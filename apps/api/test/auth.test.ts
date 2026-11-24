import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, cerrarPoolPruebas, crearApp, crearUsuario, entrar, errorDe, instantanea, limpiar, pool, type Instantanea } from "./ayuda.js";

let app: FastifyInstance;
let antes: Instantanea;
let ipN = 0;
const ip = () => ({ "x-visitante-ip": `172.16.${++ipN % 250}.${Math.floor(Math.random() * 250)}` });
const login = (payload: unknown) => app.inject({ method: "POST", url: "/api/auth/login", headers: ip(), payload: payload as object });

beforeAll(async () => {
  antes = await instantanea();
  app = await crearApp();
});
afterAll(async () => {
  await limpiar(app, antes);
  await cerrarPoolPruebas();
});

describe("POST /api/auth/login", () => {
  it("correcto: {token, expira_en, usuario} y sesion web de ~12 h", async () => {
    const u = await crearUsuario("Cajero");
    const res = await login({ usuario: u.usuario.toUpperCase(), contrasena: u.contrasena });
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(typeof b.token).toBe("string");
    expect(b.usuario).toMatchObject({ usuario: u.usuario, rol: { nombre: "Cajero" }, turno_abierto: null, debe_cambiar_contrasena: false });
    expect(res.body).not.toContain("contrasena_hash");
    const s = await pool.query<{ origen: string; horas: number }>(
      "select origen, round(extract(epoch from expira_en - creada_en) / 3600)::int as horas from app.sesion where usuario_id = $1",
      [u.id],
    );
    expect(s.rows[0]).toEqual({ origen: "web", horas: 12 });
  });

  it("origen app: sesion de 30 dias", async () => {
    const u = await crearUsuario("Cajero");
    const res = await login({ usuario: u.usuario, contrasena: u.contrasena, origen: "app" });
    expect(res.statusCode).toBe(200);
    const s = await pool.query<{ origen: string; dias: number }>(
      "select origen, round(extract(epoch from expira_en - creada_en) / 86400)::int as dias from app.sesion where usuario_id = $1",
      [u.id],
    );
    expect(s.rows[0]).toEqual({ origen: "app", dias: 30 });
  });

  it("clave mala y usuario inexistente -> 401 CREDENCIALES_INVALIDAS", async () => {
    const u = await crearUsuario("Cajero");
    for (const p of [{ usuario: u.usuario, contrasena: "incorrecta-123" }, { usuario: "no_existe_jamas", contrasena: "incorrecta-123" }]) {
      const res = await login(p);
      expect(res.statusCode).toBe(401);
      expect(errorDe(res).codigo).toBe("CREDENCIALES_INVALIDAS");
    }
  });

  it("usuario desactivado -> 401 CREDENCIALES_INVALIDAS", async () => {
    const u = await crearUsuario("Cajero", { activo: false });
    const res = await login({ usuario: u.usuario, contrasena: u.contrasena });
    expect(res.statusCode).toBe(401);
    expect(errorDe(res).codigo).toBe("CREDENCIALES_INVALIDAS");
  });

  it("cuerpo invalido -> 400 VALIDACION", async () => {
    for (const p of [{}, { usuario: "x" }, { usuario: "x", contrasena: "y", origen: "otro" }]) {
      const res = await login(p);
      expect(res.statusCode).toBe(400);
      expect(errorDe(res).codigo).toBe("VALIDACION");
    }
  });

  it("5 fallos bloquean: el 5.o responde 429 y el 6.o con clave buena sigue bloqueado", async () => {
    const u = await crearUsuario("Cajero");
    for (let i = 1; i <= 4; i++) {
      expect((await login({ usuario: u.usuario, contrasena: "mala-contrasena" })).statusCode).toBe(401);
    }
    const quinto = await login({ usuario: u.usuario, contrasena: "mala-contrasena" });
    expect(quinto.statusCode).toBe(429);
    expect(errorDe(quinto)).toMatchObject({ codigo: "USUARIO_BLOQUEADO", detalles: { reintentar_en: 900 } });
    const sexto = await login({ usuario: u.usuario, contrasena: u.contrasena });
    expect(sexto.statusCode).toBe(429);
    const e = errorDe(sexto);
    expect(e.codigo).toBe("USUARIO_BLOQUEADO");
    expect(Number.isInteger((e.detalles as { reintentar_en: number }).reintentar_en)).toBe(true);
    const bd = await pool.query("select bloqueado_hasta > now() as bloqueado from app.usuario where id = $1", [u.id]);
    expect(bd.rows[0].bloqueado).toBe(true);
  });
});

describe("bloqueo: casos limite", () => {
  const intentos = async (id: string) => (await pool.query<{ intentos_fallidos: number }>("select intentos_fallidos from app.usuario where id = $1", [id])).rows[0]!.intentos_fallidos;

  it("al vencer el bloqueo entra con clave buena y el contador queda en cero", async () => {
    const u = await crearUsuario("Cajero");
    for (let i = 0; i < 5; i++) await login({ usuario: u.usuario, contrasena: "mala-contrasena" });
    expect((await login({ usuario: u.usuario, contrasena: u.contrasena })).statusCode).toBe(429);
    await pool.query("update app.usuario set bloqueado_hasta = now() - interval '1 second' where id = $1", [u.id]);
    expect(await intentos(u.id)).toBe(0);
    expect((await login({ usuario: u.usuario, contrasena: "mala-contrasena" })).statusCode).toBe(401);
    expect(await intentos(u.id)).toBe(1);
    expect((await login({ usuario: u.usuario, contrasena: u.contrasena })).statusCode).toBe(200);
    expect(await intentos(u.id)).toBe(0);
  });

  it("usuario inactivo con clave buena no limpia los intentos y sigue contando", async () => {
    const u = await crearUsuario("Cajero", { activo: false });
    await pool.query("update app.usuario set intentos_fallidos = 2 where id = $1", [u.id]);
    const res = await login({ usuario: u.usuario, contrasena: u.contrasena });
    expect(res.statusCode).toBe(401);
    expect(errorDe(res).codigo).toBe("CREDENCIALES_INVALIDAS");
    expect(await intentos(u.id)).toBe(3);
  });

  it("un usuario que no existe tambien se bloquea a los 5 intentos (no delata cuales existen)", async () => {
    const nombre = `tapi_fantasma_${process.pid}`;
    for (let i = 1; i <= 4; i++) expect((await login({ usuario: nombre, contrasena: "x-contrasena" })).statusCode).toBe(401);
    const quinto = await login({ usuario: nombre, contrasena: "x-contrasena" });
    expect(quinto.statusCode).toBe(429);
    expect(errorDe(quinto)).toMatchObject({ codigo: "USUARIO_BLOQUEADO", detalles: { reintentar_en: 900 } });
    expect((await login({ usuario: nombre, contrasena: "x-contrasena" })).statusCode).toBe(429);
  });
});

describe("POST /api/auth/logout", () => {
  it("204 y el token queda en SESION_CERRADA; con content-type json y cuerpo vacio tambien", async () => {
    const token = await entrar(app, await crearUsuario("Cajero"));
    const res = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { ...auth(token), "content-type": "application/json" } });
    expect(res.statusCode).toBe(204);
    const despues = await app.inject({ method: "GET", url: "/api/auth/yo", headers: auth(token) });
    expect(despues.statusCode).toBe(401);
    expect(errorDe(despues).codigo).toBe("SESION_CERRADA");
  });
  it("sin token -> 401 NO_AUTENTICADO", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/logout" });
    expect(res.statusCode).toBe(401);
    expect(errorDe(res).codigo).toBe("NO_AUTENTICADO");
  });
});

describe("GET /api/auth/yo", () => {
  it("devuelve Yo con permisos, sucursal y notificaciones sin leer", async () => {
    const u = await crearUsuario("Administrador");
    await pool.query(
      "insert into app.notificacion (usuario_id, evento, titulo, cuerpo, clave) values ($1, 'pedido_nuevo', 't', 'c', 'k1'), ($1, 'pedido_nuevo', 't', 'c', 'k2')",
      [u.id],
    );
    const res = await app.inject({ method: "GET", url: "/api/auth/yo", headers: auth(await entrar(app, u)) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: u.id,
      usuario: u.usuario,
      rol: { nombre: "Administrador" },
      permisos: ["auditoria.ver", "avisos.enviar", "caja.operar", "caja.supervisar", "catalogo.editar", "catalogo.ver", "clientes.credito", "clientes.editar", "clientes.enlace", "clientes.ver", "cobranza.abonar", "cobranza.ver", "cobranza.verificar", "compras.registrar", "compras.ver", "configuracion.editar", "inventario.ajustar", "inventario.ver", "pedidos.capturar", "pedidos.gestionar", "pedidos.ver", "proveedores.gestionar", "reportes.ver", "rutas.liquidar", "rutas.operar", "rutas.planear", "rutas.ver", "surtido.ver", "ventas.crear", "ventas.credito", "ventas.devolver", "ventas.ver", "ventas.ver_todas"],
      sucursal: { nombre: "Bodega principal" },
      turno_abierto: null,
      notificaciones_sin_leer: 2,
    });
    expect(res.body).not.toContain("contrasena_hash");
  });
  it("sin token -> 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/yo" });
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /api/auth/contrasena", () => {
  it("cambia la contrasena, cierra las otras sesiones y quita debe_cambiar", async () => {
    const u = await crearUsuario("Cajero", { debeCambiar: true });
    const t1 = await entrar(app, u);
    const t2 = await entrar(app, u);
    const res = await app.inject({ method: "POST", url: "/api/auth/contrasena", headers: auth(t1), payload: { actual: u.contrasena, nueva: "otra-clave-nueva" } });
    expect(res.statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/api/auth/yo", headers: auth(t2) })).statusCode).toBe(401);
    const yo = await app.inject({ method: "GET", url: "/api/auth/yo", headers: auth(t1) });
    expect(yo.statusCode).toBe(200);
    expect(yo.json().debe_cambiar_contrasena).toBe(false);
    expect((await login({ usuario: u.usuario, contrasena: "otra-clave-nueva" })).statusCode).toBe(200);
    expect((await login({ usuario: u.usuario, contrasena: u.contrasena })).statusCode).toBe(401);
  });

  it("actual incorrecta -> 400 CONTRASENA_INCORRECTA (no 401)", async () => {
    const u = await crearUsuario("Cajero");
    const res = await app.inject({ method: "POST", url: "/api/auth/contrasena", headers: auth(await entrar(app, u)), payload: { actual: "no-es-la-actual", nueva: "otra-clave-nueva" } });
    expect(res.statusCode).toBe(400);
    expect(errorDe(res).codigo).toBe("CONTRASENA_INCORRECTA");
  });

  it("limite por usuario: la 6.a peticion en 15 min -> 429 DEMASIADAS_PETICIONES", async () => {
    const u = await crearUsuario("Cajero");
    const t = await entrar(app, u);
    for (let i = 0; i < 5; i++) {
      const r = await app.inject({ method: "POST", url: "/api/auth/contrasena", headers: auth(t), payload: { actual: "mala-actual", nueva: "otra-clave-nueva" } });
      expect(r.statusCode).toBe(400);
    }
    const sexta = await app.inject({ method: "POST", url: "/api/auth/contrasena", headers: auth(t), payload: { actual: u.contrasena, nueva: "otra-clave-nueva" } });
    expect(sexta.statusCode).toBe(429);
    expect(errorDe(sexta).codigo).toBe("DEMASIADAS_PETICIONES");
  });

  it("nueva corta -> 400 VALIDACION; sin token -> 401", async () => {
    const u = await crearUsuario("Cajero");
    const res = await app.inject({ method: "POST", url: "/api/auth/contrasena", headers: auth(await entrar(app, u)), payload: { actual: u.contrasena, nueva: "corta" } });
    expect(res.statusCode).toBe(400);
    expect(errorDe(res).codigo).toBe("VALIDACION");
    const sin = await app.inject({ method: "POST", url: "/api/auth/contrasena", payload: { actual: "x", nueva: "otra-clave-nueva" } });
    expect(sin.statusCode).toBe(401);
  });
});

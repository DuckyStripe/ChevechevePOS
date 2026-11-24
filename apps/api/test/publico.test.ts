import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { permisosPlugin } from "../src/comun/permisos.js";
import { cerrarPoolPruebas, crearApp, entrar, errorDe, pool } from "./ayuda.js";
import { hoyMas } from "./ayuda-f2.js";
import {
  activarCliente, catalogoF3, clienteConEnlace, crearUsuarioF3, limpiarF3, pedidoEntregadoF3, pedirCliente, pedirPersonal, snapshotF3, tokenF3,
  type CatalogoF3, type ClienteF3, type Credenciales, type Snapshot,
} from "./ayuda-f3.js";

let app: FastifyInstance;
let antes: Snapshot;
let pedir: ReturnType<typeof pedirPersonal>;
let publico: ReturnType<typeof pedirCliente>;
let dueno: { token: string; id: string };
let admin: string;
let k: CatalogoF3;

beforeAll(async () => {
  antes = await snapshotF3();
  app = await crearApp();
  pedir = pedirPersonal(app);
  publico = pedirCliente(app);
  const u = await crearUsuarioF3("Dueño");
  dueno = { token: await entrar(app, u), id: u.id };
  admin = await tokenF3(app, "Administrador");
  k = await catalogoF3(app, dueno.token);
});
afterAll(async () => {
  await limpiarF3(app, antes);
  await cerrarPoolPruebas();
});

const nuevo = (o: Parameters<typeof clienteConEnlace>[2] = {}) => clienteConEnlace(app, dueno, o);
const lin = (presentacion_id: string, cantidad: number) => ({ presentacion_id, cantidad });
const caja = () => k.corona.caja;
const six = () => k.corona.six;

async function activo(o: Parameters<typeof clienteConEnlace>[2] = {}): Promise<{ c: ClienteF3; k: Credenciales }> {
  const c = await nuevo(o);
  return { c, k: await activarCliente(app, c) };
}
const enviar = (cred: Credenciales, extra: object = {}) =>
  publico("POST", "/api/publico/pedidos", cred, { clave_idempotencia: randomUUID(), lineas: [lin(caja(), 1), lin(six(), 1)], total_visto: "530.00", ...extra });

describe("arranque", () => {
  it("una ruta de /api/publico/ sin config.permiso impide arrancar", async () => {
    const a = Fastify();
    await a.register(permisosPlugin);
    void a.register(async (api) => void api.get("/publico/x", async () => 1), { prefix: "/api" });
    await expect(a.ready()).rejects.toThrow(/sin config.permiso/);
    await a.close();
  });
});

describe("canje del enlace y PIN", () => {
  it("token valido sin dispositivo ni PIN: 401 PIN_REQUERIDO {tiene_pin:false} con datos del negocio para la pantalla; elegir PIN -> 200 {dispositivo_token}; con token + dispositivo -> 200", async () => {
    await pedir("PATCH", "/api/configuracion", dueno.token, { negocio_nombre: "Bodega Prueba", negocio_whatsapp: "5215500001111" });
    const c = await nuevo();
    const r = await publico("GET", "/api/publico/cliente", { token: c.token });
    expect(r.statusCode).toBe(401);
    expect(errorDe(r)).toMatchObject({
      codigo: "PIN_REQUERIDO",
      detalles: { tiene_pin: false, negocio: { nombre: "Bodega Prueba", whatsapp: "5215500001111" }, textos: { pedir_pin: expect.any(String), elegir_pin: expect.any(String), enlace_invalido: expect.any(String) } },
    });
    expect(r.body).not.toContain(c.nombre);

    const e = await publico("POST", "/api/publico/pin/elegir", { token: c.token }, { pin: "1234" });
    expect(e.statusCode).toBe(200);
    const { dispositivo_token } = e.json<{ dispositivo_token: string }>();
    expect(dispositivo_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const ok = await publico("GET", "/api/publico/cliente", { token: c.token, dispositivo: dispositivo_token });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({
      id: c.id, nombre: c.nombre, negocio: { nombre: "Bodega Prueba", whatsapp: "5215500001111" }, pedido_minimo: "500.00", hora_corte: "18:00",
      dias_visita: [], proxima_visita: null, tiene_ubicacion: false, credito: null, faltante_accion_predeterminada: "quitar", faltante_minutos_respuesta: 60,
      textos: { bienvenida: expect.stringContaining(c.nombre), aviso_ubicacion: expect.any(String) }, pedido_propuesto: null,
    });
    expect(ok.body).not.toContain("existencia");
    // Ni el hash del PIN ni el del token viajan en ninguna parte.
    expect(JSON.stringify(ok.json())).not.toMatch(/pin_hash|token_hash|bcrypt|\$2[aby]\$/);
  });

  it("elegir otra vez 409 PIN_YA_DEFINIDO; pin '12a4' o de 5 digitos 400 VALIDACION; sin enlace 401 ENLACE_INVALIDO", async () => {
    const { c, k: cred } = await activo();
    const otra = await publico("POST", "/api/publico/pin/elegir", { token: c.token }, { pin: "9999" });
    expect(otra.statusCode).toBe(409);
    expect(errorDe(otra).codigo).toBe("PIN_YA_DEFINIDO");
    const otra2 = await publico("POST", "/api/publico/pin/elegir", cred, { pin: "9999" });
    expect(errorDe(otra2).codigo).toBe("PIN_YA_DEFINIDO");
    const nuevoCliente = await nuevo();
    for (const pin of ["12a4", "12345", "123", ""]) {
      const r = await publico("POST", "/api/publico/pin/elegir", { token: nuevoCliente.token }, { pin });
      expect(r.statusCode).toBe(400);
      expect(errorDe(r).codigo).toBe("VALIDACION");
    }
    expect((await publico("POST", "/api/publico/pin/elegir", { token: nuevoCliente.token }, {})).statusCode).toBe(400);
    expect(errorDe(await publico("POST", "/api/publico/pin/elegir", { token: "no-existe" }, { pin: "1234" })).codigo).toBe("ENLACE_INVALIDO");
    expect(errorDe(await app.inject({ method: "POST", url: "/api/publico/pin/elegir", payload: { pin: "1234" } })).codigo).toBe("ENLACE_INVALIDO");
  });

  it("otro dispositivo (cookies borradas) -> 401 PIN_REQUERIDO {tiene_pin:true}; las demas rutas tambien piden PIN y pin/entrar sin PIN definido es 409", async () => {
    const { c, k: cred } = await activo();
    const sin = { token: c.token };
    const r = await publico("GET", "/api/publico/cliente", sin);
    expect(errorDe(r)).toMatchObject({ codigo: "PIN_REQUERIDO", detalles: { tiene_pin: true } });
    for (const [m, u] of [["GET", "/api/publico/catalogo"], ["GET", "/api/publico/pedidos"], ["POST", "/api/publico/pedidos"]] as const) {
      const x = await publico(m, u, sin, m === "POST" ? {} : undefined);
      expect(x.statusCode, u).toBe(401);
      expect(errorDe(x).codigo, u).toBe("PIN_REQUERIDO");
    }
    const sinPin = await nuevo();
    const e = await publico("POST", "/api/publico/pin/entrar", { token: sinPin.token }, { pin: "1234" });
    expect(e.statusCode).toBe(409);
    expect(errorDe(e).codigo).toBe("ESTADO_NO_VALIDO");
    expect((await publico("GET", "/api/publico/cliente", cred)).statusCode).toBe(200);
  });

  it("5 PIN malos: 401 PIN_INCORRECTO con intentos 4,3,2,1 y el 5.o 429 PIN_EN_ESPERA {segundos ~900}; el correcto durante la espera tambien 429; otra IP no esta en espera; pasada la espera entra, alerta dispositivo_nuevo y el primer dispositivo sigue entrando", async () => {
    const { c, k: primero } = await activo();
    const ip = "10.77.1.1";
    const mal = () => publico("POST", "/api/publico/pin/entrar", { token: c.token, ip }, { pin: "0000" });
    for (const restantes of [4, 3, 2, 1]) {
      const r = await mal();
      expect(r.statusCode).toBe(401);
      expect(errorDe(r)).toMatchObject({ codigo: "PIN_INCORRECTO", detalles: { intentos_restantes: restantes } });
    }
    const espera = await mal();
    expect(espera.statusCode).toBe(429);
    expect(errorDe(espera).codigo).toBe("PIN_EN_ESPERA");
    expect((errorDe(espera).detalles as { segundos: number }).segundos).toBeGreaterThanOrEqual(899);
    const correcto = await publico("POST", "/api/publico/pin/entrar", { token: c.token, ip }, { pin: "1234" });
    expect(correcto.statusCode).toBe(429);
    expect(errorDe(correcto).codigo).toBe("PIN_EN_ESPERA");
    const otraIp = await publico("POST", "/api/publico/pin/entrar", { token: c.token, ip: "10.77.1.2" }, { pin: "0000" });
    expect(otraIp.statusCode).toBe(401);
    expect(errorDe(otraIp).codigo).toBe("PIN_INCORRECTO");

    await pool.query("update app.cliente_pin_espera set espera_hasta = now() - interval '1 minute' where cliente_enlace_id = $1", [c.enlace_id]);
    const ok = await publico("POST", "/api/publico/pin/entrar", { token: c.token, ip }, { pin: "1234" });
    expect(ok.statusCode).toBe(200);
    const segundo = ok.json<{ dispositivo_token: string }>().dispositivo_token;
    expect(segundo).not.toBe(primero.dispositivo);
    expect((await publico("GET", "/api/publico/cliente", { token: c.token, dispositivo: segundo })).statusCode).toBe(200);
    expect((await publico("GET", "/api/publico/cliente", primero)).statusCode).toBe(200); // nada lo bloquea (C21)
    const n = await pool.query("select count(*)::int as n from app.notificacion where evento = 'dispositivo_nuevo' and usuario_id = $1 and cuerpo like $2", [dueno.id, `%${await navegador(c.id)}%`]);
    expect(n.rows[0].n).toBeGreaterThanOrEqual(1);
    expect((await pool.query("select count(*)::int as n from app.cliente_pin_espera where cliente_enlace_id = $1 and ip_hash <> ''", [c.enlace_id])).rows[0].n).toBeGreaterThanOrEqual(1);
  });

  it("dispositivo quitado o enlace reemplazado: el PIN emite un token NUEVO y entra (sin bucle de PIN); el token viejo no revive", async () => {
    const { c, k: cred } = await activo();
    const did = (await pedir("GET", `/api/clientes/${c.id}/dispositivos`, dueno.token)).json()[0].id as string;
    await pedir("DELETE", `/api/clientes/${c.id}/dispositivos/${did}`, dueno.token);
    expect(errorDe(await publico("GET", "/api/publico/cliente", cred)).codigo).toBe("PIN_REQUERIDO");
    const e = await publico("POST", "/api/publico/pin/entrar", { token: c.token, dispositivo: cred.dispositivo, ip: "10.77.2.1" }, { pin: "1234" });
    expect(e.statusCode).toBe(200);
    const nuevoTok = e.json<{ dispositivo_token: string }>().dispositivo_token;
    expect(nuevoTok).not.toBe(cred.dispositivo);
    expect((await publico("GET", "/api/publico/cliente", { token: c.token, dispositivo: nuevoTok })).statusCode).toBe(200);
    expect(errorDe(await publico("GET", "/api/publico/cliente", cred)).codigo).toBe("PIN_REQUERIDO"); // el viejo sigue quitado

    // El enlace se reemplaza: el enlace nuevo parte sin PIN ni dispositivos aunque llegue la cookie vieja.
    const g = await pedir("POST", `/api/clientes/${c.id}/enlace`, dueno.token, {});
    const t2 = /\/p\/([A-Za-z0-9_-]{43})/.exec(g.json().aviso.texto)![1]!;
    expect(errorDe(await publico("GET", "/api/publico/cliente", { token: t2, dispositivo: nuevoTok }))).toMatchObject({ codigo: "PIN_REQUERIDO", detalles: { tiene_pin: false } });
    const el = await publico("POST", "/api/publico/pin/elegir", { token: t2, dispositivo: nuevoTok }, { pin: "5555" });
    expect(el.statusCode).toBe(200);
    expect(el.json().dispositivo_token).not.toBe(nuevoTok);
  });
});

describe("PIN: dispositivo ajeno y ataque distribuido", () => {
  it("el token de dispositivo del enlace A no sirve en el enlace B (401 PIN_REQUERIDO) y un PIN correcto emite uno nuevo", async () => {
    const a = await activo();
    const b = await activo();
    const r = await publico("GET", "/api/publico/cliente", { token: b.c.token, dispositivo: a.k.dispositivo });
    expect(r.statusCode).toBe(401);
    expect(errorDe(r)).toMatchObject({ codigo: "PIN_REQUERIDO", detalles: { tiene_pin: true } });
    const e = await publico("POST", "/api/publico/pin/entrar", { token: b.c.token, dispositivo: a.k.dispositivo }, { pin: "1234" });
    expect(e.statusCode).toBe(200);
    expect(e.json().dispositivo_token).not.toBe(a.k.dispositivo);
    expect((await publico("GET", "/api/publico/cliente", { token: a.c.token, dispositivo: a.k.dispositivo })).statusCode).toBe(200);
  });

  it("20 PIN malos desde 20 IP distintas: aviso pin_ataque al personal y espera de 15 minutos para todo el enlace (C21); el enlace y los dispositivos siguen (C21)", async () => {
    const { c, k: cred } = await activo();
    for (let i = 0; i < 20; i++) {
      const r = await publico("POST", "/api/publico/pin/entrar", { token: c.token, ip: `10.50.${i}.1` }, { pin: "0000" });
      expect(errorDe(r).codigo).toBe("PIN_INCORRECTO");
    }
    const espera = await publico("POST", "/api/publico/pin/entrar", { token: c.token, ip: "10.50.200.1" }, { pin: "1234" }); // el PIN bueno tambien espera
    expect(espera.statusCode).toBe(429);
    expect(errorDe(espera).codigo).toBe("PIN_EN_ESPERA");
    expect((errorDe(espera).detalles as { segundos: number }).segundos).toBeGreaterThanOrEqual(899);
    const n = await pool.query("select titulo, cuerpo, datos from app.notificacion where evento = 'pin_ataque' and usuario_id = $1 and datos ->> 'ruta' = $2", [dueno.id, `/clientes/${c.id}`]);
    expect(n.rows).toHaveLength(1);
    expect(n.rows[0].cuerpo).toContain(c.nombre);
    expect((await pool.query("select count(*)::int as n from app.cliente_enlace where id = $1 and revocado_en is null and pin_hash is not null", [c.enlace_id])).rows[0].n).toBe(1);
    expect((await publico("GET", "/api/publico/cliente", cred)).statusCode).toBe(200);
  });
});

async function navegador(clienteId: string): Promise<string> {
  const r = await pool.query("select d.navegador from app.cliente_dispositivo d join app.cliente_enlace e on e.id = d.cliente_enlace_id where e.cliente_id = $1 order by d.id desc limit 1", [clienteId]);
  return r.rows[0]?.navegador ?? "";
}

describe("fuerza bruta de tokens y datos del negocio", () => {
  it("10 tokens falsos desde una IP: 401 ENLACE_INVALIDO cada uno; el 11.o 429 ENLACE_BLOQUEADO; desde otra IP 401; un token VALIDO desde la IP bloqueada pasa", async () => {
    const { k: cred } = await activo();
    const ip = "10.99.9.9";
    for (let i = 0; i < 10; i++) {
      const r = await publico("GET", "/api/publico/cliente", { token: `falso-${i}`, ip });
      expect(r.statusCode).toBe(401);
      expect(errorDe(r).codigo).toBe("ENLACE_INVALIDO");
    }
    const bloqueado = await publico("GET", "/api/publico/cliente", { token: "falso-11", ip });
    expect(bloqueado.statusCode).toBe(429);
    expect(errorDe(bloqueado).codigo).toBe("ENLACE_BLOQUEADO");
    expect((await publico("GET", "/api/publico/cliente", { token: "falso-11", ip: "10.99.9.10" })).statusCode).toBe(401);
    // El bloqueo frena a quien falla, no a quien trae un enlace bueno (C21).
    expect((await publico("GET", "/api/publico/cliente", { ...cred, ip })).statusCode).toBe(200);
  });

  it("las peticiones sin token no cuentan como fallo ni bloquean; IPv6 se agrupa por /64; sin IP no truena", async () => {
    const ip = "10.99.8.8";
    for (let i = 0; i < 15; i++) {
      const r = await app.inject({ method: "GET", url: "/api/publico/cliente", headers: { "x-visitante-ip": ip } });
      expect(errorDe(r).codigo).toBe("ENLACE_INVALIDO");
    }
    expect(errorDe(await publico("GET", "/api/publico/cliente", { token: "falso-x", ip })).codigo).toBe("ENLACE_INVALIDO"); // ni 429
    // Mismo /64, distintas direcciones: una sola cubeta.
    for (let i = 0; i < 10; i++) await publico("GET", "/api/publico/cliente", { token: `v6-${i}`, ip: `2001:db8:abcd:12::${i + 1}` });
    expect(errorDe(await publico("GET", "/api/publico/cliente", { token: "v6-x", ip: "2001:db8:abcd:12:ffff:1:2:3" })).codigo).toBe("ENLACE_BLOQUEADO");
    expect(errorDe(await publico("GET", "/api/publico/cliente", { token: "v6-y", ip: "2001:db8:abcd:13::1" })).codigo).toBe("ENLACE_INVALIDO");
    // IP vacia: cae en 'desconocida'.
    const vacia = await app.inject({ method: "GET", url: "/api/publico/cliente", headers: { "x-cliente-token": "algo", "x-visitante-ip": "" } });
    expect(vacia.statusCode).toBe(401);
  });

  it("GET /api/publico/negocio: sin token ni sesion, datos del negocio y textos; no cuenta como fallo", async () => {
    await pedir("PATCH", "/api/configuracion", dueno.token, { negocio_nombre: "Bodega Prueba", negocio_whatsapp: "5215500001111" });
    const ip = "10.99.7.7";
    for (let i = 0; i < 12; i++) {
      const r = await app.inject({ method: "GET", url: "/api/publico/negocio", headers: { "x-visitante-ip": ip } });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({
        negocio: { nombre: "Bodega Prueba", whatsapp: "5215500001111" },
        textos: { pedir_pin: expect.any(String), elegir_pin: expect.any(String), enlace_invalido: expect.any(String) },
      });
    }
    expect(errorDe(await publico("GET", "/api/publico/cliente", { token: "falso", ip })).codigo).toBe("ENLACE_INVALIDO");
  });
});

describe("solo lo suyo", () => {
  it("con el token de A, los recursos de B responden 404 NO_ENCONTRADO", async () => {
    const a = await activo();
    const b = await activo();
    const pb = (await enviar(b.k)).json<{ id: string }>();
    expect(pb.id).toBeTruthy();
    const ver = await publico("GET", `/api/publico/pedidos/${pb.id}`, a.k);
    expect(ver.statusCode).toBe(404);
    expect(errorDe(ver).codigo).toBe("NO_ENCONTRADO");
    expect(JSON.stringify(ver.json())).not.toContain(b.c.nombre);
    expect((await publico("PATCH", `/api/publico/pedidos/${pb.id}`, a.k, { lineas: [lin(caja(), 2)], total_visto: "840.00" })).statusCode).toBe(404);
    expect((await publico("POST", `/api/publico/pedidos/${pb.id}/cancelar`, a.k, {})).statusCode).toBe(404);
    expect((await publico("POST", `/api/publico/pedidos/${pb.id}/aceptar`, a.k, { total_visto: "530.00" })).statusCode).toBe(404);
    const l = (await pool.query("select id from app.pedido_linea where pedido_id = $1 limit 1", [pb.id])).rows[0].id;
    await pool.query("update app.pedido set estado = 'confirmado', fecha_entrega = app.fn_fecha_local(now()) where id = $1", [pb.id]);
    await pool.query("update app.pedido_linea set estado = 'faltante' where id = $1", [l]);
    const prop = (await pool.query("insert into app.propuesta_faltante (pedido_linea_id, causa, limite_en, creada_por) values ($1, 'otro', now() + interval '1 hour', $2) returning id", [l, dueno.id])).rows[0].id;
    expect((await publico("POST", `/api/publico/propuestas/${prop}/responder`, a.k, { opcion_id: null })).statusCode).toBe(404);
    expect((await publico("GET", "/api/publico/pedidos", a.k)).json().items).toEqual([]);
  });
});

describe("catalogo", () => {
  it("200 con ETag; If-None-Match igual -> 304 sin cuerpo; un precio nuevo cambia el ETag; nada de existencias ni costos", async () => {
    const { k: cred } = await activo();
    const r = await publico("GET", "/api/publico/catalogo", cred);
    expect(r.statusCode).toBe(200);
    const etag = r.headers.etag as string;
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
    expect(r.headers["cache-control"]).toBe("private, no-cache");
    const cuerpo = r.json();
    expect(cuerpo.version).toBe(etag.slice(1, -1));
    expect(cuerpo.categorias.length).toBeGreaterThan(0);
    const corona = cuerpo.articulos.find((a: { presentacion_id: string }) => a.presentacion_id === caja());
    expect(corona).toMatchObject({ producto: k.corona.nombre, presentacion: "Caja de 24", factor: 24, precio: "420.00", favorito: false, oferta: null, miniatura: null });
    expect(corona.buscar).toContain("corona");
    expect(cuerpo.articulos.some((a: { presentacion_id: string }) => a.presentacion_id === k.corona.pieza)).toBe(false); // no se vende
    expect(r.body).not.toMatch(/"existencia|"costo|"disponible/);

    const igual = await publico("GET", "/api/publico/catalogo", { ...cred, extra: { "if-none-match": etag } });
    expect(igual.statusCode).toBe(304);
    expect(igual.body).toBe("");
    expect((await publico("GET", "/api/publico/catalogo", { ...cred, extra: { "if-none-match": '"otro"' } })).statusCode).toBe(200);

    await pedir("PUT", "/api/precios", dueno.token, { precios: [{ presentacion_id: six(), lista_precio_id: k.menudeo, precio: "111.00" }] });
    const nuevoR = await publico("GET", "/api/publico/catalogo", { ...cred, extra: { "if-none-match": etag } });
    expect(nuevoR.statusCode).toBe(200);
    expect(nuevoR.headers.etag).not.toBe(etag);
    await pedir("PUT", "/api/precios", dueno.token, { precios: [{ presentacion_id: six(), lista_precio_id: k.menudeo, precio: "110.00" }] });
  });

  it("lista Mayoreo: Caja 400.00 y Six cae al precio de Menudeo; una oferta vigente va primero con {precio_normal, hasta}; favoritos", async () => {
    const { c, k: cred } = await activo({ lista_precio_id: k.mayoreo });
    const hasta = await hoyMas(5);
    const of = await pedir("POST", "/api/ofertas", dueno.token, { presentacion_id: k.victoria.caja, precio: "380.00", desde: await hoyMas(0), hasta, motivo: "promocion" });
    expect(of.statusCode).toBe(201);
    const art = (await publico("GET", "/api/publico/catalogo", cred)).json().articulos as { presentacion_id: string; precio: string; oferta: { precio_normal: string; hasta: string } | null }[];
    expect(art[0]!.presentacion_id).toBe(k.victoria.caja);
    expect(art[0]).toMatchObject({ precio: "380.00", oferta: { precio_normal: "410.00", hasta } });
    expect(art.find((a) => a.presentacion_id === caja())!.precio).toBe("400.00");
    expect(art.find((a) => a.presentacion_id === six())!.precio).toBe("110.00");
    await pedir("DELETE", `/api/ofertas/${of.json().id}`, dueno.token);

    expect((await publico("PUT", `/api/publico/favoritos/${caja()}`, cred)).statusCode).toBe(204);
    expect((await publico("GET", "/api/publico/catalogo", cred)).json().articulos.find((a: { presentacion_id: string }) => a.presentacion_id === caja()).favorito).toBe(true);
    expect((await publico("DELETE", `/api/publico/favoritos/${caja()}`, cred)).statusCode).toBe(204);
    expect((await publico("PUT", "/api/publico/favoritos/999999999", cred)).statusCode).toBe(404);
    expect((await publico("PUT", "/api/publico/favoritos/abc", cred)).statusCode).toBe(400);
    expect(c.id).toBeTruthy();
  });

  it("ultimo_pedido.vista con precios de hoy: antes -> ahora; frecuentes; visitas contadas", async () => {
    const { c, k: cred } = await activo();
    await pedidoEntregadoF3(c.id, { hace_dias: 3, lineas: [{ presentacion_id: caja(), cantidad: 2, precio: "400.00" }, { presentacion_id: six(), cantidad: 1, precio: "110.00" }] });
    const r = (await publico("GET", "/api/publico/catalogo", cred)).json();
    expect(r.ultimo_pedido).toMatchObject({ folio: expect.stringMatching(/^P-\d{6}$/), vista: { total_actual: "950.00", hay_cambios: true, quitadas: [] } });
    expect(r.ultimo_pedido.vista.lineas.find((l: { presentacion_id: string }) => l.presentacion_id === caja())).toMatchObject({ precio_actual: "420.00", precio_anterior: "400.00", cambio: "sube", cantidad: 2 });
    expect(r.frecuentes).toEqual(expect.arrayContaining([{ presentacion_id: caja(), ultima_cantidad: 2 }, { presentacion_id: six(), ultima_cantidad: 1 }]));
    const v = (await pool.query("select vistas_catalogo from app.cliente_visita where cliente_id = $1", [c.id])).rows[0];
    expect(v.vistas_catalogo).toBe(1);
  });

  it("GET /cliente cuenta una apertura por dispositivo cada 30 min", async () => {
    const { c, k: cred } = await activo();
    for (let i = 0; i < 3; i++) expect((await publico("GET", "/api/publico/cliente", cred)).statusCode).toBe(200);
    expect((await pool.query("select aperturas from app.cliente_visita where cliente_id = $1", [c.id])).rows[0].aperturas).toBe(1);
  });
});

describe("pedidos del cliente", () => {
  it("1 Caja -> 409 PEDIDO_MINIMO con lo que falta; 1 Caja + 1 Six con total_visto -> 201; misma clave y cuerpo -> 200 mismo id; otro cuerpo -> 409 IDEMPOTENCIA_CONFLICTO", async () => {
    await pedir("PATCH", "/api/configuracion", dueno.token, { negocio_whatsapp: "" });
    const { c, k: cred } = await activo();
    const corto = await publico("POST", "/api/publico/pedidos", cred, { clave_idempotencia: randomUUID(), lineas: [lin(caja(), 1)], total_visto: "420.00" });
    expect(corto.statusCode).toBe(409);
    expect(errorDe(corto)).toMatchObject({ codigo: "PEDIDO_MINIMO", detalles: { minimo: "500.00", total: "420.00", faltante: "80.00" } });

    const clave = randomUUID();
    const cuerpo = { clave_idempotencia: clave, lineas: [lin(caja(), 1), lin(six(), 1)], total_visto: "530.00" };
    const r = await publico("POST", "/api/publico/pedidos", cred, cuerpo);
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ id: expect.any(String), folio: expect.stringMatching(/^P-\d{6}$/), total: "530.00", estado: "recibido", texto_confirmacion: expect.stringContaining("Recibimos tu pedido") });
    expect(r.json().texto_confirmacion).toContain(c.nombre);
    expect(r.json().avisar_negocio).toBeNull(); // sin WhatsApp del negocio no hay boton
    const otra = await publico("POST", "/api/publico/pedidos", cred, cuerpo);
    expect(otra.statusCode).toBe(200);
    expect(otra.json().id).toBe(r.json().id);
    const conflicto = await publico("POST", "/api/publico/pedidos", cred, { ...cuerpo, lineas: [lin(caja(), 2), lin(six(), 1)], total_visto: "950.00" });
    expect(conflicto.statusCode).toBe(409);
    expect(errorDe(conflicto).codigo).toBe("IDEMPOTENCIA_CONFLICTO");
    expect((await pool.query("select count(*)::int as n from app.pedido where cliente_id = $1", [c.id])).rows[0].n).toBe(1);
    // El personal recibe la notificacion y ningun aviso se crea para el cliente.
    expect((await pool.query("select count(*)::int as n from app.notificacion where evento = 'pedido_nuevo' and clave = $1 and usuario_id = $2", [`pedido_nuevo:${r.json().id}`, dueno.id])).rows[0].n).toBe(1);
    expect((await pool.query("select count(*)::int as n from app.aviso_cliente where pedido_id = $1", [r.json().id])).rows[0].n).toBe(0);
  });

  it("avisar_negocio.url = wa.me al WhatsApp del negocio con wa_cliente_avisa_pedido", async () => {
    await pedir("PATCH", "/api/configuracion", dueno.token, { negocio_whatsapp: "5215500001111" });
    const { c, k: cred } = await activo();
    const r = await enviar(cred);
    expect(r.statusCode).toBe(201);
    const url = r.json().avisar_negocio.url as string;
    expect(url).toMatch(/^https:\/\/wa\.me\/5215500001111\?text=/);
    expect(decodeURIComponent(url.split("text=")[1]!)).toBe(`Hola, soy ${c.nombre}. Acabo de hacer mi pedido ${r.json().folio}.`);
  });

  it("total_visto distinto: 409 PRECIOS_CAMBIARON con la vista nueva en detalles y nada guardado; sin total_visto 400; lineas vacias 400; presentacion que no se vende 409; sin precio 409", async () => {
    const { c, k: cred } = await activo();
    const r = await enviar(cred, { total_visto: "520.00" });
    expect(r.statusCode).toBe(409);
    expect(errorDe(r)).toMatchObject({ codigo: "PRECIOS_CAMBIARON", detalles: { total_actual: "530.00", hay_cambios: false, lineas: [{ presentacion_id: Number(caja()), precio_actual: "420.00" }, { presentacion_id: Number(six()), precio_actual: "110.00" }] } });
    expect((await pool.query("select count(*)::int as n from app.pedido where cliente_id = $1", [c.id])).rows[0].n).toBe(0);
    const sin = await publico("POST", "/api/publico/pedidos", cred, { clave_idempotencia: randomUUID(), lineas: [lin(caja(), 2)] });
    expect(sin.statusCode).toBe(400);
    expect(errorDe(sin).codigo).toBe("VALIDACION");
    expect((await enviar(cred, { lineas: [] })).statusCode).toBe(400);
    expect((await enviar(cred, { lineas: [lin(caja(), 0)] })).statusCode).toBe(400);
    expect((await enviar(cred, { clave_idempotencia: "x" })).statusCode).toBe(400);
    const noVende = await enviar(cred, { lineas: [lin(k.corona.pieza, 30)], total_visto: "0.00" });
    expect(noVende.statusCode).toBe(409);
    expect(errorDe(noVende).codigo).toBe("PRESENTACION_NO_VALIDA");
    expect(errorDe(await enviar(cred, { fecha_solicitada: "2020-01-01" })).codigo).toBe("FECHA_NO_VALIDA");
    expect(errorDe(await publico("POST", "/api/publico/pedidos", cred, { clave_idempotencia: randomUUID(), lineas: [lin("999999999", 1)], total_visto: "10.00" })).codigo).toBe("PRESENTACION_NO_VALIDA");
  });

  it("PATCH en recibido -> 200 version 2; el cliente lleva total_visto (PRECIOS_CAMBIARON si no cuadra); ya confirmado 409 PEDIDO_NO_EDITABLE; cancelar", async () => {
    const { c, k: cred } = await activo();
    const p = (await enviar(cred)).json<{ id: string }>();
    const mal = await publico("PATCH", `/api/publico/pedidos/${p.id}`, cred, { lineas: [lin(caja(), 2)], total_visto: "800.00" });
    expect(mal.statusCode).toBe(409);
    expect(errorDe(mal).codigo).toBe("PRECIOS_CAMBIARON");
    expect((await publico("PATCH", `/api/publico/pedidos/${p.id}`, cred, { lineas: [lin(caja(), 2)] })).statusCode).toBe(400); // total_visto es obligatorio
    const r = await publico("PATCH", `/api/publico/pedidos/${p.id}`, cred, { lineas: [lin(caja(), 2)], total_visto: "840.00", notas: "tocar fuerte" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ id: p.id, version: 2, total: "840.00", estado: "recibido", editable: true });
    const seg = (await publico("GET", `/api/publico/pedidos/${p.id}`, cred)).json();
    expect(seg).toMatchObject({ id: p.id, etapa: "recibido", etiqueta: "Recibido", total: "840.00", editable: true, reparto: null });
    expect(seg.lineas).toEqual([expect.objectContaining({ id: expect.any(String), presentacion_id: caja(), cantidad: 2, importe: "840.00" })]);
    expect(seg.linea_tiempo).toEqual([{ etapa: "recibido", en: expect.any(String), etiqueta: "Recibido" }]);
    expect(JSON.stringify(seg)).not.toContain("notas_internas");

    await pool.query("update app.pedido set estado = 'confirmado', fecha_entrega = app.fn_fecha_local(now()) where id = $1", [p.id]);
    const no = await publico("PATCH", `/api/publico/pedidos/${p.id}`, cred, { lineas: [lin(caja(), 2)], total_visto: "840.00" });
    expect(no.statusCode).toBe(409);
    expect(errorDe(no).codigo).toBe("PEDIDO_NO_EDITABLE");
    expect(errorDe(await publico("POST", `/api/publico/pedidos/${p.id}/cancelar`, cred, {})).codigo).toBe("PEDIDO_NO_EDITABLE");

    const q = (await enviar(cred)).json<{ id: string }>();
    const can = await publico("POST", `/api/publico/pedidos/${q.id}/cancelar`, cred, { motivo: "ya no" });
    expect(can.statusCode).toBe(200);
    expect(can.json()).toMatchObject({ id: q.id, estado: "cancelado" });
    expect((await pool.query("select count(*)::int as n from app.notificacion where evento = 'pedido_cancelado_cliente' and clave = $1", [`pedido_cancelado_cliente:${q.id}`])).rows[0].n).toBeGreaterThanOrEqual(1);
    const lista = (await publico("GET", "/api/publico/pedidos", cred)).json();
    expect(lista).toMatchObject({ total: 2, pagina: 1, por_pagina: 20 });
    expect(lista.items.map((x: { id: string; etapa: string }) => x.etapa)).toEqual(["confirmado", "cancelado"]); // en curso primero
    expect(lista.items[0]).toMatchObject({ id: p.id, etiqueta: "Confirmado", editable: false, faltantes_pendientes: 0, reparto: null, total: "840.00" });
    expect(c.id).toBeTruthy();
  });

  it("el pedido 21 en una hora: 429 DEMASIADAS_PETICIONES (por token); 401 sin token", async () => {
    const { k: cred } = await activo();
    let ultimo = 0;
    for (let i = 0; i < 21; i++) ultimo = (await publico("POST", "/api/publico/pedidos", cred, {})).statusCode;
    expect(ultimo).toBe(429);
    const r = await publico("POST", "/api/publico/pedidos", cred, {});
    expect(errorDe(r).codigo).toBe("DEMASIADAS_PETICIONES");
    const otro = await activo();
    expect((await publico("POST", "/api/publico/pedidos", otro.k, {})).statusCode).toBe(400); // otro token, otra cuenta
    expect((await app.inject({ method: "POST", url: "/api/publico/pedidos", payload: {} })).statusCode).toBe(401);
  });
});

describe("ubicacion del cliente", () => {
  it("precision_m 150 -> 400; lat fuera de Mexico -> 400; valida -> 202 y propuesta sin tocar lat/lng; la 6.a del dia 429", async () => {
    const { c, k: cred } = await activo();
    const gps = { lat: 19.4326, lng: -99.1332, precision_m: 20 };
    const larga = await publico("POST", "/api/publico/ubicacion", cred, { ...gps, precision_m: 150 });
    expect(larga.statusCode).toBe(400);
    expect(errorDe(larga).codigo).toBe("VALIDACION");
    expect((await publico("POST", "/api/publico/ubicacion", cred, { ...gps, lat: 51.5 })).statusCode).toBe(400);
    expect((await publico("POST", "/api/publico/ubicacion", cred, {})).statusCode).toBe(400);
    const ok = await publico("POST", "/api/publico/ubicacion", cred, gps);
    expect(ok.statusCode).toBe(202);
    const ficha = (await pedir("GET", `/api/clientes/${c.id}`, dueno.token)).json();
    expect(ficha).toMatchObject({ lat: null, lng: null, lat_propuesta: "19.432600", lng_propuesta: "-99.133200", tiene_propuesta: true });
    expect((await pool.query("select count(*)::int as n from app.notificacion where evento = 'ubicacion_propuesta' and usuario_id = $1 and datos ->> 'ruta' = $2", [dueno.id, `/clientes/${c.id}`])).rows[0].n).toBeGreaterThanOrEqual(1);
    // Cuentan todas las peticiones del dia (tambien las rechazadas): ya van 4 (3 invalidas y 1 buena); la 5.a pasa y la 6.a no.
    expect((await publico("POST", "/api/publico/ubicacion", cred, gps)).statusCode).toBe(202);
    const sexta = await publico("POST", "/api/publico/ubicacion", cred, gps);
    expect(sexta.statusCode).toBe(429);
    expect(errorDe(sexta).codigo).toBe("DEMASIADAS_PETICIONES");
    expect(admin).toBeTruthy();
  });
});

import { SignJWT } from "jose";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { permisosPlugin } from "../src/comun/permisos.js";
import { auth, cerrarPoolPruebas, crearApp, crearUsuario, entrar, errorDe, instantanea, jtiAleatorio, limpiar, pool, type Instantanea } from "./ayuda.js";

async function arrancaCon(registrar: (api: FastifyInstance) => void) {
  const app = Fastify();
  await app.register(permisosPlugin);
  await app.register(async (api) => registrar(api), { prefix: "/api" });
  try {
    await app.ready();
  } finally {
    await app.close();
  }
}

describe("arranque: toda ruta declara permiso", () => {
  it("falla con una ruta /api sin config.permiso", async () => {
    await expect(arrancaCon((a) => a.get("/x", async () => 1))).rejects.toThrow(/sin config.permiso/);
  });
  it("falla con 'cliente' fuera de /api/publico/", async () => {
    await expect(arrancaCon((a) => a.get("/x", { config: { permiso: "cliente" } }, async () => 1))).rejects.toThrow(/fuera de \/api\/publico/);
  });
  it("falla con una ruta de /api/publico/ que no es 'cliente'", async () => {
    await expect(arrancaCon((a) => a.get("/publico/x", { config: { permiso: "sesion" } }, async () => 1))).rejects.toThrow(/no es 'cliente'/);
  });
  it("falla con 'publica' fuera de la lista del contrato", async () => {
    await expect(arrancaCon((a) => a.get("/otra", { config: { permiso: "publica" } }, async () => 1))).rejects.toThrow(/lista de CONTRATOS/);
  });
  it("arranca con rutas bien declaradas", async () => {
    await arrancaCon((a) => {
      a.post("/auth/login", { config: { permiso: "publica" } }, async () => 1);
      a.get("/publico/x", { config: { permiso: "cliente" } }, async () => 1);
      a.get("/y", { config: { permiso: ["a.b", "c.d"] } }, async () => 1);
    });
  });
});

describe("preHandler de permisos", () => {
  let app: FastifyInstance;
  let antes: Instantanea;
  beforeAll(async () => {
    antes = await instantanea();
    app = await crearApp();
  });
  afterAll(async () => {
    await limpiar(app, antes);
    await cerrarPoolPruebas();
  });

  it("sin token -> 401 NO_AUTENTICADO", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/yo" });
    expect(res.statusCode).toBe(401);
    expect(errorDe(res).codigo).toBe("NO_AUTENTICADO");
  });

  it("token basura -> 401 NO_AUTENTICADO", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/yo", headers: auth("no.es.jwt") });
    expect(res.statusCode).toBe(401);
    expect(errorDe(res).codigo).toBe("NO_AUTENTICADO");
  });

  it("sesion cerrada -> 401 SESION_CERRADA", async () => {
    const u = await crearUsuario("Cajero");
    const token = await entrar(app, u);
    await pool.query("update app.sesion set cerrada_en = now() where usuario_id = $1", [u.id]);
    const res = await app.inject({ method: "GET", url: "/api/auth/yo", headers: auth(token) });
    expect(res.statusCode).toBe(401);
    expect(errorDe(res).codigo).toBe("SESION_CERRADA");
  });

  it("sesion vencida -> 401 SESION_CERRADA", async () => {
    const u = await crearUsuario("Cajero");
    const token = await entrar(app, u);
    await pool.query("update app.sesion set expira_en = now() - interval '1 minute' where usuario_id = $1", [u.id]);
    const res = await app.inject({ method: "GET", url: "/api/auth/yo", headers: auth(token) });
    expect(errorDe(res).codigo).toBe("SESION_CERRADA");
  });

  it("jti que ya no existe -> 401 SESION_CERRADA", async () => {
    const u = await crearUsuario("Cajero");
    const token = await entrar(app, u);
    await pool.query("update app.sesion set jti = $2 where usuario_id = $1", [u.id, jtiAleatorio()]);
    const res = await app.inject({ method: "GET", url: "/api/auth/yo", headers: auth(token) });
    expect(res.statusCode).toBe(401);
    expect(errorDe(res).codigo).toBe("SESION_CERRADA");
  });

  it("usuario desactivado directo en la base -> 401 SESION_CERRADA", async () => {
    const u = await crearUsuario("Cajero");
    const token = await entrar(app, u);
    await pool.query("update app.usuario set activo = false where id = $1", [u.id]);
    const res = await app.inject({ method: "GET", url: "/api/auth/yo", headers: auth(token) });
    expect(errorDe(res).codigo).toBe("SESION_CERRADA");
  });

  it("cajero en GET /api/usuarios -> 403 SIN_PERMISO con el permiso en detalles", async () => {
    const token = await entrar(app, await crearUsuario("Cajero"));
    const res = await app.inject({ method: "GET", url: "/api/usuarios", headers: auth(token) });
    expect(res.statusCode).toBe(403);
    expect(errorDe(res)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "usuarios.gestionar" } });
  });

  it("debe_cambiar_contrasena -> 403 fuera de /api/auth/*, y /api/auth/yo sigue abierto", async () => {
    const token = await entrar(app, await crearUsuario("Dueño", { debeCambiar: true }));
    const bloqueada = await app.inject({ method: "GET", url: "/api/usuarios", headers: auth(token) });
    expect(bloqueada.statusCode).toBe(403);
    expect(errorDe(bloqueada).codigo).toBe("CAMBIO_CONTRASENA_REQUERIDO");
    const yo = await app.inject({ method: "GET", url: "/api/auth/yo", headers: auth(token) });
    expect(yo.statusCode).toBe(200);
  });

  it("ruta inexistente -> 404 NO_ENCONTRADO", async () => {
    const res = await app.inject({ method: "GET", url: "/api/no-existe" });
    expect(res.statusCode).toBe(404);
    expect(errorDe(res).codigo).toBe("NO_ENCONTRADO");
  });

  const jwtFalso = async (alg: "otro-secreto" | "none") => {
    const u = await crearUsuario("Dueño");
    await entrar(app, u);
    const { jti } = (await pool.query<{ jti: string }>("select jti from app.sesion where usuario_id = $1", [u.id])).rows[0]!;
    const exp = Math.floor(Date.now() / 1000) + 3600;
    if (alg === "none") {
      const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
      return `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: u.id, jti, exp })}.`;
    }
    return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(u.id).setJti(jti).setExpirationTime(exp)
      .sign(new TextEncoder().encode("otro-secreto-distinto-de-32-caracteres-o-mas"));
  };

  it("JWT firmado con otro secreto -> 401 NO_AUTENTICADO", async () => {
    const res = await app.inject({ method: "GET", url: "/api/usuarios", headers: auth(await jwtFalso("otro-secreto")) });
    expect(res.statusCode).toBe(401);
    expect(errorDe(res).codigo).toBe("NO_AUTENTICADO");
  });

  it("JWT con alg none -> 401 NO_AUTENTICADO", async () => {
    const res = await app.inject({ method: "GET", url: "/api/usuarios", headers: auth(await jwtFalso("none")) });
    expect(res.statusCode).toBe(401);
    expect(errorDe(res).codigo).toBe("NO_AUTENTICADO");
  });

  it("HEAD en una ruta GET exige el mismo permiso", async () => {
    const sin = await app.inject({ method: "HEAD", url: "/api/usuarios" });
    expect(sin.statusCode).toBe(401);
    const cajero = await app.inject({ method: "HEAD", url: "/api/usuarios", headers: auth(await entrar(app, await crearUsuario("Cajero"))) });
    expect(cajero.statusCode).toBe(403);
  });
});

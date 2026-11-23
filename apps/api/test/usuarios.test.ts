import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, cerrarPoolPruebas, crearApp, crearUsuario, entrar, errorDe, instantanea, limpiar, pool, type Instantanea, type UsuarioPrueba } from "./ayuda.js";

let app: FastifyInstance;
let antes: Instantanea;
let dueno: UsuarioPrueba;
let tokenDueno: string;
let tokenCajero: string;

const pedir = (method: "GET" | "POST" | "PATCH", url: string, token?: string, payload?: object) =>
  app.inject({ method, url, headers: token ? auth(token) : {}, ...(payload ? { payload } : {}) });
const rolId = async (nombre: string) => (await pool.query<{ id: string }>("select id from app.rol where nombre = $1", [nombre])).rows[0]!.id;

beforeAll(async () => {
  antes = await instantanea();
  app = await crearApp();
  dueno = await crearUsuario("Dueño");
  tokenDueno = await entrar(app, dueno);
  tokenCajero = await entrar(app, await crearUsuario("Cajero"));
});
afterAll(async () => {
  await limpiar(app, antes);
  await cerrarPoolPruebas();
});

describe("GET /api/usuarios", () => {
  it("lista con la forma Usuario, filtra y nunca trae contrasena_hash", async () => {
    const res = await pedir("GET", `/api/usuarios?buscar=${dueno.usuario}&activo=true&rol_id=${await rolId("Dueño")}`, tokenDueno);
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b).toMatchObject({ total: 1, pagina: 1, por_pagina: 50 });
    expect(b.items[0]).toMatchObject({ id: dueno.id, usuario: dueno.usuario, rol: { nombre: "Dueño" }, activo: true, debe_cambiar_contrasena: false, bloqueado_hasta: null });
    expect(res.body).not.toContain("contrasena_hash");
  });
  it("401 sin token, 403 cajero, 400 con filtro invalido", async () => {
    expect((await pedir("GET", "/api/usuarios")).statusCode).toBe(401);
    const c = await pedir("GET", "/api/usuarios", tokenCajero);
    expect(c.statusCode).toBe(403);
    expect(errorDe(c).codigo).toBe("SIN_PERMISO");
    const v = await pedir("GET", "/api/usuarios?por_pagina=999", tokenDueno);
    expect(v.statusCode).toBe(400);
    expect(errorDe(v).codigo).toBe("VALIDACION");
  });
});

describe("POST /api/usuarios", () => {
  it("201: nace con debe_cambiar_contrasena y puede entrar; usuario en minusculas", async () => {
    const nombre = `tapi_nuevo_${process.pid}`;
    const res = await pedir("POST", "/api/usuarios", tokenDueno, { usuario: nombre.toUpperCase(), nombre: "Nuevo", contrasena: "clave-inicial-1", rol_id: await rolId("Cajero") });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ usuario: nombre, nombre: "Nuevo", rol: { nombre: "Cajero" }, debe_cambiar_contrasena: true, activo: true });
    expect(res.body).not.toContain("contrasena_hash");
    const l = await app.inject({ method: "POST", url: "/api/auth/login", headers: { "x-visitante-ip": "192.0.2.1" }, payload: { usuario: nombre, contrasena: "clave-inicial-1" } });
    expect(l.statusCode).toBe(200);
  });
  it("409 DUPLICADO, 400 VALIDACION (clave corta, usuario malo, rol que no existe), 403, 401", async () => {
    const rol_id = await rolId("Cajero");
    const base = { usuario: dueno.usuario, nombre: "X", contrasena: "clave-inicial-1", rol_id };
    const dup = await pedir("POST", "/api/usuarios", tokenDueno, base);
    expect(dup.statusCode).toBe(409);
    expect(errorDe(dup).codigo).toBe("DUPLICADO");
    for (const mal of [{ ...base, usuario: "nuevo_ok", contrasena: "corta" }, { ...base, usuario: "AB" }, { ...base, usuario: "nuevo_ok", rol_id: "999999" }]) {
      const r = await pedir("POST", "/api/usuarios", tokenDueno, mal);
      expect(r.statusCode).toBe(400);
      expect(errorDe(r).codigo).toBe("VALIDACION");
    }
    expect((await pedir("POST", "/api/usuarios", tokenCajero, base)).statusCode).toBe(403);
    expect((await pedir("POST", "/api/usuarios", undefined, base)).statusCode).toBe(401);
  });
});

describe("PATCH /api/usuarios/:id", () => {
  it("edita campos; 404 si no existe; 400 con datos malos", async () => {
    const u = await crearUsuario("Cajero");
    const ok = await pedir("PATCH", `/api/usuarios/${u.id}`, tokenDueno, { nombre: "Cambiado", telefono: "5512345678", rol_id: await rolId("Almacenista") });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ nombre: "Cambiado", telefono: "5512345678", rol: { nombre: "Almacenista" } });
    expect((await pedir("PATCH", "/api/usuarios/99999999", tokenDueno, { nombre: "X" })).statusCode).toBe(404);
    const mal = await pedir("PATCH", `/api/usuarios/${u.id}`, tokenDueno, { activo: "si" });
    expect(mal.statusCode).toBe(400);
    expect((await pedir("PATCH", "/api/usuarios/abc", tokenDueno, { nombre: "X" })).statusCode).toBe(400);
    expect((await pedir("PATCH", `/api/usuarios/${u.id}`, tokenCajero, { nombre: "X" })).statusCode).toBe(403);
    expect((await pedir("PATCH", `/api/usuarios/${u.id}`, undefined, { nombre: "X" })).statusCode).toBe(401);
  });

  it("desactivar cierra sus sesiones: su token da 401 SESION_CERRADA", async () => {
    const u = await crearUsuario("Cajero");
    const t = await entrar(app, u);
    const res = await pedir("PATCH", `/api/usuarios/${u.id}`, tokenDueno, { activo: false });
    expect(res.statusCode).toBe(200);
    expect(res.json().activo).toBe(false);
    const yo = await pedir("GET", "/api/auth/yo", t);
    expect(yo.statusCode).toBe(401);
    expect(errorDe(yo).codigo).toBe("SESION_CERRADA");
  });

  it("ultimo dueno activo -> 409 ULTIMO_DUENO (desactivar y cambiar de rol)", async () => {
    // El dueno de prueba es el unico dueno activo de la base de pruebas.
    const d = await pedir("PATCH", `/api/usuarios/${dueno.id}`, tokenDueno, { activo: false });
    expect(d.statusCode).toBe(409);
    expect(errorDe(d).codigo).toBe("ULTIMO_DUENO");
    const r = await pedir("PATCH", `/api/usuarios/${dueno.id}`, tokenDueno, { rol_id: await rolId("Cajero") });
    expect(r.statusCode).toBe(409);
    expect(errorDe(r).codigo).toBe("ULTIMO_DUENO");
    // Nada quedo a medias: sigue activo y con su sesion.
    expect((await pedir("GET", "/api/auth/yo", tokenDueno)).statusCode).toBe(200);
  });
});

describe("POST /api/usuarios/:id/contrasena", () => {
  it("restablece: queda debe_cambiar, cierra sesiones y desbloquea; 400/404/403", async () => {
    const u = await crearUsuario("Cajero");
    const t = await entrar(app, u);
    await pool.query("update app.usuario set bloqueado_hasta = now() + interval '10 minutes' where id = $1", [u.id]);
    const res = await pedir("POST", `/api/usuarios/${u.id}/contrasena`, tokenDueno, { nueva: "restablecida-123" });
    expect(res.statusCode).toBe(204);
    expect((await pedir("GET", "/api/auth/yo", t)).statusCode).toBe(401);
    const l = await app.inject({ method: "POST", url: "/api/auth/login", headers: { "x-visitante-ip": "192.0.2.2" }, payload: { usuario: u.usuario, contrasena: "restablecida-123" } });
    expect(l.statusCode).toBe(200);
    expect(l.json().usuario.debe_cambiar_contrasena).toBe(true);
    const corta = await pedir("POST", `/api/usuarios/${u.id}/contrasena`, tokenDueno, { nueva: "corta" });
    expect(corta.statusCode).toBe(400);
    expect((await pedir("POST", "/api/usuarios/99999999/contrasena", tokenDueno, { nueva: "restablecida-123" })).statusCode).toBe(404);
    expect((await pedir("POST", `/api/usuarios/${u.id}/contrasena`, tokenCajero, { nueva: "restablecida-123" })).statusCode).toBe(403);
    expect((await pedir("POST", `/api/usuarios/${u.id}/contrasena`, undefined, { nueva: "restablecida-123" })).statusCode).toBe(401);
  });
});

describe("POST /api/usuarios/:id/cerrar-sesiones", () => {
  it("204 y sus tokens mueren; 404; 403; 401", async () => {
    const u = await crearUsuario("Cajero");
    const t = await entrar(app, u);
    expect((await pedir("POST", `/api/usuarios/${u.id}/cerrar-sesiones`, tokenDueno)).statusCode).toBe(204);
    const yo = await pedir("GET", "/api/auth/yo", t);
    expect(errorDe(yo).codigo).toBe("SESION_CERRADA");
    expect((await pedir("POST", "/api/usuarios/99999999/cerrar-sesiones", tokenDueno)).statusCode).toBe(404);
    expect((await pedir("POST", `/api/usuarios/${u.id}/cerrar-sesiones`, tokenCajero)).statusCode).toBe(403);
    expect((await pedir("POST", `/api/usuarios/${u.id}/cerrar-sesiones`)).statusCode).toBe(401);
  });
});

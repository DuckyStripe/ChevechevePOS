import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, cerrarPoolPruebas, crearApp, crearUsuario, entrar, errorDe, instantanea, limpiar, pool, type Instantanea } from "./ayuda.js";

let app: FastifyInstance;
let antes: Instantanea;
let tokenDueno: string;
let tokenCajero: string;
let n = 0;

const pedir = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, token?: string, payload?: object) =>
  app.inject({ method, url, headers: token ? auth(token) : {}, ...(payload ? { payload } : {}) });
const nuevoRol = (permisos: string[] = ["auditoria.ver"]) => pedir("POST", "/api/roles", tokenDueno, { nombre: `tapi_rol_${process.pid}_${++n}`, descripcion: "de prueba", permisos });
const rolId = async (nombre: string) => (await pool.query<{ id: string }>("select id from app.rol where nombre = $1", [nombre])).rows[0]!.id;

beforeAll(async () => {
  antes = await instantanea();
  app = await crearApp();
  tokenDueno = await entrar(app, await crearUsuario("Dueño"));
  tokenCajero = await entrar(app, await crearUsuario("Cajero"));
});
afterAll(async () => {
  await limpiar(app, antes);
  await cerrarPoolPruebas();
});

describe("GET /api/roles y /api/permisos", () => {
  it("lista roles con permisos y num_usuarios", async () => {
    const res = await pedir("GET", "/api/roles", tokenDueno);
    expect(res.statusCode).toBe(200);
    const roles = res.json() as Array<{ nombre: string; es_sistema: boolean; permisos: string[]; num_usuarios: number }>;
    expect(roles.map((r) => r.nombre)).toEqual(expect.arrayContaining(["Dueño", "Administrador", "Repartidor", "Cajero", "Almacenista"]));
    const admin = roles.find((r) => r.nombre === "Administrador")!;
    expect(admin).toMatchObject({ es_sistema: false, permisos: ["auditoria.ver", "configuracion.editar"] });
    expect(roles.find((r) => r.nombre === "Dueño")!.num_usuarios).toBeGreaterThanOrEqual(1);
  });
  it("lista permisos", async () => {
    const res = await pedir("GET", "/api/permisos", tokenDueno);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(expect.arrayContaining([{ codigo: "usuarios.gestionar", modulo: expect.any(String), descripcion: expect.any(String) }]));
  });
  it("401 sin token y 403 cajero", async () => {
    for (const url of ["/api/roles", "/api/permisos"]) {
      expect((await pedir("GET", url)).statusCode).toBe(401);
      const c = await pedir("GET", url, tokenCajero);
      expect(c.statusCode).toBe(403);
      expect(errorDe(c).codigo).toBe("SIN_PERMISO");
    }
  });
});

describe("POST /api/roles", () => {
  it("201 con sus permisos", async () => {
    const res = await nuevoRol(["auditoria.ver", "configuracion.editar", "auditoria.ver"]);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ es_sistema: false, permisos: ["auditoria.ver", "configuracion.editar"], num_usuarios: 0 });
  });
  it("409 DUPLICADO, 400 permiso inexistente / nombre vacio, 403, 401", async () => {
    const r = (await nuevoRol()).json();
    const dup = await pedir("POST", "/api/roles", tokenDueno, { nombre: r.nombre, permisos: [] });
    expect(dup.statusCode).toBe(409);
    expect(errorDe(dup).codigo).toBe("DUPLICADO");
    for (const mal of [{ nombre: "tapi_x", permisos: ["no.existe"] }, { nombre: "  ", permisos: [] }, { nombre: "tapi_y" }]) {
      const v = await pedir("POST", "/api/roles", tokenDueno, mal);
      expect(v.statusCode).toBe(400);
      expect(errorDe(v).codigo).toBe("VALIDACION");
    }
    expect((await pedir("POST", "/api/roles", tokenCajero, { nombre: "tapi_z", permisos: [] })).statusCode).toBe(403);
    expect((await pedir("POST", "/api/roles", undefined, { nombre: "tapi_z", permisos: [] })).statusCode).toBe(401);
  });
});

describe("PATCH /api/roles/:id", () => {
  it("reemplaza permisos y cambia nombre", async () => {
    const r = (await nuevoRol(["auditoria.ver"])).json();
    const res = await pedir("PATCH", `/api/roles/${r.id}`, tokenDueno, { permisos: ["configuracion.editar"] });
    expect(res.statusCode).toBe(200);
    expect(res.json().permisos).toEqual(["configuracion.editar"]);
    const nombre = `${r.nombre}_b`;
    expect((await pedir("PATCH", `/api/roles/${r.id}`, tokenDueno, { nombre })).json()).toMatchObject({ nombre, permisos: ["configuracion.editar"] });
  });
  it("Dueño -> 409 ROL_SISTEMA; inexistente 404; permiso malo 400; 403; 401", async () => {
    const dueno = await rolId("Dueño");
    const s = await pedir("PATCH", `/api/roles/${dueno}`, tokenDueno, { nombre: "Otro" });
    expect(s.statusCode).toBe(409);
    expect(errorDe(s).codigo).toBe("ROL_SISTEMA");
    expect((await pedir("PATCH", `/api/roles/${dueno}`, tokenDueno, { permisos: [] })).statusCode).toBe(409);
    expect((await pedir("PATCH", "/api/roles/99999999", tokenDueno, { nombre: "tapi_q" })).statusCode).toBe(404);
    const r = (await nuevoRol()).json();
    expect((await pedir("PATCH", `/api/roles/${r.id}`, tokenDueno, { permisos: ["no.existe"] })).statusCode).toBe(400);
    const dup = await pedir("PATCH", `/api/roles/${r.id}`, tokenDueno, { nombre: "Cajero" });
    expect(dup.statusCode).toBe(409);
    expect(errorDe(dup).codigo).toBe("DUPLICADO");
    expect((await pedir("PATCH", `/api/roles/${r.id}`, tokenCajero, { nombre: "tapi_q" })).statusCode).toBe(403);
    expect((await pedir("PATCH", `/api/roles/${r.id}`, undefined, { nombre: "tapi_q" })).statusCode).toBe(401);
  });
});

describe("DELETE /api/roles/:id", () => {
  it("204 si esta libre; 409 ROL_EN_USO con usuarios; 409 ROL_SISTEMA; 404; 403; 401", async () => {
    const libre = (await nuevoRol()).json();
    expect((await pedir("DELETE", `/api/roles/${libre.id}`, tokenDueno)).statusCode).toBe(204);
    expect((await pedir("DELETE", `/api/roles/${libre.id}`, tokenDueno)).statusCode).toBe(404);

    const enUso = (await nuevoRol()).json();
    await pool.query(
      "insert into app.usuario (usuario, nombre, contrasena_hash, rol_id, sucursal_id) values ($1, 'x', 'h', $2, 1)",
      [`tapi_${process.pid}_rol${n}`, enUso.id],
    );
    const e = await pedir("DELETE", `/api/roles/${enUso.id}`, tokenDueno);
    expect(e.statusCode).toBe(409);
    expect(errorDe(e).codigo).toBe("ROL_EN_USO");

    const s = await pedir("DELETE", `/api/roles/${await rolId("Dueño")}`, tokenDueno);
    expect(s.statusCode).toBe(409);
    expect(errorDe(s).codigo).toBe("ROL_SISTEMA");

    expect((await pedir("DELETE", `/api/roles/${enUso.id}`, tokenCajero)).statusCode).toBe(403);
    expect((await pedir("DELETE", `/api/roles/${enUso.id}`)).statusCode).toBe(401);
  });
});

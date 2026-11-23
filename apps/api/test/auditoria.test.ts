import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, cerrarPoolPruebas, crearApp, crearUsuario, entrar, errorDe, instantanea, limpiar, type Instantanea, type UsuarioPrueba } from "./ayuda.js";

let app: FastifyInstance;
let antes: Instantanea;
let admin: UsuarioPrueba;
let tokenAdmin: string;
let tokenCajero: string;

const get = (url: string, token?: string) => app.inject({ method: "GET", url, headers: token ? auth(token) : {} });

beforeAll(async () => {
  antes = await instantanea();
  app = await crearApp();
  admin = await crearUsuario("Administrador");
  tokenAdmin = await entrar(app, admin);
  tokenCajero = await entrar(app, await crearUsuario("Cajero"));
  // Genera una fila auditada por el admin.
  await app.inject({ method: "PATCH", url: "/api/configuracion", headers: auth(tokenAdmin), payload: { negocio_nombre: "Auditada" } });
});
afterAll(async () => {
  await limpiar(app, antes);
  await cerrarPoolPruebas();
});

describe("GET /api/auditoria", () => {
  it("filas de app.auditoria + usuario_nombre, filtradas por tabla y registro", async () => {
    const res = await get("/api/auditoria?tabla=configuracion&registro_id=negocio_nombre", tokenAdmin);
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b).toMatchObject({ total: 1, pagina: 1, por_pagina: 50 });
    expect(b.items[0]).toMatchObject({
      usuario_id: admin.id,
      usuario_nombre: expect.stringContaining("Prueba"),
      cliente_id: null,
      tabla: "configuracion",
      registro_id: "negocio_nombre",
      accion: "actualizar",
      antes: { valor: "" },
      despues: { valor: "Auditada" },
    });
  });

  it("filtra por usuario_id y por fechas locales; nunca expone contrasena_hash", async () => {
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
    const ok = await get(`/api/auditoria?usuario_id=${admin.id}&desde=${hoy}&hasta=${hoy}`, tokenAdmin);
    expect(ok.json().total).toBeGreaterThanOrEqual(1);
    const vacio = await get(`/api/auditoria?usuario_id=${admin.id}&desde=2000-01-01&hasta=2000-01-02`, tokenAdmin);
    expect(vacio.json()).toMatchObject({ total: 0, items: [] });
    const usuarios = await get("/api/auditoria?tabla=usuario", tokenAdmin);
    expect(usuarios.statusCode).toBe(200);
    expect(usuarios.body).not.toContain("contrasena_hash");
    expect(usuarios.body).not.toContain("hash-secreto");
  });

  it("400 con fecha invalida o por_pagina excesivo", async () => {
    for (const q of ["desde=ayer", "hasta=2026-13-45", "por_pagina=500"]) {
      const res = await get(`/api/auditoria?${q}`, tokenAdmin);
      expect(res.statusCode, q).toBe(400);
      expect(errorDe(res).codigo).toBe("VALIDACION");
    }
  });

  it("403 cajero (sin auditoria.ver), 401 sin token", async () => {
    const c = await get("/api/auditoria", tokenCajero);
    expect(c.statusCode).toBe(403);
    expect(errorDe(c)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "auditoria.ver" } });
    expect((await get("/api/auditoria")).statusCode).toBe(401);
  });
});

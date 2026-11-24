import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar, errorDe, pool } from "./ayuda.js";
import { sufijo } from "./ayuda-f2.js";
import { crearUsuarioF3, pedirPersonal, snapshotF3, tokenF3, type Snapshot } from "./ayuda-f3.js";
import { bodegaAntes, limpiarF6, type BodegaAntes } from "./ayuda-f6.js";

let app: FastifyInstance;
let antes: Snapshot;
let bodega: BodegaAntes;
let pedir: ReturnType<typeof pedirPersonal>;
let dueno: string;
let admin: string;
let almacenista: string;
let repartidor: string;
let cajero: string;

beforeAll(async () => {
  antes = await snapshotF3();
  bodega = await bodegaAntes();
  app = await crearApp();
  pedir = pedirPersonal(app);
  dueno = await entrar(app, await crearUsuarioF3("Dueño"));
  admin = await tokenF3(app, "Administrador");
  almacenista = await tokenF3(app, "Almacenista");
  repartidor = await tokenF3(app, "Repartidor");
  cajero = await tokenF3(app, "Cajero");
});
afterAll(async () => {
  await limpiarF6(app, antes, bodega);
  await cerrarPoolPruebas();
});

describe("/api/vehiculos", () => {
  it("alta 201, lista con filtro activo, edicion (incluye borrar placas y capacidad con null) y desactivar", async () => {
    const nombre = `TF6 Camioneta ${sufijo()}`;
    const c = await pedir("POST", "/api/vehiculos", dueno, { nombre: `  ${nombre}  `, placas: "ABC-123", capacidad_cajas: 120 });
    expect(c.statusCode).toBe(201);
    const v = c.json<{ id: string }>();
    expect(c.json()).toEqual({ id: expect.any(String), nombre, placas: "ABC-123", capacidad_cajas: 120, activo: true });

    const lista = (await pedir("GET", "/api/vehiculos?activo=true", almacenista)).json<{ items: { id: string }[]; total: number; pagina: number; por_pagina: number }>();
    expect(lista).toMatchObject({ pagina: 1, por_pagina: 50 });
    expect(lista.items.map((x) => x.id)).toContain(v.id);

    const p = await pedir("PATCH", `/api/vehiculos/${v.id}`, admin, { placas: null, capacidad_cajas: null, nombre: `${nombre} B` });
    expect(p.statusCode).toBe(200);
    expect(p.json()).toEqual({ id: v.id, nombre: `${nombre} B`, placas: null, capacidad_cajas: null, activo: true });
    const solo = await pedir("PATCH", `/api/vehiculos/${v.id}`, admin, { activo: false });
    expect(solo.json()).toMatchObject({ nombre: `${nombre} B`, activo: false });
    const inactivos = (await pedir("GET", "/api/vehiculos?activo=false", admin)).json<{ items: { id: string }[] }>();
    expect(inactivos.items.map((x) => x.id)).toContain(v.id);
    expect((await pedir("GET", "/api/vehiculos?activo=true", admin)).json<{ items: { id: string }[] }>().items.map((x) => x.id)).not.toContain(v.id);
    // la bitacora registra el alta
    expect((await pool.query("select 1 from app.auditoria where tabla = 'vehiculo' and registro_id = $1 and accion = 'insertar'", [v.id])).rowCount).toBe(1);
  });

  it("409 DUPLICADO con el mismo nombre (sin importar mayusculas); 400 de cuerpo; 404 al editar uno que no existe", async () => {
    const nombre = `TF6 Camioneta ${sufijo()}`;
    await pedir("POST", "/api/vehiculos", dueno, { nombre });
    const dup = await pedir("POST", "/api/vehiculos", dueno, { nombre: nombre.toUpperCase() });
    expect(dup.statusCode).toBe(409);
    expect(errorDe(dup).codigo).toBe("DUPLICADO");
    for (const mal of [{}, { nombre: "  " }, { nombre: "TF6 x", capacidad_cajas: 0 }, { nombre: "TF6 x", capacidad_cajas: 1.5 }, { nombre: "TF6 x", activo: "si" }]) {
      expect((await pedir("POST", "/api/vehiculos", dueno, mal)).statusCode).toBe(400);
    }
    expect((await pedir("PATCH", "/api/vehiculos/999999999", dueno, { activo: false })).statusCode).toBe(404);
    expect((await pedir("PATCH", "/api/vehiculos/1", dueno, {})).statusCode).toBe(400);
    expect((await pedir("GET", "/api/vehiculos?activo=quizas", dueno)).statusCode).toBe(400);
  });

  it("ver: rutas.ver; escribir: configuracion.editar; 401 sin sesion", async () => {
    expect((await pedir("GET", "/api/vehiculos")).statusCode).toBe(401);
    for (const t of [repartidor, cajero]) {
      const r = await pedir("GET", "/api/vehiculos", t);
      expect(r.statusCode).toBe(403);
      expect(errorDe(r).detalles).toEqual({ permiso: "rutas.ver" });
    }
    for (const t of [almacenista, repartidor]) {
      const r = await pedir("POST", "/api/vehiculos", t, { nombre: `TF6 x ${sufijo()}` });
      expect(r.statusCode).toBe(403);
      expect(errorDe(r).detalles).toEqual({ permiso: "configuracion.editar" });
    }
    expect((await pedir("PATCH", "/api/vehiculos/1", almacenista, { activo: false })).statusCode).toBe(403);
  });
});

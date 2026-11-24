import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, cerrarPoolPruebas, crearApp, crearUsuario, entrar, errorDe, instantanea, limpiar, pool, type Instantanea, type UsuarioPrueba } from "./ayuda.js";

let app: FastifyInstance;
let antes: Instantanea;
let admin: UsuarioPrueba;
let tokenAdmin: string;
let tokenCajero: string;

const pedir = (method: "GET" | "PATCH", token?: string, payload?: object) =>
  app.inject({ method, url: "/api/configuracion", headers: token ? auth(token) : {}, ...(payload ? { payload } : {}) });

beforeAll(async () => {
  antes = await instantanea();
  app = await crearApp();
  admin = await crearUsuario("Administrador");
  tokenAdmin = await entrar(app, admin);
  tokenCajero = await entrar(app, await crearUsuario("Cajero"));
});
afterAll(async () => {
  await limpiar(app, antes);
  await cerrarPoolPruebas();
});

describe("GET /api/configuracion", () => {
  it("objeto plano con todas las claves + sucursal, para cualquier sesion", async () => {
    const res = await pedir("GET", tokenCajero);
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b).toMatchObject({ pedido_minimo: "0.00", hora_corte: "18:00", faltante_accion_predeterminada: "quitar", respaldo_ultima_prueba: null, sucursal: { lat: null, lng: null } });
    const n = await pool.query<{ n: number }>("select count(*)::int as n from app.configuracion");
    // todas las claves + sucursal + lealtad_regalo (derivada de la presentacion elegida, no es una clave)
    expect(Object.keys(b)).toHaveLength(n.rows[0]!.n + 2);
    expect(b.lealtad_regalo).toBeNull();
  });
  it("401 sin token", async () => {
    expect((await pedir("GET")).statusCode).toBe(401);
  });
});

describe("PATCH /api/configuracion", () => {
  it("cambia solo las claves enviadas, normaliza dinero y guarda la ubicacion; queda auditado", async () => {
    const res = await pedir("PATCH", tokenAdmin, {
      negocio_nombre: "Bodega Prueba",
      pedido_minimo: "150.5",
      reparto_velocidad_kmh: 30,
      enlace_tras_primera_compra: false,
      sucursal: { lat: 19.4326, lng: "-99.1332" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      negocio_nombre: "Bodega Prueba",
      pedido_minimo: "150.50",
      reparto_velocidad_kmh: 30,
      enlace_tras_primera_compra: false,
      hora_corte: "18:00",
      sucursal: { lat: "19.432600", lng: "-99.133200" },
    });
    expect((await pedir("GET", tokenCajero)).json().negocio_nombre).toBe("Bodega Prueba");
    const a = await pool.query("select 1 from app.auditoria where tabla = 'configuracion' and registro_id = 'negocio_nombre' and usuario_id = $1", [admin.id]);
    expect(a.rowCount).toBe(1);
  });

  it("limpiar la ubicacion con nulls", async () => {
    await pedir("PATCH", tokenAdmin, { sucursal: { lat: "19.1", lng: "-99.1" } });
    const res = await pedir("PATCH", tokenAdmin, { sucursal: { lat: null, lng: null } });
    expect(res.json().sucursal).toEqual({ lat: null, lng: null });
  });

  it("400 VALIDACION: clave desconocida, valor invalido, respaldo_ultima_prueba (solo lectura), un solo lado de la ubicacion", async () => {
    for (const mal of [
      { no_existe: 1 },
      { pedido_minimo: "abc" },
      { hora_corte: "25:99" },
      { faltante_accion_predeterminada: "otra" },
      { respaldo_ultima_prueba: "2026-01-01" },
      { sucursal: { lat: "19.1", lng: null } },
      { sucursal: { lat: 120, lng: 10 } },
      { url_publica: "https://x.com/ruta" },
    ]) {
      const res = await pedir("PATCH", tokenAdmin, mal);
      expect(res.statusCode, JSON.stringify(mal)).toBe(400);
      expect(errorDe(res).codigo).toBe("VALIDACION");
    }
  });

  it("403 SIN_PERMISO cajero con configuracion.editar; 401 sin token", async () => {
    const c = await pedir("PATCH", tokenCajero, { negocio_nombre: "X" });
    expect(c.statusCode).toBe(403);
    expect(errorDe(c)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "configuracion.editar" } });
    expect((await pedir("PATCH", undefined, { negocio_nombre: "X" })).statusCode).toBe(401);
  });
});

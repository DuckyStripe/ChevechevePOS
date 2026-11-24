import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar, errorDe, pool } from "./ayuda.js";
import { crearUsuarioF3, limpiarF3, pedirPersonal, snapshotF3, type Snapshot } from "./ayuda-f3.js";
import { llaves } from "./ayuda-f8.js";

// F9 paquete C: GET /api/tablero. Cada llave existe solo si el usuario tiene el permiso de su reporte (sin permiso la llave no existe, no es null).
let app: FastifyInstance;
let antes: Snapshot;
let pedir: ReturnType<typeof pedirPersonal>;
let dueno: string;
let admin: string;
let cajero: string;
let repartidor: string;

const LLAVES = ["ventas_hoy", "utilidad_mes", "cxc_total", "cxc_vencido", "bajo_minimo", "por_caducar", "precios_bajo_costo"];
const tablero = async (token: string) => {
  const r = await pedir("GET", "/api/tablero", token);
  expect(r.statusCode, r.body).toBe(200);
  return r.json<Record<string, unknown>>();
};
const json = async (token: string, url: string) => (await pedir("GET", url, token)).json();

beforeAll(async () => {
  antes = await snapshotF3();
  app = await crearApp();
  pedir = pedirPersonal(app);
  const token = async (rol: "Dueño" | "Administrador" | "Cajero" | "Repartidor") => entrar(app, await crearUsuarioF3(rol));
  dueno = await token("Dueño");
  admin = await token("Administrador");
  cajero = await token("Cajero");
  repartidor = await token("Repartidor");
});
afterAll(async () => {
  await limpiarF3(app, antes);
  await cerrarPoolPruebas();
});

describe("tablero", () => {
  it("Dueño ve las 7 llaves: dinero como string, conteos como numero", async () => {
    const t = await tablero(dueno);
    expect(Object.keys(t).sort()).toEqual([...LLAVES].sort());
    for (const k of ["ventas_hoy", "utilidad_mes", "cxc_total", "cxc_vencido"]) expect(t[k], k).toMatch(/^-?\d+\.\d{2}$/);
    for (const k of ["bajo_minimo", "por_caducar", "precios_bajo_costo"]) expect(Number.isInteger(t[k]), k).toBe(true);
  });

  it("Administrador: sin utilidad_mes ni precios_bajo_costo (costos.ver); el resto si", async () => {
    const t = await tablero(admin);
    expect(Object.keys(t).sort()).toEqual(["bajo_minimo", "cxc_total", "cxc_vencido", "por_caducar", "ventas_hoy"]);
    expect("utilidad_mes" in t).toBe(false);
    expect("precios_bajo_costo" in t).toBe(false);
    expect(llaves(t).filter((k) => /costo|utilidad|margen|ganancia/i.test(k))).toEqual([]);
  });

  it("Cajero: solo cobranza.ver e inventario.ver; Repartidor: objeto vacio; sin sesion 401", async () => {
    expect(Object.keys(await tablero(cajero)).sort()).toEqual(["bajo_minimo", "cxc_total", "cxc_vencido", "por_caducar"]);
    expect(await tablero(repartidor)).toEqual({});
    const r = await app.inject({ method: "GET", url: "/api/tablero" });
    expect(r.statusCode).toBe(401);
    expect(errorDe(r).codigo).toBe("NO_AUTENTICADO");
  });

  it("ventas_hoy = total de /reportes/ventas de hoy; cxc_total y cxc_vencido = totales de cuentas por cobrar", async () => {
    const hoy = (await pool.query<{ d: string }>("select app.fn_fecha_local(now())::text as d")).rows[0]!.d;
    const t = await tablero(dueno);
    const ventas = await json(dueno, `/api/reportes/ventas?desde=${hoy}&hasta=${hoy}&agrupar=dia`);
    expect(t.ventas_hoy).toBe((ventas as { totales: { importe: string } }).totales.importe);
    const cxc = (await json(dueno, `/api/reportes/cuentas-por-cobrar?al=${hoy}`)) as { totales: Record<string, string> };
    expect(t.cxc_total).toBe(cxc.totales.total);
    const vencido = (await pool.query<{ v: string }>("select coalesce(sum(vencido), 0)::numeric(14,2)::text as v from app.v_saldo_cliente")).rows[0]!.v;
    expect(t.cxc_vencido).toBe(vencido);
    const util = (await json(dueno, `/api/reportes/utilidad?desde=${hoy.slice(0, 8)}01&hasta=${hoy}&agrupar=mes`)) as { totales: { utilidad: string } };
    expect(t.utilidad_mes).toBe(util.totales.utilidad);
  });

  it("ventas_hoy y utilidad del dia = /cierre/resumen (una sola regla: v_ventas_lineas)", async () => {
    const hoy = (await pool.query<{ d: string }>("select app.fn_fecha_local(now())::text as d")).rows[0]!.d;
    const t = await tablero(dueno);
    const r = (await json(dueno, `/api/cierre/resumen?fecha=${hoy}`)) as { vendido: string };
    expect(t.ventas_hoy).toBe(r.vendido);
  });

  it("bajo_minimo, por_caducar y precios_bajo_costo = las filas de las pantallas que ya los muestran", async () => {
    const t = await tablero(dueno);
    expect(t.bajo_minimo).toBe(((await json(dueno, "/api/reportes/bajo-minimo")) as { filas: unknown[] }).filas.length);
    const lotes = (await json(dueno, "/api/inventario/por-caducar?por_pagina=200")) as { items: { producto_id: string }[] };
    expect(t.por_caducar).toBe(new Set(lotes.items.map((x) => String(x.producto_id))).size);
    expect(t.precios_bajo_costo).toBe(((await json(dueno, "/api/precios/bajo-costo")) as { filas: unknown[] }).filas.length);
  });
});

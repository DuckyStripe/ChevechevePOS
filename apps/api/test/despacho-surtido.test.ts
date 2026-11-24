import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar } from "./ayuda.js";
import { crearUsuarioF3, limpiarF3, pedirPersonal, snapshotF3, tokenF3, type Snapshot } from "./ayuda-f3.js";
import { escenarioF5, limpiarF5, type EscenarioF5 } from "./ayuda-f5.js";

let app: FastifyInstance;
let antes: Snapshot;
let pedir: ReturnType<typeof pedirPersonal>;
let dueno: { token: string; id: string };
let e: EscenarioF5;
const tokens: Record<string, string> = {};

beforeAll(async () => {
  antes = await snapshotF3();
  app = await crearApp();
  pedir = pedirPersonal(app);
  const u = await crearUsuarioF3("Dueño");
  dueno = { token: await entrar(app, u), id: u.id };
  for (const rol of ["Administrador", "Almacenista", "Cajero", "Repartidor"] as const) tokens[rol] = await tokenF3(app, rol);
  e = await escenarioF5(app, dueno, tokens.Cajero!);
});
afterAll(async () => {
  await limpiarF5();
  await limpiarF3(app, antes);
  await cerrarPoolPruebas();
});

describe("GET /api/despacho: bloque surtido", () => {
  it("con surtido.ver trae surtido.productos_por_comprar = filas de /surtido de esa fecha; sin el permiso no hay bloque", async () => {
    const lista = (await pedir("GET", `/api/surtido?fecha=${e.manana}`, dueno.token)).json<{ totales: { productos: number } }>();
    expect(lista.totales.productos).toBeGreaterThanOrEqual(2); // Corona y Victoria
    for (const t of [dueno.token, tokens.Administrador!, tokens.Almacenista!]) {
      const d = (await pedir("GET", `/api/despacho?fecha=${e.manana}`, t)).json();
      expect(d.surtido).toEqual({ productos_por_comprar: lista.totales.productos });
    }
    for (const t of [tokens.Cajero!, tokens.Repartidor!]) {
      expect((await pedir("GET", `/api/despacho?fecha=${e.manana}`, t)).json()).not.toHaveProperty("surtido");
    }
  });

  it("sin fecha usa hoy: el contador es el de la lista de hoy", async () => {
    const lista = (await pedir("GET", `/api/surtido?fecha=${e.hoy}`, dueno.token)).json<{ totales: { productos: number } }>();
    const d = (await pedir("GET", "/api/despacho", dueno.token)).json();
    expect(d.fecha).toBe(e.hoy);
    expect(d.surtido).toEqual({ productos_por_comprar: lista.totales.productos });
  });
});

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar } from "./ayuda.js";
import { crearUsuarioF3, pedirPersonal, snapshotF3, tokenF3, type Snapshot } from "./ayuda-f3.js";
import {
  bodegaAntes, crearRuta, escenarioF6, limpiarF6, repartidorF6, rutaConPedidos, rutaEnCurso,
  type BodegaAntes, type Dueno, type EscenarioF6, type RutaApi,
} from "./ayuda-f6.js";

let app: FastifyInstance;
let antes: Snapshot;
let bodega: BodegaAntes;
let pedir: ReturnType<typeof pedirPersonal>;
let dueno: Dueno;
let almacenista: string;
let cajero: string;
let rep: Dueno;
let otro: Dueno;
let e: EscenarioF6;
let planeada: RutaApi;
let enCurso: RutaApi;
let ajena: RutaApi;

beforeAll(async () => {
  antes = await snapshotF3();
  bodega = await bodegaAntes();
  app = await crearApp();
  pedir = pedirPersonal(app);
  const u = await crearUsuarioF3("Dueño");
  dueno = { token: await entrar(app, u), id: u.id };
  almacenista = await tokenF3(app, "Almacenista");
  cajero = await tokenF3(app, "Cajero");
  rep = await repartidorF6(app);
  otro = await repartidorF6(app);
  e = await escenarioF6(app, dueno, { n: 4 });
  planeada = await rutaConPedidos(app, dueno, e, rep.id, [e.pedidos[0]!]);
  enCurso = await rutaEnCurso(app, dueno, e, rep, [e.pedidos[1]!, e.pedidos[2]!]);
  ajena = await rutaEnCurso(app, dueno, e, otro, [e.pedidos[3]!]);
});
afterAll(async () => {
  await limpiarF6(app, antes, bodega);
  await cerrarPoolPruebas();
});

type Bloque = { lista: { id: string; folio: string; nombre: string | null; estado: string; repartidor: string; paradas: number; entregadas: number }[]; por_cargar: number; en_curso: number };

describe("GET /api/despacho: bloque rutas", () => {
  it("con rutas.ver ve todas las de la fecha (menos canceladas) con paradas y entregadas; cuenta por_cargar y en_curso", async () => {
    const cancelada = (await crearRuta(app, dueno.token, e, rep.id)).json<RutaApi>();
    await pedir("POST", `/api/rutas/${cancelada.id}/cancelar`, dueno.token);
    const d = (await pedir("GET", `/api/despacho?fecha=${e.manana}`, almacenista)).json<{ rutas: Bloque }>();
    const mias = d.rutas.lista.filter((r) => [planeada.id, enCurso.id, ajena.id, cancelada.id].includes(r.id));
    expect(mias.map((r) => r.id)).toEqual([planeada.id, enCurso.id, ajena.id]);
    expect(mias[0]).toEqual({ id: planeada.id, folio: planeada.folio, nombre: null, estado: "planeada", repartidor: expect.any(String), paradas: 1, entregadas: 0 });
    expect(mias[1]).toMatchObject({ estado: "en_curso", paradas: 2, entregadas: 0 });
    expect(d.rutas.por_cargar).toBe(d.rutas.lista.filter((r) => r.estado === "planeada").length);
    expect(d.rutas.en_curso).toBe(d.rutas.lista.filter((r) => r.estado === "en_curso").length);
    expect(d.rutas.por_cargar).toBeGreaterThanOrEqual(1);
    expect(d.rutas.en_curso).toBeGreaterThanOrEqual(2);
    const dueno2 = (await pedir("GET", `/api/despacho?fecha=${e.manana}`, dueno.token)).json<{ rutas: Bloque }>();
    expect(dueno2.rutas.lista.map((r) => r.id)).toEqual(expect.arrayContaining([planeada.id, enCurso.id, ajena.id]));
  });

  it("con solo rutas.operar, solo las propias; otra fecha, vacio; sin permiso de rutas, sin bloque", async () => {
    const d = (await pedir("GET", `/api/despacho?fecha=${e.manana}`, rep.token)).json<{ rutas: Bloque }>();
    expect(d.rutas.lista.map((r) => r.id)).toEqual([planeada.id, enCurso.id]);
    expect(d.rutas).toMatchObject({ por_cargar: 1, en_curso: 1 });
    const o = (await pedir("GET", `/api/despacho?fecha=${e.manana}`, otro.token)).json<{ rutas: Bloque }>();
    expect(o.rutas.lista.map((r) => r.id)).toEqual([ajena.id]);
    const vacio = (await pedir("GET", "/api/despacho?fecha=2030-01-02", almacenista)).json<{ rutas: Bloque }>();
    expect(vacio.rutas).toEqual({ lista: [], por_cargar: 0, en_curso: 0 });
    expect((await pedir("GET", "/api/despacho", cajero)).json()).not.toHaveProperty("rutas");
  });
});

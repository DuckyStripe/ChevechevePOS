import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar, pool } from "./ayuda.js";
import { activarCliente, crearUsuarioF3, pedirCliente, pedirPersonal, snapshotF3, type Snapshot } from "./ayuda-f3.js";
import {
  bodegaAntes, clienteEn, escenarioF6, limpiarF6, pedidoConfirmado, repartidorF6, rutaConPedidos,
  type BodegaAntes, type Dueno, type EscenarioF6, type RutaApi,
} from "./ayuda-f6.js";

let app: FastifyInstance;
let antes: Snapshot;
let bodega: BodegaAntes;
let pedir: ReturnType<typeof pedirPersonal>;
let publico: ReturnType<typeof pedirCliente>;
let dueno: Dueno;
let rep: Dueno;
let e: EscenarioF6;

beforeAll(async () => {
  antes = await snapshotF3();
  bodega = await bodegaAntes();
  app = await crearApp();
  pedir = pedirPersonal(app);
  publico = pedirCliente(app);
  const u = await crearUsuarioF3("Dueño");
  dueno = { token: await entrar(app, u), id: u.id };
  rep = await repartidorF6(app);
  e = await escenarioF6(app, dueno, { n: 4 });
});
afterAll(async () => {
  await limpiarF6(app, antes, bodega);
  await cerrarPoolPruebas();
});

describe("«parada N de M» del cliente", () => {
  it("antes de salir no hay reparto; en ruta de 4 paradas el cliente de la parada 3 ve {parada:3, paradas:4} y su hora; fallar la parada 1 sube su lugar; nunca ve al repartidor ni otras paradas", async () => {
    const r = await rutaConPedidos(app, dueno, e, rep.id, e.pedidos);
    const opt = await pedir("POST", `/api/rutas/${r.id}/optimizar`, dueno.token);
    expect(opt.statusCode).toBe(200);
    const orden = opt.json<{ ruta: RutaApi }>().ruta.paradas;
    expect(orden.map((p) => p.pedido!.id)).toEqual(e.pedidos);
    const cliente3 = await activarCliente(app, e.clientes[2]!);

    expect((await publico("GET", `/api/publico/pedidos/${e.pedidos[2]}`, cliente3)).json()).toMatchObject({ etapa: "confirmado", reparto: null });
    await pedir("POST", `/api/rutas/${r.id}/cargar`, dueno.token);
    expect((await publico("GET", `/api/publico/pedidos/${e.pedidos[2]}`, cliente3)).json()).toMatchObject({ etapa: "cargado", etiqueta: "Cargado en el camión", reparto: null });
    expect((await pedir("POST", `/api/rutas/${r.id}/iniciar`, rep.token, {})).statusCode).toBe(200);

    const lista = (await publico("GET", "/api/publico/pedidos", cliente3)).json<{ items: { id: string; etapa: string; reparto: unknown }[] }>();
    expect(lista.items).toHaveLength(1);
    expect(lista.items[0]).toMatchObject({ id: e.pedidos[2], etapa: "en_ruta", reparto: { parada: 3, paradas: 4 } });
    expect(lista.items[0]!.reparto).toEqual({ parada: 3, paradas: 4 }); // la lista solo trae N de M

    const seg = (await publico("GET", `/api/publico/pedidos/${e.pedidos[2]}`, cliente3)).json<{ reparto: { parada: number; paradas: number; antes_que_tu: number; llegada_estimada_desde: string; llegada_estimada_hasta: string } }>();
    expect(seg).toMatchObject({ etapa: "en_ruta", etiqueta: "En camino", reparto: { parada: 3, paradas: 4, antes_que_tu: 2 } });
    // 3 tramos de 1.05 km a 25 km/h (7.6 min) + 2 paradas de 10 min + 30 min de margen = 57.6 min
    const hasta = (Date.parse(seg.reparto.llegada_estimada_hasta) - Date.now()) / 60_000;
    expect(hasta).toBeGreaterThan(55.5);
    expect(hasta).toBeLessThan(58.5);
    expect(Math.abs(Date.parse(seg.reparto.llegada_estimada_desde) - Date.now()) / 60_000).toBeLessThan(2);
    expect(JSON.stringify(seg)).not.toMatch(/repartidor|telefono/i);
    expect(Object.keys(seg.reparto).sort()).toEqual(["antes_que_tu", "llegada_estimada_desde", "llegada_estimada_hasta", "parada", "paradas"]);
    // ningun otro cliente ve este pedido
    const cliente1 = await activarCliente(app, e.clientes[0]!);
    expect((await publico("GET", `/api/publico/pedidos/${e.pedidos[2]}`, cliente1)).statusCode).toBe(404);

    await pedir("POST", `/api/rutas/paradas/${orden[0]!.id}/no-entregado`, rep.token, { motivo: "cerrado" });
    const despues = (await publico("GET", `/api/publico/pedidos/${e.pedidos[2]}`, cliente3)).json<{ reparto: { antes_que_tu: number; parada: number } }>();
    expect(despues.reparto).toMatchObject({ parada: 3, antes_que_tu: 1 });
    // el del que falla ya no es «en camino»
    const primero = (await publico("GET", `/api/publico/pedidos/${e.pedidos[0]}`, cliente1)).json();
    expect(primero).toMatchObject({ etapa: "no_entregado", reparto: null });
  });
});

describe("GET /api/pedidos: requiere_surtido y ruta", () => {
  it("requiere_surtido true solo cuando el pedido deja disponible < 0; ruta {id, folio} en los asignados y null en los demas", async () => {
    const libre = await clienteEn(app, dueno, 19, -98.9);
    const chico = await pedidoConfirmado(app, dueno, e.k, libre.id, e.manana);
    const lista = async () => (await pedir("GET", `/api/pedidos?estado=confirmado&cliente_id=${libre.id}`, dueno.token)).json<{ items: { id: string; requiere_surtido: boolean; ruta: { id: string; folio: string } | null }[] }>().items;
    expect((await lista()).find((p) => p.id === chico)).toMatchObject({ requiere_surtido: false, ruta: null });

    const grande = await pedidoConfirmado(app, dueno, e.k, libre.id, e.manana, [{ presentacion_id: e.k.corona.caja, cantidad: 3 }]); // 72 pz de 60
    const filas = await lista();
    expect(filas.find((p) => p.id === grande)!.requiere_surtido).toBe(true);
    const seg = await pool.query("select app.fn_requiere_surtido($1) as r", [grande]);
    expect(seg.rows[0].r).toBe(true);

    const r = await rutaConPedidos(app, dueno, e, rep.id, [chico]);
    expect((await lista()).find((p) => p.id === chico)!.ruta).toEqual({ id: r.id, folio: r.folio });
    expect((await pedir("GET", `/api/pedidos/${chico}`, dueno.token)).json()).toMatchObject({ ruta: { id: r.id, folio: r.folio } });
    expect((await lista()).find((p) => p.id === grande)!.ruta).toBeNull();
    expect((await pedir("GET", `/api/pedidos?ruta_id=${r.id}`, dueno.token)).json().items.map((p: { id: string }) => p.id)).toEqual([chico]);

    // el cliente de un pedido confirmado que requiere surtido ve «Preparando tu pedido»
    const cred = await activarCliente(app, libre);
    expect((await publico("GET", `/api/publico/pedidos/${grande}`, cred)).json()).toMatchObject({ etapa: "surtiendo", etiqueta: "Preparando tu pedido" });
    // la lista del cliente usa la misma etapa (una sola funcion en SQL)
    const lista2 = (await publico("GET", "/api/publico/pedidos", cred)).json<{ items: { id: string; etapa: string; etiqueta: string }[] }>().items;
    expect(lista2.find((x) => x.id === grande)).toMatchObject({ etapa: "surtiendo", etiqueta: "Preparando tu pedido" });
    // cancelar un pedido de una ruta planeada lo saca de la ruta
    expect((await pedir("POST", `/api/pedidos/${chico}/cancelar`, dueno.token, { motivo: "ya no lo quiere" })).statusCode).toBe(200);
    expect((await pedir("GET", `/api/rutas/${r.id}`, dueno.token)).json<RutaApi>().paradas).toEqual([]);
  });
});

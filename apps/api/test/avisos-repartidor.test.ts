import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar, errorDe, pool } from "./ayuda.js";
import { crearUsuarioF3, pedirPersonal, snapshotF3, type Snapshot } from "./ayuda-f3.js";
import { bodegaAntes, escenarioF6, limpiarF6, repartidorF6, rutaEnCurso, type BodegaAntes, type Dueno, type EscenarioF6, type RutaApi } from "./ayuda-f6.js";

let app: FastifyInstance;
let antes: Snapshot;
let bodega: BodegaAntes;
let pedir: ReturnType<typeof pedirPersonal>;
let dueno: Dueno;
let admin: Dueno;
let rep: Dueno;
let otro: Dueno;
let e: EscenarioF6;
let suya: RutaApi;

beforeAll(async () => {
  antes = await snapshotF3();
  bodega = await bodegaAntes();
  app = await crearApp();
  pedir = pedirPersonal(app);
  const u = await crearUsuarioF3("Dueño");
  dueno = { token: await entrar(app, u), id: u.id };
  const a = await crearUsuarioF3("Administrador");
  admin = { token: await entrar(app, a), id: a.id };
  rep = await repartidorF6(app);
  otro = await repartidorF6(app);
  e = await escenarioF6(app, dueno, { n: 3 });
  suya = await rutaEnCurso(app, dueno, e, rep, [e.pedidos[0]!, e.pedidos[1]!]);
  await rutaEnCurso(app, dueno, e, otro, [e.pedidos[2]!]);
});
afterAll(async () => {
  await limpiarF6(app, antes, bodega);
  await cerrarPoolPruebas();
});

type Aviso = { id: string; pedido_folio: string | null; plantilla: string; estado: string; texto: string; url: string };
const folioDe = async (pedido: string) => (await pool.query<{ folio: string }>("select folio from app.pedido where id = $1", [pedido])).rows[0]!.folio;

describe("avisos del Repartidor (solo los de pedidos de sus rutas)", () => {
  it("GET /avisos: solo wa_pedido_en_ruta / wa_entrega_fallida de su ruta; con el texto y enlace de wa.me listos", async () => {
    const mios = (await pedir("GET", "/api/avisos", rep.token)).json<{ items: Aviso[] }>().items;
    const folios = await Promise.all([e.pedidos[0]!, e.pedidos[1]!].map(folioDe));
    expect(mios.map((a) => a.pedido_folio).sort()).toEqual([...folios].sort());
    expect(mios.every((a) => a.plantilla === "wa_pedido_en_ruta")).toBe(true);
    expect(mios[0]!.texto).toMatch(/parada \d de 2/);
    expect(mios[0]!.url).toMatch(/^https:\/\/wa\.me\/5215512345678\?text=/);

    const ajenos = (await pedir("GET", "/api/avisos", otro.token)).json<{ items: Aviso[] }>().items;
    expect(ajenos.map((a) => a.pedido_folio)).toEqual([await folioDe(e.pedidos[2]!)]);

    // Una entrega fallida de su ruta tambien le llega; el aviso de en_ruta de ese pedido ya no esta pendiente (el nuevo lo reemplaza).
    await pedir("POST", `/api/rutas/paradas/${suya.paradas[1]!.id}/no-entregado`, rep.token, { motivo: "cerrado" });
    const despues = (await pedir("GET", "/api/avisos", rep.token)).json<{ items: Aviso[] }>().items;
    expect(despues.map((a) => a.plantilla).sort()).toEqual(["wa_entrega_fallida", "wa_pedido_en_ruta"]);
    expect(despues.find((a) => a.plantilla === "wa_entrega_fallida")!.texto).toContain("cerrado");

    // Quien tiene pedidos.ver ve todos.
    const todos = (await pedir("GET", "/api/avisos?por_pagina=200", admin.token)).json<{ items: Aviso[] }>().items.filter((a) => a.pedido_folio);
    expect(todos.length).toBeGreaterThanOrEqual(3);
  });

  it("POST /avisos/:id/enviado del suyo -> 204 (repetir 204); del ajeno -> 404; Administrador marca cualquiera", async () => {
    const mio = (await pedir("GET", "/api/avisos", rep.token)).json<{ items: Aviso[] }>().items.find((a) => a.plantilla === "wa_pedido_en_ruta")!;
    const ajeno = (await pedir("GET", "/api/avisos", otro.token)).json<{ items: Aviso[] }>().items[0]!;
    const no = await pedir("POST", `/api/avisos/${ajeno.id}/enviado`, rep.token);
    expect(no.statusCode).toBe(404);
    expect(errorDe(no).codigo).toBe("NO_ENCONTRADO");
    expect((await pedir("POST", `/api/avisos/${ajeno.id}/descartar`, rep.token)).statusCode).toBe(404);
    expect((await pedir("POST", `/api/avisos/${mio.id}/enviado`, rep.token)).statusCode).toBe(204);
    expect((await pedir("POST", `/api/avisos/${mio.id}/enviado`, rep.token)).statusCode).toBe(204);
    expect((await pool.query("select estado, enviado_por from app.aviso_cliente where id = $1", [mio.id])).rows[0]).toEqual({ estado: "enviado", enviado_por: rep.id });
    expect(errorDe(await pedir("POST", `/api/avisos/${mio.id}/descartar`, rep.token)).codigo).toBe("AVISO_NO_PENDIENTE");
    expect((await pedir("POST", `/api/avisos/${ajeno.id}/enviado`, admin.token)).statusCode).toBe(204);
    // un aviso sin pedido (enlace del cliente) tampoco es suyo
    const sin = (await pool.query<{ id: string }>("insert into app.aviso_cliente (cliente_id, plantilla, clave) values ($1, 'wa_enlace_cliente', $2) returning id", [e.clientes[0]!.id, `sin:${randomUUID()}`])).rows[0]!;
    expect((await pedir("POST", `/api/avisos/${sin.id}/enviado`, rep.token)).statusCode).toBe(404);
  });

  it("POST /avisos (manual) -> 403 SIN_PERMISO pedidos.ver; GET /despacho: avisos_pendientes cuenta solo los suyos", async () => {
    const m = await pedir("POST", "/api/avisos", rep.token, { clave_idempotencia: randomUUID(), cliente_id: e.clientes[0]!.id, plantilla: "wa_datos_transferencia" });
    expect(m.statusCode).toBe(403);
    expect(errorDe(m)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "pedidos.ver" } });

    const propios = (await pedir("GET", "/api/avisos?por_pagina=200", rep.token)).json<{ total: number }>().total;
    const d = (await pedir("GET", `/api/despacho?fecha=${e.manana}`, rep.token)).json<{ avisos_pendientes: number; rutas: { lista: { id: string }[] } }>();
    expect(d.avisos_pendientes).toBe(propios);
    expect(d.avisos_pendientes).toBeGreaterThan(0);
    const dAjeno = (await pedir("GET", "/api/despacho", otro.token)).json<{ avisos_pendientes: number }>();
    expect(dAjeno.avisos_pendientes).toBe((await pedir("GET", "/api/avisos?por_pagina=200", otro.token)).json<{ total: number }>().total);
    expect(d.rutas.lista.map((r) => r.id)).toEqual([suya.id]);
  });

  it("una ruta cancelada deja de ser suya: sus avisos desaparecen del Repartidor", async () => {
    const extra = await escenarioF6(app, dueno, { n: 1 });
    const r = await pedir("POST", "/api/rutas", dueno.token, { fecha: extra.manana, vehiculo_id: extra.vehiculo, repartidor_id: rep.id });
    const id = r.json<RutaApi>().id;
    await pedir("POST", `/api/rutas/${id}/pedidos`, dueno.token, { pedido_ids: extra.pedidos });
    await pedir("POST", `/api/rutas/${id}/cargar`, dueno.token);
    await pedir("POST", `/api/rutas/${id}/iniciar`, rep.token, {});
    const folio = await folioDe(extra.pedidos[0]!);
    const ver = async () => (await pedir("GET", "/api/avisos?por_pagina=200", rep.token)).json<{ items: Aviso[] }>().items.map((a) => a.pedido_folio);
    expect(await ver()).toContain(folio);
    await pool.query("update app.ruta set estado = 'cancelada' where id = $1", [id]);
    expect(await ver()).not.toContain(folio);
  });
});

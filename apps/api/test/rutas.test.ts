import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar, errorDe, pool } from "./ayuda.js";
import { crearUsuarioF3, pedirPersonal, snapshotF3, tokenF3, type Snapshot } from "./ayuda-f3.js";
import {
  bodegaAntes, clienteEn, crearRuta, escenarioF6, limpiarF6, pedidoConfirmado, ponerBodega, repartidorF6, rutaConPedidos,
  type BodegaAntes, type Dueno, type EscenarioF6, type RutaApi,
} from "./ayuda-f6.js";

let app: FastifyInstance;
let antes: Snapshot;
let bodega: BodegaAntes;
let pedir: ReturnType<typeof pedirPersonal>;
let dueno: Dueno;
let admin: string;
let almacenista: string;
let cajero: string;
let cajeroId: string;
let rep: Dueno;
let otroRep: Dueno;
let e: EscenarioF6;

beforeAll(async () => {
  antes = await snapshotF3();
  bodega = await bodegaAntes();
  app = await crearApp();
  pedir = pedirPersonal(app);
  const u = await crearUsuarioF3("Dueño");
  dueno = { token: await entrar(app, u), id: u.id };
  admin = await tokenF3(app, "Administrador");
  almacenista = await tokenF3(app, "Almacenista");
  const c = await crearUsuarioF3("Cajero");
  cajero = await entrar(app, c);
  cajeroId = c.id;
  rep = await repartidorF6(app);
  otroRep = await repartidorF6(app);
  e = await escenarioF6(app, dueno);
});
afterAll(async () => {
  await limpiarF6(app, antes, bodega);
  await cerrarPoolPruebas();
});

const ids = (r: RutaApi) => r.paradas.map((p) => p.id);
const pedidosDe = (r: RutaApi) => r.paradas.map((p) => p.pedido?.id);

describe("flujo completo de una ruta", () => {
  it("crear -> candidatos -> asignar -> optimizar -> cargar -> carga LIFO -> iniciar -> no entregado (idempotente) -> terminar", async () => {
    const creada = await crearRuta(app, dueno.token, e, rep.id, { nombre: "Norte manana" });
    expect(creada.statusCode).toBe(201);
    const r0 = creada.json<RutaApi>();
    expect(r0).toMatchObject({ estado: "planeada", nombre: "Norte manana", paradas: [], navegar_ruta: [], fecha: e.manana, repartidor: { id: rep.id }, vehiculo: { id: e.vehiculo } });
    expect(r0.folio).toMatch(/^R-\d{6}$/);

    // Candidatos: solo los asignables (estos 6), agrupados por zona (clientes sin zona -> zona null).
    const cand = (await pedir("GET", `/api/rutas/${r0.id}/candidatos`, dueno.token)).json<{ zonas: { zona: unknown; pedidos: { id: string; tiene_ubicacion: boolean; estado: string; total: string; folio: string; cliente: { id: string } }[] }[] }>();
    const mios = cand.zonas.flatMap((z) => z.pedidos).filter((p) => e.pedidos.includes(p.id));
    expect(mios).toHaveLength(6);
    expect(mios[0]).toMatchObject({ tiene_ubicacion: true, estado: "confirmado", total: "110.00", folio: expect.stringMatching(/^P-/) });
    // Un pedido de otra fecha o a recoger no es candidato.
    const otraFecha = await pedidoConfirmado(app, dueno, e.k, e.clientes[0]!.id, "2030-01-02");
    const candidatos2 = (await pedir("GET", `/api/rutas/${r0.id}/candidatos`, dueno.token)).json<{ zonas: { pedidos: { id: string }[] }[] }>();
    expect(candidatos2.zonas.flatMap((z) => z.pedidos.map((p) => p.id))).not.toContain(otraFecha);

    // Asignar en el orden de captura [4, 1, 6, 2, 5, 3].
    const captura = [4, 1, 6, 2, 5, 3].map((i) => e.pedidos[i - 1]!);
    const asignada = await pedir("POST", `/api/rutas/${r0.id}/pedidos`, dueno.token, { pedido_ids: captura });
    expect(asignada.statusCode).toBe(200);
    const r1 = asignada.json<RutaApi>();
    expect(pedidosDe(r1)).toEqual(captura);
    expect(r1.paradas.map((p) => p.orden)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r1.paradas[0]!.navegar).toEqual({
      google: expect.stringMatching(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=19\.000000,-98\.960000$/),
      waze: "https://waze.com/ul?ll=19.000000,-98.960000&navigate=yes",
    });
    const candidatos3 = (await pedir("GET", `/api/rutas/${r0.id}/candidatos`, dueno.token)).json<{ zonas: { pedidos: { id: string }[] }[] }>();
    expect(candidatos3.zonas.flatMap((z) => z.pedidos.map((p) => p.id)).filter((id) => e.pedidos.includes(id))).toEqual([]);

    // Optimizar: [1..6] y 12.60 a 12.63 km.
    const opt = await pedir("POST", `/api/rutas/${r0.id}/optimizar`, dueno.token);
    expect(opt.statusCode).toBe(200);
    const o = opt.json<{ ruta: RutaApi; distancia_km: string; sin_ubicacion: string[]; distancia_anterior_km: string | null }>();
    expect(Number(o.distancia_km)).toBeGreaterThanOrEqual(12.6);
    expect(Number(o.distancia_km)).toBeLessThanOrEqual(12.63);
    expect(o.sin_ubicacion).toEqual([]);
    expect(o.distancia_anterior_km).toBeNull();
    expect(pedidosDe(o.ruta)).toEqual(e.pedidos);
    expect(o.ruta).toMatchObject({ distancia_km: o.distancia_km, optimizada_en: expect.any(String) });
    expect(o.ruta.paradas.map((p) => p.km_desde_anterior)).toEqual(["1.05", "1.05", "1.05", "1.05", "1.05", "1.05"]);
    expect(o.ruta.navegar_ruta).toHaveLength(1);
    expect(o.ruta.navegar_ruta[0]).toContain("origin=19.000000,-99.000000");

    // Orden a mano: borra los km; con un id de otra ruta, 409 PARADAS_NO_CUADRAN.
    const otra = (await crearRuta(app, dueno.token, e, rep.id)).json<RutaApi>();
    const extra = await clienteEn(app, dueno, 19, -98.5);
    const pExtra = await pedidoConfirmado(app, dueno, e.k, extra.id, e.manana);
    const otraConParada = (await pedir("POST", `/api/rutas/${otra.id}/pedidos`, dueno.token, { pedido_ids: [pExtra] })).json<RutaApi>();
    const mal = await pedir("PUT", `/api/rutas/${r0.id}/orden`, dueno.token, { paradas: [...ids(o.ruta).slice(1), otraConParada.paradas[0]!.id] });
    expect(mal.statusCode).toBe(409);
    expect(errorDe(mal).codigo).toBe("PARADAS_NO_CUADRAN");
    const manual = await pedir("PUT", `/api/rutas/${r0.id}/orden`, dueno.token, { paradas: [...ids(o.ruta)].reverse() });
    expect(manual.statusCode).toBe(200);
    expect(manual.json<RutaApi>()).toMatchObject({ distancia_km: null, optimizada_en: null });
    expect(manual.json<RutaApi>().paradas.every((p) => p.km_desde_anterior === null)).toBe(true);
    expect((await pedir("POST", `/api/rutas/${r0.id}/optimizar`, dueno.token)).json().distancia_anterior_km).toBeNull();
    expect((await pedir("POST", `/api/rutas/${otra.id}/cancelar`, dueno.token)).json()).toMatchObject({ estado: "cancelada" });

    // Cargar.
    const cargada = await pedir("POST", `/api/rutas/${r0.id}/cargar`, dueno.token);
    expect(cargada.statusCode).toBe(200);
    const cg = cargada.json<{ ruta: RutaApi; carga: { paradas: { carga_n: number; orden: number }[]; totales: unknown[]; cajas_totales: number }; advertencias: unknown[] }>();
    expect(cg.ruta.estado).toBe("cargada");
    expect(cg.advertencias).toEqual([]);
    expect(cg.carga.paradas.map((p) => [p.carga_n, p.orden])).toEqual([[1, 6], [2, 5], [3, 4], [4, 3], [5, 2], [6, 1]]);
    expect(cg.carga.totales).toEqual([{ producto: e.k.corona.nombre, presentacion: expect.any(String), cantidad: 6, piezas: 36 }]);
    expect(cg.carga.cajas_totales).toBe(2);
    const carga = (await pedir("GET", `/api/rutas/${r0.id}/carga`, almacenista)).json<typeof cg.carga>();
    expect(carga.paradas[0]).toMatchObject({ carga_n: 1, orden: 6, lineas: [{ cantidad: 1, producto: e.k.corona.nombre }] });
    expect((await pedir("POST", `/api/rutas/${r0.id}/optimizar`, dueno.token)).statusCode).toBe(409); // RUTA_NO_EDITABLE (abajo se revisa el codigo)

    // Iniciar: el repartidor dueno de la ruta; turno null en F6.
    const ini = await pedir("POST", `/api/rutas/${r0.id}/iniciar`, rep.token, {});
    expect(ini.statusCode).toBe(200);
    expect(ini.json()).toMatchObject({ ruta: { estado: "en_curso" }, turno: null });
    const paradas = ini.json<{ ruta: RutaApi }>().ruta.paradas;
    expect(paradas.every((p) => p.estado === "pendiente")).toBe(true);

    // No entregado: 200 y repetir -> 200 con la misma parada, sin filas nuevas.
    const nuevoAvisos = async () => (await pool.query("select count(*)::int as n from app.aviso_cliente where plantilla = 'wa_entrega_fallida' and pedido_id = $1", [paradas[0]!.pedido!.id])).rows[0].n;
    const f1 = await pedir("POST", `/api/rutas/paradas/${paradas[0]!.id}/no-entregado`, rep.token, { motivo: "cerrado" });
    expect(f1.statusCode).toBe(200);
    expect(f1.json()).toMatchObject({ id: paradas[0]!.id, estado: "fallida", nota: "cerrado", pedido_id: paradas[0]!.pedido!.id });
    const f2 = await pedir("POST", `/api/rutas/paradas/${paradas[0]!.id}/no-entregado`, rep.token, { motivo: "cerrado" });
    expect(f2.statusCode).toBe(200);
    expect(f2.json()).toEqual(f1.json());
    expect(await nuevoAvisos()).toBe(1);
    expect(errorDe(await pedir("POST", `/api/rutas/paradas/${paradas[1]!.id}/no-entregado`, rep.token, { motivo: "" })).codigo).toBe("VALIDACION");
    expect((await pedir("POST", `/api/rutas/paradas/999999999/no-entregado`, rep.token, { motivo: "x" })).statusCode).toBe(404);

    const fin = await pedir("POST", `/api/rutas/${r0.id}/terminar`, rep.token);
    expect(fin.statusCode).toBe(200);
    expect(fin.json<RutaApi>().estado).toBe("terminada");
    expect(fin.json<RutaApi>().paradas.map((p) => p.estado)).toEqual(["fallida", "omitida", "omitida", "omitida", "omitida", "omitida"]);
    expect(errorDe(await pedir("POST", `/api/rutas/${r0.id}/terminar`, rep.token)).codigo).toBe("ESTADO_NO_VALIDO");
    expect((await pool.query("select estado, motivo from app.pedido where id = $1", [e.pedidos[1]])).rows[0]).toEqual({ estado: "no_entregado", motivo: "no visitada" });
  });
});

describe("optimizar y errores de la ruta", () => {
  it("sin bodega -> 409 BODEGA_SIN_UBICACION; ruta cargada -> 409 RUTA_NO_EDITABLE; paradas sin ubicacion al final con advertencia", async () => {
    const sin = await clienteEn(app, dueno, null, null);
    const pSin = await pedidoConfirmado(app, dueno, e.k, sin.id, e.manana);
    const pCon = await pedidoConfirmado(app, dueno, e.k, e.clientes[0]!.id, e.manana);
    const r = await rutaConPedidos(app, dueno, e, rep.id, [pSin, pCon]);
    expect(r.paradas[0]!.navegar).toBeNull();

    await ponerBodega(app, dueno, null, null);
    const sinBodega = await pedir("POST", `/api/rutas/${r.id}/optimizar`, dueno.token);
    expect(sinBodega.statusCode).toBe(409);
    expect(errorDe(sinBodega).codigo).toBe("BODEGA_SIN_UBICACION");
    await ponerBodega(app, dueno, "19.000000", "-99.000000");

    const ok = await pedir("POST", `/api/rutas/${r.id}/optimizar`, dueno.token);
    expect(ok.statusCode).toBe(200);
    const o = ok.json<{ ruta: RutaApi; sin_ubicacion: string[]; advertencias: { codigo: string; parada_id: string }[] }>();
    expect(pedidosDe(o.ruta)).toEqual([pCon, pSin]);
    expect(o.sin_ubicacion).toEqual([r.paradas[0]!.id]);
    expect(o.advertencias).toEqual([{ codigo: "sin_ubicacion", parada_id: r.paradas[0]!.id, cliente: sin.nombre }]);

    await pedir("POST", `/api/rutas/${r.id}/cargar`, dueno.token);
    const cargada = await pedir("POST", `/api/rutas/${r.id}/optimizar`, dueno.token);
    expect(cargada.statusCode).toBe(409);
    expect(errorDe(cargada).codigo).toBe("RUTA_NO_EDITABLE");
    expect(errorDe(await pedir("PUT", `/api/rutas/${r.id}/orden`, dueno.token, { paradas: ids(o.ruta) })).codigo).toBe("RUTA_NO_EDITABLE");
    expect(errorDe(await pedir("POST", `/api/rutas/${r.id}/pedidos`, dueno.token, { pedido_ids: [pCon] })).codigo).toBe("RUTA_NO_EDITABLE");
    expect(errorDe(await pedir("DELETE", `/api/rutas/paradas/${r.paradas[1]!.id}`, dueno.token)).codigo).toBe("RUTA_NO_EDITABLE");
    expect((await pedir("POST", `/api/rutas/${r.id}/cancelar`, dueno.token)).json()).toMatchObject({ estado: "cancelada" });
    expect(errorDe(await pedir("POST", `/api/rutas/${r.id}/cancelar`, dueno.token)).codigo).toBe("ESTADO_NO_VALIDO");
    expect((await pedir("POST", "/api/rutas/999999999/optimizar", dueno.token)).statusCode).toBe(404);
  });

  it("FALTA_SURTIR con detalles exactos (72 pz con existencia 60) y no cambia nada; RUTA_VACIA; asignar mal; quitar parada; crear con datos malos", async () => {
    const cli = await clienteEn(app, dueno, 19, -98.7);
    const grande = await pedidoConfirmado(app, dueno, e.k, cli.id, e.manana, [{ presentacion_id: e.k.corona.caja, cantidad: 3 }]);
    const r = await rutaConPedidos(app, dueno, e, rep.id, [grande]);
    const falta = await pedir("POST", `/api/rutas/${r.id}/cargar`, dueno.token);
    expect(falta.statusCode).toBe(409);
    expect(errorDe(falta)).toMatchObject({ codigo: "FALTA_SURTIR", detalles: [{ producto_id: Number(e.k.corona.id), producto: e.k.corona.nombre, faltan: 12 }] });
    expect((await pedir("GET", `/api/rutas/${r.id}`, dueno.token)).json<RutaApi>().estado).toBe("planeada");

    // quitar la parada deja la ruta vacia y el pedido libre
    const quitada = await pedir("DELETE", `/api/rutas/paradas/${r.paradas[0]!.id}`, dueno.token);
    expect(quitada.statusCode).toBe(200);
    expect(quitada.json<RutaApi>().paradas).toEqual([]);
    expect(errorDe(await pedir("POST", `/api/rutas/${r.id}/cargar`, dueno.token)).codigo).toBe("RUTA_VACIA");
    // repetir -> 404; pedido ya asignado en otra ruta -> 409
    expect((await pedir("DELETE", `/api/rutas/paradas/${r.paradas[0]!.id}`, dueno.token)).statusCode).toBe(404);
    const dos = await rutaConPedidos(app, dueno, e, rep.id, [grande]);
    const repetido = await pedir("POST", `/api/rutas/${r.id}/pedidos`, dueno.token, { pedido_ids: [grande] });
    expect(repetido.statusCode).toBe(409);
    expect(errorDe(repetido)).toMatchObject({ codigo: "PEDIDO_EN_OTRA_RUTA", detalles: { pedido_ids: [Number(grande)] } });
    const reciente = await pedir("POST", "/api/pedidos", dueno.token, { clave_idempotencia: randomUUID(), cliente_id: cli.id, lineas: [{ presentacion_id: e.k.corona.six, cantidad: 1 }] });
    const noAsignable = await pedir("POST", `/api/rutas/${dos.id}/pedidos`, dueno.token, { pedido_ids: [reciente.json().id] });
    expect(errorDe(noAsignable).codigo).toBe("PEDIDO_NO_ASIGNABLE");

    // crear: repartidor sin rutas.operar, vehiculo inexistente, cuerpo mal formado
    const cajeroComoRep = await crearRuta(app, dueno.token, e, cajeroId);
    expect(cajeroComoRep.statusCode).toBe(409);
    expect(errorDe(cajeroComoRep).codigo).toBe("REPARTIDOR_NO_VALIDO");
    expect(errorDe(await crearRuta(app, dueno.token, { ...e, vehiculo: "999999999" }, rep.id)).codigo).toBe("VALIDACION");
    expect((await pedir("POST", "/api/rutas", dueno.token, { fecha: "mañana", vehiculo_id: e.vehiculo, repartidor_id: rep.id })).statusCode).toBe(400);
    expect((await pedir("POST", "/api/rutas", dueno.token, { fecha: e.manana })).statusCode).toBe(400);
    expect((await pedir("POST", `/api/rutas/${dos.id}/pedidos`, dueno.token, { pedido_ids: [] })).statusCode).toBe(400);
    expect((await pedir("PUT", `/api/rutas/${dos.id}/orden`, dueno.token, { paradas: ["x"] })).statusCode).toBe(400);
    expect((await pedir("GET", "/api/rutas/abc", dueno.token)).statusCode).toBe(400);
    expect((await pedir("GET", "/api/rutas/999999999", dueno.token)).statusCode).toBe(404);
    expect((await pedir("GET", "/api/rutas/999999999/carga", dueno.token)).statusCode).toBe(404);
    // Repartidores: usuarios activos con rutas.operar (el selector de /rutas)
    const reps = (await pedir("GET", "/api/rutas/repartidores", admin)).json<{ id: string; nombre: string }[]>();
    expect(reps.map((x) => x.id)).toEqual(expect.arrayContaining([rep.id, otroRep.id, dueno.id]));
    expect(reps.map((x) => x.id)).not.toContain(cajeroId);
  });
});

describe("permisos de rutas", () => {
  it("Repartidor solo ve las suyas (ajena: 404 y 403 RUTA_AJENA al iniciar); POST /rutas -> 403 rutas.planear; Almacenista ve todo y no planea; Cajero 403 en todo", async () => {
    const pedidoPropio = await pedidoConfirmado(app, dueno, e.k, e.clientes[1]!.id, e.manana);
    const pedidoAjeno = await pedidoConfirmado(app, dueno, e.k, e.clientes[2]!.id, e.manana);
    const suya = await rutaConPedidos(app, dueno, e, rep.id, [pedidoPropio]);
    const ajena = await rutaConPedidos(app, dueno, e, otroRep.id, [pedidoAjeno]);

    const lista = (await pedir("GET", `/api/rutas?fecha=${e.manana}`, rep.token)).json<{ items: { id: string; repartidor: { id: string } }[] }>();
    expect(lista.items.map((x) => x.id)).toContain(suya.id);
    expect(lista.items.map((x) => x.id)).not.toContain(ajena.id);
    expect(lista.items.every((x) => x.repartidor.id === rep.id)).toBe(true);
    expect((await pedir("GET", `/api/rutas?repartidor_id=${otroRep.id}`, rep.token)).json().items).toEqual([]);
    expect((await pedir("GET", `/api/rutas/${suya.id}`, rep.token)).statusCode).toBe(200);
    expect((await pedir("GET", `/api/rutas/${ajena.id}`, rep.token)).statusCode).toBe(404);
    expect((await pedir("GET", `/api/rutas/${ajena.id}/carga`, rep.token)).statusCode).toBe(404);
    expect((await pedir("GET", `/api/rutas/${suya.id}/carga`, rep.token)).statusCode).toBe(200);

    await pedir("POST", `/api/rutas/${ajena.id}/cargar`, dueno.token);
    const noMia = await pedir("POST", `/api/rutas/${ajena.id}/iniciar`, rep.token, {});
    expect(noMia.statusCode).toBe(403);
    expect(errorDe(noMia).codigo).toBe("RUTA_AJENA");
    expect(errorDe(await pedir("POST", `/api/rutas/${ajena.id}/terminar`, rep.token)).codigo).toBe("RUTA_AJENA");

    for (const [metodo, url, cuerpo] of [
      ["POST", "/api/rutas", { fecha: e.manana, vehiculo_id: e.vehiculo, repartidor_id: rep.id }],
      ["POST", `/api/rutas/${suya.id}/pedidos`, { pedido_ids: [pedidoPropio] }],
      ["POST", `/api/rutas/${suya.id}/optimizar`, undefined],
      ["POST", `/api/rutas/${suya.id}/cargar`, undefined],
      ["GET", `/api/rutas/${suya.id}/candidatos`, undefined],
      ["GET", "/api/rutas/repartidores", undefined],
    ] as const) {
      for (const [token, quien] of [[rep.token, "repartidor"], [almacenista, "almacenista"]] as const) {
        const r = await pedir(metodo, url, token, cuerpo);
        expect(r.statusCode, `${quien} ${metodo} ${url}`).toBe(403);
        expect(errorDe(r)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "rutas.planear" } });
      }
    }

    const verTodo = (await pedir("GET", `/api/rutas?fecha=${e.manana}`, almacenista)).json<{ items: { id: string }[] }>();
    expect(verTodo.items.map((x) => x.id)).toEqual(expect.arrayContaining([suya.id, ajena.id]));
    expect((await pedir("GET", `/api/rutas/${ajena.id}`, almacenista)).statusCode).toBe(200);
    expect((await pedir("GET", `/api/rutas/${ajena.id}/carga`, almacenista)).statusCode).toBe(200);
    expect(errorDe(await pedir("POST", `/api/rutas/${ajena.id}/iniciar`, almacenista, {})).detalles).toEqual({ permiso: "rutas.operar" });

    for (const [metodo, url] of [["GET", "/api/rutas"], ["GET", `/api/rutas/${suya.id}`], ["GET", `/api/rutas/${suya.id}/carga`], ["POST", `/api/rutas/${suya.id}/iniciar`], ["GET", "/api/vehiculos"]] as const) {
      expect((await pedir(metodo, url, cajero, metodo === "POST" ? {} : undefined)).statusCode, `${metodo} ${url}`).toBe(403);
    }
    expect((await pedir("GET", "/api/rutas")).statusCode).toBe(401);
    // Administrador planea y opera (tiene los 4 permisos).
    expect((await pedir("POST", `/api/rutas/${suya.id}/cancelar`, admin)).statusCode).toBe(200);
    expect((await pedir("POST", `/api/rutas/${ajena.id}/cancelar`, admin)).statusCode).toBe(200);
  });
});

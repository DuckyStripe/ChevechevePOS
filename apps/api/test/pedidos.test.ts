import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar, errorDe, pool } from "./ayuda.js";
import { hoyMas, sufijo } from "./ayuda-f2.js";
import {
  activarCliente, catalogoF3, clienteConEnlace, crearUsuarioF3, limpiarF3, pedirCliente, pedirPersonal, snapshotF3, tokenF3,
  type CatalogoF3, type Snapshot,
} from "./ayuda-f3.js";

let app: FastifyInstance;
let antes: Snapshot;
let pedir: ReturnType<typeof pedirPersonal>;
let publico: ReturnType<typeof pedirCliente>;
let dueno: { token: string; id: string };
let admin: string;
let cajero: string;
let repartidor: string;
let almacenista: string;
let k: CatalogoF3;
let cliente: string;

beforeAll(async () => {
  antes = await snapshotF3();
  app = await crearApp();
  pedir = pedirPersonal(app);
  publico = pedirCliente(app);
  const u = await crearUsuarioF3("Dueño");
  dueno = { token: await entrar(app, u), id: u.id };
  admin = await tokenF3(app, "Administrador");
  cajero = await tokenF3(app, "Cajero");
  repartidor = await tokenF3(app, "Repartidor");
  almacenista = await tokenF3(app, "Almacenista");
  k = await catalogoF3(app, dueno.token);
  cliente = (await clienteConEnlace(app, dueno, {})).id;
});
afterAll(async () => {
  await limpiarF3(app, antes);
  await cerrarPoolPruebas();
});

const lin = (presentacion_id: string, cantidad: number) => ({ presentacion_id, cantidad });
const crear = (token: string, extra: object = {}, cli = cliente) =>
  pedir("POST", "/api/pedidos", token, { clave_idempotencia: randomUUID(), cliente_id: cli, lineas: [lin(k.corona.caja, 1), lin(k.corona.six, 1)], ...extra });
const nuevoPedido = async (extra: object = {}, cli = cliente) => (await crear(cajero, extra, cli)).json<{ id: string; version: number; lineas: { id: string; presentacion_id: string }[] }>();
const confirmarHoy = async (id: string, version: number, extra: object = {}, token = dueno.token) => {
  const hoy = await hoyMas(0);
  return pedir("POST", `/api/pedidos/${id}/confirmar`, token, { version, fecha_entrega: hoy, ...extra });
};

describe("POST /api/pedidos (captura del personal)", () => {
  it("Cajero: 201 con el detalle; misma clave -> 200 mismo pedido; otro cuerpo -> 409; sin notificacion y con aviso wa_pedido_recibido para el cliente", async () => {
    const clave = randomUUID();
    const cuerpo = { clave_idempotencia: clave, cliente_id: cliente, lineas: [lin(k.corona.caja, 1), lin(k.corona.six, 1)], notas: "por llamada" };
    const r = await pedir("POST", "/api/pedidos", cajero, cuerpo);
    expect(r.statusCode).toBe(201);
    const p = r.json();
    expect(p).toMatchObject({
      id: expect.any(String), folio: expect.stringMatching(/^P-\d{6}$/), cliente: { id: cliente, telefono_whatsapp: "5215512345678" }, origen: "captura", estado: "recibido",
      entrega_tipo: "reparto", total: "530.00", num_lineas: 2, requiere_surtido: false, faltantes_pendientes: 0, version: 1, notas: "por llamada", notas_internas: null,
      zona: null, fecha_entrega: null, propuestas: [],
    });
    expect(p.lineas).toHaveLength(2);
    expect(p.lineas[0]).toMatchObject({ id: expect.any(String), presentacion_id: k.corona.caja, producto: k.corona.nombre, presentacion: "Caja de 24", factor: 24, cantidad_pedida: 1, cantidad: 1, precio_unitario: "420.00", importe: "420.00", estado: "activa" });
    expect(p.eventos).toEqual([expect.objectContaining({ tipo: "recibido", usuario: { id: expect.any(String), nombre: expect.any(String) } })]);

    const otra = await pedir("POST", "/api/pedidos", cajero, cuerpo);
    expect(otra.statusCode).toBe(200);
    expect(otra.json().id).toBe(p.id);
    expect(errorDe(await pedir("POST", "/api/pedidos", cajero, { ...cuerpo, lineas: [lin(k.corona.caja, 2)] })).codigo).toBe("IDEMPOTENCIA_CONFLICTO");

    expect((await pool.query("select count(*)::int as n from app.notificacion where evento = 'pedido_nuevo' and clave = $1", [`pedido_nuevo:${p.id}`])).rows[0].n).toBe(0);
    const avisos = (await pedir("GET", `/api/avisos?pedido_id=${p.id}`, cajero)).json();
    expect(avisos.items).toEqual([expect.objectContaining({ plantilla: "wa_pedido_recibido", pedido_folio: p.folio, estado: "pendiente", telefono_completo: true })]);
  });

  it("409 PEDIDO_MINIMO con detalles; 409 PRESENTACION_NO_VALIDA; 404 cliente; 400 de forma; 401; 403 sin pedidos.capturar", async () => {
    const corto = await crear(cajero, { lineas: [lin(k.corona.caja, 1)] });
    expect(corto.statusCode).toBe(409);
    expect(errorDe(corto)).toMatchObject({ codigo: "PEDIDO_MINIMO", detalles: { minimo: "500.00", total: "420.00", faltante: "80.00" } });
    expect(errorDe(await crear(cajero, { lineas: [lin(k.corona.pieza, 30)] })).codigo).toBe("PRESENTACION_NO_VALIDA");
    expect((await crear(cajero, {}, "999999999")).statusCode).toBe(404);
    expect(errorDe(await crear(cajero, { fecha_solicitada: "2020-01-01" })).codigo).toBe("FECHA_NO_VALIDA");
    for (const mal of [{ lineas: [] }, { clave_idempotencia: "x" }, { cliente_id: "abc" }, { entrega_tipo: "avion" }, { lineas: [lin(k.corona.caja, -1)] }, { notas: "x".repeat(501) }]) {
      expect((await crear(cajero, mal)).statusCode, JSON.stringify(mal)).toBe(400);
    }
    expect((await pedir("POST", "/api/pedidos", undefined, {})).statusCode).toBe(401);
    for (const t of [repartidor, almacenista]) {
      const r = await crear(t);
      expect(r.statusCode).toBe(403);
      expect(errorDe(r)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "pedidos.capturar" } });
    }
    const inactivo = (await pedir("POST", "/api/clientes", dueno.token, { nombre: `TF3 Inactivo ${sufijo()}`, activo: false })).json().id;
    expect(errorDe(await crear(cajero, {}, inactivo)).codigo).toBe("CLIENTE_INACTIVO");
  });

  it("Mayoreo: 2 Cajas + 1 Six = 910.00 (Six cae al precio de Menudeo)", async () => {
    const m = (await clienteConEnlace(app, dueno, { lista_precio_id: k.mayoreo })).id;
    const r = await crear(cajero, { lineas: [lin(k.corona.caja, 2), lin(k.corona.six, 1)] }, m);
    expect(r.json().total).toBe("910.00");
  });
});

describe("GET /api/pedidos y /api/pedidos/:id", () => {
  it("lista paginada con filtros; Repartidor 403; 401; 400 de filtro; detalle 404 y 400", async () => {
    const cli = (await clienteConEnlace(app, dueno, {})).id;
    const p = await nuevoPedido({}, cli);
    const lista = await pedir("GET", `/api/pedidos?cliente_id=${cli}&estado=recibido`, almacenista);
    expect(lista.statusCode).toBe(200);
    expect(lista.json()).toMatchObject({ total: 1, pagina: 1, por_pagina: 50 });
    expect(lista.json().items[0]).toMatchObject({ id: p.id, cliente: { id: cli }, estado: "recibido", total: "530.00", num_lineas: 2, requiere_surtido: false, faltantes_pendientes: 0, origen: "captura" });
    expect((await pedir("GET", `/api/pedidos?cliente_id=${cli}&estado=confirmado`, cajero)).json().total).toBe(0);
    expect((await pedir("GET", `/api/pedidos?cliente_id=${cli}&origen=enlace`, cajero)).json().total).toBe(0);
    expect((await pedir("GET", `/api/pedidos?cliente_id=${cli}&sin_ruta=true`, cajero)).json().total).toBe(1);
    expect((await pedir("GET", "/api/pedidos?estado=raro", cajero)).statusCode).toBe(400);
    expect((await pedir("GET", "/api/pedidos?por_pagina=999", cajero)).statusCode).toBe(400);
    expect((await pedir("GET", "/api/pedidos")).statusCode).toBe(401);
    const r = await pedir("GET", "/api/pedidos", repartidor);
    expect(r.statusCode).toBe(403);
    expect(errorDe(r).detalles).toEqual({ permiso: "pedidos.ver" });

    expect((await pedir("GET", `/api/pedidos/${p.id}`, almacenista)).json()).toMatchObject({ id: p.id, version: 1 });
    expect((await pedir("GET", "/api/pedidos/999999999", cajero)).statusCode).toBe(404);
    expect((await pedir("GET", "/api/pedidos/abc", cajero)).statusCode).toBe(400);
    expect((await pedir("GET", `/api/pedidos/${p.id}`, repartidor)).statusCode).toBe(403);
    expect((await pedir("GET", `/api/pedidos/${p.id}`)).statusCode).toBe(401);
  });
});

describe("confirmar", () => {
  it("la edicion del cliente sube la version: confirmar con 1 -> 409 PEDIDO_CAMBIO; con 2 -> 200 {pedido, advertencias} y aviso wa_pedido_confirmado; Cajero 403 SIN_PERMISO pedidos.gestionar", async () => {
    const c = await clienteConEnlace(app, dueno, {});
    const cred = await activarCliente(app, c);
    const e = await publico("POST", "/api/publico/pedidos", cred, { clave_idempotencia: randomUUID(), lineas: [lin(k.corona.caja, 1), lin(k.corona.six, 1)], total_visto: "530.00" });
    const id = e.json().id as string;
    expect((await publico("PATCH", `/api/publico/pedidos/${id}`, cred, { lineas: [lin(k.corona.caja, 2)], total_visto: "840.00" })).statusCode).toBe(200);
    expect((await pool.query("select count(*)::int as n from app.notificacion where evento = 'pedido_modificado' and clave = $1", [`pedido_modificado:${id}:2`])).rows[0].n).toBeGreaterThanOrEqual(1);

    const viejo = await confirmarHoy(id, 1);
    expect(viejo.statusCode).toBe(409);
    expect(errorDe(viejo).codigo).toBe("PEDIDO_CAMBIO");
    const sin = await confirmarHoy(id, 2, {}, cajero);
    expect(sin.statusCode).toBe(403);
    expect(errorDe(sin)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "pedidos.gestionar" } });

    const ok = await confirmarHoy(id, 2, { notas_internas: "dejar con la vecina" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().pedido).toMatchObject({ id, estado: "confirmado", version: 2, total: "840.00", notas_internas: "dejar con la vecina" });
    expect(ok.json().advertencias).toEqual(expect.any(Array));
    const aviso = (await pedir("GET", `/api/avisos?pedido_id=${id}`, dueno.token)).json().items.find((a: { plantilla: string }) => a.plantilla === "wa_pedido_confirmado");
    expect(aviso).toMatchObject({ estado: "pendiente", texto: expect.stringContaining("confirmado") });
    expect(errorDe(await confirmarHoy(id, 2)).codigo).toBe("ESTADO_NO_VALIDO");
  });

  it("fecha ayer FECHA_NO_VALIDA; 400 sin fecha o con version rara; 404; 401; precio distinto: Administrador 403 SIN_PERMISO_PRECIO, el dueno si (motivo y total nuevo)", async () => {
    const p = await nuevoPedido();
    const l = p.lineas.find((x) => x.presentacion_id === k.corona.caja)!.id;
    const ayer = await hoyMas(-1);
    expect(errorDe(await pedir("POST", `/api/pedidos/${p.id}/confirmar`, dueno.token, { version: 1, fecha_entrega: ayer })).codigo).toBe("FECHA_NO_VALIDA");
    expect((await pedir("POST", `/api/pedidos/${p.id}/confirmar`, dueno.token, { version: 1 })).statusCode).toBe(400);
    expect((await pedir("POST", `/api/pedidos/${p.id}/confirmar`, dueno.token, { version: "uno", fecha_entrega: ayer })).statusCode).toBe(400);
    expect((await pedir("POST", `/api/pedidos/${p.id}/confirmar`, dueno.token, { version: 1, fecha_entrega: "hoy" })).statusCode).toBe(400);
    expect((await confirmarHoy("999999999", 1)).statusCode).toBe(404);
    expect((await pedir("POST", `/api/pedidos/${p.id}/confirmar`, undefined, { version: 1, fecha_entrega: ayer })).statusCode).toBe(401);

    const cambio = { lineas: [{ pedido_linea_id: l, precio_unitario: "400.00", motivo_ajuste: "trato" }] };
    const r = await confirmarHoy(p.id, 1, cambio, admin);
    expect(r.statusCode).toBe(403);
    expect(errorDe(r).codigo).toBe("SIN_PERMISO_PRECIO");
    const ok = await confirmarHoy(p.id, 1, cambio);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().pedido).toMatchObject({ estado: "confirmado", total: "510.00", version: 2 });
    const linea = ok.json().pedido.lineas.find((x: { id: string }) => x.id === l);
    expect(linea).toMatchObject({ precio_unitario: "400.00", motivo_ajuste: "trato" });
  });

  it("disponible y advertencias: X 1 Caja confirma sin aviso; Y 2 Cajas advierte 48 > 36 y confirma; catalogo-venta, codigo, producto y existencias lo reflejan", async () => {
    const k0 = k;
    k = await catalogoF3(app, dueno.token); // producto nuevo: sin pedidos confirmados de las pruebas anteriores
    const codigo = `7501${Date.now().toString().slice(-8)}`;
    await pedir("PATCH", `/api/presentaciones/${k.corona.caja}`, dueno.token, { codigo_barras: codigo });
    const base = async () => {
      const cat = (await pedir("GET", "/api/catalogo-venta", dueno.token)).json() as { presentacion_id: string; disponible_piezas: number; existencia_piezas: number }[];
      return cat.find((a) => a.presentacion_id === k.corona.caja)!;
    };
    const antesDisp = (await base()).disponible_piezas;
    const x = await nuevoPedido({ lineas: [lin(k.corona.caja, 1), lin(k.corona.six, 1)] });
    expect((await base()).disponible_piezas).toBe(antesDisp); // recibido no cuenta
    const rx = await confirmarHoy(x.id, 1);
    expect(rx.json().advertencias).toEqual([]);
    expect(await base()).toMatchObject({ existencia_piezas: 60, disponible_piezas: antesDisp - 30 });
    const y = await nuevoPedido({ lineas: [lin(k.corona.caja, 2)] });
    const ry = await confirmarHoy(y.id, 1);
    expect(ry.json().advertencias).toEqual([{ producto_id: Number(k.corona.id), producto: k.corona.nombre, requeridas: 48, disponibles: antesDisp - 30 }]);
    expect(ry.json().pedido.estado).toBe("confirmado");
    expect((await base()).disponible_piezas).toBe(antesDisp - 78);
    // Los otros lugares usan la misma regla.
    const cod = (await pedir("GET", `/api/presentaciones/codigo/${codigo}`, cajero)).json();
    expect(cod).toMatchObject({ presentacion_id: k.corona.caja, disponible_piezas: antesDisp - 78, existencia_piezas: 60 });
    expect((await pedir("GET", `/api/productos/${k.corona.id}`, dueno.token)).json().comprometido).toBe(78);
    const ex = (await pedir("GET", `/api/inventario/existencias?buscar=${encodeURIComponent(k.corona.nombre)}`, dueno.token)).json().items.find((i: { producto_id: string }) => i.producto_id === k.corona.id);
    expect(ex).toMatchObject({ cantidad: 60, confirmadas: 78, cargadas: 0 });
    k = k0;
  });
});

describe("ajustar, cancelar y reprogramar", () => {
  it("ajustar: bajar con motivo -> {pedido, advertencias, aviso}; sin cambios 409 AJUSTE_NO_VALIDO; a cero todo PEDIDO_VACIO; 409 en recibido; 400/401/403", async () => {
    const p = await nuevoPedido({ lineas: [lin(k.corona.caja, 2), lin(k.corona.six, 1)] });
    const lc = p.lineas.find((x) => x.presentacion_id === k.corona.caja)!.id;
    const ls = p.lineas.find((x) => x.presentacion_id === k.corona.six)!.id;
    expect(errorDe(await pedir("POST", `/api/pedidos/${p.id}/ajustar`, dueno.token, { lineas: [{ pedido_linea_id: ls, cantidad: 0, motivo_ajuste: "x" }] })).codigo).toBe("ESTADO_NO_VALIDO");
    await confirmarHoy(p.id, 1);
    const r = await pedir("POST", `/api/pedidos/${p.id}/ajustar`, dueno.token, { lineas: [{ pedido_linea_id: ls, cantidad: 0, motivo_ajuste: "no hay" }] });
    expect(r.statusCode).toBe(200);
    expect(r.json().pedido).toMatchObject({ total: "840.00", version: 2, estado: "confirmado" });
    expect(r.json().aviso).toMatchObject({ plantilla: "wa_pedido_ajustado", estado: "pendiente", texto: expect.stringContaining("840.00") });
    expect(errorDe(await pedir("POST", `/api/pedidos/${p.id}/ajustar`, dueno.token, {})).codigo).toBe("AJUSTE_NO_VALIDO");
    expect(errorDe(await pedir("POST", `/api/pedidos/${p.id}/ajustar`, dueno.token, { lineas: [{ pedido_linea_id: lc, cantidad: 0, motivo_ajuste: "x" }] })).codigo).toBe("PEDIDO_VACIO");
    expect(errorDe(await pedir("POST", `/api/pedidos/${p.id}/ajustar`, dueno.token, { version: 1, lineas: [{ pedido_linea_id: lc, cantidad: 1, motivo_ajuste: "x" }] })).codigo).toBe("PEDIDO_CAMBIO");
    expect((await pedir("POST", `/api/pedidos/${p.id}/ajustar`, dueno.token, { lineas: [{ pedido_linea_id: lc, cantidad: -1 }] })).statusCode).toBe(400);
    expect((await pedir("POST", `/api/pedidos/${p.id}/ajustar`, undefined, {})).statusCode).toBe(401);
    expect((await pedir("POST", `/api/pedidos/${p.id}/ajustar`, cajero, {})).statusCode).toBe(403);
    expect((await pedir("POST", "/api/pedidos/999999999/ajustar", dueno.token, {})).statusCode).toBe(404);
  });

  it("cancelar: 200 con el pedido cancelado y sus avisos pendientes descartados; sin motivo 400; ya cancelado 409 ESTADO_NO_VALIDO; en ruta 409 PEDIDO_EN_RUTA; 403 y 404", async () => {
    const p = await nuevoPedido();
    await confirmarHoy(p.id, 1);
    expect((await pedir("POST", `/api/pedidos/${p.id}/cancelar`, dueno.token, {})).statusCode).toBe(400);
    const r = await pedir("POST", `/api/pedidos/${p.id}/cancelar`, dueno.token, { motivo: "no pagó" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ id: p.id, estado: "cancelado" });
    expect((await pedir("GET", `/api/avisos?pedido_id=${p.id}`, dueno.token)).json().items).toEqual([]);
    expect(errorDe(await pedir("POST", `/api/pedidos/${p.id}/cancelar`, dueno.token, { motivo: "otra vez" })).codigo).toBe("ESTADO_NO_VALIDO");
    const q = await nuevoPedido();
    await confirmarHoy(q.id, 1);
    await pool.query("update app.pedido set estado = 'cargado' where id = $1", [q.id]);
    expect(errorDe(await pedir("POST", `/api/pedidos/${q.id}/cancelar`, dueno.token, { motivo: "x" })).codigo).toBe("PEDIDO_EN_RUTA");
    await pool.query("update app.pedido set estado = 'confirmado' where id = $1", [q.id]);
    expect((await pedir("POST", `/api/pedidos/${q.id}/cancelar`, cajero, { motivo: "x" })).statusCode).toBe(403);
    expect((await pedir("POST", "/api/pedidos/999999999/cancelar", dueno.token, { motivo: "x" })).statusCode).toBe(404);
  });

  it("reprogramar: no_entregado -> confirmado con fecha nueva; ayer FECHA_NO_VALIDA; desde recibido ESTADO_NO_VALIDO; 400/401/403/404", async () => {
    const p = await nuevoPedido();
    const manana = await hoyMas(1);
    expect(errorDe(await pedir("POST", `/api/pedidos/${p.id}/reprogramar`, dueno.token, { fecha_entrega: manana })).codigo).toBe("ESTADO_NO_VALIDO");
    await confirmarHoy(p.id, 1);
    await pool.query("update app.pedido set estado = 'no_entregado' where id = $1", [p.id]);
    expect(errorDe(await pedir("POST", `/api/pedidos/${p.id}/reprogramar`, dueno.token, { fecha_entrega: await hoyMas(-1) })).codigo).toBe("FECHA_NO_VALIDA");
    const r = await pedir("POST", `/api/pedidos/${p.id}/reprogramar`, dueno.token, { fecha_entrega: manana });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ estado: "confirmado", fecha_entrega: manana });
    expect((await pedir("POST", `/api/pedidos/${p.id}/reprogramar`, dueno.token, {})).statusCode).toBe(400);
    expect((await pedir("POST", `/api/pedidos/${p.id}/reprogramar`, dueno.token, { fecha_entrega: "manana" })).statusCode).toBe(400);
    expect((await pedir("POST", `/api/pedidos/${p.id}/reprogramar`, undefined, { fecha_entrega: manana })).statusCode).toBe(401);
    expect((await pedir("POST", `/api/pedidos/${p.id}/reprogramar`, cajero, { fecha_entrega: manana })).statusCode).toBe(403);
    expect((await pedir("POST", "/api/pedidos/999999999/reprogramar", dueno.token, { fecha_entrega: manana })).statusCode).toBe(404);
  });
});


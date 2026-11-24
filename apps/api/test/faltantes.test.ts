import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar, errorDe, pool } from "./ayuda.js";
import { hoyMas } from "./ayuda-f2.js";
import {
  activarCliente, catalogoF3, clienteConEnlace, crearUsuarioF3, limpiarF3, pedidoEntregadoF3, pedirCliente, pedirPersonal, snapshotF3, tokenF3,
  type CatalogoF3, type ClienteF3, type Credenciales, type Snapshot,
} from "./ayuda-f3.js";

let app: FastifyInstance;
let antes: Snapshot;
let pedir: ReturnType<typeof pedirPersonal>;
let publico: ReturnType<typeof pedirCliente>;
let dueno: { token: string; id: string };
let cajero: string;
let k: CatalogoF3;

beforeAll(async () => {
  antes = await snapshotF3();
  app = await crearApp();
  pedir = pedirPersonal(app);
  publico = pedirCliente(app);
  const u = await crearUsuarioF3("Dueño");
  dueno = { token: await entrar(app, u), id: u.id };
  cajero = await tokenF3(app, "Cajero");
  k = await catalogoF3(app, dueno.token);
});
afterAll(async () => {
  await limpiarF3(app, antes);
  await cerrarPoolPruebas();
});

const lin = (presentacion_id: string, cantidad: number) => ({ presentacion_id, cantidad });
type Detalle = { id: string; version: number; total: string; estado: string; lineas: { id: string; presentacion_id: string; estado: string; cantidad: number }[]; propuestas: { id: string; estado: string; opciones: { id: string; tipo: string }[] }[] };

/** Cliente activo con un pedido 2 Cajas + 1 Six (950.00) ya confirmado. */
async function confirmado(): Promise<{ c: ClienteF3; cred: Credenciales; p: Detalle; caja: string }> {
  const c = await clienteConEnlace(app, dueno, {});
  const cred = await activarCliente(app, c);
  const r = await pedir("POST", "/api/pedidos", cajero, { clave_idempotencia: randomUUID(), cliente_id: c.id, lineas: [lin(k.corona.caja, 2), lin(k.corona.six, 1)] });
  const p0 = r.json<Detalle>();
  const ok = await pedir("POST", `/api/pedidos/${p0.id}/confirmar`, dueno.token, { version: p0.version, fecha_entrega: await hoyMas(0) });
  const p = ok.json<{ pedido: Detalle }>().pedido;
  return { c, cred, p, caja: p.lineas.find((l) => l.presentacion_id === k.corona.caja)!.id };
}
const faltante = (p: Detalle, linea: string, opciones: object[], extra: object = {}, token = dueno.token) =>
  pedir("POST", `/api/pedidos/${p.id}/faltantes`, token, { version: p.version, lineas: [{ pedido_linea_id: linea, causa: "sin_existencia", opciones, ...extra }] });
const sustituto = () => ({ tipo: "sustituto", presentacion_id: k.victoria.caja, cantidad: 2 });
const reducir = () => ({ tipo: "reducir", presentacion_id: k.corona.caja, cantidad: 1 });

describe("sugerencias de equivalentes", () => {
  it("Victoria Caja primero (mismo factor) con precio de la lista y disponible; 404 linea ajena; 400; 401; 403", async () => {
    const { p, caja } = await confirmado();
    const r = await pedir("GET", `/api/pedidos/${p.id}/sugerencias?pedido_linea_id=${caja}`, dueno.token);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([{ presentacion_id: k.victoria.caja, producto: k.victoria.nombre, presentacion: "Caja de 24", factor: 24, precio: "410.00", disponible_piezas: 0, imagen: null }]);
    const otra = await confirmado();
    expect((await pedir("GET", `/api/pedidos/${p.id}/sugerencias?pedido_linea_id=${otra.caja}`, dueno.token)).statusCode).toBe(404);
    expect((await pedir("GET", `/api/pedidos/${p.id}/sugerencias`, dueno.token)).statusCode).toBe(400);
    expect((await pedir("GET", `/api/pedidos/${p.id}/sugerencias?pedido_linea_id=${caja}`)).statusCode).toBe(401);
    expect((await pedir("GET", `/api/pedidos/${p.id}/sugerencias?pedido_linea_id=${caja}`, cajero)).statusCode).toBe(403);
  });
});

describe("faltante de punta a punta", () => {
  it("el personal marca el faltante -> {pedido, aviso} esperando_cliente; el cliente elige el sustituto por su enlace: total 930.00, etapa confirmado; responder otra vez 409 PROPUESTA_CERRADA", async () => {
    const { cred, p, caja } = await confirmado();
    const r = await faltante(p, caja, [sustituto(), reducir()], { nota: "se rompio una tarima" });
    expect(r.statusCode).toBe(200);
    const { pedido, aviso } = r.json<{ pedido: Detalle & { respuesta_limite_en: string }; aviso: { plantilla: string; texto: string } }>();
    expect(pedido).toMatchObject({ estado: "esperando_cliente", version: 2, total: "950.00" });
    expect(pedido.respuesta_limite_en).toEqual(expect.any(String));
    expect(pedido.lineas.find((l) => l.id === caja)!.estado).toBe("faltante");
    expect(aviso).toMatchObject({ plantilla: "wa_pedido_faltante" });
    expect(aviso.texto).toContain(k.corona.nombre);
    expect(pedido.propuestas).toEqual([expect.objectContaining({ estado: "pendiente", causa: "sin_existencia", nota: "se rompio una tarima", opciones: [expect.objectContaining({ tipo: "sustituto", cantidad: 2, precio_unitario: "410.00", importe: "820.00" }), expect.objectContaining({ tipo: "reducir", cantidad: 1, precio_unitario: "420.00" })] })]);
    // El aviso de confirmado pendiente se descarto: queda solo el del faltante.
    expect((await pedir("GET", `/api/avisos?pedido_id=${p.id}`, dueno.token)).json().items.map((a: { plantilla: string }) => a.plantilla)).toEqual(["wa_pedido_faltante"]);

    // Lo que ve el cliente.
    const seg = (await publico("GET", `/api/publico/pedidos/${p.id}`, cred)).json();
    expect(seg).toMatchObject({ etapa: "esperando_cliente", etiqueta: "Esperando tu respuesta", editable: false });
    expect(seg.faltantes).toHaveLength(1);
    const f = seg.faltantes[0];
    expect(f).toMatchObject({ propuesta_id: pedido.propuestas[0]!.id, causa: "sin_existencia", linea: { cantidad: 2 } });
    expect(f.opciones.map((o: { id: unknown }) => typeof o.id)).toEqual(["string", "string"]);
    expect((await publico("GET", "/api/publico/pedidos", cred)).json().items[0]).toMatchObject({ faltantes_pendientes: 1, etapa: "esperando_cliente" });
    const opcion = f.opciones.find((o: { tipo: string }) => o.tipo === "sustituto").id as string;

    const r2 = await publico("POST", `/api/publico/propuestas/${f.propuesta_id}/responder`, cred, { opcion_id: opcion });
    expect(r2.statusCode).toBe(200);
    expect(r2.json()).toMatchObject({ id: p.id, total: "930.00", etapa: "confirmado", faltantes: [] });
    expect(r2.json().lineas.map((l: { estado: string; cantidad: number }) => [l.estado, l.cantidad])).toEqual([["sustituida", 0], ["activa", 1], ["activa", 2]]);
    expect((await pool.query("select count(*)::int as n from app.notificacion where evento = 'faltante_respondido' and clave = $1", [`faltante:${f.propuesta_id}`])).rows[0].n).toBeGreaterThanOrEqual(1);
    const otra = await publico("POST", `/api/publico/propuestas/${f.propuesta_id}/responder`, cred, { opcion_id: opcion });
    expect(otra.statusCode).toBe(409);
    expect(errorDe(otra).codigo).toBe("PROPUESTA_CERRADA");
    expect((await publico("POST", `/api/publico/propuestas/${f.propuesta_id}/responder`, cred, {})).statusCode).toBe(400);
    expect((await publico("POST", "/api/publico/propuestas/999999999/responder", cred, { opcion_id: null })).statusCode).toBe(404);
  });

  it("el personal responde por llamada: reducir -> 530.00; rechazar -> linea quitada; retirar la pregunta devuelve la linea; 409/403/404/401", async () => {
    const a = await confirmado();
    const ra = (await faltante(a.p, a.caja, [sustituto(), reducir()])).json<{ pedido: Detalle }>().pedido;
    const prop = ra.propuestas[0]!;
    expect((await pedir("POST", `/api/propuestas/${prop.id}/responder`, cajero, { opcion_id: null })).statusCode).toBe(403);
    expect((await pedir("POST", `/api/propuestas/${prop.id}/responder`, undefined, { opcion_id: null })).statusCode).toBe(401);
    expect((await pedir("POST", `/api/propuestas/${prop.id}/responder`, dueno.token, {})).statusCode).toBe(400);
    const ajena = (await pedir("POST", `/api/propuestas/${prop.id}/responder`, dueno.token, { opcion_id: "999999999" }));
    expect(ajena.statusCode).toBe(400); // la opcion no es de esa propuesta
    const red = await pedir("POST", `/api/propuestas/${prop.id}/responder`, dueno.token, { opcion_id: prop.opciones.find((o) => o.tipo === "reducir")!.id });
    expect(red.statusCode).toBe(200);
    expect(red.json()).toMatchObject({ estado: "confirmado", total: "530.00" });
    expect(errorDe(await pedir("POST", `/api/propuestas/${prop.id}/responder`, dueno.token, { opcion_id: null })).codigo).toBe("PROPUESTA_CERRADA");
    expect((await pedir("POST", "/api/propuestas/999999999/responder", dueno.token, { opcion_id: null })).statusCode).toBe(404);

    const b = await confirmado();
    const rb = (await faltante(b.p, b.caja, [sustituto()])).json<{ pedido: Detalle }>().pedido;
    const rech = await pedir("POST", `/api/propuestas/${rb.propuestas[0]!.id}/responder`, dueno.token, { opcion_id: null });
    expect(rech.json()).toMatchObject({ estado: "confirmado", total: "110.00" });
    expect(rech.json().lineas.find((l: { id: string }) => l.id === b.caja)).toMatchObject({ estado: "quitada", cantidad: 0 });

    const c = await confirmado();
    const rc = (await faltante(c.p, c.caja, [sustituto()])).json<{ pedido: Detalle }>().pedido;
    expect((await pedir("POST", `/api/propuestas/${rc.propuestas[0]!.id}/cancelar`, cajero)).statusCode).toBe(403);
    const ret = await pedir("POST", `/api/propuestas/${rc.propuestas[0]!.id}/cancelar`, dueno.token);
    expect(ret.statusCode).toBe(200);
    expect(ret.json()).toMatchObject({ estado: "confirmado", total: "950.00" });
    expect(ret.json().lineas.find((l: { id: string }) => l.id === c.caja)).toMatchObject({ estado: "activa", cantidad: 2 });
    expect(errorDe(await pedir("POST", `/api/propuestas/${rc.propuestas[0]!.id}/cancelar`, dueno.token)).codigo).toBe("PROPUESTA_CERRADA");
  });

  it("rechazar lo unico que tenia el pedido lo cancela con motivo sin_lineas y avisa al cliente", async () => {
    const c = await clienteConEnlace(app, dueno, {});
    const cred = await activarCliente(app, c);
    const p0 = (await pedir("POST", "/api/pedidos", cajero, { clave_idempotencia: randomUUID(), cliente_id: c.id, lineas: [lin(k.corona.caja, 2)] })).json<Detalle>();
    const p = (await pedir("POST", `/api/pedidos/${p0.id}/confirmar`, dueno.token, { version: 1, fecha_entrega: await hoyMas(0) })).json<{ pedido: Detalle }>().pedido;
    const f = (await faltante(p, p.lineas[0]!.id, [sustituto()])).json<{ pedido: Detalle }>().pedido;
    const r = await publico("POST", `/api/publico/propuestas/${f.propuestas[0]!.id}/responder`, cred, { opcion_id: null });
    expect(r.json()).toMatchObject({ etapa: "cancelado", total: "0.00" });
    expect((await pool.query("select motivo from app.pedido where id = $1", [p.id])).rows[0].motivo).toBe("sin_lineas");
    expect((await pedir("GET", `/api/avisos?pedido_id=${p.id}`, dueno.token)).json().items.map((a: { plantilla: string }) => a.plantilla)).toEqual(["wa_pedido_ajustado"]);
  });

  it("errores de POST /faltantes: PEDIDO_CAMBIO, LINEA_NO_VALIDA (reducir igual o linea no activa), FECHA_NO_VALIDA desde recibido, ESTADO_NO_VALIDO, 400, 401, 403, 404", async () => {
    const { p, caja } = await confirmado();
    const viejo = await pedir("POST", `/api/pedidos/${p.id}/faltantes`, dueno.token, { version: p.version + 5, lineas: [{ pedido_linea_id: caja, causa: "otro", opciones: [] }] });
    expect(errorDe(viejo).codigo).toBe("PEDIDO_CAMBIO");
    const igual = await faltante(p, caja, [{ tipo: "reducir", presentacion_id: k.corona.caja, cantidad: 2 }]);
    expect(igual.statusCode).toBe(409);
    expect(errorDe(igual).codigo).toBe("LINEA_NO_VALIDA");
    expect(errorDe(await faltante(p, "999999999", [])).codigo).toBe("LINEA_NO_VALIDA");
    expect((await faltante(p, caja, [], { causa: "porque si" })).statusCode).toBe(400);
    expect((await faltante(p, caja, [{ tipo: "sustituto", cantidad: 1 }])).statusCode).toBe(409); // sustituto sin presentacion
    expect((await pedir("POST", `/api/pedidos/${p.id}/faltantes`, dueno.token, { version: p.version, lineas: [] })).statusCode).toBe(400);
    expect((await faltante(p, caja, [], {}, cajero)).statusCode).toBe(403);
    expect((await pedir("POST", `/api/pedidos/${p.id}/faltantes`, undefined, {})).statusCode).toBe(401);
    expect((await pedir("POST", "/api/pedidos/999999999/faltantes", dueno.token, { version: 1, lineas: [{ pedido_linea_id: caja, causa: "otro", opciones: [] }] })).statusCode).toBe(404);

    // Desde recibido sin fecha_entrega: FECHA_NO_VALIDA; con fecha confirma el resto.
    const c = await clienteConEnlace(app, dueno, {});
    const rec = (await pedir("POST", "/api/pedidos", cajero, { clave_idempotencia: randomUUID(), cliente_id: c.id, lineas: [lin(k.corona.caja, 2), lin(k.corona.six, 1)] })).json<Detalle>();
    const lc = rec.lineas.find((l) => l.presentacion_id === k.corona.caja)!.id;
    expect(errorDe(await faltante(rec, lc, [])).codigo).toBe("FECHA_NO_VALIDA");
    const ok = await pedir("POST", `/api/pedidos/${rec.id}/faltantes`, dueno.token, { version: rec.version, fecha_entrega: await hoyMas(0), lineas: [{ pedido_linea_id: lc, causa: "danado", opciones: [] }] });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().pedido.estado).toBe("esperando_cliente");
    expect(errorDe(await faltante({ ...rec, version: 2 }, lc, [])).codigo).toBe("ESTADO_NO_VALIDO");
  });

  it("plazo vencido: la accion predeterminada (quitar) se aplica por la tarea; el cliente que contesta tarde recibe 409 PROPUESTA_CERRADA", async () => {
    const { p, cred, caja } = await confirmado();
    const f = (await faltante(p, caja, [sustituto(), reducir()])).json<{ pedido: Detalle }>().pedido;
    await pool.query("update app.propuesta_faltante set limite_en = now() - interval '1 minute' where id = $1", [f.propuestas[0]!.id]);
    const tarde = await publico("POST", `/api/publico/propuestas/${f.propuestas[0]!.id}/responder`, cred, { opcion_id: f.propuestas[0]!.opciones[0]!.id });
    expect(tarde.statusCode).toBe(409);
    expect(errorDe(tarde).codigo).toBe("PROPUESTA_CERRADA");
    expect((await pool.query("select app.fn_vencer_faltantes() as n")).rows[0].n).toBeGreaterThanOrEqual(1);
    const det = (await pedir("GET", `/api/pedidos/${p.id}`, dueno.token)).json<Detalle>();
    expect(det).toMatchObject({ estado: "confirmado", total: "110.00" });
    expect(det.propuestas[0]!.estado).toBe("vencida");
    expect((await pedir("GET", `/api/avisos?pedido_id=${p.id}`, dueno.token)).json().items.map((a: { plantilla: string }) => a.plantilla)).toEqual(["wa_pedido_ajustado"]);
  });
});

describe("«lo de siempre»", () => {
  it("la tarea crea el propuesto: GET /cliente lo trae; el seguimiento trae la vista sin folio; precio nuevo -> 409 PRECIOS_CAMBIARON; con el total nuevo 200 etapa recibido con folio; vencido 409 PEDIDO_VENCIDO; el aviso trae ?ir=pedido-<id> y ningun $", async () => {
    await pedir("PATCH", "/api/configuracion", dueno.token, { sugerencia_hora: "00:00", url_publica: "https://pedidos.prueba.mx" });
    const c = await clienteConEnlace(app, dueno, {});
    const cred = await activarCliente(app, c);
    for (const dias of [30, 23, 16, 9]) await pedidoEntregadoF3(c.id, { hace_dias: dias, lineas: [{ presentacion_id: k.corona.caja, cantidad: 2, precio: "420.00" }] });
    expect((await pool.query("select app.fn_sugerir_pedidos() as n")).rows[0].n).toBeGreaterThanOrEqual(1);

    const perfil = (await publico("GET", "/api/publico/cliente", cred)).json();
    expect(perfil.pedido_propuesto).toEqual({ id: expect.any(String) });
    const id = perfil.pedido_propuesto.id as string;
    expect((await publico("GET", "/api/publico/pedidos", cred)).json().items.map((x: { id: string }) => x.id)).not.toContain(id); // un propuesto no es un pedido
    const seg = (await publico("GET", `/api/publico/pedidos/${id}`, cred)).json();
    expect(seg).toMatchObject({ id, folio: null, etapa: "propuesto", etiqueta: "Esperando tu confirmación", total: null, editable: false });
    expect(seg.borrador).toMatchObject({ total_actual: "840.00", hay_cambios: false });
    expect(seg.borrador.lineas[0]).toMatchObject({ presentacion_id: k.corona.caja, cantidad: 2, precio_actual: "420.00" });
    expect(seg.lineas.every((l: { precio_unitario: string | null }) => l.precio_unitario === null)).toBe(true);

    const av = (await pedir("GET", `/api/avisos?pedido_id=${id}`, dueno.token)).json().items[0];
    expect(av.plantilla).toBe("wa_lo_de_siempre");
    expect(av.texto).toMatch(new RegExp(`https://pedidos\\.prueba\\.mx/p/[A-Za-z0-9_-]{43}\\?ir=pedido-${id}`));
    expect(av.texto).not.toContain("$");

    await pedir("PUT", "/api/precios", dueno.token, { precios: [{ presentacion_id: k.corona.caja, lista_precio_id: k.menudeo, precio: "430.00" }] });
    const cambio = await publico("POST", `/api/publico/pedidos/${id}/aceptar`, cred, { total_visto: "840.00" });
    expect(cambio.statusCode).toBe(409);
    expect(errorDe(cambio)).toMatchObject({ codigo: "PRECIOS_CAMBIARON", detalles: { total_actual: "860.00", hay_cambios: true, lineas: [{ cambio: "sube", precio_anterior: "420.00", precio_actual: "430.00" }] } });
    expect((await publico("POST", `/api/publico/pedidos/${id}/aceptar`, cred, {})).statusCode).toBe(400);
    expect((await pool.query("select estado from app.pedido where id = $1", [id])).rows[0].estado).toBe("propuesto");

    const ok = await publico("POST", `/api/publico/pedidos/${id}/aceptar`, cred, { total_visto: "860.00" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ etapa: "recibido", total: "860.00", folio: expect.stringMatching(/^P-\d{6}$/) });
    expect((await pool.query("select count(*)::int as n from app.notificacion where evento = 'pedido_nuevo' and clave = $1", [`pedido_nuevo:${id}`])).rows[0].n).toBeGreaterThanOrEqual(1);
    await pedir("PUT", "/api/precios", dueno.token, { precios: [{ presentacion_id: k.corona.caja, lista_precio_id: k.menudeo, precio: "420.00" }] });

    // Vencido.
    const c2 = await clienteConEnlace(app, dueno, {});
    const cred2 = await activarCliente(app, c2);
    for (const dias of [30, 23, 16, 9]) await pedidoEntregadoF3(c2.id, { hace_dias: dias, lineas: [{ presentacion_id: k.corona.caja, cantidad: 2, precio: "420.00" }] });
    await pool.query("select app.fn_sugerir_pedidos()");
    const id2 = (await publico("GET", "/api/publico/cliente", cred2)).json().pedido_propuesto.id as string;
    await pool.query("update app.pedido set propuesto_vence_en = now() - interval '1 minute' where id = $1", [id2]);
    const v = await publico("POST", `/api/publico/pedidos/${id2}/aceptar`, cred2, { total_visto: "840.00" });
    expect(v.statusCode).toBe(409);
    expect(errorDe(v).codigo).toBe("PEDIDO_VENCIDO");
    expect((await publico("GET", "/api/publico/cliente", cred2)).json().pedido_propuesto).toBeNull();
    await pool.query("select app.fn_vencer_propuestos()");
    expect(errorDe(await publico("POST", `/api/publico/pedidos/${id2}/aceptar`, cred2, { total_visto: "840.00" })).codigo).toBe("PEDIDO_VENCIDO");
  });

  it("rechazar un propuesto (cancelar del cliente) no avisa al personal", async () => {
    await pedir("PATCH", "/api/configuracion", dueno.token, { sugerencia_hora: "00:00" });
    const c = await clienteConEnlace(app, dueno, {});
    const cred = await activarCliente(app, c);
    for (const dias of [30, 23, 16, 9]) await pedidoEntregadoF3(c.id, { hace_dias: dias, lineas: [{ presentacion_id: k.corona.caja, cantidad: 2, precio: "420.00" }] });
    await pool.query("select app.fn_sugerir_pedidos()");
    const id = (await publico("GET", "/api/publico/cliente", cred)).json().pedido_propuesto.id as string;
    const r = await publico("POST", `/api/publico/pedidos/${id}/cancelar`, cred, {});
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ estado: "cancelado", folio: null });
    expect((await pool.query("select count(*)::int as n from app.notificacion where clave = $1", [`pedido_cancelado_cliente:${id}`])).rows[0].n).toBe(0);
  });
});

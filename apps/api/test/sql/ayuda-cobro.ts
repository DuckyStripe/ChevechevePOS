import { randomUUID } from "node:crypto";
import type pg from "pg";
import { dia, ponerPrecio, producto } from "./ayuda-inventario.js";
import { ROL3, usuarioF3 } from "./ayuda-pedidos.js";
import { clienteEn, fila, pedido, pedidoConfirmado, repartidor, rutaCon } from "./ayuda-rutas.js";
import { compra, lin } from "./ayuda-surtido.js";

// F7: se reutilizan ayuda-pedidos.ts, ayuda-rutas.ts y ayuda-surtido.ts. Aqui solo lo propio de caja, venta y cobranza.
export { ROL3, fila, lin, pedido, pedidoConfirmado, repartidor, rutaCon, usuarioF3 };
export { dia, errorConDetalle } from "./ayuda-inventario.js";

let n = 0;
const sufijo = () => `${++n}x${process.pid}`;

/** Caja nueva (nombre unico) con un turno de mostrador abierto de `usuario`: un turno por caja y por usuario, y 'Mostrador' es una sola. */
export async function turnoMostrador(c: pg.PoolClient, usuario: string, fondo = "0.00"): Promise<string> {
  const caja = await c.query("insert into app.caja (sucursal_id, nombre) values (1, $1) returning id", [`Caja ${sufijo()}`]);
  const r = await c.query("select app.fn_abrir_turno($1, $2, $3) as id", [usuario, caja.rows[0].id, fondo]);
  return r.rows[0].id;
}

export interface Pagos {
  pagos: { metodo: string; monto: string; referencia?: string; comprobante?: string }[];
  efectivo_recibido?: string;
}
export const efectivo = (monto: string, recibido?: string): Pagos => ({ pagos: [{ metodo: "efectivo", monto }], efectivo_recibido: recibido });
export const credito = (monto: string): Pagos => ({ pagos: [{ metodo: "credito", monto }] });
export const transferencia = (monto: string, referencia = "ABC123", comprobante?: string): Pagos =>
  ({ pagos: [{ metodo: "transferencia", monto, referencia, comprobante }] });

/** fn_entregar_pedido con clave aleatoria (o la dada). Devuelve `{venta_id, repetida}`. */
export async function entregar(
  c: pg.PoolClient, usuario: string, ped: string,
  o: Pagos & { lineas?: { pedido_linea_id: string; cantidad_entregada: number }[]; clave?: string; hash?: string; recibio?: string; foto_entrega?: string; notas?: string },
): Promise<{ venta_id: string; repetida: boolean }> {
  const datos = {
    clave_idempotencia: o.clave ?? randomUUID(), lineas: o.lineas, pagos: o.pagos, efectivo_recibido: o.efectivo_recibido,
    recibio: o.recibio, foto_entrega: o.foto_entrega, notas: o.notas,
  };
  const r = await c.query("select venta_id, repetida from app.fn_entregar_pedido($1, $2, $3::jsonb, $4)", [usuario, ped, JSON.stringify(datos), o.hash ?? "hash-e"]);
  return r.rows[0];
}

/** fn_registrar_venta de mostrador. `lineas` = [{presentacion_id, cantidad, precio_unitario?}]. */
export async function vender(
  c: pg.PoolClient, usuario: string,
  o: Pagos & { lineas: { presentacion_id: string; cantidad: number; precio_unitario?: string }[]; cliente_id?: string | null; lista_precio_id?: string; clave?: string; hash?: string },
): Promise<{ venta_id: string; repetida: boolean }> {
  const datos = {
    clave_idempotencia: o.clave ?? randomUUID(), cliente_id: o.cliente_id ?? undefined, lista_precio_id: o.lista_precio_id,
    lineas: o.lineas, pagos: o.pagos, efectivo_recibido: o.efectivo_recibido,
  };
  const r = await c.query("select venta_id, repetida from app.fn_registrar_venta($1, $2::jsonb, $3)", [usuario, JSON.stringify(datos), o.hash ?? "hash-v"]);
  return r.rows[0];
}

/** fn_registrar_abono (clave aleatoria o la dada). */
export async function abonar(
  c: pg.PoolClient, usuario: string,
  o: { cliente_id: string; metodo?: string; monto: string; ruta_parada_id?: string; cuentas?: { cuenta_por_cobrar_id: string; monto: string }[]; clave?: string; hash?: string; referencia?: string },
): Promise<{ abono_id: string; repetida: boolean }> {
  const datos = {
    clave_idempotencia: o.clave ?? randomUUID(), cliente_id: o.cliente_id, metodo: o.metodo ?? "efectivo", monto: o.monto,
    ruta_parada_id: o.ruta_parada_id, cuentas: o.cuentas, referencia: o.referencia,
  };
  const r = await c.query("select abono_id, repetida from app.fn_registrar_abono($1, $2::jsonb, $3)", [usuario, JSON.stringify(datos), o.hash ?? "hash-a"]);
  return r.rows[0];
}

/** fn_registrar_devolucion. `lineas` = [{venta_linea_id, piezas, regresa_a_inventario}]. */
export async function devolver(
  c: pg.PoolClient, usuario: string, venta: string,
  o: { lineas: { venta_linea_id: string; piezas: number; regresa_a_inventario: boolean }[]; motivo?: string; clave?: string; hash?: string },
): Promise<{ devolucion_id: string; repetida: boolean }> {
  const datos = { clave_idempotencia: o.clave ?? randomUUID(), motivo: o.motivo ?? "prueba", lineas: o.lineas };
  const r = await c.query("select devolucion_id, repetida from app.fn_registrar_devolucion($1, $2, $3::jsonb, $4)", [usuario, venta, JSON.stringify(datos), o.hash ?? "hash-d"]);
  return r.rows[0];
}

/** CxC de saldo inicial (fn_saldo_inicial). Devuelve su id. */
export async function saldoInicial(c: pg.PoolClient, cliente: string, monto: string, vence: string, usuario?: string): Promise<string> {
  const u = usuario ?? (await usuarioF3(c, ROL3.dueno));
  const r = await c.query("select app.fn_saldo_inicial($1, $2, $3, $4::date, 'Saldo de prueba') as id", [u, cliente, monto, vence]);
  return r.rows[0].id;
}

/** Mueve `creado_en` dentro de la transaccion de prueba (los disparadores de estas tablas no lo impiden). */
export async function fechar(c: pg.PoolClient, tabla: "venta" | "cuenta_por_cobrar" | "abono" | "devolucion", id: string, ts: string): Promise<void> {
  await c.query("select set_config('app.escribiendo_dinero', '1', true)");
  await c.query(`update app.${tabla} set creado_en = $2::timestamptz where id = $1`, [id, ts]);
}

/** Cliente nuevo con limite y dias de credito, en la zona Centro. */
export async function clienteCredito(c: pg.PoolClient, limite: string, dias = 0): Promise<string> {
  const id = await clienteEn(c, "19.000000", "-99.000000", "Centro");
  await c.query("update app.cliente set limite_credito = $2, dias_credito = $3 where id = $1", [id, limite, dias]);
  return id;
}

export interface Juego {
  dueno: string; rep: string; hoy: string;
  corona: { id: string; caja: string; six: string; pieza: string; nombre: string };
  victoria: { id: string; caja: string; nombre: string };
  A: string; B: string; C: string; D: string;
  P1: string; P2: string; P3: string; P4: string;
  ruta: string; turno: string; paradaCobro: string;
  /** parada de cada pedido (por id de pedido). */
  parada: Record<string, string>;
  /** CxC de saldo inicial de D (300.00, vencida hace 10 dias). */
  cxcD: string;
}

/**
 * Juego fijo de F7.md: Corona (Caja 24 400.00, Six 105.00, Pieza 18.00; 10 cajas a 300.00 -> promedio 12.500000) y Victoria
 * (Caja 390.00; 1 caja a 290.00 -> 12.083333); clientes A y B sin credito, C (1000.00, 7 dias) y D (500.00, saldo inicial 300.00
 * vencido hace 10 dias); ruta R de hoy con P1 (A, 2 Cajas Corona), P2 (C, 1 Caja + 1 Six), P3 (B, 1 Caja Victoria),
 * P4 (C, 2 Cajas) y parada de cobro de D; cargada e iniciada con fondo 500.00.
 */
export async function juego(c: pg.PoolClient): Promise<Juego> {
  const dueno = await usuarioF3(c, ROL3.dueno);
  const hoy = await dia(c, 0);
  const s = sufijo();
  const cor = await producto(c, { factores: [1, 6, 24], nombre: `Corona ${s}`, usuario: dueno });
  await ponerPrecio(c, cor.pf(24), "Menudeo", "400.00");
  await ponerPrecio(c, cor.pf(6), "Menudeo", "105.00");
  await ponerPrecio(c, cor.pf(1), "Menudeo", "18.00");
  const vic = await producto(c, { factores: [1, 24], nombre: `Victoria ${s}`, usuario: dueno });
  await ponerPrecio(c, vic.pf(24), "Menudeo", "390.00");
  await compra(c, cor.pf(24), 10, "300.00");
  await compra(c, vic.pf(24), 1, "290.00");

  const A = await clienteCredito(c, "0.00");
  const B = await clienteCredito(c, "0.00");
  const C = await clienteCredito(c, "1000.00", 7);
  const D = await clienteCredito(c, "500.00", 0);
  await c.query("update app.cliente set ya_compro = false where id = $1", [A]);
  const cxcD = await saldoInicial(c, D, "300.00", await dia(c, -10), dueno);

  const P1 = await pedidoConfirmado(c, A, [lin(cor.pf(24), 2)], hoy, dueno);
  const P2 = await pedidoConfirmado(c, C, [lin(cor.pf(24), 1), lin(cor.pf(6), 1)], hoy, dueno);
  const P3 = await pedidoConfirmado(c, B, [lin(vic.pf(24), 1)], hoy, dueno);
  const P4 = await pedidoConfirmado(c, C, [lin(cor.pf(24), 2)], hoy, dueno);
  const rep = await repartidor(c);
  const r = await rutaCon(c, [P1, P2, P3, P4], { fecha: hoy, usuario: dueno, repartidor: rep });
  const paradaCobro = (await c.query("select app.fn_agregar_cobro($1, $2, $3) as id", [dueno, r.id, D])).rows[0].id as string;
  await c.query("select app.fn_cargar_ruta($1, $2)", [dueno, r.id]);
  const turno = (await c.query("select app.fn_iniciar_ruta($1, $2, '500.00') as id", [rep, r.id])).rows[0].id as string;
  const paradas = (await c.query("select id, pedido_id from app.ruta_parada where ruta_id = $1 and pedido_id is not null", [r.id])).rows;
  const parada = Object.fromEntries(paradas.map((p) => [p.pedido_id as string, p.id as string]));
  return {
    dueno, rep, hoy,
    corona: { id: cor.id, caja: cor.pf(24), six: cor.pf(6), pieza: cor.pf(1), nombre: `Corona ${s}` },
    victoria: { id: vic.id, caja: vic.pf(24), nombre: `Victoria ${s}` },
    A, B, C, D, P1, P2, P3, P4, ruta: r.id, turno, paradaCobro, parada, cxcD,
  };
}

/** Linea de pedido por presentacion. */
export async function lineaPedido(c: pg.PoolClient, ped: string, presentacion: string): Promise<string> {
  return (await fila<{ id: string }>(c, "select id from app.pedido_linea where pedido_id = $1 and presentacion_id = $2", [ped, presentacion])).id;
}

/** Lo que pasa en el camino de la tabla de F7.md: P1 parcial en efectivo (1 Caja, recibido 500), P2 a credito, P3 por transferencia. */
export async function entregasBase(c: pg.PoolClient, j: Juego): Promise<{ v1: string; v2: string; v3: string }> {
  const l1 = await lineaPedido(c, j.P1, j.corona.caja);
  const v1 = (await entregar(c, j.rep, j.P1, { lineas: [{ pedido_linea_id: l1, cantidad_entregada: 1 }], ...efectivo("400.00", "500.00") })).venta_id;
  const v2 = (await entregar(c, j.rep, j.P2, credito("505.00"))).venta_id;
  const v3 = (await entregar(c, j.rep, j.P3, transferencia("390.00"))).venta_id;
  return { v1, v2, v3 };
}

/** Resumen del dia de la sucursal 1. */
export async function resumenDia(c: pg.PoolClient, fecha: string): Promise<Record<string, unknown>> {
  return (await c.query("select app.fn_resumen_dia(1, $1::date) as r", [fecha])).rows[0].r;
}

/** Existencia (piezas) y suma del kardex de un producto en la sucursal 1. */
export async function existenciaYKardex(c: pg.PoolClient, producto: string): Promise<{ cantidad: number; kardex: number }> {
  return fila(c, `select coalesce((select cantidad from app.existencia where sucursal_id = 1 and producto_id = $1), 0)::int as cantidad,
    (select coalesce(sum(cantidad), 0)::int from app.movimiento_inventario where sucursal_id = 1 and producto_id = $1) as kardex`, [producto]);
}

/* ------------------------------------------------ pruebas con dos conexiones: datos confirmados que se borran al final */

const TABLAS_CON_ID = [
  "zona", "usuario", "categoria", "producto", "presentacion", "cliente", "pedido", "pedido_linea", "pedido_evento", "aviso_cliente", "notificacion",
  "compra", "compra_linea", "proveedor", "vehiculo", "ruta", "ruta_parada", "caja", "turno_caja", "movimiento_caja", "venta", "venta_linea",
  "venta_pago", "cuenta_por_cobrar", "devolucion", "devolucion_linea", "abono", "movimiento_inventario", "auditoria",
] as const;

/** Marca de agua de cada tabla: lo que tenga id mayor al terminar lo creo la prueba (los archivos corren uno tras otro). */
export async function marcarAgua(): Promise<Record<string, string>> {
  const p = (await import("./ayuda.js")).pool;
  const marcas: Record<string, string> = {};
  for (const t of TABLAS_CON_ID) marcas[t] = (await p.query(`select coalesce(max(id), 0) as m from app.${t}`)).rows[0].m;
  return marcas;
}

/** Borra todo lo creado desde `marcas` (rol de replicacion: sin disparadores ni llaves foraneas). La base de pruebas es de superusuario. */
export async function borrarDesde(marcas: Record<string, string>): Promise<void> {
  const p = (await import("./ayuda.js")).pool;
  const l = await p.connect();
  try {
    await l.query("begin");
    await l.query("set local session_replication_role = replica");
    await l.query("delete from app.abono_aplicacion where abono_id > $1", [marcas.abono]);
    await l.query("delete from app.precio where presentacion_id > $1", [marcas.presentacion]);
    await l.query("delete from app.existencia where producto_id > $1", [marcas.producto]);
    for (const t of TABLAS_CON_ID) await l.query(`delete from app.${t} where id > $1`, [marcas[t]]);
    await l.query("commit");
  } catch (e) {
    await l.query("rollback").catch(() => undefined);
    throw e;
  } finally { l.release(); }
}

import type pg from "pg";
import { ajuste, ponerPrecio, producto, type ProductoCreado } from "./ayuda-inventario.js";
import { compra } from "./ayuda-surtido.js";
import {
  clienteCredito, devolver, efectivo, entregar, existenciaYKardex, fechar, fila, lin, pedido, pedidoConfirmado, repartidor, ROL3, rutaCon,
  turnoMostrador, usuarioF3, vender,
} from "./ayuda-cobro.js";
import { clienteEn } from "./ayuda-rutas.js";

// F11: se reutiliza ayuda-cobro.ts (turnoMostrador, vender, devolver, fechar, entregar...). Aqui solo lo propio de lealtad y sugerencias.
export { clienteCredito, devolver, efectivo, entregar, existenciaYKardex, fechar, fila, lin, pedido, pedidoConfirmado, repartidor, ROL3, turnoMostrador, usuarioF3, vender };
export { borrarDesde, dia, errorConDetalle, marcarAgua } from "./ayuda-cobro.js";

let n = 0;
const sufijo = () => `${++n}x${process.pid}`;

/** Prende la lealtad con el Dueno (fn_lealtad_configurar): regalo = `regaloId`, un premio cada `cada` cajas. */
export async function prenderLealtad(c: pg.PoolClient, regaloId: string, cada = 10, usuario?: string): Promise<void> {
  const u = usuario ?? (await usuarioF3(c, ROL3.dueno));
  await c.query("select app.fn_lealtad_configurar($1, $2::jsonb)", [
    u, JSON.stringify({ lealtad_activa: true, lealtad_cada: cada, lealtad_presentacion_regalo_id: regaloId }),
  ]);
}

/** Saldo de lealtad (v_lealtad_saldo; sin movimientos = 0). */
export async function saldoLealtad(c: pg.PoolClient, cliente: string): Promise<number> {
  return (await fila<{ s: number }>(c, "select coalesce((select saldo from app.v_lealtad_saldo where cliente_id = $1), 0)::int as s", [cliente])).s;
}

export interface Movimiento { tipo: string; cantidad: number; venta_linea_id: string | null }
/** Movimientos de lealtad de una venta, en orden de id. */
export async function movimientos(c: pg.PoolClient, venta: string): Promise<Movimiento[]> {
  return (await c.query("select tipo, cantidad::int as cantidad, venta_linea_id::text as venta_linea_id from app.lealtad_movimiento where venta_id = $1 order by id", [venta])).rows;
}

export interface LineaVenta {
  numero: number; presentacion_id: string; cantidad: number; precio_lista: string; precio_unitario: string; importe: string;
  costo_unitario: string; costo_total: string; id: string;
}
export async function lineasDe(c: pg.PoolClient, venta: string): Promise<LineaVenta[]> {
  return (await c.query(
    `select id::text, numero::int as numero, presentacion_id::text, cantidad, precio_lista::text, precio_unitario::text, importe::text,
            costo_unitario::text, costo_total::text from app.venta_linea where venta_id = $1 order by numero`, [venta])).rows;
}

export async function totalVenta(c: pg.PoolClient, venta: string): Promise<string> {
  return (await fila<{ t: string }>(c, "select total::text as t from app.venta where id = $1", [venta])).t;
}

export interface JuegoL {
  dueno: string; cajero: string; L: string; sufijo: string;
  corona: { id: string; caja: string; six: string; nombre: string };
  victoria: { id: string; caja: string; nombre: string };
}

/**
 * Juego fijo L de F11.md: Corona (Caja de 24 a 400.00 marcada para lealtad, Six a 105.00; 10 cajas a 300.00 -> 12.500000) y Victoria (Caja de 24
 * a 390.00 marcada; 5 cajas a 290.00 -> 12.083333). Cliente L (Menudeo, sin credito) y turno de mostrador del Cajero. Con `prender`, lealtad
 * prendida con meta 10 y regalo = Caja de Corona; sin el, queda la semilla (apagada).
 */
export async function juegoL(c: pg.PoolClient, o: { prender?: boolean; cajasVictoria?: number } = {}): Promise<JuegoL> {
  const s = sufijo();
  const dueno = await usuarioF3(c, ROL3.dueno);
  const cajero = await usuarioF3(c, ROL3.cajero);
  const cor = await producto(c, { factores: [1, 6, 24], nombre: `Corona ${s}`, usuario: dueno });
  await ponerPrecio(c, cor.pf(24), "Menudeo", "400.00");
  await ponerPrecio(c, cor.pf(6), "Menudeo", "105.00");
  const vic = await producto(c, { factores: [1, 24], nombre: `Victoria ${s}`, usuario: dueno });
  await ponerPrecio(c, vic.pf(24), "Menudeo", "390.00");
  await compra(c, cor.pf(24), 10, "300.00");
  await compra(c, vic.pf(24), o.cajasVictoria ?? 5, "290.00");
  await c.query("update app.presentacion set cuenta_lealtad = true where id = any($1)", [[cor.pf(24), vic.pf(24)]]);
  const L = await clienteCredito(c, "0.00");
  await turnoMostrador(c, cajero);
  if (o.prender ?? true) await prenderLealtad(c, cor.pf(24), 10, dueno);
  return {
    dueno, cajero, L, sufijo: s,
    corona: { id: cor.id, caja: cor.pf(24), six: cor.pf(6), nombre: `Corona ${s}` },
    victoria: { id: vic.id, caja: vic.pf(24), nombre: `Victoria ${s}` },
  };
}

/** Venta de mostrador del cajero a L en efectivo exacto. */
export const venderL = (c: pg.PoolClient, j: JuegoL, lineas: { presentacion_id: string; cantidad: number }[], total: string, o: { clave?: string; hash?: string } = {}) =>
  vender(c, j.cajero, { cliente_id: j.L, lineas, ...efectivo(total), ...o });

/** Ruta de hoy con los pedidos dados, cargada e iniciada (turno de ruta con fondo 500.00). Devuelve ruta, repartidor y turno. */
export async function rutaEnCurso(c: pg.PoolClient, dueno: string, pedidos: string[], rep?: string): Promise<{ ruta: string; rep: string; turno: string }> {
  const hoy = (await fila<{ d: string }>(c, "select app.fn_fecha_local(now())::text as d")).d;
  const r = rep ?? (await repartidor(c));
  const ruta = await rutaCon(c, pedidos, { fecha: hoy, usuario: dueno, repartidor: r });
  await c.query("select app.fn_cargar_ruta($1, $2)", [dueno, ruta.id]);
  const turno = (await c.query("select app.fn_iniciar_ruta($1, $2, '500.00') as id", [r, ruta.id])).rows[0].id as string;
  return { ruta: ruta.id, rep: r, turno };
}

export { ajuste, compra, ponerPrecio, producto, type ProductoCreado };

/* ------------------------------------------------------------------------------------------- juego Z (sugerencias) */

export interface JuegoZ {
  dueno: string; cajero: string; Centro: string; Norte: string;
  A: string; B: string; C: string; D: string; E: string; F: string; G: string; S: string;
  /** Caja de 24 por nombre de producto (y `coronaSix`, `modeloSix`). */
  caja: Record<"Corona" | "Indio" | "Carta Blanca" | "Sol" | "Modelo" | "Victoria" | "Tecate" | "XX Lager" | "Pacifico" | "Bohemia", string>;
  coronaSix: string; modeloSix: string;
  /** producto_id por nombre. */
  producto: Record<string, string>;
  clientes: string[];
}

/** Mediodia local de hace `dias` dias, como texto (timestamptz). */
async function mediodia(c: pg.PoolClient, dias: number): Promise<string> {
  return (await fila<{ t: string }>(c, "select (app.fn_inicio_dia(app.fn_fecha_local(now()) - $1::int) + interval '12 hours')::text as t", [dias])).t;
}

/** Compra de mostrador de `cant` Cajas (400.00) de una presentacion a `cliente`, fechada a mediodia de hace `dias` dias. Devuelve la venta. */
export async function comprarHace(
  c: pg.PoolClient, cajero: string, cliente: string, presentacion: string, cant: number, dias: number, precio = "400.00",
): Promise<string> {
  const total = (await fila<{ t: string }>(c, "select ($1::numeric * $2::numeric)::numeric(12,2)::text as t", [precio, cant])).t;
  const v = (await vender(c, cajero, { cliente_id: cliente, lineas: [lin(presentacion, cant)], ...efectivo(total) })).venta_id;
  await fechar(c, "venta", v, await mediodia(c, dias));
  return v;
}

/**
 * Juego fijo Z de F11.md. Zona Centro (A, B, C, D, G y el objetivo E), Norte (F) y S sin zona. Todas las Cajas de 24 con precio en Menudeo.
 * Ventas de mostrador completadas fechadas a mediodia local. Lealtad apagada (semilla).
 */
export async function juegoZ(c: pg.PoolClient): Promise<JuegoZ> {
  const s = sufijo();
  const dueno = await usuarioF3(c, ROL3.dueno);
  const cajero = await usuarioF3(c, ROL3.cajero);
  await turnoMostrador(c, cajero);
  const Centro = `Centro ${s}`;
  const Norte = `Norte ${s}`;
  const cli = (zona: string | null) => clienteEn(c, zona === null ? null : "19.000000", zona === null ? null : "-99.000000", zona);
  const A = await cli(Centro), B = await cli(Centro), C = await cli(Centro), D = await cli(Centro), G = await cli(Centro), E = await cli(Centro);
  const F = await cli(Norte);
  const S = await cli(null);

  const nombres = ["Corona", "Indio", "Carta Blanca", "Sol", "Modelo", "Victoria", "Tecate", "XX Lager", "Pacifico", "Bohemia"] as const;
  const caja = {} as JuegoZ["caja"];
  const prod: Record<string, string> = {};
  let coronaSix = "";
  let modeloSix = "";
  for (const nom of nombres) {
    const conSix = nom === "Corona" || nom === "Modelo";
    const p = await producto(c, { factores: conSix ? [1, 6, 24] : [1, 24], nombre: `${nom} ${s}`, usuario: dueno });
    await ponerPrecio(c, p.pf(24), "Menudeo", "400.00");
    if (conSix) await ponerPrecio(c, p.pf(6), "Menudeo", "105.00");
    await compra(c, p.pf(24), 20, "300.00");
    caja[nom] = p.pf(24);
    prod[nom] = p.id;
    if (nom === "Corona") coronaSix = p.pf(6);
    if (nom === "Modelo") modeloSix = p.pf(6);
  }
  const compraDe = async (quienes: string[], nom: (typeof nombres)[number], dias: number, presentacion = caja[nom], precio = "400.00") => {
    for (const q of quienes) await comprarHace(c, cajero, q, presentacion, 1, dias, precio);
  };

  await compraDe([A, B, C, D], "Corona", 3);
  await compraDe([A, B, C], "Corona", 30, coronaSix, "105.00");
  await compraDe([A, B, C, D], "Indio", 20);
  await compraDe([E], "Indio", 61);
  await compraDe([A, B, C], "Carta Blanca", 7);
  await compraDe([A, B, C], "Sol", 7);
  await compraDe([A, B, C], "Modelo", 60);
  await compraDe([E], "Modelo", 5, modeloSix, "105.00");
  await compraDe([A, B, C], "Victoria", 1);
  await compraDe([E], "Victoria", 10);
  await compraDe([A, B], "Tecate", 5);
  await compraDe([G], "Tecate", 61);
  await compraDe([A, B], "XX Lager", 2);
  await compraDe([F], "XX Lager", 2);
  await compraDe([A, B], "Pacifico", 4);
  const vC = await comprarHace(c, cajero, C, caja.Pacifico, 1, 4);
  await turnoMostrador(c, dueno);
  await c.query("select app.fn_cancelar_venta($1, $2, 'prueba')", [dueno, vC]);
  await compraDe([A, B, C], "Bohemia", 4);
  await c.query("update app.presentacion set activa = false where id = $1", [caja.Bohemia]);
  return { dueno, cajero, Centro, Norte, A, B, C, D, E, F, G, S, caja, coronaSix, modeloSix, producto: prod, clientes: [A, B, C, D, E, F, G, S] };
}

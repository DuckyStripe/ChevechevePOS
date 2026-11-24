import type pg from "pg";
import { ajuste, compra, ponerPrecio, producto } from "./ayuda-inventario.js";
import { proveedorNombrado } from "./ayuda-surtido.js";
import {
  clienteCredito, devolver, efectivo, entregar, credito, fechar, fila, lin, pedidoConfirmado, repartidor, ROL3, rutaCon, saldoInicial,
  turnoMostrador, usuarioF3, vender,
} from "./ayuda-cobro.js";

// F9: el juego fijo de F9.md. Fechas locales fijas (en el pasado): lo que valida fecha (pedido, ruta) se crea con hoy y se mueve despues.

export const D0 = "2026-11-01";
export const D1 = "2026-11-02";
export const D2 = "2026-11-03";

export interface JuegoReportes {
  dueno: string; cajero: string; rep: string;
  corona: { id: string; caja: string; six: string };
  victoria: { id: string; caja: string };
  tecate: { id: string };
  indio: { id: string };
  /** Los 4 productos del juego (para filtrar: la base de pruebas puede traer datos de otras suites). */
  productos: string[];
  A: string; B: string; C: string;
  modelo: string; heineken: string;
  T1: string; R1: string; T2: string;
  V1: string; V2: string; V3: string; V4: string; DV1: string;
  C1: string; C2: string; C3: string; C4: string;
  pedidoA: string; pedidoB: string;
  /** Los ids de las ventas completadas del juego (V1, V2, V3). */
  ventas: string[];
}

/** Mueve `creado_en` de filas inmutables (kardex, devolucion): solo con el rol de replicacion, dentro de la transaccion de prueba. */
async function fecharInmutable(c: pg.PoolClient, tabla: "movimiento_inventario" | "devolucion", id: string, ts: string): Promise<void> {
  await c.query("set local session_replication_role = replica");
  await c.query(`update app.${tabla} set creado_en = $2::timestamptz where id = $1`, [id, ts]);
  await c.query("set local session_replication_role = origin");
}

export async function juegoReportes(c: pg.PoolClient): Promise<JuegoReportes> {
  const hoy = (await fila<{ d: string }>(c, "select app.fn_fecha_local(now())::text as d")).d;
  const dueno = await usuarioF3(c, ROL3.dueno);
  const cajero = await usuarioF3(c, ROL3.cajero);
  const rep = await repartidor(c);

  const cor = await producto(c, { factores: [1, 6, 24], nombre: "Corona Extra", marca: "Corona", usuario: dueno });
  const vic = await producto(c, { factores: [1, 24], nombre: "Victoria", marca: "Victoria", usuario: dueno });
  const tec = await producto(c, { factores: [1, 24], nombre: "Tecate", marca: "Tecate", usuario: dueno });
  const ind = await producto(c, { factores: [1, 24], nombre: "Indio", marca: "Indio", usuario: dueno });
  await ponerPrecio(c, cor.pf(24), "Menudeo", "400.00");
  await ponerPrecio(c, cor.pf(6), "Menudeo", "105.00");
  await ponerPrecio(c, vic.pf(24), "Menudeo", "390.00");
  const modelo = await proveedorNombrado(c, "Modelo");
  const heineken = await proveedorNombrado(c, "Heineken");
  await c.query("update app.producto set proveedor_id = $2 where id = any($1)", [[cor.id, vic.id, ind.id], modelo.id]);
  await c.query("update app.producto set proveedor_id = $2 where id = $1", [tec.id, heineken.id]);
  await c.query("update app.producto set existencia_minima = 12 where id = $1", [vic.id]);
  await c.query("update app.producto set existencia_minima = 24 where id = $1", [tec.id]);

  // D0: compras (C4 cancelada)
  const un = (p: string, cant: number, costo: string) => [{ presentacion_id: p, cantidad: cant, costo_presentacion: costo }];
  const C1 = (await compra(c, un(cor.pf(24), 10, "300.00"), { usuario: dueno, proveedor: modelo.id, fecha: D0 })).id;
  const C2 = (await compra(c, un(vic.pf(24), 1, "290.00"), { usuario: dueno, proveedor: modelo.id, fecha: D0 })).id;
  const C3 = (await compra(c, un(tec.pf(24), 1, "240.00"), { usuario: dueno, proveedor: heineken.id, fecha: D0 })).id;
  const C4 = (await compra(c, un(ind.pf(24), 1, "280.00"), { usuario: dueno, proveedor: modelo.id, fecha: D0 })).id;
  await c.query("select app.fn_cancelar_compra($1, $2, 'prueba')", [dueno, C4]);

  const A = await clienteCredito(c, "0.00");
  const B = await clienteCredito(c, "0.00");
  const C = await clienteCredito(c, "1000.00", 7);

  // D1: V1 de mostrador (23:30 hora de Mexico) en el turno T1 del cajero
  const T1 = await turnoMostrador(c, cajero, "500.00");
  const V1 = (await vender(c, cajero, { lineas: [lin(cor.pf(6), 2)], ...efectivo("210.00") })).venta_id;
  await fechar(c, "venta", V1, "2026-11-03T05:30:00Z");

  // D1: ruta R1 (A entregado, B ajustado a 1 caja y no entregado, gasto 150.00, liquidada con 1350.00)
  const pedidoA = await pedidoConfirmado(c, A, [lin(cor.pf(24), 3)], hoy, dueno);
  const pedidoB = await pedidoConfirmado(c, B, [lin(cor.pf(24), 2)], hoy, dueno);
  const lineaB = (await fila<{ id: string }>(c, "select id from app.pedido_linea where pedido_id = $1", [pedidoB])).id;
  await c.query("select app.fn_ajustar_pedido($1, $2, $3::jsonb)", [
    dueno, pedidoB, JSON.stringify({ lineas: [{ pedido_linea_id: lineaB, cantidad: 1, motivo_ajuste: "solo se pudo surtir una" }] })]);
  const r = await rutaCon(c, [pedidoA, pedidoB], { fecha: hoy, usuario: dueno, repartidor: rep });
  await c.query("select app.fn_cargar_ruta($1, $2)", [dueno, r.id]);
  const turnoR = (await c.query("select app.fn_iniciar_ruta($1, $2, '300.00') as id", [rep, r.id])).rows[0].id as string;
  const V2 = (await entregar(c, rep, pedidoA, efectivo("1200.00"))).venta_id;
  const paradaB = (await fila<{ id: string }>(c, "select id from app.ruta_parada where ruta_id = $1 and pedido_id = $2", [r.id, pedidoB])).id;
  await c.query("select app.fn_marcar_no_entregado($1, $2, 'no_estaba')", [rep, paradaB]);
  await c.query("select * from app.fn_movimiento_caja($1, $2, 'salida', 150, 'Gasolina')", [rep, turnoR]);
  await c.query("select app.fn_terminar_ruta($1, $2)", [rep, r.id]);
  await c.query("select app.fn_liquidar_ruta($1, $2, '1350.00', null)", [dueno, r.id]);
  await c.query("update app.ruta set fecha = $2 where id = $1", [r.id, D1]);
  await c.query("update app.pedido set fecha_entrega = $2 where id = any($1)", [[pedidoA, pedidoB], D1]);
  await fechar(c, "venta", V2, "2026-11-02T18:00:00Z");
  await c.query("select app.fn_cerrar_turno($1, $2, '700.00', null)", [cajero, T1]);

  // D2: turno T2 del dueno
  const T2 = await turnoMostrador(c, dueno, "500.00");
  const V3 = (await vender(c, dueno, { lineas: [lin(vic.pf(24), 1)], cliente_id: C, ...credito("390.00") })).venta_id;
  await fechar(c, "venta", V3, "2026-11-03T18:00:00Z");
  await c.query("select set_config('app.escribiendo_dinero', '1', true)");
  await c.query("update app.cuenta_por_cobrar set vence_el = '2026-11-10', creado_en = '2026-11-03T18:00:00Z' where venta_id = $1", [V3]);
  const V4 = (await vender(c, dueno, { lineas: [lin(cor.pf(24), 1)], ...efectivo("400.00") })).venta_id;
  await fechar(c, "venta", V4, "2026-11-03T19:00:00Z");
  await c.query("select app.fn_cancelar_venta($1, $2, 'prueba')", [dueno, V4]);
  const lineaV2 = (await fila<{ id: string }>(c, "select id from app.venta_linea where venta_id = $1", [V2])).id;
  const DV1 = (await devolver(c, dueno, V2, { lineas: [{ venta_linea_id: lineaV2, piezas: 24, regresa_a_inventario: true }] })).devolucion_id;
  await fecharInmutable(c, "devolucion", DV1, "2026-11-03T20:00:00Z");
  const merma = await ajuste(c, dueno, tec.id, "merma", 6, { causa: "caducado", motivo: "caducado" });
  const entrada = await ajuste(c, dueno, cor.id, "ajuste_entrada", 2, { motivo: "conteo" });
  await fecharInmutable(c, "movimiento_inventario", merma, "2026-11-03T20:30:00Z");
  await fecharInmutable(c, "movimiento_inventario", entrada, "2026-11-03T20:31:00Z");
  await c.query("select app.fn_cerrar_turno($1, $2, '100.00', null)", [dueno, T2]);
  await saldoInicial(c, A, "500.00", "2026-12-31", dueno);

  return {
    dueno, cajero, rep,
    corona: { id: cor.id, caja: cor.pf(24), six: cor.pf(6) }, victoria: { id: vic.id, caja: vic.pf(24) }, tecate: { id: tec.id }, indio: { id: ind.id },
    productos: [cor.id, vic.id, tec.id, ind.id], A, B, C, modelo: modelo.id, heineken: heineken.id,
    T1, R1: r.id, T2, V1, V2, V3, V4, DV1, C1, C2, C3, C4, pedidoA, pedidoB, ventas: [V1, V2, V3],
  };
}

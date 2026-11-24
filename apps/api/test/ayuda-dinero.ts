import type pg from "pg";

/**
 * F7: borra lo que las pruebas de API dejan en las tablas de dinero (008), en orden de llaves foraneas, para que las demas suites
 * puedan borrar sus clientes, pedidos, rutas y usuarios. Va dentro de la transaccion de limpieza del llamador.
 * Los argumentos son subconsultas SQL (`select id from ...`) que devuelven ids; todo es texto fijo de pruebas, sin valores del usuario.
 * Las tablas inmutables (`fn_dinero_inmutable`) se desprotegen solo dentro de esta transaccion.
 */
export async function borrarDinero(c: pg.PoolClient, o: { clientes: string; usuarios: string; rutas: string }): Promise<void> {
  await c.query("select set_config('app.escribiendo_dinero', '1', true)");
  const inmutables = ["venta_linea", "venta_pago", "movimiento_caja", "devolucion", "devolucion_linea", "abono_aplicacion"];
  const trg = (t: string) => `trg_${t}_inmutable`;
  for (const t of inmutables) await c.query(`alter table app.${t} disable trigger ${trg(t)}`);
  const turnos = `(select id from app.turno_caja where ruta_id in (${o.rutas}) or usuario_id in (${o.usuarios}) or caja_id in (select id from app.caja where nombre like 'TF7 %'))`;
  const ventas = `(select id from app.venta where cliente_id in (${o.clientes}) or turno_caja_id in ${turnos} or usuario_id in (${o.usuarios}))`;
  const abonos = `(select id from app.abono where cliente_id in (${o.clientes}) or turno_caja_id in ${turnos} or usuario_id in (${o.usuarios}))`;
  const devs = `(select id from app.devolucion where venta_id in ${ventas} or turno_caja_id in ${turnos} or usuario_id in (${o.usuarios}))`;
  const cxc = `(select id from app.cuenta_por_cobrar where cliente_id in (${o.clientes}) or venta_id in ${ventas} or creado_por in (${o.usuarios}))`;
  await c.query(`delete from app.abono_aplicacion where abono_id in ${abonos} or cuenta_por_cobrar_id in ${cxc}`);
  await c.query(`delete from app.devolucion_linea where devolucion_id in ${devs}`);
  await c.query(`delete from app.devolucion where id in ${devs}`);
  await c.query(`delete from app.movimiento_caja where turno_caja_id in ${turnos} or usuario_id in (${o.usuarios})`);
  await c.query(`delete from app.cuenta_por_cobrar where id in ${cxc}`);
  await c.query(`delete from app.abono where id in ${abonos}`);
  await c.query(`delete from app.venta_pago where venta_id in ${ventas}`);
  await c.query(`delete from app.venta_linea where venta_id in ${ventas}`);
  // El pedido entregado exige venta; se cancela solo para soltarla (los pedidos de prueba se borran despues).
  await c.query(`update app.pedido set venta_id = null, estado = 'cancelado', cancelado_en = coalesce(cancelado_en, now()) where venta_id in ${ventas}`);
  await c.query(`delete from app.venta where id in ${ventas}`);
  await c.query(`update app.ruta set turno_caja_id = null where turno_caja_id in ${turnos}`);
  await c.query(`delete from app.turno_caja where id in ${turnos}`);
  await c.query("delete from app.caja where nombre like 'TF7 %'");
  for (const [serie, tabla] of [["V", "venta"], ["D", "devolucion"], ["A", "abono"]] as const) {
    await c.query(`delete from app.folio where serie = $1 and not exists (select 1 from app.${tabla})`, [serie]);
  }
  for (const t of inmutables) await c.query(`alter table app.${t} enable trigger ${trg(t)}`);
}

import type pg from "pg";
import { AppError } from "../../comun/errores.js";
import { hashSolicitud } from "../../comun/idempotencia.js";
import { listado, offset, type Pagina } from "../../comun/paginacion.js";
import { conUsuario } from "../../comun/transaccion.js";
import { consulta, pool } from "../../db/database.js";

const RESUMEN = `co.id, co.folio, json_build_object('id', pv.id::text, 'nombre', pv.nombre) as proveedor, co.folio_proveedor,
  co.fecha::text as fecha, co.condicion_pago, co.estado, co.total, co.fecha_surtido::text as fecha_surtido, co.creado_en`;
const DESDE = "from app.compra co join app.proveedor pv on pv.id = co.proveedor_id";

export async function listarCompras(
  sucursal: string,
  f: Pagina & { desde?: string; hasta?: string; proveedor_id?: string; estado?: string; fecha_surtido?: string },
) {
  const p: unknown[] = [sucursal];
  const arg = (v: unknown) => {
    p.push(v);
    return `$${p.length}`;
  };
  const donde = ["co.sucursal_id = $1"];
  if (f.desde) donde.push(`co.fecha >= ${arg(f.desde)}::date`);
  if (f.hasta) donde.push(`co.fecha <= ${arg(f.hasta)}::date`);
  if (f.proveedor_id) donde.push(`co.proveedor_id = ${arg(f.proveedor_id)}`);
  if (f.estado) donde.push(`co.estado = ${arg(f.estado)}`);
  if (f.fecha_surtido) donde.push(`co.fecha_surtido = ${arg(f.fecha_surtido)}::date`);
  const limite = arg(f.por_pagina);
  const desplazo = arg(offset(f));
  // `total` de la compra choca con el `total` del conteo: el importe se renombra y se vuelve a poner.
  const r = await consulta<{ importe: string; total_filas: string }>(
    `select ${RESUMEN.replace("co.total,", "co.total as importe,")}, count(*) over() as total_filas ${DESDE} where ${donde.join(" and ")}
      order by co.fecha desc, co.id desc limit ${limite} offset ${desplazo}`,
    p,
  );
  const items = r.rows.map((fila) => {
    const { importe, ...resto } = fila;
    delete (resto as { total_filas?: string }).total_filas;
    return { ...resto, total: importe };
  });
  return listado(items, r.rows[0]?.total_filas ?? 0, f);
}

async function leerCompra(c: pg.Pool | pg.PoolClient, id: string, veCostos: boolean) {
  const r = await c.query(
    `select ${RESUMEN}, co.notas, co.motivo_cancelacion, co.cancelada_en,
            (select coalesce(json_agg(json_build_object(
                'id', cl.id::text, 'presentacion_id', cl.presentacion_id::text, 'producto_id', cl.producto_id::text,
                'producto', p.nombre, 'presentacion', pz.nombre, 'factor', cl.factor, 'cantidad', cl.cantidad,
                'piezas', cl.piezas, 'costo_presentacion', cl.costo_presentacion::text, 'importe', cl.importe::text,
                ${veCostos ? "'costo_unitario', cl.costo_unitario::text, " : ""}'caduca_el', cl.caduca_el::text) order by cl.id), '[]'::json)
               from app.compra_linea cl
               join app.producto p on p.id = cl.producto_id
               join app.presentacion pz on pz.id = cl.presentacion_id
              where cl.compra_id = co.id) as lineas
       ${DESDE} where co.id = $1`,
    [id],
  );
  if (!r.rows[0]) throw new AppError("NO_ENCONTRADO");
  return r.rows[0];
}

// costo_unitario (costo por pieza) solo con costos.ver (P37); costo_presentacion e importe son lo pagado y los ve quien ve compras.
export const detalleCompra = (id: string, veCostos: boolean) => leerCompra(pool, id, veCostos);

export async function registrarCompra(actor: string, sucursal: string, cuerpo: Record<string, unknown>) {
  const hash = hashSolicitud(cuerpo);
  return conUsuario(actor, async (c) => {
    const r = await c.query<{ compra_id: string; repetida: boolean }>(
      "select compra_id, repetida from app.fn_registrar_compra($1::bigint, $2::bigint, $3::jsonb, $4::text)",
      [actor, sucursal, JSON.stringify(cuerpo), hash],
    );
    const { compra_id, repetida } = r.rows[0]!;
    const t = await c.query<{ id: string; folio: string; total: string }>("select id, folio, total from app.compra where id = $1", [compra_id]);
    return { compra: t.rows[0]!, repetida };
  });
}

export async function cancelarCompra(actor: string, id: string, motivo: string, veCostos: boolean) {
  return conUsuario(actor, async (c) => {
    await c.query("select app.fn_cancelar_compra($1::bigint, $2::bigint, $3::text)", [actor, id, motivo]);
    return leerCompra(c, id, veCostos);
  });
}

export async function margenesCompra(id: string) {
  const r = await consulta("select * from app.fn_margenes_compra($1)", [id]);
  const existe = await consulta("select 1 from app.compra where id = $1", [id]);
  if (!existe.rowCount) throw new AppError("NO_ENCONTRADO");
  // Todo en una sola pagina: la pantalla no pagina y cortar filas ocultaria alertas.
  return { items: r.rows, total: r.rows.length, pagina: 1, por_pagina: Math.max(r.rows.length, 1) };
}

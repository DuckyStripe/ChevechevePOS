import type pg from "pg";
import { AppError } from "../../comun/errores.js";
import { listadoDeFilas, offset, type Pagina } from "../../comun/paginacion.js";
import { conUsuario } from "../../comun/transaccion.js";
import { consulta } from "../../db/database.js";

export async function listarExistencias(
  sucursal: string,
  veCostos: boolean,
  f: Pagina & { buscar?: string; categoria_id?: string; modo_surtido?: string; bajo_minimo?: boolean },
) {
  const p: unknown[] = [sucursal];
  const arg = (v: unknown) => {
    p.push(v);
    return `$${p.length}`;
  };
  const donde = ["(p.activo or coalesce(e.cantidad, 0) > 0)"];
  let unir = "";
  let orden = "p.nombre, p.id";
  if (f.buscar) {
    unir = `join app.fn_buscar_productos(${arg(f.buscar)}, 500, true) b on b.producto_id = p.id`;
    orden = "b.puntaje desc, p.nombre, p.id";
  }
  if (f.categoria_id) donde.push(`p.categoria_id = ${arg(f.categoria_id)}`);
  if (f.modo_surtido) donde.push(`p.modo_surtido = ${arg(f.modo_surtido)}`);
  if (f.bajo_minimo !== undefined) {
    donde.push(`${f.bajo_minimo ? "" : "not "}(p.modo_surtido = 'inventario' and coalesce(e.cantidad, 0) < p.existencia_minima)`);
  }
  const limite = arg(f.por_pagina);
  const desplazo = arg(offset(f));
  const r = await consulta<{ total: string }>(
    `select p.id as producto_id, p.nombre as producto, json_build_object('id', c.id::text, 'nombre', c.nombre) as categoria,
            p.modo_surtido, coalesce(e.cantidad, 0) as cantidad, 0 as confirmadas, 0 as cargadas,
            coalesce(e.cantidad, 0) / f.factor as cajas, coalesce(e.cantidad, 0) % f.factor as sueltas,
            p.existencia_minima
            ${veCostos ? ", e.costo_promedio, round(coalesce(e.cantidad, 0) * e.costo_promedio, 2) as valor" : ""},
            count(*) over() as total
       from app.producto p
       join app.categoria c on c.id = p.categoria_id
       left join app.existencia e on e.producto_id = p.id and e.sucursal_id = $1
       cross join lateral (select coalesce(max(pz.factor), 1) as factor from app.presentacion pz where pz.producto_id = p.id and pz.activa) f
       ${unir}
      where ${donde.join(" and ")}
      order by ${orden} limit ${limite} offset ${desplazo}`,
    p,
  );
  return listadoDeFilas(r.rows, f);
}

const columnasMovimiento = (veCostos: boolean) => `
  m.id, m.producto_id, p.nombre as producto, m.tipo, m.cantidad, m.existencia_resultante, m.causa_merma, m.motivo,
  json_build_object('id', u.id::text, 'nombre', u.nombre) as usuario, u.nombre as usuario_nombre,
  (select co.folio from app.compra_linea cl join app.compra co on co.id = cl.compra_id
    where m.referencia_tabla = 'compra_linea' and cl.id = m.referencia_id) as referencia,
  m.creado_en
  ${veCostos ? ", m.costo_unitario, m.costo_promedio_resultante" : ""}`;
const DESDE_MOV = `from app.movimiento_inventario m
  join app.producto p on p.id = m.producto_id
  join app.usuario u on u.id = m.usuario_id`;

export async function listarMovimientos(
  sucursal: string,
  veCostos: boolean,
  f: Pagina & { producto_id?: string; tipo?: string; causa_merma?: string; desde?: string; hasta?: string },
) {
  const p: unknown[] = [sucursal];
  const arg = (v: unknown) => {
    p.push(v);
    return `$${p.length}`;
  };
  const donde = ["m.sucursal_id = $1"];
  if (f.producto_id) donde.push(`m.producto_id = ${arg(f.producto_id)}`);
  if (f.tipo) donde.push(`m.tipo = ${arg(f.tipo)}`);
  if (f.causa_merma) donde.push(`m.causa_merma = ${arg(f.causa_merma)}`);
  if (f.desde) donde.push(`app.fn_fecha_local(m.creado_en) >= ${arg(f.desde)}::date`);
  if (f.hasta) donde.push(`app.fn_fecha_local(m.creado_en) <= ${arg(f.hasta)}::date`);
  const limite = arg(f.por_pagina);
  const desplazo = arg(offset(f));
  const r = await consulta<{ total: string }>(
    `select ${columnasMovimiento(veCostos)}, count(*) over() as total ${DESDE_MOV}
      where ${donde.join(" and ")} order by m.id desc limit ${limite} offset ${desplazo}`,
    p,
  );
  return listadoDeFilas(r.rows, f);
}

async function leerMovimiento(c: pg.PoolClient, veCostos: boolean, id: string) {
  const r = await c.query(`select ${columnasMovimiento(veCostos)} ${DESDE_MOV} where m.id = $1`, [id]);
  return r.rows[0];
}

async function exigirProducto(c: pg.PoolClient, id: string) {
  if (!(await c.query("select 1 from app.producto where id = $1", [id])).rowCount) throw new AppError("NO_ENCONTRADO");
}

export async function ajustar(
  actor: string,
  sucursal: string,
  veCostos: boolean,
  d: { producto_id: string; tipo: string; piezas: number; costo_unitario?: string; motivo?: string; causa_merma?: string },
  clave?: string,
  hash?: string,
) {
  return conUsuario(actor, async (c) => {
    await exigirProducto(c, d.producto_id);
    const r = await c.query<{ movimiento_id: string; repetida: boolean }>(
      `select movimiento_id, repetida from app.fn_ajustar_inventario($1::bigint, $2::bigint, $3::bigint, $4::text, $5::integer, $6::numeric, $7::text, $8::text, $9::uuid, $10::text)`,
      [actor, sucursal, d.producto_id, d.tipo, d.piezas, d.costo_unitario ?? null, d.motivo ?? null, d.causa_merma ?? null, clave ?? null, hash ?? null],
    );
    const { movimiento_id, repetida } = r.rows[0]!;
    return { movimiento: await leerMovimiento(c, veCostos, movimiento_id), repetida };
  });
}

/** `movimiento: null` = el conteo coincide y no hay movimiento. */
export async function contar(
  actor: string,
  sucursal: string,
  veCostos: boolean,
  d: { producto_id: string; piezas_contadas: number; motivo: string },
  clave?: string,
  hash?: string,
) {
  return conUsuario(actor, async (c) => {
    await exigirProducto(c, d.producto_id);
    const r = await c.query<{ movimiento_id: string | null; repetida: boolean }>(
      "select movimiento_id, repetida from app.fn_contar_inventario($1::bigint, $2::bigint, $3::bigint, $4::integer, $5::text, $6::uuid, $7::text)",
      [actor, sucursal, d.producto_id, d.piezas_contadas, d.motivo, clave ?? null, hash ?? null],
    );
    const { movimiento_id, repetida } = r.rows[0]!;
    return { movimiento: movimiento_id ? await leerMovimiento(c, veCostos, movimiento_id) : null, repetida };
  });
}

/** Corrige el costo promedio sin mover piezas (fn_revaluar_costo deja un movimiento `revaluacion`). */
export async function revaluar(actor: string, sucursal: string, veCostos: boolean, d: { producto_id: string; costo_unitario: string; motivo: string }) {
  return conUsuario(actor, async (c) => {
    await exigirProducto(c, d.producto_id);
    const r = await c.query<{ id: string }>("select app.fn_revaluar_costo($1::bigint, $2::bigint, $3::bigint, $4::numeric, $5::text) as id", [
      actor, sucursal, d.producto_id, d.costo_unitario, d.motivo,
    ]);
    return leerMovimiento(c, veCostos, r.rows[0]!.id);
  });
}

export async function porCaducar(sucursal: string, f: Pagina & { dias?: number }) {
  const r = await consulta<{ total: string }>(
    `select v.producto_id, v.producto,
            coalesce((select pz.id from app.presentacion pz where pz.producto_id = v.producto_id and pz.activa and pz.se_vende
                       order by pz.factor desc, pz.id limit 1), v.presentacion_id) as presentacion_id,
            v.compra_folio, v.caduca_el::text as caduca_el, v.piezas_estimadas, v.dias_restantes, count(*) over() as total
       from app.v_por_caducar v
      where v.sucursal_id = $1
        and v.dias_restantes <= coalesce($2::integer, (select (cf.valor #>> '{}')::integer from app.configuracion cf where cf.clave = 'dias_aviso_caducidad'))
      order by v.dias_restantes, v.producto, v.compra_folio
      limit $3 offset $4`,
    [sucursal, f.dias ?? null, f.por_pagina, offset(f)],
  );
  return listadoDeFilas(r.rows, f);
}

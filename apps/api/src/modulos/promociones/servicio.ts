import type pg from "pg";
import { AppError } from "../../comun/errores.js";
import { listadoDeFilas, offset, type Pagina } from "../../comun/paginacion.js";
import { conUsuario } from "../../comun/transaccion.js";
import { consulta } from "../../db/database.js";

const SELECT = `select pp.id, json_build_object('id', pv.id::text, 'nombre', pv.nombre) as proveedor,
    json_build_object('id', pz.id::text, 'nombre', pz.nombre, 'factor', pz.factor) as presentacion,
    json_build_object('id', pr.id::text, 'nombre', pr.nombre) as producto,
    pp.costo_presentacion, pp.minimo_cantidad, pp.desde::text as desde, pp.hasta::text as hasta,
    (app.fn_fecha_local(now()) between pp.desde and pp.hasta) as vigente, pp.notas, pp.creado_en
  from app.promocion_proveedor pp
  join app.proveedor pv on pv.id = pp.proveedor_id
  join app.presentacion pz on pz.id = pp.presentacion_id
  join app.producto pr on pr.id = pz.producto_id`;

export async function listarPromociones(f: Pagina & { vigentes?: boolean; proveedor_id?: string }, veCostos: boolean) {
  const p: unknown[] = [];
  const donde: string[] = [];
  if (f.vigentes) donde.push("app.fn_fecha_local(now()) between pp.desde and pp.hasta");
  if (f.proveedor_id) {
    p.push(f.proveedor_id);
    donde.push(`pp.proveedor_id = $${p.length}`);
  }
  p.push(f.por_pagina, offset(f));
  const r = await consulta<{ total: string }>(
    `${SELECT.replace("pp.creado_en", "pp.creado_en, count(*) over() as total")}
      ${donde.length ? `where ${donde.join(" and ")}` : ""}
      order by pp.hasta desc, pp.id desc limit $${p.length - 1} offset $${p.length}`,
    p,
  );
  const lista = listadoDeFilas(r.rows, f);
  // Sin costos.ver ni compras.registrar el costo de la promocion se borra (misma regla que /surtido).
  if (!veCostos) for (const x of lista.items) delete (x as { costo_presentacion?: string }).costo_presentacion;
  return lista;
}

async function leer(c: pg.PoolClient, id: string) {
  const r = await c.query(`${SELECT} where pp.id = $1`, [id]);
  if (!r.rows[0]) throw new AppError("NO_ENCONTRADO");
  return r.rows[0];
}

/** Proveedor existente y presentacion activa que se compra: si no, 404 o `PRESENTACION_NO_VALIDA` (nunca un 500 por llave foranea). */
async function validarLlaves(c: pg.PoolClient, proveedor: string, presentacion: string) {
  const pv = await c.query("select 1 from app.proveedor where id = $1", [proveedor]);
  if (!pv.rowCount) throw new AppError("NO_ENCONTRADO", { proveedor_id: proveedor });
  const pz = await c.query("select 1 from app.presentacion where id = $1 and se_compra and activa", [presentacion]);
  if (!pz.rowCount) throw new AppError("PRESENTACION_NO_VALIDA", { presentacion_ids: [presentacion] });
}

export async function crearPromocion(actor: string, d: Record<string, unknown> & { proveedor_id: string; presentacion_id: string }) {
  return conUsuario(actor, async (c) => {
    await validarLlaves(c, d.proveedor_id, d.presentacion_id);
    const r = await c.query<{ id: string }>(
      `insert into app.promocion_proveedor (proveedor_id, presentacion_id, costo_presentacion, minimo_cantidad, desde, hasta, notas, creado_por)
       values ($1, $2, $3, coalesce($4::integer, 1), $5, $6, $7, $8) returning id`,
      [d.proveedor_id, d.presentacion_id, d.costo_presentacion, d.minimo_cantidad ?? null, d.desde, d.hasta, d.notas ?? null, actor],
    );
    return leer(c, r.rows[0]!.id);
  });
}

export async function editarPromocion(actor: string, id: string, d: Record<string, unknown>) {
  return conUsuario(actor, async (c) => {
    const actual = await c.query<{ proveedor_id: string; presentacion_id: string; desde: string; hasta: string }>(
      "select proveedor_id, presentacion_id, desde::text, hasta::text from app.promocion_proveedor where id = $1 for update",
      [id],
    );
    const a = actual.rows[0];
    if (!a) throw new AppError("NO_ENCONTRADO");
    const desde = (d.desde as string | undefined) ?? a.desde;
    const hasta = (d.hasta as string | undefined) ?? a.hasta;
    if (hasta < desde) throw new AppError("VALIDACION", [{ path: ["hasta"], message: "La promocion no puede terminar antes de empezar" }]);
    await validarLlaves(c, (d.proveedor_id as string | undefined) ?? a.proveedor_id, (d.presentacion_id as string | undefined) ?? a.presentacion_id);
    const sets: string[] = [];
    const p: unknown[] = [id];
    for (const [col, v] of Object.entries(d)) {
      if (v === undefined) continue;
      p.push(v);
      sets.push(`${col} = $${p.length}`);
    }
    if (sets.length) await c.query(`update app.promocion_proveedor set ${sets.join(", ")} where id = $1`, p);
    return leer(c, id);
  });
}

export async function borrarPromocion(actor: string, id: string) {
  return conUsuario(actor, async (c) => {
    const r = await c.query("delete from app.promocion_proveedor where id = $1", [id]);
    if (!r.rowCount) throw new AppError("NO_ENCONTRADO");
  });
}

import type pg from "pg";
import { AppError } from "../../comun/errores.js";
import { listadoDeFilas, offset, type Pagina } from "../../comun/paginacion.js";
import { conUsuario } from "../../comun/transaccion.js";
import { consulta, pool } from "../../db/database.js";

const ref = (alias: string, nulo = false) =>
  `${nulo ? `case when ${alias}.id is null then null else ` : ""}json_build_object('id', ${alias}.id::text, 'nombre', ${alias}.nombre)${nulo ? " end" : ""}`;

const PRESENTACIONES = `(select coalesce(json_agg(json_build_object(
    'id', pz.id::text, 'nombre', pz.nombre, 'factor', pz.factor, 'codigo_barras', pz.codigo_barras,
    'se_vende', pz.se_vende, 'se_compra', pz.se_compra, 'activa', pz.activa,
    'precios', (select coalesce(json_agg(json_build_object('lista_precio_id', pr.lista_precio_id::text, 'precio', pr.precio::text)
                                          order by pr.lista_precio_id), '[]'::json)
                  from app.precio pr where pr.presentacion_id = pz.id)
  ) order by pz.factor, pz.id), '[]'::json) from app.presentacion pz where pz.producto_id = p.id)`;

/** Forma `Producto` (CONTRATOS §4.4). Costos solo con `costos.ver`: sin el permiso las llaves no existen. $1 = sucursal. */
const columnas = (veCostos: boolean) => `
  p.id, p.nombre, p.sku, p.descripcion, p.alias,
  ${ref("c")} as categoria, ${ref("m", true)} as marca,
  p.contenido_ml, p.tipo_envase, p.imagen, p.modo_surtido, p.margen_objetivo,
  ${ref("pv", true)} as proveedor,
  p.existencia_minima, p.activo, coalesce(e.cantidad, 0) as existencia, coalesce(d.confirmadas, 0) + coalesce(d.cargadas, 0) as comprometido,
  ${
    veCostos
      ? `e.costo_promedio,
  (select mi.costo_unitario from app.movimiento_inventario mi
    where mi.sucursal_id = $1 and mi.producto_id = p.id and mi.tipo = 'compra' order by mi.id desc limit 1) as ultimo_costo,`
      : ""
  }
  ${PRESENTACIONES} as presentaciones`;

const DESDE = `from app.producto p
  join app.categoria c on c.id = p.categoria_id
  left join app.marca m on m.id = p.marca_id
  left join app.proveedor pv on pv.id = p.proveedor_id
  left join app.existencia e on e.producto_id = p.id and e.sucursal_id = $1
  left join app.v_disponible d on d.producto_id = p.id and d.sucursal_id = $1`;

export interface FiltrosProductos extends Pagina {
  buscar?: string;
  categoria_id?: string;
  marca_id?: string;
  proveedor_id?: string;
  modo_surtido?: string;
  activo?: boolean;
  bajo_minimo?: boolean;
  producto_ids?: string[];
}

export async function listarProductos(sucursal: string, veCostos: boolean, f: FiltrosProductos) {
  const p: unknown[] = [sucursal];
  const arg = (v: unknown) => {
    p.push(v);
    return `$${p.length}`;
  };
  const donde: string[] = [];
  let unir = "";
  let orden = "p.nombre, p.id";
  if (f.buscar) {
    unir = `join app.fn_buscar_productos(${arg(f.buscar)}, 500, true) b on b.producto_id = p.id`;
    orden = "b.puntaje desc, p.nombre, p.id";
  }
  if (f.categoria_id) donde.push(`p.categoria_id = ${arg(f.categoria_id)}`);
  if (f.marca_id) donde.push(`p.marca_id = ${arg(f.marca_id)}`);
  if (f.proveedor_id) donde.push(`p.proveedor_id = ${arg(f.proveedor_id)}`);
  if (f.modo_surtido) donde.push(`p.modo_surtido = ${arg(f.modo_surtido)}`);
  if (f.activo !== undefined && !f.producto_ids) donde.push(`p.activo = ${arg(f.activo)}`); // con producto_ids se devuelven aunque esten inactivos
  if (f.producto_ids) donde.push(`p.id = any(${arg(f.producto_ids)}::bigint[])`);
  if (f.bajo_minimo !== undefined) {
    donde.push(`${f.bajo_minimo ? "" : "not "}(p.modo_surtido = 'inventario' and coalesce(e.cantidad, 0) < p.existencia_minima)`);
  }
  const limite = arg(f.por_pagina);
  const desplazo = arg(offset(f));
  const r = await consulta<{ total: string }>(
    `select ${columnas(veCostos)}, count(*) over() as total ${DESDE} ${unir}
      ${donde.length ? `where ${donde.join(" and ")}` : ""}
      order by ${orden} limit ${limite} offset ${desplazo}`,
    p,
  );
  return listadoDeFilas(r.rows, f);
}

export async function leerProducto(c: pg.Pool | pg.PoolClient, sucursal: string, veCostos: boolean, id: string) {
  const r = await c.query(`select ${columnas(veCostos)} ${DESDE} where p.id = $2`, [sucursal, id]);
  if (!r.rows[0]) throw new AppError("NO_ENCONTRADO");
  return r.rows[0];
}

export const obtenerProducto = (sucursal: string, veCostos: boolean, id: string) => leerProducto(pool, sucursal, veCostos, id);

const invalido = (campo: string, mensaje: string) => new AppError("VALIDACION", [{ path: [campo], message: mensaje }]);

/** Las llaves foraneas se revisan antes: un 23503 de Postgres saldria como 500. */
async function exigirReferencias(c: pg.PoolClient, d: { categoria_id?: string; marca_id?: string | null; proveedor_id?: string | null }) {
  const tablas: Array<[campo: "categoria_id" | "marca_id" | "proveedor_id", tabla: string]> = [
    ["categoria_id", "categoria"],
    ["marca_id", "marca"],
    ["proveedor_id", "proveedor"],
  ];
  for (const [campo, tabla] of tablas) {
    const id = d[campo];
    if (id == null) continue;
    const r = await c.query(`select 1 from app.${tabla} where id = $1`, [id]);
    if (!r.rowCount) throw invalido(campo, "No existe");
  }
}

export interface DatosPresentacion {
  nombre: string;
  factor: number;
  codigo_barras?: string | null;
  se_vende?: boolean;
  se_compra?: boolean;
}

const INSERTAR_PRESENTACION = `insert into app.presentacion (producto_id, nombre, factor, codigo_barras, se_vende, se_compra)
  values ($1, $2, $3, $4, coalesce($5::boolean, true), coalesce($6::boolean, true)) returning id`;
const params = (productoId: string, x: DatosPresentacion) => [productoId, x.nombre, x.factor, x.codigo_barras ?? null, x.se_vende ?? null, x.se_compra ?? null];

export async function crearProducto(
  actor: string,
  sucursal: string,
  veCostos: boolean,
  d: Record<string, unknown> & { categoria_id: string; presentaciones: DatosPresentacion[] },
) {
  return conUsuario(actor, async (c) => {
    await exigirReferencias(c, d as { categoria_id: string; marca_id?: string | null; proveedor_id?: string | null });
    const r = await c.query<{ id: string }>(
      `insert into app.producto (nombre, categoria_id, marca_id, sku, descripcion, alias, contenido_ml, tipo_envase,
                                 modo_surtido, margen_objetivo, proveedor_id, existencia_minima)
       values ($1, $2, $3, $4, $5, coalesce($6::text[], '{}'), $7, $8, coalesce($9::text, 'inventario'), $10, $11, $12) returning id`,
      [d.nombre, d.categoria_id, d.marca_id ?? null, d.sku ?? null, d.descripcion ?? null, d.alias ?? null, d.contenido_ml ?? null,
       d.tipo_envase ?? null, d.modo_surtido ?? null, d.margen_objetivo ?? null, d.proveedor_id ?? null, d.existencia_minima],
    );
    const id = r.rows[0]!.id;
    for (const x of d.presentaciones) await c.query(INSERTAR_PRESENTACION, params(id, x));
    // El disparador diferido PRODUCTO_SIN_PIEZA salta en el commit de conUsuario.
    return leerProducto(c, sucursal, veCostos, id);
  });
}

export async function editarProducto(actor: string, sucursal: string, veCostos: boolean, id: string, d: Record<string, unknown>) {
  return conUsuario(actor, async (c) => {
    await leerProducto(c, sucursal, false, id);
    await exigirReferencias(c, d as { categoria_id?: string; marca_id?: string | null; proveedor_id?: string | null });
    const sets: string[] = [];
    const p: unknown[] = [id];
    for (const [col, v] of Object.entries(d)) {
      if (v === undefined) continue;
      p.push(v);
      sets.push(`${col} = $${p.length}`);
    }
    await c.query(`update app.producto set ${[...sets, "actualizado_en = now()"].join(", ")} where id = $1`, p);
    return leerProducto(c, sucursal, veCostos, id);
  });
}

/* ---------------------------------------------------------------- presentaciones */

async function leerPresentacion(c: pg.PoolClient, id: string) {
  const r = await c.query(
    `select pz.id, pz.producto_id, pz.nombre, pz.factor, pz.codigo_barras, pz.se_vende, pz.se_compra, pz.activa,
            (select coalesce(json_agg(json_build_object('lista_precio_id', pr.lista_precio_id::text, 'precio', pr.precio::text)
                                      order by pr.lista_precio_id), '[]'::json)
               from app.precio pr where pr.presentacion_id = pz.id) as precios
       from app.presentacion pz where pz.id = $1`,
    [id],
  );
  if (!r.rows[0]) throw new AppError("NO_ENCONTRADO");
  return r.rows[0];
}

export async function crearPresentacion(actor: string, productoId: string, d: DatosPresentacion) {
  return conUsuario(actor, async (c) => {
    if (!(await c.query("select 1 from app.producto where id = $1", [productoId])).rowCount) throw new AppError("NO_ENCONTRADO");
    const r = await c.query<{ id: string }>(INSERTAR_PRESENTACION, params(productoId, d));
    return leerPresentacion(c, r.rows[0]!.id);
  });
}

export async function editarPresentacion(actor: string, id: string, d: Record<string, unknown>) {
  return conUsuario(actor, async (c) => {
    await leerPresentacion(c, id);
    const sets: string[] = [];
    const p: unknown[] = [id];
    for (const [col, v] of Object.entries(d)) {
      if (v === undefined) continue;
      p.push(v);
      sets.push(`${col} = $${p.length}`);
    }
    if (sets.length) await c.query(`update app.presentacion set ${sets.join(", ")} where id = $1`, p);
    return leerPresentacion(c, id);
  });
}

/** `ArticuloPos`: `disponible_piezas` sale de `v_disponible` (existencia menos lo comprometido en pedidos). */
export async function articuloPorCodigo(sucursal: string, codigo: string, listaId?: string) {
  const r = await consulta(
    `select pz.id as presentacion_id, p.id as producto_id, p.nombre as producto, pz.nombre as presentacion, pz.factor,
            pz.codigo_barras, pz.se_vende, pz.se_compra, p.categoria_id, m.nombre as marca, p.imagen,
            app.fn_precio(pz.id, coalesce($3::bigint, (select l.id from app.lista_precio l where l.es_predeterminada))) as precio,
            coalesce(e.cantidad, 0) as existencia_piezas, coalesce(d.disponible, coalesce(e.cantidad, 0)) as disponible_piezas
       from app.presentacion pz
       join app.producto p on p.id = pz.producto_id
       left join app.marca m on m.id = p.marca_id
       left join app.existencia e on e.producto_id = p.id and e.sucursal_id = $1
       left join app.v_disponible d on d.producto_id = p.id and d.sucursal_id = $1
      where pz.codigo_barras = $2 and pz.activa and p.activo`,
    [sucursal, codigo, listaId ?? null],
  );
  if (!r.rows[0]) throw new AppError("NO_ENCONTRADO");
  return r.rows[0];
}

/* ---------------------------------------------------------------- imagen */

export async function fijarImagen(actor: string, id: string, imagen: string | null): Promise<void> {
  await conUsuario(actor, async (c) => {
    const r = await c.query("update app.producto set imagen = $2, actualizado_en = now() where id = $1", [id, imagen]);
    if (!r.rowCount) throw new AppError("NO_ENCONTRADO");
  });
}

export async function existeProducto(id: string): Promise<boolean> {
  return (await consulta("select 1 from app.producto where id = $1", [id])).rowCount === 1;
}

/* ---------------------------------------------------------------- F3: catalogo de venta y equivalentes */

/** `GET /catalogo-venta`: presentaciones vendibles con precio de la lista y `disponible_piezas` de `v_disponible`. */
export async function catalogoVenta(sucursal: string, listaId?: string) {
  const r = await consulta(
    `select pz.id::text as presentacion_id, p.id::text as producto_id, p.nombre as producto, pz.nombre as presentacion, pz.factor, pz.codigo_barras,
            p.categoria_id::text as categoria_id, m.nombre as marca, p.imagen, l.precio::text as precio,
            coalesce(e.cantidad, 0) as existencia_piezas, coalesce(d.disponible, 0) as disponible_piezas
       from app.presentacion pz
       join app.producto p on p.id = pz.producto_id and p.activo
       left join app.marca m on m.id = p.marca_id
       left join app.existencia e on e.producto_id = p.id and e.sucursal_id = $1
       left join app.v_disponible d on d.producto_id = p.id and d.sucursal_id = $1
       cross join lateral (select app.fn_precio(pz.id, coalesce($2::bigint, (select id from app.lista_precio where es_predeterminada))) as precio) l
      where pz.activa and pz.se_vende and l.precio is not null
      order by p.nombre, pz.factor, pz.id`,
    [sucursal, listaId ?? null],
  );
  return r.rows;
}

export async function listarEquivalentes(productoId: string, q: pg.Pool | pg.PoolClient = pool) {
  if (!(await q.query("select 1 from app.producto where id = $1", [productoId])).rowCount) throw new AppError("NO_ENCONTRADO");
  const r = await q.query(
    `select e.equivalente_id::text as producto_id, p.nombre as producto, e.orden from app.producto_equivalente e join app.producto p on p.id = e.equivalente_id
      where e.producto_id = $1 order by e.orden, e.equivalente_id`,
    [productoId],
  );
  return r.rows;
}

/** Reemplaza la lista: borra lo que sobra y actualiza el orden de lo que queda (la bitacora solo ve cambios reales). */
export async function reemplazarEquivalentes(actor: string, productoId: string, lista: { producto_id: string; orden: number }[]) {
  const ids = lista.map((x) => x.producto_id);
  if (new Set(ids).size !== ids.length) throw invalido("equivalentes", "Hay productos repetidos");
  if (ids.includes(productoId)) throw invalido("equivalentes", "Un producto no puede ser equivalente de si mismo");
  return conUsuario(actor, async (c) => {
    await listarEquivalentes(productoId, c);
    if (ids.length) {
      const n = await c.query("select count(*)::int as n from app.producto where id = any($1::bigint[])", [ids]);
      if (n.rows[0].n !== ids.length) throw invalido("equivalentes", "Hay productos que no existen");
    }
    await c.query("delete from app.producto_equivalente where producto_id = $1 and not (equivalente_id = any($2::bigint[]))", [productoId, ids]);
    for (const x of lista) {
      await c.query(
        `insert into app.producto_equivalente (producto_id, equivalente_id, orden) values ($1, $2, $3)
         on conflict (producto_id, equivalente_id) do update set orden = excluded.orden where producto_equivalente.orden <> excluded.orden`,
        [productoId, x.producto_id, x.orden],
      );
    }
    return listarEquivalentes(productoId, c);
  });
}

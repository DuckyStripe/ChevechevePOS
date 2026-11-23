import type pg from "pg";
import { AppError } from "../../comun/errores.js";
import { listadoDeFilas, offset, type Pagina } from "../../comun/paginacion.js";
import { conUsuario } from "../../comun/transaccion.js";
import { consulta } from "../../db/database.js";

const invalido = (campo: string, mensaje: string) => new AppError("VALIDACION", [{ path: [campo], message: mensaje }]);

/* ---------------------------------------------------------------- listas de precio */

const COLUMNAS_LISTA = "id, nombre, es_predeterminada, activa";

export async function listarListas(f: Pagina) {
  const r = await consulta<{ total: string }>(
    `select ${COLUMNAS_LISTA}, count(*) over() as total from app.lista_precio
      order by es_predeterminada desc, nombre, id limit $1 offset $2`,
    [f.por_pagina, offset(f)],
  );
  return listadoDeFilas(r.rows, f);
}

async function leerLista(c: pg.PoolClient, id: string) {
  const r = await c.query(`select ${COLUMNAS_LISTA} from app.lista_precio where id = $1`, [id]);
  if (!r.rows[0]) throw new AppError("NO_ENCONTRADO");
  return r.rows[0];
}

export async function crearLista(actor: string, nombre: string) {
  return conUsuario(actor, async (c) => {
    const r = await c.query<{ id: string }>("insert into app.lista_precio (nombre) values ($1) returning id", [nombre]);
    return leerLista(c, r.rows[0]!.id);
  });
}

export async function editarLista(actor: string, id: string, d: { nombre?: string; es_predeterminada?: boolean; activa?: boolean }) {
  return conUsuario(actor, async (c) => {
    const actual = (await c.query<{ es_predeterminada: boolean; activa: boolean }>("select es_predeterminada, activa from app.lista_precio where id = $1 for update", [id])).rows[0];
    if (!actual) throw new AppError("NO_ENCONTRADO");
    const pred = d.es_predeterminada ?? actual.es_predeterminada;
    const activa = d.activa ?? actual.activa;
    // Siempre debe haber una predeterminada y activa: se cambia marcando otra, no desmarcando esta.
    if ((actual.es_predeterminada && !pred) || (pred && !activa)) throw new AppError("ESTADO_NO_VALIDO");
    if (pred && !actual.es_predeterminada) await c.query("update app.lista_precio set es_predeterminada = false where es_predeterminada");
    await c.query(
      "update app.lista_precio set nombre = coalesce($2, nombre), es_predeterminada = $3, activa = $4 where id = $1",
      [id, d.nombre ?? null, pred, activa],
    );
    return leerLista(c, id);
  });
}

/* ---------------------------------------------------------------- precios */

interface Fila {
  presentacion_id: string;
  lista_precio_id: string;
  precio: string;
}

export async function guardarPrecios(actor: string, sucursal: string, veCostos: boolean, filas: Fila[]) {
  const pres = filas.map((f) => f.presentacion_id);
  const listas = filas.map((f) => f.lista_precio_id);
  const precios = filas.map((f) => f.precio);
  return conUsuario(actor, async (c) => {
    const ok = await c.query<{ n: string }>(
      `select count(*) as n from unnest($1::bigint[], $2::bigint[]) as t(presentacion_id, lista_precio_id)
        join app.presentacion pz on pz.id = t.presentacion_id
        join app.lista_precio l on l.id = t.lista_precio_id and l.activa`,
      [pres, listas],
    );
    if (Number(ok.rows[0]!.n) !== filas.length) throw invalido("precios", "Una presentacion o lista no existe o la lista esta inactiva");
    const up = await c.query(
      `insert into app.precio (presentacion_id, lista_precio_id, precio, actualizado_en, actualizado_por)
       select t.presentacion_id, t.lista_precio_id, t.precio, now(), $4
         from unnest($1::bigint[], $2::bigint[], $3::numeric[]) as t(presentacion_id, lista_precio_id, precio)
       on conflict (presentacion_id, lista_precio_id)
       do update set precio = excluded.precio, actualizado_en = now(), actualizado_por = excluded.actualizado_por
          where app.precio.precio is distinct from excluded.precio`,
      [pres, listas, precios, actor],
    );
    const resultado: { actualizados: number; advertencias?: unknown[] } = { actualizados: up.rowCount ?? 0 };
    if (veCostos) {
      const a = await c.query(
        `select t.presentacion_id, t.lista_precio_id, t.precio, round(e.costo_promedio * pz.factor, 2) as costo_presentacion
           from unnest($1::bigint[], $2::bigint[], $3::numeric[]) as t(presentacion_id, lista_precio_id, precio)
           join app.presentacion pz on pz.id = t.presentacion_id
           join app.existencia e on e.producto_id = pz.producto_id and e.sucursal_id = $4
          where e.costo_promedio > 0 and t.precio < round(e.costo_promedio * pz.factor, 2)
          order by t.presentacion_id, t.lista_precio_id`,
        [pres, listas, precios, sucursal],
      );
      resultado.advertencias = a.rows;
    }
    return resultado;
  });
}

export async function precioBajoCosto(listaId?: string) {
  const r = await consulta(
    `select * from app.v_precio_bajo_costo ${listaId ? "where lista_precio_id = $1" : ""} order by producto, presentacion, lista`,
    listaId ? [listaId] : [],
  );
  return { filas: r.rows };
}

/** Misma formula A1 de fn_margenes_compra (app.fn_precio_sugerido), con el costo promedio vigente en vez de el de una compra. */
export async function preciosSugeridos(sucursal: string, productoIds: string[]) {
  const r = await consulta(
    `select pz.id as presentacion_id, l.id as lista_precio_id, b.precio,
            case when b.costo > 0 then app.fn_precio_sugerido(round(b.costo * pz.factor, 2), b.objetivo) end as precio_sugerido,
            case when b.costo > 0 and b.precio > 0 then (b.precio - round(b.costo * pz.factor, 2)) / b.precio end as margen,
            b.objetivo
       from app.producto p
       join app.presentacion pz on pz.producto_id = p.id and pz.activa
       cross join app.lista_precio l
       cross join lateral (
         select app.fn_precio(pz.id, l.id) as precio, app.fn_margen_objetivo(p.id) as objetivo,
                coalesce((select e.costo_promedio from app.existencia e where e.producto_id = p.id and e.sucursal_id = $1), 0) as costo) b
      where l.activa and p.id = any($2::bigint[])
      order by p.id, pz.id, l.id`,
    [sucursal, productoIds],
  );
  return r.rows;
}

/* ---------------------------------------------------------------- ofertas */

const OFERTA = `select o.id, o.presentacion_id, p.nombre as producto, pz.nombre as presentacion, o.lista_precio_id, l.nombre as lista,
    o.precio,
    coalesce((select pr.precio from app.precio pr where pr.presentacion_id = o.presentacion_id and pr.lista_precio_id = o.lista_precio_id),
             (select pr.precio from app.precio pr join app.lista_precio lp on lp.id = pr.lista_precio_id and lp.es_predeterminada
               where pr.presentacion_id = o.presentacion_id)) as precio_normal,
    o.desde::text as desde, o.hasta::text as hasta, o.motivo,
    app.fn_fecha_local(now()) between o.desde and o.hasta as vigente
  from app.precio_oferta o
  join app.presentacion pz on pz.id = o.presentacion_id
  join app.producto p on p.id = pz.producto_id
  left join app.lista_precio l on l.id = o.lista_precio_id`;

export async function listarOfertas(f: Pagina & { presentacion_id?: string; vigentes?: boolean }) {
  const p: unknown[] = [];
  const donde: string[] = [];
  if (f.presentacion_id) {
    p.push(f.presentacion_id);
    donde.push(`o.presentacion_id = $${p.length}`);
  }
  if (f.vigentes) donde.push("o.hasta >= app.fn_fecha_local(now())");
  p.push(f.por_pagina, offset(f));
  const r = await consulta<{ total: string }>(
    `select x.*, count(*) over() as total from (${OFERTA} ${donde.length ? `where ${donde.join(" and ")}` : ""}) x
      order by x.desde, x.id limit $${p.length - 1} offset $${p.length}`,
    p,
  );
  return listadoDeFilas(r.rows, f);
}

async function leerOferta(c: pg.PoolClient, id: string) {
  const r = await c.query(`${OFERTA} where o.id = $1`, [id]);
  if (!r.rows[0]) throw new AppError("NO_ENCONTRADO");
  return r.rows[0];
}

async function exigirLista(c: pg.PoolClient, id: string | null | undefined) {
  if (id && !(await c.query("select 1 from app.lista_precio where id = $1", [id])).rowCount) throw invalido("lista_precio_id", "No existe");
}

export async function crearOferta(
  actor: string,
  d: { presentacion_id: string; lista_precio_id?: string | null; precio: string; desde: string; hasta: string; motivo: string },
) {
  return conUsuario(actor, async (c) => {
    if (!(await c.query("select 1 from app.presentacion where id = $1", [d.presentacion_id])).rowCount) throw invalido("presentacion_id", "No existe");
    await exigirLista(c, d.lista_precio_id);
    const r = await c.query<{ id: string }>(
      `insert into app.precio_oferta (presentacion_id, lista_precio_id, precio, desde, hasta, motivo, creado_por)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [d.presentacion_id, d.lista_precio_id ?? null, d.precio, d.desde, d.hasta, d.motivo, actor],
    );
    return leerOferta(c, r.rows[0]!.id);
  });
}

export async function editarOferta(actor: string, id: string, d: Record<string, unknown> & { desde?: string; hasta?: string }) {
  return conUsuario(actor, async (c) => {
    const actual = await c.query<{ desde: string; hasta: string }>("select desde::text, hasta::text from app.precio_oferta where id = $1 for update", [id]);
    if (!actual.rows[0]) throw new AppError("NO_ENCONTRADO");
    if ((d.hasta ?? actual.rows[0].hasta) < (d.desde ?? actual.rows[0].desde)) throw invalido("hasta", "La oferta no puede terminar antes de empezar");
    await exigirLista(c, d.lista_precio_id as string | null | undefined);
    const sets: string[] = [];
    const p: unknown[] = [id];
    for (const [col, v] of Object.entries(d)) {
      if (v === undefined) continue;
      p.push(v);
      sets.push(`${col} = $${p.length}`);
    }
    if (sets.length) await c.query(`update app.precio_oferta set ${sets.join(", ")} where id = $1`, p);
    return leerOferta(c, id);
  });
}

export async function quitarOferta(actor: string, id: string): Promise<void> {
  await conUsuario(actor, async (c) => {
    const r = await c.query("delete from app.precio_oferta where id = $1", [id]);
    if (!r.rowCount) throw new AppError("NO_ENCONTRADO");
  });
}

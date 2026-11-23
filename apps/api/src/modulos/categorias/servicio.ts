import type pg from "pg";
import { AppError } from "../../comun/errores.js";
import { listadoDeFilas, offset, type Pagina } from "../../comun/paginacion.js";
import { conUsuario } from "../../comun/transaccion.js";
import { consulta } from "../../db/database.js";

const COLUMNAS = "id, nombre, orden, margen_objetivo, activa";

export async function listarCategorias(f: Pagina & { activa?: boolean }) {
  const p: unknown[] = [];
  let donde = "";
  if (f.activa !== undefined) {
    p.push(f.activa);
    donde = `where activa = $${p.length}`;
  }
  p.push(f.por_pagina, offset(f));
  const r = await consulta<{ total: string }>(
    `select ${COLUMNAS}, count(*) over() as total from app.categoria ${donde}
      order by orden, nombre, id limit $${p.length - 1} offset $${p.length}`,
    p,
  );
  return listadoDeFilas(r.rows, f);
}

async function leer(c: pg.PoolClient, id: string) {
  const r = await c.query(`select ${COLUMNAS} from app.categoria where id = $1`, [id]);
  if (!r.rows[0]) throw new AppError("NO_ENCONTRADO");
  return r.rows[0];
}

export async function crearCategoria(actor: string, d: { nombre: string; orden?: number; margen_objetivo?: string | null; activa?: boolean }) {
  return conUsuario(actor, async (c) => {
    const r = await c.query<{ id: string }>(
      `insert into app.categoria (nombre, orden, margen_objetivo, activa)
       values ($1, coalesce($2::smallint, 0), $3, coalesce($4::boolean, true)) returning id`,
      [d.nombre, d.orden ?? null, d.margen_objetivo ?? null, d.activa ?? null],
    );
    return leer(c, r.rows[0]!.id);
  });
}

export async function editarCategoria(actor: string, id: string, d: Record<string, unknown>) {
  return conUsuario(actor, async (c) => {
    await leer(c, id);
    const sets: string[] = [];
    const p: unknown[] = [id];
    for (const [col, v] of Object.entries(d)) {
      if (v === undefined) continue;
      p.push(v);
      sets.push(`${col} = $${p.length}`);
    }
    if (sets.length) await c.query(`update app.categoria set ${sets.join(", ")} where id = $1`, p);
    return leer(c, id);
  });
}

import type pg from "pg";
import { AppError } from "../../comun/errores.js";
import { listadoDeFilas, offset, type Pagina } from "../../comun/paginacion.js";
import { conUsuario } from "../../comun/transaccion.js";
import { consulta } from "../../db/database.js";

const COLUMNAS = "id, nombre, telefono, contacto, notas, activo";

export async function listarProveedores(f: Pagina & { buscar?: string; activo?: boolean }) {
  const donde: string[] = [];
  const p: unknown[] = [];
  if (f.buscar) {
    p.push(`%${f.buscar.replace(/[\\%_]/g, "\\$&")}%`);
    donde.push(`(nombre ilike $${p.length} or contacto ilike $${p.length})`);
  }
  if (f.activo !== undefined) {
    p.push(f.activo);
    donde.push(`activo = $${p.length}`);
  }
  p.push(f.por_pagina, offset(f));
  const r = await consulta<{ total: string }>(
    `select ${COLUMNAS}, count(*) over() as total from app.proveedor
      ${donde.length ? `where ${donde.join(" and ")}` : ""}
      order by nombre, id limit $${p.length - 1} offset $${p.length}`,
    p,
  );
  return listadoDeFilas(r.rows, f);
}

async function leer(c: pg.PoolClient, id: string) {
  const r = await c.query(`select ${COLUMNAS} from app.proveedor where id = $1`, [id]);
  if (!r.rows[0]) throw new AppError("NO_ENCONTRADO");
  return r.rows[0];
}

export async function crearProveedor(
  actor: string,
  d: { nombre: string; telefono?: string | null; contacto?: string | null; notas?: string | null; activo?: boolean },
) {
  return conUsuario(actor, async (c) => {
    const r = await c.query<{ id: string }>(
      `insert into app.proveedor (nombre, telefono, contacto, notas, activo)
       values ($1, $2, $3, $4, coalesce($5::boolean, true)) returning id`,
      [d.nombre, d.telefono ?? null, d.contacto ?? null, d.notas ?? null, d.activo ?? null],
    );
    return leer(c, r.rows[0]!.id);
  });
}

export async function editarProveedor(actor: string, id: string, d: Record<string, unknown>) {
  return conUsuario(actor, async (c) => {
    await leer(c, id);
    const sets: string[] = [];
    const p: unknown[] = [id];
    for (const [col, v] of Object.entries(d)) {
      if (v === undefined) continue;
      p.push(v);
      sets.push(`${col} = $${p.length}`);
    }
    if (sets.length) await c.query(`update app.proveedor set ${sets.join(", ")} where id = $1`, p);
    return leer(c, id);
  });
}

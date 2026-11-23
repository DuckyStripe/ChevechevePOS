import bcrypt from "bcryptjs";
import type pg from "pg";
import { AppError } from "../../comun/errores.js";
import { listadoDeFilas, offset, type Pagina } from "../../comun/paginacion.js";
import { conUsuario } from "../../comun/transaccion.js";
import { exigirDuenoSiRolSistema, exigirDuenoSiUsuarioEsDueno } from "../../comun/privilegios.js";
import { consulta } from "../../db/database.js";

// Forma `Usuario` de CONTRATOS §4.4. Nunca incluye contrasena_hash.
const COLUMNAS = `u.id, u.usuario, u.nombre, u.telefono,
  json_build_object('id', r.id, 'nombre', r.nombre) as rol,
  u.activo, u.debe_cambiar_contrasena, u.bloqueado_hasta, u.creado_en`;
const DESDE = "from app.usuario u join app.rol r on r.id = u.rol_id";

export async function listarUsuarios(f: Pagina & { buscar?: string; rol_id?: string; activo?: boolean }) {
  const donde: string[] = [];
  const p: unknown[] = [];
  if (f.buscar) {
    p.push(`%${f.buscar.replace(/[\\%_]/g, "\\$&")}%`);
    donde.push(`(u.usuario ilike $${p.length} or u.nombre ilike $${p.length} or u.telefono ilike $${p.length})`);
  }
  if (f.rol_id) {
    p.push(f.rol_id);
    donde.push(`u.rol_id = $${p.length}`);
  }
  if (f.activo !== undefined) {
    p.push(f.activo);
    donde.push(`u.activo = $${p.length}`);
  }
  p.push(f.por_pagina, offset(f));
  const r = await consulta<{ total: string }>(
    `select ${COLUMNAS}, count(*) over() as total ${DESDE}
      ${donde.length ? `where ${donde.join(" and ")}` : ""}
      order by u.nombre, u.id limit $${p.length - 1} offset $${p.length}`,
    p,
  );
  return listadoDeFilas(r.rows, f);
}

async function leerUsuario(c: pg.PoolClient, id: string) {
  const r = await c.query(`select ${COLUMNAS} ${DESDE} where u.id = $1`, [id]);
  if (!r.rows[0]) throw new AppError("NO_ENCONTRADO");
  return r.rows[0];
}

async function exigirRol(c: pg.PoolClient, rolId: string) {
  const r = await c.query("select 1 from app.rol where id = $1", [rolId]);
  if (!r.rowCount) throw new AppError("VALIDACION", [{ path: ["rol_id"], message: "El rol no existe" }]);
}

export async function crearUsuario(
  actor: string,
  d: { usuario: string; nombre: string; telefono?: string | null; contrasena: string; rol_id: string },
) {
  const hash = await bcrypt.hash(d.contrasena, 12);
  return conUsuario(actor, async (c) => {
    await exigirRol(c, d.rol_id);
    await exigirDuenoSiRolSistema(c, actor, d.rol_id);
    const r = await c.query<{ id: string }>(
      `insert into app.usuario (usuario, nombre, telefono, contrasena_hash, rol_id, sucursal_id)
       values ($1, $2, $3, $4, $5, 1) returning id`,
      [d.usuario, d.nombre, d.telefono ?? null, hash, d.rol_id],
    );
    return leerUsuario(c, r.rows[0]!.id);
  });
}

const CIERRA_SESIONES = "update app.sesion set cerrada_en = now() where usuario_id = $1 and cerrada_en is null";

export async function editarUsuario(
  actor: string,
  id: string,
  d: { nombre?: string; telefono?: string | null; rol_id?: string; activo?: boolean },
) {
  return conUsuario(actor, async (c) => {
    const actual = await c.query("select 1 from app.usuario where id = $1 for update", [id]);
    if (!actual.rowCount) throw new AppError("NO_ENCONTRADO");
    await exigirDuenoSiUsuarioEsDueno(c, actor, id);
    if (d.rol_id) {
      await exigirRol(c, d.rol_id);
      await exigirDuenoSiRolSistema(c, actor, d.rol_id);
    }
    const sets: string[] = [];
    const p: unknown[] = [id];
    for (const [col, v] of Object.entries(d)) {
      if (v === undefined) continue;
      p.push(v);
      sets.push(`${col} = $${p.length}`);
    }
    if (sets.length) {
      await c.query(`update app.usuario set ${sets.join(", ")}, actualizado_en = now() where id = $1`, p);
    }
    if (d.activo === false) await c.query(CIERRA_SESIONES, [id]);
    return leerUsuario(c, id);
  });
}

export async function restablecerContrasena(actor: string, id: string, nueva: string): Promise<void> {
  const hash = await bcrypt.hash(nueva, 12);
  await conUsuario(actor, async (c) => {
    await exigirDuenoSiUsuarioEsDueno(c, actor, id);
    const r = await c.query(
      `update app.usuario set contrasena_hash = $2, debe_cambiar_contrasena = true,
              intentos_fallidos = 0, bloqueado_hasta = null, actualizado_en = now() where id = $1`,
      [id, hash],
    );
    if (!r.rowCount) throw new AppError("NO_ENCONTRADO");
    await c.query(CIERRA_SESIONES, [id]);
  });
}

export async function cerrarSesionesDe(actor: string, id: string): Promise<void> {
  await conUsuario(actor, async (c) => {
    const r = await c.query("select 1 from app.usuario where id = $1", [id]);
    if (!r.rowCount) throw new AppError("NO_ENCONTRADO");
    await exigirDuenoSiUsuarioEsDueno(c, actor, id);
    await c.query(CIERRA_SESIONES, [id]);
  });
}

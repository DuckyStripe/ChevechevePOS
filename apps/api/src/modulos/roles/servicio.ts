import type pg from "pg";
import { AppError } from "../../comun/errores.js";
import { conUsuario } from "../../comun/transaccion.js";
import { exigirDueno } from "../../comun/privilegios.js";
import { consulta } from "../../db/database.js";

const SELECT_ROL = `select r.id, r.nombre, r.descripcion, r.es_sistema,
  array(select rp.permiso_codigo from app.rol_permiso rp where rp.rol_id = r.id order by 1) as permisos,
  (select count(*)::int from app.usuario u where u.rol_id = r.id) as num_usuarios
  from app.rol r`;

export async function listarRoles() {
  return (await consulta(`${SELECT_ROL} order by r.es_sistema desc, r.nombre`)).rows;
}

export async function listarPermisos() {
  return (await consulta("select codigo, modulo, descripcion from app.permiso order by modulo, codigo")).rows;
}

async function leerRol(c: pg.PoolClient, id: string) {
  const r = await c.query(`${SELECT_ROL} where r.id = $1`, [id]);
  if (!r.rows[0]) throw new AppError("NO_ENCONTRADO");
  return r.rows[0];
}

async function exigirPermisos(c: pg.PoolClient, codigos: string[]) {
  const r = await c.query<{ n: number }>("select count(*)::int as n from app.permiso where codigo = any($1::text[])", [codigos]);
  if (r.rows[0]!.n !== codigos.length) throw new AppError("VALIDACION", [{ path: ["permisos"], message: "Hay permisos que no existen" }]);
}

const GESTIONA = "usuarios.gestionar";
const GUARDA_PERMISOS = `insert into app.rol_permiso (rol_id, permiso_codigo) select $1, unnest($2::text[])`;

export async function crearRol(actor: string, d: { nombre: string; descripcion?: string | null; permisos: string[] }) {
  return conUsuario(actor, async (c) => {
    if (d.permisos.includes(GESTIONA)) await exigirDueno(c, actor);
    await exigirPermisos(c, d.permisos);
    const r = await c.query<{ id: string }>("insert into app.rol (nombre, descripcion) values ($1, $2) returning id", [d.nombre, d.descripcion ?? null]);
    await c.query(GUARDA_PERMISOS, [r.rows[0]!.id, d.permisos]);
    return leerRol(c, r.rows[0]!.id);
  });
}

export async function editarRol(actor: string, id: string, d: { nombre?: string; descripcion?: string | null; permisos?: string[] }) {
  return conUsuario(actor, async (c) => {
    const r = await c.query<{ es_sistema: boolean }>("select es_sistema from app.rol where id = $1 for update", [id]);
    if (!r.rows[0]) throw new AppError("NO_ENCONTRADO");
    if (r.rows[0].es_sistema) {
      await exigirDueno(c, actor);
      throw new AppError("ROL_SISTEMA");
    }
    // Repartir o quitar usuarios.gestionar (o editar un rol que ya lo tiene) es del dueno.
    const tiene = await c.query("select 1 from app.rol_permiso where rol_id = $1 and permiso_codigo = $2", [id, GESTIONA]);
    if (tiene.rowCount || d.permisos?.includes(GESTIONA)) await exigirDueno(c, actor);
    if (d.permisos) await exigirPermisos(c, d.permisos);
    if (d.nombre !== undefined || d.descripcion !== undefined) {
      await c.query("update app.rol set nombre = coalesce($2, nombre), descripcion = case when $3 then $4 else descripcion end where id = $1", [
        id,
        d.nombre ?? null,
        d.descripcion !== undefined,
        d.descripcion ?? null,
      ]);
    }
    if (d.permisos) {
      // Solo la diferencia, para que la auditoria registre cambios reales.
      await c.query("delete from app.rol_permiso where rol_id = $1 and permiso_codigo <> all($2::text[])", [id, d.permisos]);
      await c.query(`${GUARDA_PERMISOS} on conflict do nothing`, [id, d.permisos]);
    }
    return leerRol(c, id);
  });
}

export async function borrarRol(actor: string, id: string): Promise<void> {
  await conUsuario(actor, async (c) => {
    const r = await c.query<{ es_sistema: boolean; usuarios: number }>(
      "select es_sistema, (select count(*)::int from app.usuario where rol_id = $1) as usuarios from app.rol where id = $1 for update",
      [id],
    );
    if (!r.rows[0]) throw new AppError("NO_ENCONTRADO");
    if (r.rows[0].es_sistema) throw new AppError("ROL_SISTEMA");
    if (r.rows[0].usuarios > 0) throw new AppError("ROL_EN_USO");
    await c.query("delete from app.rol where id = $1", [id]);
  });
}

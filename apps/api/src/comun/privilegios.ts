import type pg from "pg";
import { AppError } from "./errores.js";

/** `usuarios.gestionar` no basta para tocar al dueno ni para repartir poder: eso es solo del rol de sistema (decision del dueno). */
export async function exigirDueno(c: pg.PoolClient, actorId: string): Promise<void> {
  const r = await c.query("select 1 from app.usuario u join app.rol r on r.id = u.rol_id where u.id = $1 and u.activo and r.es_sistema", [actorId]);
  if (!r.rowCount) throw new AppError("SIN_PERMISO", { permiso: "rol_sistema" });
}

/** Si el rol (o el usuario, por su rol) es de sistema, el actor debe ser dueno. */
export async function exigirDuenoSiRolSistema(c: pg.PoolClient, actorId: string, rolId: string): Promise<void> {
  const r = await c.query<{ es_sistema: boolean }>("select es_sistema from app.rol where id = $1", [rolId]);
  if (r.rows[0]?.es_sistema) await exigirDueno(c, actorId);
}

export async function exigirDuenoSiUsuarioEsDueno(c: pg.PoolClient, actorId: string, usuarioId: string): Promise<void> {
  const r = await c.query("select 1 from app.usuario u join app.rol r on r.id = u.rol_id where u.id = $1 and r.es_sistema", [usuarioId]);
  if (r.rowCount) await exigirDueno(c, actorId);
}

import { conUsuario } from "../../comun/transaccion.js";
import { consulta } from "../../db/database.js";

/** Objeto plano {clave: valor, ..., sucursal:{lat,lng}} (CONTRATOS §4.4). Coordenadas como string. */
export async function leerConfiguracion(): Promise<Record<string, unknown>> {
  const [cfg, suc] = await Promise.all([
    consulta<{ clave: string; valor: unknown }>("select clave, valor from app.configuracion order by clave"),
    consulta<{ lat: string | null; lng: string | null }>("select lat, lng from app.sucursal where id = 1"),
  ]);
  const o: Record<string, unknown> = {};
  for (const f of cfg.rows) o[f.clave] = f.valor;
  o.sucursal = { lat: suc.rows[0]?.lat ?? null, lng: suc.rows[0]?.lng ?? null };
  return o;
}

export async function editarConfiguracion(actor: string, cambios: Record<string, unknown>) {
  const { sucursal, ...claves } = cambios as { sucursal?: { lat: string | null; lng: string | null } };
  await conUsuario(actor, async (c) => {
    for (const [clave, valor] of Object.entries(claves)) {
      await c.query(
        `update app.configuracion set valor = $2::jsonb, actualizado_en = now(), actualizado_por = $3
          where clave = $1 and valor is distinct from $2::jsonb`,
        [clave, JSON.stringify(valor), actor],
      );
    }
    if (sucursal) {
      await c.query("update app.sucursal set lat = $1::numeric(9,6), lng = $2::numeric(9,6) where id = 1", [sucursal.lat, sucursal.lng]);
    }
  });
  return leerConfiguracion();
}

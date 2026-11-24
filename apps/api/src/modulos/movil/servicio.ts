import { z } from "zod";
import type { UsuarioSesion } from "../../comun/permisos.js";
import { consulta } from "../../db/database.js";

// Token FCM: solo estos caracteres y largo; nunca se loguea (el logger tambien lo censura).
export const esquemaRegistrar = z.object({
  token: z.string().regex(/^[A-Za-z0-9_:-]{20,4096}$/),
  plataforma: z.literal("android"),
  app_version: z.string().max(32).optional(),
});
export const esquemaQuitar = z.object({ token: z.string().regex(/^[A-Za-z0-9_:-]{20,4096}$/).optional() });

/** El SQL decide: sesion viva, del usuario y origen 'app' (si no SOLO_APP); el mismo SQL protege el DELETE. */
export async function registrarDispositivo(u: UsuarioSesion, d: z.infer<typeof esquemaRegistrar>): Promise<{ registrado: true }> {
  await consulta("select app.fn_registrar_dispositivo($1, $2, $3, $4, $5)", [u.id, u.jti, d.token, d.plataforma, d.app_version ?? null]);
  return { registrado: true };
}

export async function quitarDispositivos(u: UsuarioSesion, token?: string): Promise<{ quitados: number }> {
  const r = await consulta<{ n: number }>("select app.fn_quitar_dispositivos($1, $2, $3) as n", [u.id, u.jti, token ?? null]);
  return { quitados: r.rows[0]!.n };
}

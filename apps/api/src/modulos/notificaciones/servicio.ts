import { listadoDeFilas, offset, type Pagina } from "../../comun/paginacion.js";
import { conUsuario } from "../../comun/transaccion.js";
import { consulta } from "../../db/database.js";
import { EVENTOS } from "./esquemas.js";

export async function listarNotificaciones(usuarioId: string, f: Pagina & { no_leidas?: boolean }) {
  const r = await consulta<{ total: string }>(
    `select id, evento, titulo, cuerpo, datos, creado_en, leida_en, count(*) over() as total
       from app.notificacion
      where usuario_id = $1 and ($2::boolean is not true or leida_en is null)
      order by id desc limit $3 offset $4`,
    [usuarioId, f.no_leidas ?? false, f.por_pagina, offset(f)],
  );
  return listadoDeFilas(r.rows, f);
}

export async function marcarLeidas(usuarioId: string, ids?: string[]) {
  return conUsuario(usuarioId, async (c) => {
    await c.query(
      `update app.notificacion set leida_en = now()
        where usuario_id = $1 and leida_en is null and ($2::bigint[] is null or id = any($2::bigint[]))`,
      [usuarioId, ids?.length ? ids : null],
    );
    const r = await c.query<{ n: number }>("select count(*)::int as n from app.notificacion where usuario_id = $1 and leida_en is null", [usuarioId]);
    return { sin_leer: r.rows[0]!.n };
  });
}

/** Todos los eventos; los que nunca se guardaron valen push = true. */
export async function leerPreferencias(usuarioId: string) {
  const r = await consulta<{ evento: string; push: boolean }>("select evento, push from app.notificacion_preferencia where usuario_id = $1", [usuarioId]);
  const guardadas = new Map(r.rows.map((f) => [f.evento, f.push]));
  return { preferencias: EVENTOS.map((evento) => ({ evento, push: guardadas.get(evento) ?? true })) };
}

export async function guardarPreferencias(usuarioId: string, prefs: Array<{ evento: string; push: boolean }>) {
  await conUsuario(usuarioId, async (c) => {
    for (const p of prefs) {
      await c.query(
        `insert into app.notificacion_preferencia (usuario_id, evento, push) values ($1, $2, $3)
         on conflict (usuario_id, evento) do update set push = excluded.push`,
        [usuarioId, p.evento, p.push],
      );
    }
  });
  return leerPreferencias(usuarioId);
}

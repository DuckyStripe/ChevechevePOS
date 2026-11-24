import { AppError } from "../../comun/errores.js";
import { conUsuario } from "../../comun/transaccion.js";
import { consulta } from "../../db/database.js";

const ANIO_ACTUAL = "extract(year from app.fn_fecha_local(now()))::integer";

/** Calendario del anio (por omision el actual), con `factor` como string (numeric). */
export async function listarFechasDemanda(anio: number | undefined) {
  const r = await consulta<{ anio: number }>(`select coalesce($1::integer, ${ANIO_ACTUAL}) as anio`, [anio ?? null]);
  const a = r.rows[0]!.anio;
  const f = await consulta("select fecha::text as fecha, nombre, factor::text as factor from app.fecha_demanda where extract(year from fecha) = $1 order by fecha", [a]);
  // Forma de lista (§4.2) sin paginar, con el anio.
  return { anio: a, items: f.rows, total: f.rows.length, pagina: 1, por_pagina: Math.max(f.rows.length, 1) };
}

/**
 * Reemplaza el calendario del anio. Todas las fechas deben ser de ese anio (si no, `FECHA_NO_VALIDA`); una fecha repetida es `DUPLICADO`.
 * Sin `anio`, el de la primera fecha (o el actual si la lista viene vacia).
 */
export async function guardarFechasDemanda(actor: string, d: { anio?: number; fechas: { fecha: string; nombre: string; factor: number }[] }) {
  const anio = d.anio ?? (d.fechas[0] ? Number(d.fechas[0].fecha.slice(0, 4)) : undefined);
  const a = anio ?? (await consulta<{ a: number }>(`select ${ANIO_ACTUAL} as a`)).rows[0]!.a;
  if (new Set(d.fechas.map((x) => x.fecha)).size !== d.fechas.length) throw new AppError("DUPLICADO");
  await conUsuario(actor, (c) => c.query("select app.fn_reemplazar_fechas_demanda($1::bigint, $2::integer, $3::jsonb)", [actor, a, JSON.stringify(d.fechas)]));
  return listarFechasDemanda(a);
}

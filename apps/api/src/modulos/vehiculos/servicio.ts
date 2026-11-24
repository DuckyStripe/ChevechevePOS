import { AppError } from "../../comun/errores.js";
import { listadoDeFilas, offset, type Pagina } from "../../comun/paginacion.js";
import { conUsuario } from "../../comun/transaccion.js";
import { consulta } from "../../db/database.js";

const COLUMNAS = "id::text as id, nombre, placas, capacidad_cajas, activo";

export async function listarVehiculos(f: Pagina & { activo?: boolean }) {
  const r = await consulta<{ total: string }>(
    `select ${COLUMNAS}, count(*) over() as total from app.vehiculo where ($1::boolean is null or activo = $1) order by lower(nombre), id limit $2 offset $3`,
    [f.activo ?? null, f.por_pagina, offset(f)],
  );
  return listadoDeFilas(r.rows, f);
}

export async function crearVehiculo(actor: string, d: { nombre: string; placas?: string | null; capacidad_cajas?: number | null; activo?: boolean }) {
  return conUsuario(actor, async (c) =>
    (await c.query(
      `insert into app.vehiculo (nombre, placas, capacidad_cajas, activo) values ($1, $2, $3, coalesce($4::boolean, true)) returning ${COLUMNAS}`,
      [d.nombre, d.placas ?? null, d.capacidad_cajas ?? null, d.activo ?? null],
    )).rows[0],
  );
}

/** Placas y capacidad aceptan `null` (borrar el dato): por eso cada campo lleva su bandera «viene». */
export async function editarVehiculo(
  actor: string, id: string,
  d: { nombre?: string; placas?: string | null; capacidad_cajas?: number | null; activo?: boolean },
) {
  return conUsuario(actor, async (c) => {
    const r = await c.query(
      `update app.vehiculo set nombre = coalesce($2, nombre),
              placas = case when $3::boolean then $4 else placas end,
              capacidad_cajas = case when $5::boolean then $6::integer else capacidad_cajas end,
              activo = coalesce($7, activo)
        where id = $1 returning ${COLUMNAS}`,
      [id, d.nombre ?? null, "placas" in d, d.placas ?? null, "capacidad_cajas" in d, d.capacidad_cajas ?? null, d.activo ?? null],
    );
    if (!r.rows[0]) throw new AppError("NO_ENCONTRADO");
    return r.rows[0];
  });
}

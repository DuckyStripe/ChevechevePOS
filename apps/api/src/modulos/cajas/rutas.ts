import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../../comun/errores.js";
import { paramId } from "../../comun/ids.js";
import { esquemaPagina, listadoDeFilas, offset } from "../../comun/paginacion.js";
import { conUsuario } from "../../comun/transaccion.js";
import { consulta } from "../../db/database.js";

const CAJA = `k.id::text as id, k.nombre, k.activa,
  (select json_build_object('id', t.id::text, 'usuario', u.nombre) from app.turno_caja t join app.usuario u on u.id = t.usuario_id
    where t.caja_id = k.id and t.estado = 'abierto') as turno_abierto`;

const crear = z.object({ nombre: z.string().trim().min(1).max(60), activa: z.boolean().optional() });
const editar = z.object({ nombre: z.string().trim().min(1).max(60).optional(), activa: z.boolean().optional() });

export async function rutasCajas(app: FastifyInstance): Promise<void> {
  app.get("/", { config: { permiso: "caja.operar" } }, async (req) => {
    const p = esquemaPagina.parse(req.query);
    const r = await consulta<{ total: string }>(
      `select ${CAJA}, count(*) over() as total from app.caja k where k.sucursal_id = $1 order by k.nombre, k.id limit $2 offset $3`,
      [req.usuario!.sucursal_id, p.por_pagina, offset(p)],
    );
    return listadoDeFilas(r.rows, p);
  });

  app.post("/", { config: { permiso: "configuracion.editar" } }, async (req, reply) => {
    const d = crear.parse(req.body);
    const caja = await conUsuario(req.usuario!.id, async (c) => {
      const r = await c.query<{ id: string }>("insert into app.caja (sucursal_id, nombre, activa) values ($1, $2, coalesce($3::boolean, true)) returning id::text as id", [req.usuario!.sucursal_id, d.nombre, d.activa ?? null]);
      return (await c.query(`select ${CAJA} from app.caja k where k.id = $1`, [r.rows[0]!.id])).rows[0];
    });
    return reply.code(201).send(caja);
  });

  app.patch("/:id", { config: { permiso: "configuracion.editar" } }, async (req) => {
    const { id } = paramId.parse(req.params);
    const d = editar.parse(req.body);
    return conUsuario(req.usuario!.id, async (c) => {
      const r = await c.query("update app.caja set nombre = coalesce($2, nombre), activa = coalesce($3, activa) where id = $1 and sucursal_id = $4 returning id", [id, d.nombre ?? null, d.activa ?? null, req.usuario!.sucursal_id]);
      if (!r.rowCount) throw new AppError("NO_ENCONTRADO");
      return (await c.query(`select ${CAJA} from app.caja k where k.id = $1`, [id])).rows[0];
    });
  });
}

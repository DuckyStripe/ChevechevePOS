import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { dinero } from "../../comun/dinero.js";
import { AppError } from "../../comun/errores.js";
import { paramId, idEsquema } from "../../comun/ids.js";
import { hashSolicitud } from "../../comun/idempotencia.js";
import { esquemaPagina, listadoDeFilas, offset } from "../../comun/paginacion.js";
import type { UsuarioSesion } from "../../comun/permisos.js";
import { conUsuario } from "../../comun/transaccion.js";
import { consulta, pool } from "../../db/database.js";

const TURNO = `t.id::text as id, t.tipo, t.caja_id::text as caja_id, t.ruta_id::text as ruta_id,
  json_build_object('id', u.id::text, 'nombre', u.nombre) as usuario,
  case when k.id is null then null else json_build_object('id', k.id::text, 'nombre', k.nombre) end as caja,
  t.estado, t.fondo_inicial::text as fondo_inicial, t.fondo_inicial::text as fondo, t.abierto_en, t.cerrado_en,
  t.efectivo_esperado::text as efectivo_esperado, t.efectivo_contado::text as efectivo_contado, t.diferencia::text as diferencia`;
const DESDE = `from app.turno_caja t join app.usuario u on u.id = t.usuario_id left join app.caja k on k.id = t.caja_id left join app.ruta r on r.id = t.ruta_id`;
const SUCURSAL = "coalesce(k.sucursal_id, r.sucursal_id) = $1";

const supervisa = (u: UsuarioSesion) => u.permisos.includes("caja.supervisar");

const esquemaLista = esquemaPagina.extend({
  desde: z.iso.date().optional(), hasta: z.iso.date().optional(), usuario_id: idEsquema.optional(), caja_id: idEsquema.optional(),
  tipo: z.enum(["mostrador", "ruta"]).optional(), estado: z.enum(["abierto", "cerrado"]).optional(),
});
const esquemaAbrir = z.object({ caja_id: idEsquema, fondo_inicial: dinero });
const esquemaMovimiento = z.object({
  clave_idempotencia: z.uuid(), tipo: z.enum(["entrada", "salida", "retiro"]), monto: dinero, motivo: z.string().trim().min(1).max(200),
});
const esquemaCerrar = z.object({ efectivo_contado: dinero, notas: z.string().trim().min(1).max(500).optional() });

/** Un turno de la sucursal que esta persona puede ver: el propio, uno ajeno con caja.supervisar, o el de una ruta con rutas.liquidar. Si no, 404. */
async function turnoVisible(q: pg.Pool | pg.PoolClient, u: UsuarioSesion, id: string) {
  const r = await q.query(`select ${TURNO} ${DESDE} where t.id = $2 and ${SUCURSAL}`, [u.sucursal_id, id]);
  const t = r.rows[0];
  if (!t || (t.usuario.id !== u.id && !supervisa(u) && !(t.tipo === "ruta" && u.permisos.includes("rutas.liquidar")))) throw new AppError("NO_ENCONTRADO");
  return t;
}

export async function rutasTurnos(app: FastifyInstance): Promise<void> {
  app.get("/actual", { config: { permiso: ["caja.operar", "rutas.operar"] } }, async (req, reply) => {
    const r = await consulta(`select ${TURNO} ${DESDE} where t.usuario_id = $2 and t.estado = 'abierto' and ${SUCURSAL}`, [req.usuario!.sucursal_id, req.usuario!.id]);
    return reply.send(r.rows[0] ?? null);
  });

  app.get("/", { config: { permiso: ["caja.operar", "caja.supervisar"] } }, async (req) => {
    const u = req.usuario!;
    const f = esquemaLista.parse(req.query);
    const p: unknown[] = [u.sucursal_id];
    const arg = (v: unknown) => (p.push(v), `$${p.length}`);
    const donde = [SUCURSAL];
    // Sin caja.supervisar solo los propios (el filtro `usuario_id` de otro no devuelve nada).
    if (!supervisa(u)) donde.push(`t.usuario_id = ${arg(u.id)}`);
    if (f.usuario_id) donde.push(`t.usuario_id = ${arg(f.usuario_id)}`);
    if (f.caja_id) donde.push(`t.caja_id = ${arg(f.caja_id)}`);
    if (f.tipo) donde.push(`t.tipo = ${arg(f.tipo)}`);
    if (f.estado) donde.push(`t.estado = ${arg(f.estado)}`);
    if (f.desde) donde.push(`t.abierto_en >= app.fn_inicio_dia(${arg(f.desde)}::date)`);
    if (f.hasta) donde.push(`t.abierto_en < app.fn_inicio_dia(${arg(f.hasta)}::date + 1)`);
    const limite = arg(f.por_pagina);
    const desplazo = arg(offset(f));
    const r = await consulta<{ total: string }>(`select ${TURNO}, count(*) over() as total ${DESDE} where ${donde.join(" and ")} order by t.abierto_en desc, t.id desc limit ${limite} offset ${desplazo}`, p);
    return listadoDeFilas(r.rows, f);
  });

  app.post("/", { config: { permiso: "caja.operar" } }, async (req, reply) => {
    const d = esquemaAbrir.parse(req.body);
    const t = await conUsuario(req.usuario!.id, async (c) => {
      const r = await c.query<{ id: string }>("select app.fn_abrir_turno($1::bigint, $2::bigint, $3::numeric) as id", [req.usuario!.id, d.caja_id, d.fondo_inicial]);
      return turnoVisible(c, req.usuario!, r.rows[0]!.id);
    });
    return reply.code(201).send(t);
  });

  app.post("/:id/movimientos", { config: { permiso: ["caja.operar", "rutas.operar"] } }, async (req, reply) => {
    const { id } = paramId.parse(req.params);
    const d = esquemaMovimiento.parse(req.body);
    const hash = hashSolicitud({ ...d, turno_id: id });
    const r = await conUsuario(req.usuario!.id, async (c) => {
      const m = await c.query<{ movimiento_id: string; repetida: boolean }>(
        "select movimiento_id::text as movimiento_id, repetida from app.fn_movimiento_caja($1::bigint, $2::bigint, $3, $4::numeric, $5, $6::uuid, $7)",
        [req.usuario!.id, id, d.tipo, d.monto, d.motivo, d.clave_idempotencia, hash],
      );
      const fila = await c.query("select id::text as id, turno_caja_id::text as turno_id, tipo, monto::text as monto, motivo, creado_en from app.movimiento_caja where id = $1", [m.rows[0]!.movimiento_id]);
      return { mov: fila.rows[0], repetida: m.rows[0]!.repetida };
    });
    return reply.code(r.repetida ? 200 : 201).send(r.mov);
  });

  app.get("/:id/resumen", { config: { permiso: ["caja.operar", "caja.supervisar", "rutas.operar", "rutas.liquidar"] } }, async (req) => {
    const { id } = paramId.parse(req.params);
    await turnoVisible(pool, req.usuario!, id);
    return resumenConMovimientos(pool, id);
  });

  app.post("/:id/cerrar", { config: { permiso: "caja.operar" } }, async (req) => {
    const { id } = paramId.parse(req.params);
    const d = esquemaCerrar.parse(req.body);
    return conUsuario(req.usuario!.id, async (c) => {
      const r = await c.query<{ r: Record<string, unknown> }>("select app.fn_cerrar_turno($1::bigint, $2::bigint, $3::numeric, $4) as r", [req.usuario!.id, id, d.efectivo_contado, d.notas ?? null]);
      return { ...r.rows[0]!.r, movimientos: await movimientos(c, id) };
    });
  });
}

async function movimientos(q: pg.Pool | pg.PoolClient, turno: string) {
  return (await q.query("select id::text as id, tipo, monto::text as monto, motivo, creado_en from app.movimiento_caja where turno_caja_id = $1 order by id", [turno])).rows;
}

/** `fn_resumen_turno` (unica regla del efectivo esperado) mas la lista de movimientos del turno. */
export async function resumenConMovimientos(q: pg.Pool | pg.PoolClient, turno: string) {
  const r = await q.query<{ r: Record<string, unknown> }>("select app.fn_resumen_turno($1::bigint) as r", [turno]);
  return { ...r.rows[0]!.r, movimientos: await movimientos(q, turno) };
}

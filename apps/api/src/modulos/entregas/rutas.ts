import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { comprobanteNombre, dinero, pagosEsquema, SALDO_CLIENTE } from "../../comun/dinero.js";
import { AppError } from "../../comun/errores.js";
import { hashSolicitud } from "../../comun/idempotencia.js";
import { paramId } from "../../comun/ids.js";
import type { UsuarioSesion } from "../../comun/permisos.js";
import { conUsuario } from "../../comun/transaccion.js";
import { pool } from "../../db/database.js";
import { avisoDePedido } from "../avisos/servicio.js";
import { resumenConMovimientos } from "../turnos/rutas.js";

const esquemaEntrega = z.object({
  clave_idempotencia: z.uuid(),
  lineas: z.array(z.object({ pedido_linea_id: z.union([z.string().regex(/^[1-9]\d{0,17}$/), z.number().int().positive()]).transform(String), cantidad_entregada: z.number().int().min(0).max(1_000_000) })).max(200).optional(),
  pagos: pagosEsquema,
  efectivo_recibido: dinero.optional(),
  notas: z.string().trim().min(1).max(500).optional(),
  recibio: z.string().trim().min(1).max(80).optional(),
  foto_entrega: comprobanteNombre.optional(),
});
const esquemaLiquidar = z.object({ efectivo_contado: dinero, notas: z.string().trim().min(1).max(500).optional() });

async function entregar(u: UsuarioSesion, pedido: string, d: z.infer<typeof esquemaEntrega>) {
  const hash = hashSolicitud({ ...d, pedido_id: pedido });
  return conUsuario(u.id, async (c) => {
    const r = await c.query<{ venta_id: string; repetida: boolean }>(
      "select venta_id::text as venta_id, repetida from app.fn_entregar_pedido($1::bigint, $2::bigint, $3::jsonb, $4)",
      [u.id, pedido, JSON.stringify(d), hash],
    );
    const { venta_id, repetida } = r.rows[0]!;
    const f = await c.query(
      `select json_build_object('id', v.id::text, 'folio', v.folio, 'total', v.total::text, 'cambio', v.cambio::text) as venta,
              json_build_object('id', p.id::text, 'folio', p.folio, 'estado', p.estado, 'entregado_en', p.entregado_en, 'recibio', p.recibio) as pedido,
              (select ${SALDO_CLIENTE("s")} from app.v_saldo_cliente s where s.cliente_id = p.cliente_id) as saldo_cliente
         from app.venta v join app.pedido p on p.id = v.pedido_id where v.id = $1`,
      [venta_id],
    );
    const aviso = await avisoDePedido(c, f.rows[0].pedido.id, "wa_nota_entrega");
    return { cuerpo: { ...f.rows[0], aviso }, repetida };
  });
}

/** La ruta y su turno: el repartidor la ve (solo lectura); quien liquida (rutas.liquidar) ve cualquiera de la sucursal. Si no, 404. */
async function turnoDeRuta(q: pg.Pool | pg.PoolClient, u: UsuarioSesion, id: string): Promise<{ turno: string; ruta: { id: string; folio: string; estado: string } }> {
  const r = await q.query<{ id: string; folio: string; estado: string; repartidor_id: string; turno: string | null }>(
    "select id::text as id, folio, estado, repartidor_id::text as repartidor_id, turno_caja_id::text as turno from app.ruta where id = $1 and sucursal_id = $2", [id, u.sucursal_id]);
  const f = r.rows[0];
  if (!f || !f.turno || (!u.permisos.includes("rutas.liquidar") && f.repartidor_id !== u.id)) throw new AppError("NO_ENCONTRADO");
  return { turno: f.turno, ruta: { id: f.id, folio: f.folio, estado: f.estado } };
}

export async function rutasEntregas(app: FastifyInstance): Promise<void> {
  // Reparto: rutas.operar (solo el repartidor de la ruta, lo decide SQL); recoge en bodega: ventas.crear (SQL).
  app.post("/pedidos/:id/entregar", { config: { permiso: ["rutas.operar", "ventas.crear"] } }, async (req, reply) => {
    const { id } = paramId.parse(req.params);
    const { cuerpo, repetida } = await entregar(req.usuario!, id, esquemaEntrega.parse(req.body));
    return reply.code(repetida ? 200 : 201).send(cuerpo);
  });

  app.get("/rutas/:id/liquidacion", { config: { permiso: ["rutas.liquidar", "rutas.operar"] } }, async (req) => {
    const { turno, ruta } = await turnoDeRuta(pool, req.usuario!, paramId.parse(req.params).id);
    return { ...(await resumenConMovimientos(pool, turno)), ruta };
  });

  app.post("/rutas/:id/liquidar", { config: { permiso: "rutas.liquidar" } }, async (req) => {
    const { id } = paramId.parse(req.params);
    const d = esquemaLiquidar.parse(req.body);
    return conUsuario(req.usuario!.id, async (c) => {
      await c.query("select app.fn_liquidar_ruta($1::bigint, $2::bigint, $3::numeric, $4)", [req.usuario!.id, id, d.efectivo_contado, d.notas ?? null]);
      const { turno, ruta } = await turnoDeRuta(c, req.usuario!, id);
      return { ...(await resumenConMovimientos(c, turno)), ruta };
    });
  });
}

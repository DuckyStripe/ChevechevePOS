import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { consulta } from "../../db/database.js";

export async function rutasCierre(app: FastifyInstance): Promise<void> {
  // `fn_resumen_dia` es la unica regla. La ganancia solo se entrega con costos.ver (se borra, no se pone en null), y el costo estimado
  // de lo que falta comprar, con costos.ver o compras.registrar (igual que el resto de la lista de surtido, CONTRATOS §2.6).
  app.get("/resumen", { config: { permiso: "reportes.ver" } }, async (req) => {
    const u = req.usuario!;
    const { fecha } = z.object({ fecha: z.iso.date().optional() }).parse(req.query);
    const r = await consulta<{ r: Record<string, unknown> & { por_comprar: Record<string, unknown> } }>(
      "select app.fn_resumen_dia($1::bigint, coalesce($2::date, app.fn_fecha_local(now()))) as r", [u.sucursal_id, fecha ?? null]);
    const resumen = r.rows[0]!.r;
    if (!u.permisos.includes("costos.ver")) delete resumen.ganancia;
    if (!u.permisos.includes("costos.ver") && !u.permisos.includes("compras.registrar")) delete resumen.por_comprar.costo_estimado;
    return resumen;
  });
}

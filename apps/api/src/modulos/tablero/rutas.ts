import type { FastifyInstance } from "fastify";
import { consulta } from "../../db/database.js";

/**
 * GET /api/tablero (CONTRATOS §4.4): KPIs de dinero e inventario. Cada llave existe solo si el usuario tiene el permiso de su reporte
 * (sin permiso no hay llave: ni `null` ni 0). Cada cifra sale de la misma vista o regla que su reporte; aqui no se calcula nada.
 */
export async function rutasTablero(app: FastifyInstance): Promise<void> {
  app.get("/", { config: { permiso: "sesion" } }, async (req) => {
    const { permisos, sucursal_id } = req.usuario!;
    const tiene = (p: string) => permisos.includes(p);
    const hoy = "app.fn_fecha_local(now())";
    const ventas = (desde: string, col: string) =>
      `(select coalesce(sum(${col}), 0)::numeric(14,2)::text from app.v_ventas_lineas where sucursal_id = $1 and fecha >= ${desde} and fecha <= ${hoy})`;
    const kpis: Array<[llave: string, sql: string]> = [];
    if (tiene("reportes.ver")) kpis.push(["ventas_hoy", ventas(hoy, "importe")]);
    if (tiene("reportes.ver") && tiene("costos.ver")) kpis.push(["utilidad_mes", ventas(`date_trunc('month', ${hoy}::timestamp)::date`, "utilidad")]);
    if (tiene("cobranza.ver")) {
      // La misma regla del reporte de cuentas por cobrar (fn_cxc_antiguedad de hoy y de la sucursal): vencido = todo lo que ya paso su fecha.
      const cxc = `app.fn_cxc_antiguedad(${hoy}, $1)`;
      kpis.push(["cxc_total", `(select coalesce(sum(total), 0)::numeric(14,2)::text from ${cxc})`]);
      kpis.push(["cxc_vencido", `(select coalesce(sum(total - corriente), 0)::numeric(14,2)::text from ${cxc})`]);
    }
    if (tiene("inventario.ver")) kpis.push(["bajo_minimo", "(select count(*)::int from app.v_bajo_minimo where sucursal_id = $1)"]);
    // Por caducar: productos distintos con alguna compra por caducar (PEPS estimado de v_por_caducar) dentro de los dias de aviso de la configuracion.
    if (tiene("inventario.ver")) {
      kpis.push(["por_caducar", `(select count(distinct v.producto_id)::int from app.v_por_caducar v where v.sucursal_id = $1
        and v.dias_restantes <= (select (cf.valor #>> '{}')::integer from app.configuracion cf where cf.clave = 'dias_aviso_caducidad'))`]);
    }
    if (tiene("costos.ver")) kpis.push(["precios_bajo_costo", "(select count(*)::int from app.v_precio_bajo_costo)"]);

    const resultado: Record<string, unknown> = {};
    if (kpis.length) {
      const sql = `select ${kpis.map(([k, s]) => `${s} as ${k}`).join(", ")}`;
      const r = await consulta(sql, sql.includes("$1") ? [sucursal_id] : []);
      Object.assign(resultado, r.rows[0]);
    }
    return resultado;
  });
}

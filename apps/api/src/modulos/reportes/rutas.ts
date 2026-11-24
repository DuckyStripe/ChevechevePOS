import type { FastifyInstance } from "fastify";
import { exigirPermiso } from "../../comun/permisos.js";
import {
  esquemaCompras, esquemaCortes, esquemaCxc, esquemaEntregas, esquemaFaltantes, esquemaGanancia, esquemaUtilidad, esquemaValorizado, esquemaVentas,
} from "./esquemas.js";
import * as servicio from "./servicio.js";

/**
 * Reportes de solo lectura (CONTRATOS §4.4 «Reportes (F9)»). Orden de cada ruta: zod, rango de fechas (400), permiso fino (403), consulta.
 * Los que exponen costo o utilidad exigen costos.ver con `exigirPermiso`: sin el, la respuesta ni siquiera se calcula.
 */
export async function rutasReportes(app: FastifyInstance): Promise<void> {
  app.get("/ventas", { config: { permiso: "reportes.ver" } }, async (req) => {
    const f = esquemaVentas.parse(req.query);
    return servicio.ventas(req.usuario!.sucursal_id, await servicio.resolverRango(f), f.agrupar);
  });

  app.get("/compras", { config: { permiso: "reportes.ver" } }, async (req) => {
    const f = esquemaCompras.parse(req.query);
    const r = await servicio.resolverRango(f);
    exigirPermiso(req, "compras.ver"); // el importe de compras es costo: reportes.ver no basta
    return servicio.compras(req.usuario!.sucursal_id, r, f.agrupar);
  });

  app.get("/utilidad", { config: { permiso: "reportes.ver" } }, async (req) => {
    const f = esquemaUtilidad.parse(req.query);
    const r = await servicio.resolverRango(f);
    exigirPermiso(req, "costos.ver");
    return servicio.utilidad(req.usuario!.sucursal_id, r, f.agrupar);
  });

  app.get("/ganancia", { config: { permiso: "reportes.ver" } }, async (req) => {
    const f = esquemaGanancia.parse(req.query);
    const r = await servicio.resolverRango(f);
    exigirPermiso(req, "costos.ver");
    return servicio.ganancia(req.usuario!.sucursal_id, r, f.agrupar);
  });

  app.get("/entregas", { config: { permiso: "reportes.ver" } }, async (req) => {
    const f = esquemaEntregas.parse(req.query);
    return servicio.entregas(req.usuario!.sucursal_id, await servicio.resolverRango(f), f.agrupar);
  });

  app.get("/faltantes", { config: { permiso: "reportes.ver" } }, async (req) => {
    const f = esquemaFaltantes.parse(req.query);
    return servicio.faltantes(req.usuario!.sucursal_id, await servicio.resolverRango(f), f.agrupar);
  });

  app.get("/inventario-valorizado", { config: { permiso: "costos.ver" } }, async (req) => {
    const f = esquemaValorizado.parse(req.query);
    return servicio.inventarioValorizado(req.usuario!.sucursal_id, f.categoria_id);
  });

  app.get("/bajo-minimo", { config: { permiso: "inventario.ver" } }, async (req) => servicio.bajoMinimo(req.usuario!.sucursal_id));

  app.get("/cuentas-por-cobrar", { config: { permiso: "cobranza.ver" } }, async (req) => {
    const f = esquemaCxc.parse(req.query);
    return servicio.cuentasPorCobrar(req.usuario!.sucursal_id, f.al, f.zona_id);
  });

  app.get("/cortes", { config: { permiso: ["caja.supervisar", "rutas.liquidar"] } }, async (req) => {
    const f = esquemaCortes.parse(req.query);
    return servicio.cortes(req.usuario!, await servicio.resolverRango(f), f);
  });
}

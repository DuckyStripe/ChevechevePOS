import type { FastifyInstance, FastifyRequest } from "fastify";
import { hashSolicitud } from "../../comun/idempotencia.js";
import { exigirPermiso } from "../../comun/permisos.js";
import {
  esquemaAjuste,
  esquemaConteo,
  esquemaExistencias,
  esquemaMovimientos,
  esquemaPorCaducar,
  esquemaRevaluacion,
} from "./esquemas.js";
import { ajustar, contar, listarExistencias, listarMovimientos, porCaducar, revaluar } from "./servicio.js";

const ver = { permiso: "inventario.ver" };
const ajustarPermiso = { permiso: "inventario.ajustar" };
const veCostos = (req: FastifyRequest) => req.usuario!.permisos.includes("costos.ver");

export async function rutasInventario(app: FastifyInstance): Promise<void> {
  app.get("/existencias", { config: ver }, async (req) =>
    listarExistencias(req.usuario!.sucursal_id, veCostos(req), esquemaExistencias.parse(req.query)),
  );

  app.get("/movimientos", { config: ver }, async (req) =>
    listarMovimientos(req.usuario!.sucursal_id, veCostos(req), esquemaMovimientos.parse(req.query)),
  );

  app.post("/ajustes", { config: ajustarPermiso }, async (req, reply) => {
    const { clave_idempotencia, ...d } = esquemaAjuste.parse(req.body);
    const { movimiento, repetida } = await ajustar(req.usuario!.id, req.usuario!.sucursal_id, veCostos(req), d, clave_idempotencia, hashSolicitud(d));
    return reply.code(repetida ? 200 : 201).send(movimiento);
  });

  app.post("/conteos", { config: ajustarPermiso }, async (req, reply) => {
    const { clave_idempotencia, ...d } = esquemaConteo.parse(req.body);
    const { movimiento, repetida } = await contar(req.usuario!.id, req.usuario!.sucursal_id, veCostos(req), d, clave_idempotencia, hashSolicitud(d));
    if (!movimiento) return { sin_diferencia: true };
    return reply.code(repetida ? 200 : 201).send(movimiento);
  });

  app.post("/revaluaciones", { config: { permiso: "precios.editar" } }, async (req, reply) => {
    const d = esquemaRevaluacion.parse(req.body);
    exigirPermiso(req, "costos.ver");
    const m = await revaluar(req.usuario!.id, req.usuario!.sucursal_id, true, d);
    return reply.code(201).send(m);
  });

  app.get("/por-caducar", { config: ver }, async (req) => porCaducar(req.usuario!.sucursal_id, esquemaPorCaducar.parse(req.query)));
}

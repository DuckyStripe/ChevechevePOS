import type { FastifyInstance, FastifyRequest } from "fastify";
import { paramId } from "../../comun/ids.js";
import { exigirPermiso } from "../../comun/permisos.js";
import { esquemaCancelarCompra, esquemaCrearCompra, esquemaListaCompras } from "./esquemas.js";
import { cancelarCompra, detalleCompra, listarCompras, margenesCompra, registrarCompra } from "./servicio.js";

const ver = { permiso: "compras.ver" };
const veCostos = (req: FastifyRequest) => req.usuario!.permisos.includes("costos.ver");

export async function rutasCompras(app: FastifyInstance): Promise<void> {
  app.get("/", { config: ver }, async (req) => listarCompras(req.usuario!.sucursal_id, esquemaListaCompras.parse(req.query)));

  app.get("/:id", { config: ver }, async (req) => detalleCompra(paramId.parse(req.params).id, veCostos(req)));

  app.post("/", { config: { permiso: "compras.registrar" } }, async (req, reply) => {
    const { compra, repetida } = await registrarCompra(req.usuario!.id, req.usuario!.sucursal_id, esquemaCrearCompra.parse(req.body));
    return reply.code(repetida ? 200 : 201).send(compra);
  });

  app.post("/:id/cancelar", { config: { permiso: "compras.cancelar" } }, async (req) => {
    const { id } = paramId.parse(req.params);
    return cancelarCompra(req.usuario!.id, id, esquemaCancelarCompra.parse(req.body).motivo, veCostos(req));
  });

  // compras.ver + costos.ver (CONTRATOS §4.4): el segundo se exige antes de tocar la base.
  app.get("/:id/margenes", { config: ver }, async (req) => {
    const { id } = paramId.parse(req.params);
    exigirPermiso(req, "costos.ver");
    return margenesCompra(id);
  });
}

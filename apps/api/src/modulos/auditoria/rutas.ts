import type { FastifyInstance } from "fastify";
import { esquemaListaAuditoria } from "./esquemas.js";
import { listarAuditoria } from "./servicio.js";

export async function rutasAuditoria(app: FastifyInstance): Promise<void> {
  app.get("/", { config: { permiso: "auditoria.ver" } }, async (req) => listarAuditoria(esquemaListaAuditoria.parse(req.query)));
}

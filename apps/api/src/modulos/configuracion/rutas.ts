import type { FastifyInstance } from "fastify";
import { esquemaEditarConfiguracion } from "./esquemas.js";
import { editarConfiguracion, leerConfiguracion } from "./servicio.js";

export async function rutasConfiguracion(app: FastifyInstance): Promise<void> {
  app.get("/", { config: { permiso: "sesion" } }, async () => leerConfiguracion());

  app.patch("/", { config: { permiso: "configuracion.editar" } }, async (req) =>
    editarConfiguracion(req.usuario!.id, esquemaEditarConfiguracion.parse(req.body)),
  );
}

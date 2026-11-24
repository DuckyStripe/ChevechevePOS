import type { FastifyInstance } from "fastify";
import { esquemaAnio, esquemaGuardarFechas } from "./esquemas.js";
import { guardarFechasDemanda, listarFechasDemanda } from "./servicio.js";

export async function rutasFechasDemanda(app: FastifyInstance): Promise<void> {
  app.get("/", { config: { permiso: "surtido.ver" } }, async (req) => listarFechasDemanda(esquemaAnio.parse(req.query).anio));

  app.put("/", { config: { permiso: "configuracion.editar" } }, async (req) =>
    guardarFechasDemanda(req.usuario!.id, esquemaGuardarFechas.parse(req.body)),
  );
}

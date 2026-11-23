import type { FastifyInstance } from "fastify";
import { esquemaEditarPlantilla, esquemaListaPlantillas, esquemaVistaPrevia, paramClave } from "./esquemas.js";
import { editarPlantilla, listarPlantillas, vistaPrevia } from "./servicio.js";

const config = { permiso: "configuracion.editar" };

export async function rutasPlantillas(app: FastifyInstance): Promise<void> {
  app.get("/", { config }, async (req) => listarPlantillas(esquemaListaPlantillas.parse(req.query).canal));

  app.patch("/:clave", { config }, async (req) => {
    const { clave } = paramClave.parse(req.params);
    return editarPlantilla(req.usuario!.id, clave, esquemaEditarPlantilla.parse(req.body));
  });

  app.post("/:clave/vista-previa", { config }, async (req) => {
    const { clave } = paramClave.parse(req.params);
    return vistaPrevia(clave, esquemaVistaPrevia.parse(req.body ?? {}).vars);
  });
}

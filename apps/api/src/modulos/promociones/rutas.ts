import type { FastifyInstance } from "fastify";
import { paramId } from "../../comun/ids.js";
import { esquemaCrearPromocion, esquemaEditarPromocion, esquemaListaPromociones } from "./esquemas.js";
import { borrarPromocion, crearPromocion, editarPromocion, listarPromociones } from "./servicio.js";

const ver = { permiso: "surtido.ver" };
const escribir = { permiso: "compras.registrar" };

export async function rutasPromociones(app: FastifyInstance): Promise<void> {
  app.get("/", { config: ver }, async (req) => listarPromociones(esquemaListaPromociones.parse(req.query)));

  app.post("/", { config: escribir }, async (req, reply) => {
    const p = await crearPromocion(req.usuario!.id, esquemaCrearPromocion.parse(req.body));
    return reply.code(201).send(p);
  });

  app.patch("/:id", { config: escribir }, async (req) => {
    const { id } = paramId.parse(req.params);
    return editarPromocion(req.usuario!.id, id, esquemaEditarPromocion.parse(req.body));
  });

  app.delete("/:id", { config: escribir }, async (req, reply) => {
    const { id } = paramId.parse(req.params);
    await borrarPromocion(req.usuario!.id, id);
    return reply.code(204).send();
  });
}

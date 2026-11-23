import type { FastifyInstance } from "fastify";
import { paramId } from "../../comun/ids.js";
import { esquemaCrearCategoria, esquemaEditarCategoria, esquemaListaCategorias } from "./esquemas.js";
import { crearCategoria, editarCategoria, listarCategorias } from "./servicio.js";

const ver = { permiso: "catalogo.ver" };
const editar = { permiso: "catalogo.editar" };

export async function rutasCategorias(app: FastifyInstance): Promise<void> {
  app.get("/", { config: ver }, async (req) => listarCategorias(esquemaListaCategorias.parse(req.query)));

  app.post("/", { config: editar }, async (req, reply) => {
    const c = await crearCategoria(req.usuario!.id, esquemaCrearCategoria.parse(req.body));
    return reply.code(201).send(c);
  });

  app.patch("/:id", { config: editar }, async (req) => {
    const { id } = paramId.parse(req.params);
    return editarCategoria(req.usuario!.id, id, esquemaEditarCategoria.parse(req.body));
  });
}

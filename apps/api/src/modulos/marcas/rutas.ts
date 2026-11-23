import type { FastifyInstance } from "fastify";
import { paramId } from "../../comun/ids.js";
import { esquemaCrearMarca, esquemaEditarMarca, esquemaListaMarcas } from "./esquemas.js";
import { crearMarca, editarMarca, listarMarcas } from "./servicio.js";

const ver = { permiso: "catalogo.ver" };
const editar = { permiso: "catalogo.editar" };

export async function rutasMarcas(app: FastifyInstance): Promise<void> {
  app.get("/", { config: ver }, async (req) => listarMarcas(esquemaListaMarcas.parse(req.query)));

  app.post("/", { config: editar }, async (req, reply) => {
    const m = await crearMarca(req.usuario!.id, esquemaCrearMarca.parse(req.body));
    return reply.code(201).send(m);
  });

  app.patch("/:id", { config: editar }, async (req) => {
    const { id } = paramId.parse(req.params);
    return editarMarca(req.usuario!.id, id, esquemaEditarMarca.parse(req.body));
  });
}

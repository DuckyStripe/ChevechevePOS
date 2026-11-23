import type { FastifyInstance } from "fastify";
import { paramId } from "../../comun/ids.js";
import { esquemaCrearProveedor, esquemaEditarProveedor, esquemaListaProveedores } from "./esquemas.js";
import { crearProveedor, editarProveedor, listarProveedores } from "./servicio.js";

const ver = { permiso: ["proveedores.gestionar", "compras.ver", "surtido.ver"] };
const gestionar = { permiso: "proveedores.gestionar" };

export async function rutasProveedores(app: FastifyInstance): Promise<void> {
  app.get("/", { config: ver }, async (req) => listarProveedores(esquemaListaProveedores.parse(req.query)));

  app.post("/", { config: gestionar }, async (req, reply) => {
    const p = await crearProveedor(req.usuario!.id, esquemaCrearProveedor.parse(req.body));
    return reply.code(201).send(p);
  });

  app.patch("/:id", { config: gestionar }, async (req) => {
    const { id } = paramId.parse(req.params);
    return editarProveedor(req.usuario!.id, id, esquemaEditarProveedor.parse(req.body));
  });
}

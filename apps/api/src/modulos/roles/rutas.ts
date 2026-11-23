import type { FastifyInstance } from "fastify";
import { paramId } from "../../comun/ids.js";
import { esquemaCrearRol, esquemaEditarRol } from "./esquemas.js";
import { borrarRol, crearRol, editarRol, listarPermisos, listarRoles } from "./servicio.js";

const config = { permiso: "usuarios.gestionar" };

// Se registra bajo /api (no /api/roles) porque tambien expone /permisos.
export async function rutasRoles(app: FastifyInstance): Promise<void> {
  app.get("/roles", { config }, async () => listarRoles());
  app.get("/permisos", { config }, async () => listarPermisos());

  app.post("/roles", { config }, async (req, reply) =>
    reply.code(201).send(await crearRol(req.usuario!.id, esquemaCrearRol.parse(req.body))),
  );

  app.patch("/roles/:id", { config }, async (req) => {
    const { id } = paramId.parse(req.params);
    return editarRol(req.usuario!.id, id, esquemaEditarRol.parse(req.body));
  });

  app.delete("/roles/:id", { config }, async (req, reply) => {
    const { id } = paramId.parse(req.params);
    await borrarRol(req.usuario!.id, id);
    return reply.code(204).send();
  });
}

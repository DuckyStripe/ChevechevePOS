import type { FastifyInstance } from "fastify";
import { paramId } from "../../comun/ids.js";
import {
  esquemaCrearUsuario,
  esquemaEditarUsuario,
  esquemaListaUsuarios,
  esquemaNuevaContrasena,
} from "./esquemas.js";
import { cerrarSesionesDe, crearUsuario, editarUsuario, listarUsuarios, restablecerContrasena } from "./servicio.js";

const config = { permiso: "usuarios.gestionar" };

export async function rutasUsuarios(app: FastifyInstance): Promise<void> {
  app.get("/", { config }, async (req) => listarUsuarios(esquemaListaUsuarios.parse(req.query)));

  app.post("/", { config }, async (req, reply) => {
    const u = await crearUsuario(req.usuario!.id, esquemaCrearUsuario.parse(req.body));
    return reply.code(201).send(u);
  });

  app.patch("/:id", { config }, async (req) => {
    const { id } = paramId.parse(req.params);
    return editarUsuario(req.usuario!.id, id, esquemaEditarUsuario.parse(req.body));
  });

  app.post("/:id/contrasena", { config }, async (req, reply) => {
    const { id } = paramId.parse(req.params);
    await restablecerContrasena(req.usuario!.id, id, esquemaNuevaContrasena.parse(req.body).nueva);
    return reply.code(204).send();
  });

  app.post("/:id/cerrar-sesiones", { config }, async (req, reply) => {
    const { id } = paramId.parse(req.params);
    await cerrarSesionesDe(req.usuario!.id, id);
    return reply.code(204).send();
  });
}

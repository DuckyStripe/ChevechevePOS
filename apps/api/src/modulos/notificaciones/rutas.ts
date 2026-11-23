import type { FastifyInstance } from "fastify";
import { esquemaLeer, esquemaListaNotificaciones, esquemaPreferencias } from "./esquemas.js";
import { guardarPreferencias, leerPreferencias, listarNotificaciones, marcarLeidas } from "./servicio.js";

const config = { permiso: "sesion" };

export async function rutasNotificaciones(app: FastifyInstance): Promise<void> {
  app.get("/", { config }, async (req) => listarNotificaciones(req.usuario!.id, esquemaListaNotificaciones.parse(req.query)));

  app.post("/leer", { config }, async (req) => marcarLeidas(req.usuario!.id, esquemaLeer.parse(req.body ?? {}).ids));

  app.get("/preferencias", { config }, async (req) => leerPreferencias(req.usuario!.id));

  app.put("/preferencias", { config }, async (req) =>
    guardarPreferencias(req.usuario!.id, esquemaPreferencias.parse(req.body).preferencias),
  );
}

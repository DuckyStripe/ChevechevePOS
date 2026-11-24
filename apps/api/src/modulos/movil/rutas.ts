import type { FastifyInstance } from "fastify";
import { rutasActualizaciones } from "./actualizaciones.js";
import { esquemaQuitar, esquemaRegistrar, quitarDispositivos, registrarDispositivo } from "./servicio.js";

const config = { permiso: "sesion" };

/** Cascaron Android (CONTRATOS §4.4): push de la sesion `app` y servidor de actualizaciones (publico, solo lee archivos). */
export async function rutasMovil(app: FastifyInstance): Promise<void> {
  app.post("/push/registrar", { config }, async (req) => registrarDispositivo(req.usuario!, esquemaRegistrar.parse(req.body)));

  app.delete("/push/registrar", { config }, async (req) => quitarDispositivos(req.usuario!, esquemaQuitar.parse(req.body ?? {}).token));

  await app.register(rutasActualizaciones, { prefix: "/actualizaciones" });
}

import type { FastifyInstance } from "fastify";
import { esquemaMensaje, esquemaPublicar, esquemaSurtido } from "./esquemas.js";
import { listaSurtido, mensajeSurtido, publicarSurtido } from "./servicio.js";

const config = { permiso: "surtido.ver" };

export async function rutasSurtido(app: FastifyInstance): Promise<void> {
  app.get("/", { config }, async (req) => {
    const q = esquemaSurtido.parse(req.query);
    return listaSurtido(req.usuario!.sucursal_id, q, req.usuario!.permisos.includes("costos.ver"));
  });

  app.get("/mensaje", { config }, async (req) => mensajeSurtido(req.usuario!.sucursal_id, esquemaMensaje.parse(req.query)));

  app.post("/publicar", { config }, async (req) => {
    const { fecha } = esquemaPublicar.parse(req.body);
    return publicarSurtido(req.usuario!.id, req.usuario!.sucursal_id, fecha);
  });
}

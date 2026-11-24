import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { despacho } from "./servicio.js";

export async function rutasDespacho(app: FastifyInstance): Promise<void> {
  // Cada bloque se filtra por permiso dentro del servicio; la ruta solo pide sesion.
  app.get("/despacho", { config: { permiso: "sesion" } }, async (req) => {
    const { fecha } = z.object({ fecha: z.iso.date().optional() }).parse(req.query);
    return despacho(req.usuario!, fecha);
  });
}

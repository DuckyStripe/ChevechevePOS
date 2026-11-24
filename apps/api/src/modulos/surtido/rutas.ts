import type { FastifyInstance } from "fastify";
import { esquemaMensaje, esquemaPublicar, esquemaSurtido } from "./esquemas.js";
import { listaSurtido, mensajeSurtido, publicarSurtido } from "./servicio.js";

const config = { permiso: "surtido.ver" };

/** Una sola regla de costos de F5: los ve quien ve costos o quien registra compras (lo que paga al proveedor). */
export const verCostos = (permisos: string[]) => permisos.includes("costos.ver") || permisos.includes("compras.registrar");

export async function rutasSurtido(app: FastifyInstance): Promise<void> {
  app.get("/", { config }, async (req) => {
    const q = esquemaSurtido.parse(req.query);
    return listaSurtido(req.usuario!.sucursal_id, q, verCostos(req.usuario!.permisos));
  });

  app.get("/mensaje", { config }, async (req) => mensajeSurtido(req.usuario!.sucursal_id, esquemaMensaje.parse(req.query)));

  app.post("/publicar", { config }, async (req) => {
    const { fecha } = esquemaPublicar.parse(req.body);
    return publicarSurtido(req.usuario!.id, req.usuario!.sucursal_id, fecha);
  });
}

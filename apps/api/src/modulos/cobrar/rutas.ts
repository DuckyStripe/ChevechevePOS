import type { FastifyInstance } from "fastify";
import { esquemaContexto, esquemaVista } from "./esquemas.js";
import { contexto, vista } from "./servicio.js";

export async function rutasCobrar(app: FastifyInstance): Promise<void> {
  // Cada modo se autoriza en SQL (pedido cobrable / cuenta visible); aqui solo entran quienes cobran algo.
  app.get("/contexto", { config: { permiso: ["ventas.crear", "rutas.operar", "cobranza.abonar"] } }, async (req) =>
    contexto(req.usuario!, esquemaContexto.parse(req.query)),
  );
  app.post("/vista", { config: { permiso: ["ventas.crear", "rutas.operar"] } }, async (req) => vista(req.usuario!, esquemaVista.parse(req.body)));
}

import type { FastifyInstance } from "fastify";
import { paramId } from "../../comun/ids.js";
import { pool } from "../../db/database.js";
import { esquemaCancelarVenta, esquemaDevolucion, esquemaListaVentas, esquemaVenta } from "./esquemas.js";
import { cancelarVenta, crearVenta, detalleVenta, devolverVenta, listarVentas, ticketVenta } from "./servicio.js";

// `ventas.ver` ve las propias; `ventas.ver_todas`, todas (el servicio filtra; una ajena es 404).
const ver = { permiso: ["ventas.ver", "ventas.ver_todas"] };

export async function rutasVentas(app: FastifyInstance): Promise<void> {
  app.get("/", { config: ver }, async (req) => listarVentas(req.usuario!, esquemaListaVentas.parse(req.query)));
  app.get("/:id", { config: ver }, async (req) => detalleVenta(pool, req.usuario!, paramId.parse(req.params).id));
  app.get("/:id/ticket", { config: ver }, async (req) => ticketVenta(pool, req.usuario!, paramId.parse(req.params).id));

  app.post("/", { config: { permiso: "ventas.crear" } }, async (req, reply) => {
    const { ticket, repetida } = await crearVenta(req.usuario!, esquemaVenta.parse(req.body));
    return reply.code(repetida ? 200 : 201).send(ticket);
  });

  app.post("/:id/cancelar", { config: { permiso: "ventas.cancelar" } }, async (req) => {
    const { id } = paramId.parse(req.params);
    return cancelarVenta(req.usuario!, id, esquemaCancelarVenta.parse(req.body).motivo);
  });

  app.post("/:id/devoluciones", { config: { permiso: "ventas.devolver" } }, async (req, reply) => {
    const { id } = paramId.parse(req.params);
    const { devolucion, repetida } = await devolverVenta(req.usuario!, id, esquemaDevolucion.parse(req.body));
    return reply.code(repetida ? 200 : 201).send(devolucion);
  });
}

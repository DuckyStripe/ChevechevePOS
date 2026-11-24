import type { FastifyInstance } from "fastify";
import { paramId } from "../../comun/ids.js";
import {
  esquemaAjustar, esquemaCancelar, esquemaConfirmar, esquemaCrearPedido, esquemaFaltantes, esquemaInterpretar, esquemaListaPedidos,
  esquemaReprogramar, esquemaResponder, esquemaSugerencias,
} from "./esquemas.js";
import {
  ajustarPedido, cancelarPedido, cancelarPropuesta, confirmarPedido, interpretar, listarPedidos, obtenerPedido, proponerFaltantes,
  registrarPedido, reprogramarPedido, responderPorCliente, sugerenciasDeLinea,
} from "./servicio.js";

const ver = { permiso: "pedidos.ver" };
const capturar = { permiso: "pedidos.capturar" };
const gestionar = { permiso: "pedidos.gestionar" };

export async function rutasPedidos(app: FastifyInstance): Promise<void> {
  app.get("/pedidos", { config: ver }, async (req) => listarPedidos(req.usuario!.sucursal_id, esquemaListaPedidos.parse(req.query)));

  app.get("/pedidos/:id", { config: ver }, async (req) => obtenerPedido(paramId.parse(req.params).id));

  app.post("/pedidos", { config: capturar }, async (req, reply) => {
    const { pedido, repetida } = await registrarPedido(req.usuario!.id, esquemaCrearPedido.parse(req.body));
    return reply.code(repetida ? 200 : 201).send(pedido);
  });

  // Antes que /pedidos/:id/... no choca: son segmentos distintos.
  app.post("/pedidos/interpretar", { config: capturar }, async (req) => {
    const d = esquemaInterpretar.parse(req.body);
    return interpretar(d.cliente_id, d.texto);
  });

  app.post("/pedidos/:id/confirmar", { config: gestionar }, async (req) => {
    const { id } = paramId.parse(req.params);
    return confirmarPedido(req.usuario!.id, id, esquemaConfirmar.parse(req.body));
  });

  app.post("/pedidos/:id/ajustar", { config: gestionar }, async (req) => {
    const { id } = paramId.parse(req.params);
    return ajustarPedido(req.usuario!.id, id, esquemaAjustar.parse(req.body));
  });

  app.get("/pedidos/:id/sugerencias", { config: gestionar }, async (req) => {
    const { id } = paramId.parse(req.params);
    return sugerenciasDeLinea(id, esquemaSugerencias.parse(req.query).pedido_linea_id);
  });

  app.post("/pedidos/:id/faltantes", { config: gestionar }, async (req) => {
    const { id } = paramId.parse(req.params);
    return proponerFaltantes(req.usuario!.id, id, esquemaFaltantes.parse(req.body));
  });

  app.post("/pedidos/:id/cancelar", { config: gestionar }, async (req) => {
    const { id } = paramId.parse(req.params);
    return cancelarPedido(req.usuario!.id, id, esquemaCancelar.parse(req.body).motivo);
  });

  app.post("/pedidos/:id/reprogramar", { config: gestionar }, async (req) => {
    const { id } = paramId.parse(req.params);
    return reprogramarPedido(req.usuario!.id, id, esquemaReprogramar.parse(req.body).fecha_entrega);
  });

  app.post("/propuestas/:id/responder", { config: gestionar }, async (req) => {
    const { id } = paramId.parse(req.params);
    return responderPorCliente(req.usuario!.id, id, esquemaResponder.parse(req.body).opcion_id);
  });

  app.post("/propuestas/:id/cancelar", { config: gestionar }, async (req) => {
    const { id } = paramId.parse(req.params);
    return cancelarPropuesta(req.usuario!.id, id);
  });
}


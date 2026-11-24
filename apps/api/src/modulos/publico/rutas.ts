import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { paramId } from "../../comun/ids.js";
import { ipDe } from "../../comun/permisos.js";
import { AppError } from "../../comun/errores.js";
import { datosPublicos } from "../../comun/negocio-publico.js";
import { consulta } from "../../db/database.js";
import { esquemaEditarPedidoCliente, esquemaPedidoCliente } from "../pedidos/esquemas.js";
import {
  esquemaAceptar, esquemaCancelarCliente, esquemaPin, esquemaResponderCliente, esquemaUbicacionCliente, paramPresentacion,
} from "./esquemas.js";
import {
  aceptarPropuesto, cancelarPedidoCliente, catalogoCliente, crearPedidoCliente, editarPedidoCliente, elegirPin, entrarConPin, hashIp,
  listarPedidosCliente, perfilCliente, ponerFavorito, proponerUbicacion, registrarApertura, responderFaltanteCliente, seguimientoCliente,
} from "./servicio.js";

// Limites del enlace (CONTRATOS §4.4): la llave es el hash del token, no la IP. Todo es temporal.
const porToken = (req: FastifyRequest) => {
  const t = req.headers["x-cliente-token"];
  return typeof t === "string" && t ? createHash("sha256").update(t).digest("hex") : ipDe(req);
};
const limite = (max: number, timeWindow: string, prefijo: string) => ({ max, timeWindow, keyGenerator: (req: FastifyRequest) => `${prefijo}:${porToken(req)}` });
const general = limite(120, "1 minute", "gral");
const escritura = limite(20, "1 hour", "pedidos");
const unaPorDia = limite(5, "1 day", "ubicacion");

const cfg = { permiso: "cliente", rateLimit: general };
const cfgPin = { permiso: "cliente", sinDispositivo: true, rateLimit: general };

export async function rutasPublico(app: FastifyInstance): Promise<void> {
  // Sin token: nombre y WhatsApp del negocio y textos de las pantallas de PIN y enlace invalido. No cuenta como fallo de token.
  app.get("/negocio", { config: { permiso: "publica" } }, async () => datosPublicos());

  /* ---- PIN (solo via BFF: devuelven el token del dispositivo, que el BFF pone en su cookie) ---- */
  app.post("/pin/elegir", { config: cfgPin }, async (req) => {
    const { pin } = esquemaPin.parse(req.body);
    return elegirPin(req.cliente!, pin, req.headers["user-agent"]);
  });

  app.post("/pin/entrar", { config: cfgPin }, async (req) => {
    const { pin } = esquemaPin.parse(req.body);
    return entrarConPin(req.cliente!, pin, hashIp(ipDe(req)), req.headers["user-agent"]);
  });

  /* ---- perfil: es la ruta del canje del enlace, por eso acepta un dispositivo desconocido y lo manda a PIN ---- */
  app.get("/cliente", { config: cfgPin }, async (req) => {
    const c = req.cliente!;
    if (!c.dispositivo_ok) throw new AppError("PIN_REQUERIDO", { tiene_pin: c.tiene_pin, ...(await datosPublicos()) });
    const d = req.headers["x-cliente-dispositivo"];
    await registrarApertura(c, typeof d === "string" ? d : "");
    return perfilCliente(c);
  });

  /* ---- catalogo con ETag ---- */
  app.get("/catalogo", { config: cfg }, async (req, reply) => {
    const c = req.cliente!;
    await consulta("select app.fn_registrar_visita($1::bigint, 'catalogo')", [c.cliente_id]);
    const { cuerpo, version } = await catalogoCliente(c);
    const etag = `"${version}"`;
    reply.header("cache-control", "private, no-cache").header("etag", etag);
    const previo = req.headers["if-none-match"];
    if (typeof previo === "string" && previo.split(",").some((x) => x.trim().replace(/^W\//, "") === etag)) return reply.code(304).send();
    return cuerpo;
  });

  app.put("/favoritos/:presentacion_id", { config: cfg }, async (req, reply) => {
    await ponerFavorito(req.cliente!, paramPresentacion.parse(req.params).presentacion_id, true);
    return reply.code(204).send();
  });
  app.delete("/favoritos/:presentacion_id", { config: cfg }, async (req, reply) => {
    await ponerFavorito(req.cliente!, paramPresentacion.parse(req.params).presentacion_id, false);
    return reply.code(204).send();
  });

  /* ---- pedidos ---- */
  app.get("/pedidos", { config: cfg }, async (req) => listarPedidosCliente(req.cliente!));
  app.get("/pedidos/:id", { config: cfg }, async (req) => seguimientoCliente(req.cliente!, paramId.parse(req.params).id));

  app.post("/pedidos", { config: { permiso: "cliente", rateLimit: escritura } }, async (req, reply) => {
    const { cuerpo, repetida } = await crearPedidoCliente(req.cliente!, esquemaPedidoCliente.parse(req.body));
    return reply.code(repetida ? 200 : 201).send(cuerpo);
  });

  app.patch("/pedidos/:id", { config: { permiso: "cliente", rateLimit: escritura } }, async (req) => {
    const { id } = paramId.parse(req.params);
    return editarPedidoCliente(req.cliente!, id, esquemaEditarPedidoCliente.parse(req.body));
  });

  app.post("/pedidos/:id/cancelar", { config: cfg }, async (req) => {
    const { id } = paramId.parse(req.params);
    return cancelarPedidoCliente(req.cliente!, id, esquemaCancelarCliente.parse(req.body ?? {}).motivo);
  });

  app.post("/pedidos/:id/aceptar", { config: cfg }, async (req) => {
    const { id } = paramId.parse(req.params);
    return aceptarPropuesto(req.cliente!, id, esquemaAceptar.parse(req.body).total_visto);
  });

  app.post("/propuestas/:id/responder", { config: cfg }, async (req) => {
    const { id } = paramId.parse(req.params);
    return responderFaltanteCliente(req.cliente!, id, esquemaResponderCliente.parse(req.body).opcion_id);
  });

  /* ---- ubicacion ---- */
  app.post("/ubicacion", { config: { permiso: "cliente", rateLimit: unaPorDia } }, async (req, reply) => {
    const d = esquemaUbicacionCliente.parse(req.body);
    await proponerUbicacion(req.cliente!, d.lat, d.lng);
    return reply.code(202).send({});
  });
}

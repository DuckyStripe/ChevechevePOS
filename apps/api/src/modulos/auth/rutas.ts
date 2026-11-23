import type { FastifyInstance, FastifyRequest } from "fastify";
import { env } from "../../config/env.js";
import { esquemaCambioContrasena, esquemaLogin } from "./esquemas.js";
import { cambiarContrasena, cerrarSesion, iniciarSesion, obtenerYo } from "./servicio.js";

export async function rutasAuth(app: FastifyInstance): Promise<void> {
  app.post(
    "/login",
    // Limite por IP (X-Visitante-Ip) ademas del global; el bloqueo por usuario esta en el servicio.
    { config: { permiso: "publica", rateLimit: { max: Math.min(env.RATE_LIMIT_MAX, 20), timeWindow: "1 minute" } } },
    async (req) => {
      const datos = esquemaLogin.parse(req.body);
      const ip = (typeof req.headers["x-visitante-ip"] === "string" && req.headers["x-visitante-ip"]) || req.ip;
      const r = await iniciarSesion(datos, ip, req.headers["user-agent"]);
      return { token: r.token, expira_en: r.expira_en, usuario: r.usuario };
    },
  );

  app.post("/logout", { config: { permiso: "sesion" } }, async (req, reply) => {
    await cerrarSesion(req.usuario!.jti);
    return reply.code(204).send();
  });

  app.get("/yo", { config: { permiso: "sesion" } }, async (req) => obtenerYo(req.usuario!.id));

  // Anti adivinar la contrasena actual con un token robado: 5 por 15 min por usuario (hook preHandler: ya hay req.usuario).
  const limiteContrasena = {
    max: 5,
    timeWindow: "15 minutes",
    hook: "preHandler" as const,
    keyGenerator: (req: FastifyRequest) => `contrasena:${req.usuario?.id ?? req.ip}`,
  };
  app.post("/contrasena", { config: { permiso: "sesion", rateLimit: limiteContrasena } }, async (req, reply) => {
    const { actual, nueva } = esquemaCambioContrasena.parse(req.body);
    await cambiarContrasena(req.usuario!.id, req.usuario!.jti, actual, nueva);
    return reply.code(204).send();
  });
}

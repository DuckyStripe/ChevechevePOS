import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config/env.js";
import { opcionesLogger } from "./config/logger.js";
import { cerrarPool } from "./db/database.js";
import { mapearError } from "./db/errores.js";
import { saludRoutes } from "./modules/salud/salud-routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: opcionesLogger(env.LOG_LEVEL, env.NODE_ENV === "development"),
    // El front (BFF) manda la IP real en X-Visitante-Ip; detras de Next la IP del par es la del contenedor.
    trustProxy: false,
    bodyLimit: 1_048_576,
  });

  await app.register(helmet);
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    keyGenerator: (req) => {
      const ip = req.headers["x-visitante-ip"];
      return (typeof ip === "string" && ip) || req.ip;
    },
    // Los healthchecks de Docker no cuentan contra el limite.
    allowList: (req) => req.url === "/health" || req.url === "/ready",
  });

  app.setErrorHandler((err, req, reply) => {
    const e = mapearError(err);
    if (e.statusCode >= 500) req.log.error({ err }, "error no controlado");
    return reply.code(e.statusCode).send({ codigo: e.code, mensaje: e.message, detalles: e.details });
  });

  // Sondas fuera del prefijo: las usa Docker y no pasan por el BFF.
  await app.register(saludRoutes);

  // Todos los modulos de negocio van bajo /api.
  await app.register(async (api) => {
    // await api.register(modulo, { prefix: "/modulo" });
    api.get("/", async () => ({ nombre: "ChevechevePOS API" }));
  }, { prefix: "/api" });

  app.addHook("onClose", async () => {
    await cerrarPool();
  });

  return app;
}

async function main() {
  const app = await buildApp();
  const cerrar = async () => {
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", cerrar);
  process.on("SIGINT", cerrar);
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (err) {
    app.log.error({ err }, "no pudo arrancar");
    process.exit(1);
  }
}

// Solo arranca si se ejecuta directamente (no al importar buildApp en pruebas).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}

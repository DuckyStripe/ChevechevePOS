import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config/env.js";
import { opcionesLogger } from "./config/logger.js";
import { cerrarPool } from "./db/database.js";
import { z } from "zod";
import { AppError, mapearError } from "./comun/errores.js";
import { saludRoutes } from "./modulos/salud/rutas.js";
import { permisosPlugin } from "./comun/permisos.js";
import { modulos } from "./modulos/index.js";
import { registrarTareas } from "./tareas.js";

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
    // Fastify lanza lo que devuelve: pasa por el error handler y sale con el formato comun.
    errorResponseBuilder: () => new AppError("DEMASIADAS_PETICIONES"),
  });

  app.setErrorHandler((err, req, reply) => {
    const estado = (err as { statusCode?: number }).statusCode;
    let e;
    if (err instanceof z.ZodError) {
      e = mapearError(new AppError("VALIDACION", err.issues));
    } else if (estado === 413) {
      e = mapearError(new AppError("ARCHIVO_GRANDE"));
    } else if (estado && estado >= 400 && estado < 500) {
      // Errores de Fastify (JSON mal formado, tipo de contenido...): son del cliente.
      e = mapearError(new AppError("VALIDACION"));
    } else {
      e = mapearError(err);
    }
    if (e.statusCode >= 500) {
      // detail/where de pg pueden traer valores de filas (telefonos, hashes): no se loguean.
      const seguro = { ...(err as Record<string, unknown>) };
      delete seguro.detail;
      delete seguro.where;
      const ex = err as Error;
      req.log.error({ err: { ...seguro, type: ex.name, message: ex.message, stack: ex.stack } }, "error no controlado");
    }
    return reply.code(e.statusCode).send({ error: { codigo: e.codigo, mensaje: e.mensaje, ...(e.detalles === undefined ? {} : { detalles: e.detalles }) } });
  });

  app.setNotFoundHandler((_req, reply) => {
    const e = mapearError(new AppError("NO_ENCONTRADO"));
    return reply.code(e.statusCode).send({ error: { codigo: e.codigo, mensaje: e.mensaje } });
  });

  // BFF y otros clientes mandan POST sin cuerpo con content-type json: se acepta como "sin cuerpo".
  const jsonSeguro = app.getDefaultJsonParser("error", "error"); // secure-json-parse de Fastify
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, cuerpo, done) => {
    if (cuerpo === "") return done(null, undefined);
    jsonSeguro(req, cuerpo as string, done);
  });

  // Antes que cualquier ruta: el hook onRoute valida config.permiso y el preHandler autentica.
  await app.register(permisosPlugin);

  // Sondas fuera del prefijo: las usa Docker y no pasan por el BFF.
  await app.register(saludRoutes);

  // Todos los modulos de negocio van bajo /api.
  await app.register(modulos, { prefix: "/api" });

  // Las pruebas llaman las funciones SQL directo: sin tareas con reloj.
  if (env.NODE_ENV !== "test") registrarTareas(app);

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

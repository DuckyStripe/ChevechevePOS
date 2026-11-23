import type { FastifyInstance } from "fastify";
import { consulta } from "../../db/database.js";

/** `/health`: liveness, no toca la base. `/ready`: comprueba la base. */
export async function saludRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({ estado: "ok" }));

  app.get("/ready", async (_req, reply) => {
    try {
      await consulta("select 1");
      return { estado: "listo" };
    } catch (err) {
      app.log.error({ err }, "la base no responde");
      return reply.code(503).send({ estado: "no_listo" });
    }
  });
}

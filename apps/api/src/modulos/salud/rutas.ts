import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { consulta } from "../../db/database.js";

const ARCHIVO_RESPALDO = "/respaldos/respaldo_estado.json";

/** Estado del ultimo respaldo (lo escribe el servicio `respaldo`); sin archivo o ilegible = null. */
export async function leerRespaldo(): Promise<{ ultimo: string; ok: boolean } | null> {
  try {
    const j = JSON.parse(await readFile(ARCHIVO_RESPALDO, "utf8")) as { ultimo?: unknown; ok?: unknown };
    if (typeof j.ultimo !== "string" || typeof j.ok !== "boolean") return null;
    return { ultimo: j.ultimo, ok: j.ok };
  } catch {
    return null;
  }
}

/** `/health`: liveness, no toca la base. `/ready`: comprueba la base. Ambos informan el respaldo. */
export async function saludRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({ estado: "ok", respaldo: await leerRespaldo() }));

  app.get("/ready", async (_req, reply) => {
    try {
      await consulta("select 1");
      return { estado: "ok", respaldo: await leerRespaldo() };
    } catch (err) {
      app.log.error({ err }, "la base no responde");
      return reply.code(503).send({ estado: "no_listo" });
    }
  });
}

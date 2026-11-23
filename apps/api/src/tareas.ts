import type { FastifyInstance } from "fastify";

/** Tarea periodica sin solapes: si la anterior sigue corriendo, se salta el tick. Errores logueados; se detiene en onClose. */
export function programar(app: FastifyInstance, nombre: string, ms: number, fn: () => Promise<void>): void {
  let corriendo = false;
  const timer = setInterval(() => {
    if (corriendo) return;
    corriendo = true;
    fn()
      .catch((err) => app.log.error({ err, tarea: nombre }, "tarea fallo"))
      .finally(() => {
        corriendo = false;
      });
  }, ms);
  timer.unref();
  app.addHook("onClose", async () => clearInterval(timer));
}

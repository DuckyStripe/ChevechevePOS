import type { FastifyInstance } from "fastify";
import { consulta } from "./db/database.js";

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

const MIN = 60_000;

/**
 * Tareas periodicas de F3 (la fuente de verdad de lo que corre solo; `test/c21.test.ts` la vigila: ninguna toca el acceso del cliente).
 * Cada funcion SQL decide por si misma si ya toca (`sugerencia_hora`) y es idempotente por clave.
 */
export const TAREAS_F3: ReadonlyArray<{ nombre: string; cadaMs: number; sql: string }> = [
  { nombre: "vencer-faltantes", cadaMs: MIN, sql: "select app.fn_vencer_faltantes()" },
  { nombre: "vencer-propuestos", cadaMs: 15 * MIN, sql: "select app.fn_vencer_propuestos()" },
  { nombre: "sugerir-pedidos", cadaMs: 15 * MIN, sql: "select app.fn_sugerir_pedidos()" },
  { nombre: "alertas-clientes", cadaMs: 60 * MIN, sql: "select app.fn_alertas_clientes()" },
];

export function registrarTareas(app: FastifyInstance): void {
  for (const t of TAREAS_F3) {
    programar(app, t.nombre, t.cadaMs, async () => {
      await consulta(t.sql);
    });
  }
}

import pg from "pg";
import { env } from "../config/env.js";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
  idle_in_transaction_session_timeout: env.DB_STATEMENT_TIMEOUT_MS * 2,
});

// Un cliente inactivo que falla no debe tumbar el proceso.
pool.on("error", (err) => {
  console.error("[db] error en cliente inactivo:", err.message);
});

/** Consulta parametrizada. Los importes (numeric) llegan como string: nada de aritmetica en JS. */
export async function consulta<T extends pg.QueryResultRow = pg.QueryResultRow>(
  texto: string,
  parametros: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(texto, parametros);
}

/** Ejecuta `fn` en una transaccion: commit si resuelve, rollback si lanza. */
export async function enTransaccion<T>(fn: (cliente: pg.PoolClient) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query("begin");
    const resultado = await fn(cliente);
    await cliente.query("commit");
    return resultado;
  } catch (err) {
    await cliente.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    cliente.release();
  }
}

export async function cerrarPool(): Promise<void> {
  await pool.end();
}

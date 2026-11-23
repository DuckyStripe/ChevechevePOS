import type pg from "pg";
import { enTransaccion } from "../db/database.js";

/** Transaccion de escritura del personal: fija `app.usuario_id` (lo lee el disparador de auditoria). `fn` recibe el cliente, nunca el pool. */
export function conUsuario<T>(usuarioId: string | number, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  return enTransaccion(async (c) => {
    await c.query("select set_config('app.usuario_id', $1, true)", [String(usuarioId)]);
    return fn(c);
  });
}

/** Transaccion de una ruta de cliente (enlace): `app.usuario_id` queda vacio y se fija `app.cliente_id`. */
export function conCliente<T>(clienteId: string | number, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  return enTransaccion(async (c) => {
    await c.query("select set_config('app.cliente_id', $1, true)", [String(clienteId)]);
    return fn(c);
  });
}

import pg from "pg";

/** Pool contra la base de pruebas (DATABASE_URL la fija test/entorno.ts). */
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

/** BEGIN ... ROLLBACK: nada de lo que haga `fn` queda en la base. */
export async function enTransaccion<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    return await fn(c);
  } finally {
    await c.query("rollback").catch(() => undefined);
    c.release();
  }
}

/** Ejecuta `fn` y devuelve el error de Postgres (code, message) o falla si no hubo. Usa savepoint. */
export async function error(c: pg.PoolClient, fn: () => Promise<unknown>): Promise<{ code: string; message: string }> {
  await c.query("savepoint antes_del_error");
  try {
    await fn();
  } catch (e) {
    await c.query("rollback to savepoint antes_del_error");
    const { code, message } = e as { code: string; message: string };
    return { code, message };
  }
  throw new Error("se esperaba un error y no hubo");
}

export const ROL = {
  dueno: "(select id from app.rol where es_sistema)",
  admin: "(select id from app.rol where nombre = 'Administrador')",
};

let n = 0;
/** Crea un usuario (nombre unico) y devuelve su id. */
export async function crearUsuario(c: pg.PoolClient, rol: string, activo = true): Promise<string> {
  const r = await c.query(
    `insert into app.usuario (usuario, nombre, contrasena_hash, rol_id, sucursal_id, activo)
     values ($1, 'Prueba', 'hash-secreto', ${rol}, 1, $2) returning id`,
    [`prueba${++n}x${process.pid}`, activo],
  );
  return r.rows[0].id;
}

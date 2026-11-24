import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import pg from "pg";

// Importar buildApp despues de test/entorno.ts (setupFiles) para que lea la base de pruebas.
import { buildApp } from "../src/app.js";
import { borrarDinero } from "./ayuda-dinero.js";

/** Pool propio de las pruebas (la app tiene el suyo). */
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });

const PREFIJO = "tapi_";
const CONTRASENA = "clave-de-prueba-1";
const HASH = bcrypt.hashSync(CONTRASENA, 4); // costo bajo: solo para pruebas
let n = 0;

export type NombreRol = "Dueño" | "Administrador" | "Repartidor" | "Cajero" | "Almacenista";
export interface UsuarioPrueba {
  id: string;
  usuario: string;
  contrasena: string;
}

export async function crearApp(): Promise<FastifyInstance> {
  const app = await buildApp();
  await app.ready();
  return app;
}

/** Crea un usuario committed (se borra en `limpiar`). */
export async function crearUsuario(rol: NombreRol, opciones: { debeCambiar?: boolean; activo?: boolean } = {}): Promise<UsuarioPrueba> {
  const usuario = `${PREFIJO}${process.pid}_${++n}`;
  const r = await pool.query<{ id: string }>(
    `insert into app.usuario (usuario, nombre, contrasena_hash, rol_id, sucursal_id, activo, debe_cambiar_contrasena)
     values ($1, $2, $3, (select id from app.rol where nombre = $4), 1, $5, $6) returning id`,
    [usuario, `Prueba ${n}`, HASH, rol, opciones.activo ?? true, opciones.debeCambiar ?? false],
  );
  return { id: r.rows[0]!.id, usuario, contrasena: CONTRASENA };
}

/** Login real por la API. Cada llamada usa una IP distinta para no chocar con el limite por IP. */
export async function entrar(app: FastifyInstance, u: UsuarioPrueba, origen: "web" | "app" = "web") {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { "x-visitante-ip": `10.${n % 250}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
    payload: { usuario: u.usuario, contrasena: u.contrasena, origen },
  });
  if (res.statusCode !== 200) throw new Error(`login de prueba fallo: ${res.statusCode} ${res.body}`);
  return res.json<{ token: string; expira_en: string }>().token;
}

export const auth = (token: string) => ({ authorization: `Bearer ${token}` });

export function errorDe(res: { json: () => unknown }) {
  return (res.json() as { error: { codigo: string; mensaje: string; detalles?: unknown } }).error;
}

/** Marca de la auditoria antes de la prueba: `limpiar` borra todo lo posterior. */
export async function marcaAuditoria(): Promise<string> {
  const r = await pool.query<{ m: string }>("select coalesce(max(id), 0) as m from app.auditoria");
  return r.rows[0]!.m;
}

export interface Instantanea {
  marca: string;
  configuracion: Array<{ clave: string; valor: unknown; actualizado_en: Date }>;
  plantillas: Array<{ clave: string; titulo: string | null; texto: string; actualizado_en: Date }>;
  sucursal: { lat: string | null; lng: string | null };
}

export async function instantanea(): Promise<Instantanea> {
  return {
    marca: await marcaAuditoria(),
    configuracion: (await pool.query("select clave, valor, actualizado_en from app.configuracion")).rows,
    plantillas: (await pool.query("select clave, titulo, texto, actualizado_en from app.plantilla")).rows,
    sucursal: (await pool.query("select lat, lng from app.sucursal where id = 1")).rows[0],
  };
}

/** Borra usuarios y roles de prueba, restaura configuracion/plantillas/sucursal y la auditoria que generaron. */
export async function limpiar(app: FastifyInstance | undefined, antes: Instantanea): Promise<void> {
  await app?.close();
  const c = await pool.connect();
  try {
    await c.query("begin");
    const ids = `(select id from app.usuario where usuario like '${PREFIJO}%')`;
    await c.query(`delete from app.notificacion_envio where notificacion_id in (select id from app.notificacion where usuario_id in ${ids})`);
    await c.query(`delete from app.notificacion where usuario_id in ${ids}`);
    await c.query(`delete from app.sesion where usuario_id in ${ids}`);
    // F7: turnos, ventas y cobros que dejaron esos usuarios (si no, no se pueden borrar).
    await borrarDinero(c, { clientes: "select id from app.cliente where false", usuarios: `select id from app.usuario where usuario like '${PREFIJO}%'`, rutas: "select id from app.ruta where false" });
    await c.query(`update app.configuracion set actualizado_por = null where actualizado_por in ${ids}`);
    await c.query(`update app.plantilla set actualizado_por = null where actualizado_por in ${ids}`);
    // Sin duenos en la base de pruebas, borrar el ultimo dueno de prueba dispararia ULTIMO_DUENO.
    await c.query("alter table app.usuario disable trigger trg_ultimo_dueno");
    await c.query(`delete from app.auditoria where usuario_id in ${ids}`);
    await c.query(`delete from app.usuario where usuario like '${PREFIJO}%'`);
    await c.query("alter table app.usuario enable trigger trg_ultimo_dueno");
    await c.query(`delete from app.rol where nombre like '${PREFIJO}%'`);
    for (const f of antes.configuracion) {
      await c.query("update app.configuracion set valor = $2::jsonb, actualizado_en = $3 where clave = $1", [f.clave, JSON.stringify(f.valor), f.actualizado_en]);
    }
    for (const f of antes.plantillas) {
      await c.query("update app.plantilla set titulo = $2, texto = $3, actualizado_en = $4 where clave = $1", [f.clave, f.titulo, f.texto, f.actualizado_en]);
    }
    await c.query("update app.sucursal set lat = $1, lng = $2 where id = 1", [antes.sucursal.lat, antes.sucursal.lng]);
    await c.query("delete from app.auditoria where id > $1", [antes.marca]);
    await c.query("commit");
  } catch (err) {
    await c.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

export async function cerrarPoolPruebas(): Promise<void> {
  await pool.end();
}

export const jtiAleatorio = () => randomUUID();

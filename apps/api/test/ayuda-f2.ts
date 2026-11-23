import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { auth, entrar, pool, type NombreRol, type UsuarioPrueba } from "./ayuda.js";

// Prefijo propio: `limpiar()` de F1 borra `tapi_%` y fallaria por la FK del kardex (usuario_id de movimientos).
// Estas pruebas NO borran nada: la base de pruebas se recrea en cada `npm run prueba`.
const PREFIJO = "tf2_";
const HASH = bcrypt.hashSync("clave-de-prueba-1", 4);
let n = 0;

export const sufijo = () => randomBytes(4).toString("hex");

/** Usuario committed de un rol del sistema, o de un rol de prueba `tf2_…` con exactamente esos permisos. */
export async function crearUsuarioF2(rol: NombreRol | { permisos: string[] }): Promise<UsuarioPrueba> {
  const usuario = `${PREFIJO}${process.pid}_${++n}_${sufijo()}`;
  let rolId: string;
  if (typeof rol === "string") {
    rolId = (await pool.query<{ id: string }>("select id from app.rol where nombre = $1", [rol])).rows[0]!.id;
  } else {
    rolId = (await pool.query<{ id: string }>("insert into app.rol (nombre) values ($1) returning id", [`${PREFIJO}rol_${usuario}`])).rows[0]!.id;
    for (const p of rol.permisos) await pool.query("insert into app.rol_permiso (rol_id, permiso_codigo) values ($1, $2)", [rolId, p]);
  }
  const r = await pool.query<{ id: string }>(
    `insert into app.usuario (usuario, nombre, contrasena_hash, rol_id, sucursal_id, debe_cambiar_contrasena) values ($1, $2, $3, $4, 1, false) returning id`,
    [usuario, `Prueba F2 ${n}`, HASH, rolId],
  );
  return { id: r.rows[0]!.id, usuario, contrasena: "clave-de-prueba-1" };
}

export async function tokenF2(app: FastifyInstance, rol: NombreRol | { permisos: string[] }): Promise<string> {
  return entrar(app, await crearUsuarioF2(rol));
}

/** `inject` con una IP distinta por llamada: el limite de peticiones es por IP y estas pruebas hacen muchas. */
export function pedirCon(app: FastifyInstance) {
  return (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, token?: string, payload?: object) =>
    app.inject({
      method,
      url,
      headers: { ...(token ? auth(token) : {}), "x-visitante-ip": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
      ...(payload ? { payload } : {}),
    });
}

export interface PresentacionPrueba {
  id: string;
  nombre: string;
  factor: number;
}
export interface ProductoPrueba {
  id: string;
  nombre: string;
  presentaciones: PresentacionPrueba[];
  /** presentacion por factor */
  por: (factor: number) => PresentacionPrueba;
}

export function ayudaF2(app: FastifyInstance) {
  const pedir = pedirCon(app);

  async function crearCategoria(token: string, extra: object = {}): Promise<{ id: string; nombre: string }> {
    const nombre = `Cat ${sufijo()}`;
    const r = await pedir("POST", "/api/categorias", token, { nombre, ...extra });
    if (r.statusCode !== 201) throw new Error(`categoria: ${r.statusCode} ${r.body}`);
    return r.json();
  }

  async function crearProveedor(token: string): Promise<{ id: string; nombre: string }> {
    const r = await pedir("POST", "/api/proveedores", token, { nombre: `Prov ${sufijo()}` });
    if (r.statusCode !== 201) throw new Error(`proveedor: ${r.statusCode} ${r.body}`);
    return r.json();
  }

  /** Producto con Pieza (1) y las presentaciones extra de `factores` (p. ej. [6, 24]). */
  async function crearProducto(
    token: string,
    o: { nombre?: string; factores?: number[]; categoria_id?: string; alias?: string[]; extra?: object } = {},
  ): Promise<ProductoPrueba> {
    const categoria_id = o.categoria_id ?? (await crearCategoria(token)).id;
    const nombre = o.nombre ?? `Producto ${sufijo()}`;
    const nombres: Record<number, string> = { 6: "Six", 12: "Media caja de 12", 24: "Caja de 24" };
    const r = await pedir("POST", "/api/productos", token, {
      nombre,
      categoria_id,
      existencia_minima: 0,
      ...(o.alias ? { alias: o.alias } : {}),
      ...o.extra,
      presentaciones: [{ nombre: "Pieza", factor: 1 }, ...(o.factores ?? []).map((f) => ({ nombre: nombres[f] ?? `Paquete de ${f}`, factor: f }))],
    });
    if (r.statusCode !== 201) throw new Error(`producto: ${r.statusCode} ${r.body}`);
    const b = r.json<{ id: string; presentaciones: PresentacionPrueba[] }>();
    return { id: b.id, nombre, presentaciones: b.presentaciones, por: (f) => b.presentaciones.find((p) => p.factor === f)! };
  }

  /** Compra con una clave nueva; devuelve la respuesta cruda para poder asertar status. */
  async function registrarCompra(
    token: string,
    lineas: { presentacion_id: string; cantidad: number; costo_presentacion: string; caduca_el?: string }[],
    o: { proveedor_id: string; clave?: string; fecha?: string },
  ) {
    const hoy = await hoyMas(0);
    return pedir("POST", "/api/compras", token, {
      clave_idempotencia: o.clave ?? randomUUID(),
      proveedor_id: o.proveedor_id,
      fecha: o.fecha ?? hoy,
      condicion_pago: "contado",
      lineas,
    });
  }

  return { pedir, crearCategoria, crearProveedor, crearProducto, registrarCompra };
}

/** Fecha local de negocio (Mexico) mas `d` dias, igual que la base. */
export async function hoyMas(d: number): Promise<string> {
  return (await pool.query<{ f: string }>("select (app.fn_fecha_local(now()) + $1::int)::text as f", [d])).rows[0]!.f;
}

/**
 * Deja la base como la encontro para las pruebas de F1 y las SQL que corren despues: usuarios `tf2_` desactivados
 * (no se pueden borrar: el kardex y las compras los referencian), sin roles de prueba y sin listas de precio extra.
 */
export async function limpiarF2(): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const roles = "(select id from app.rol where nombre like 'tf2\\_%')";
    await c.query("alter table app.usuario disable trigger trg_ultimo_dueno");
    await c.query(`update app.usuario set rol_id = (select id from app.rol where nombre = 'Cajero') where rol_id in ${roles}`);
    await c.query("update app.usuario set activo = false where usuario like 'tf2\\_%'");
    await c.query("alter table app.usuario enable trigger trg_ultimo_dueno");
    await c.query(`delete from app.rol_permiso where rol_id in ${roles}`);
    const ids = (await c.query<{ id: string }>("select id from app.rol where nombre like 'tf2\\_%'")).rows.map((r) => r.id);
    await c.query("delete from app.rol where nombre like 'tf2\\_%'");
    // Despues de borrar: el propio borrado tambien deja filas en la bitacora.
    await c.query(
      `delete from app.auditoria where (tabla = 'rol' and registro_id = any($1::text[]))
        or (tabla = 'rol_permiso' and split_part(registro_id, ':', 1) = any($1::text[]))`,
      [ids],
    );
    await c.query(`delete from app.lista_precio l where l.nombre not in ('Menudeo', 'Mayoreo')
      and not exists (select 1 from app.precio p where p.lista_precio_id = l.id)
      and not exists (select 1 from app.precio_oferta o where o.lista_precio_id = l.id)`);
    await c.query("commit");
  } catch (err) {
    await c.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

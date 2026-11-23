import { randomUUID } from "node:crypto";
import type pg from "pg";
import { ROL } from "./ayuda.js";

let n = 0;
const sufijo = () => `${++n}x${process.pid}`;

/** Usuario Dueño con prefijo tf2_ (los de F1 usan tapi_; limpiar() de F1 no debe tocar estos). */
export async function usuarioF2(c: pg.PoolClient, rol: string = ROL.dueno): Promise<string> {
  const r = await c.query(
    `insert into app.usuario (usuario, nombre, contrasena_hash, rol_id, sucursal_id)
     values ($1, 'Prueba F2', 'hash-secreto', ${rol}, 1) returning id`,
    [`tf2_sql${sufijo()}`],
  );
  return r.rows[0].id;
}

export async function proveedor(c: pg.PoolClient): Promise<string> {
  const r = await c.query("insert into app.proveedor (nombre) values ($1) returning id", [`Proveedor ${sufijo()}`]);
  return r.rows[0].id;
}

export interface ProductoCreado {
  id: string;
  categoria_id: string;
  /** ids de presentación en el mismo orden que `factores`. */
  pres: string[];
  /** id de presentación por factor (si hay factores repetidos, la última). */
  porFactor: Record<number, string>;
  /** id de la presentación del factor dado (falla si el producto no la tiene). */
  pf: (factor: number) => string;
  usuario: string;
}

const NOMBRES: Record<number, string> = { 1: "Pieza", 6: "Six", 12: "Caja de 12", 24: "Caja de 24" };

/**
 * Crea categoría, producto y una presentación por factor (nombre estándar; si se repite, `Presentación i`).
 * Con `costo` deja `piezas` (def. 240) por `inventario_inicial` a ese costo por pieza.
 */
export async function producto(
  c: pg.PoolClient,
  o: {
    factores?: number[]; costo?: string; piezas?: number; nombre?: string; alias?: string[];
    marca?: string; modo?: "inventario" | "contra_pedido"; margen?: string | null; margenCategoria?: string | null;
    usuario?: string;
  } = {},
): Promise<ProductoCreado> {
  const factores = o.factores ?? [1];
  const s = sufijo();
  const cat = await c.query("insert into app.categoria (nombre, margen_objetivo) values ($1, $2) returning id", [`Categoria ${s}`, o.margenCategoria ?? null]);
  let marcaId: string | null = null;
  if (o.marca) marcaId = (await c.query("insert into app.marca (nombre) values ($1) returning id", [`${o.marca} ${s}`])).rows[0].id;
  const p = await c.query(
    `insert into app.producto (nombre, categoria_id, marca_id, alias, modo_surtido, margen_objetivo)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [o.nombre ?? `Producto ${s}`, cat.rows[0].id, marcaId, o.alias ?? [], o.modo ?? "inventario", o.margen ?? null],
  );
  const pres: string[] = [];
  const porFactor: Record<number, string> = {};
  const usados = new Set<string>();
  for (const [i, f] of factores.entries()) {
    let nombre = NOMBRES[f] ?? `Presentacion de ${f}`;
    if (usados.has(nombre.toLowerCase())) nombre = `Presentacion ${i}`;
    usados.add(nombre.toLowerCase());
    const r = await c.query("insert into app.presentacion (producto_id, nombre, factor) values ($1, $2, $3) returning id", [p.rows[0].id, nombre, f]);
    pres.push(r.rows[0].id);
    porFactor[f] = r.rows[0].id;
  }
  const usuario = o.usuario ?? (await usuarioF2(c));
  if (o.costo !== undefined) {
    await c.query("select app.fn_ajustar_inventario($1, 1, $2, 'inventario_inicial', $3, $4)", [usuario, p.rows[0].id, o.piezas ?? 240, o.costo]);
  }
  const pf = (factor: number) => {
    const id = porFactor[factor];
    if (!id) throw new Error(`el producto no tiene presentacion de factor ${factor}`);
    return id;
  };
  return { id: p.rows[0].id, categoria_id: cat.rows[0].id, pres, porFactor, pf, usuario };
}

export interface LineaCompra {
  presentacion_id: string;
  cantidad: number;
  costo_presentacion: string;
  caduca_el?: string;
}

/** Registra una compra con clave aleatoria (o la dada). Devuelve `{id, repetida}`. */
export async function compra(
  c: pg.PoolClient,
  lineas: LineaCompra[],
  o: { usuario?: string; proveedor?: string; fecha?: string; clave?: string; hash?: string } = {},
): Promise<{ id: string; repetida: boolean }> {
  const usuario = o.usuario ?? (await usuarioF2(c));
  const prov = o.proveedor ?? (await proveedor(c));
  const datos = {
    clave_idempotencia: o.clave ?? randomUUID(),
    proveedor_id: prov,
    fecha: o.fecha ?? (await dia(c, 0)),
    condicion_pago: "contado",
    lineas,
  };
  const r = await c.query("select compra_id, repetida from app.fn_registrar_compra($1, 1, $2::jsonb, $3)", [usuario, JSON.stringify(datos), o.hash ?? "hash-1"]);
  return { id: r.rows[0].compra_id, repetida: r.rows[0].repetida };
}

/** Existencia (piezas) y costo promedio de la sucursal 1; sin fila = 0. */
export async function existencia(c: pg.PoolClient, productoId: string): Promise<{ cantidad: number; costo_promedio: string }> {
  const r = await c.query("select cantidad, costo_promedio from app.existencia where sucursal_id = 1 and producto_id = $1", [productoId]);
  return r.rows[0] ?? { cantidad: 0, costo_promedio: "0.000000" };
}

/** Fecha local de negocio + `desplazamiento` días, como 'YYYY-MM-DD'. */
export async function dia(c: pg.PoolClient, desplazamiento = 0): Promise<string> {
  const r = await c.query("select (app.fn_fecha_local(now()) + $1::int)::text as d", [desplazamiento]);
  return r.rows[0].d;
}

/** Como `error()` de ayuda.ts pero devuelve también `detail` ya interpretado como JSON. */
export async function errorConDetalle(
  c: pg.PoolClient,
  fn: () => Promise<unknown>,
): Promise<{ code: string; message: string; detalle: unknown }> {
  await c.query("savepoint antes_del_error_f2");
  try {
    await fn();
  } catch (e) {
    await c.query("rollback to savepoint antes_del_error_f2");
    const { code, message, detail } = e as { code: string; message: string; detail?: string };
    let detalle: unknown = detail;
    try { detalle = detail ? JSON.parse(detail) : undefined; } catch { /* detail no es JSON (p. ej. 23505) */ }
    return { code, message, detalle };
  }
  throw new Error("se esperaba un error y no hubo");
}

export async function ajuste(
  c: pg.PoolClient, usuario: string, productoId: string, tipo: string, piezas: number,
  o: { costo?: string | null; motivo?: string | null; causa?: string | null } = {},
): Promise<string> {
  const r = await c.query(
    "select movimiento_id as id from app.fn_ajustar_inventario($1, 1, $2, $3, $4, $5, $6, $7)",
    [usuario, productoId, tipo, piezas, o.costo ?? null, o.motivo ?? "prueba", o.causa ?? null],
  );
  return r.rows[0].id;
}

/** `precio` base de una presentación en una lista (upsert). */
export async function ponerPrecio(c: pg.PoolClient, presentacionId: string, lista: "Menudeo" | "Mayoreo", precio: string): Promise<void> {
  await c.query(
    `insert into app.precio (presentacion_id, lista_precio_id, precio)
     select $1, l.id, $3 from app.lista_precio l where l.nombre = $2
     on conflict (presentacion_id, lista_precio_id) do update set precio = excluded.precio`,
    [presentacionId, lista, precio],
  );
}

import type pg from "pg";
import { ajuste, compra as compraBase, dia, ponerPrecio, producto as productoBase, type ProductoCreado } from "./ayuda-inventario.js";
import { catalogoBase, cliente, fila, pedido, type CatalogoBase } from "./ayuda-pedidos.js";

let n = 0;
const sufijo = () => `${++n}x${process.pid}`;

/** Proveedor con nombre unico (el indice de nombre es unico y otras suites dejan filas confirmadas). */
export async function proveedorNombrado(c: pg.PoolClient, prefijo: string): Promise<{ id: string; nombre: string }> {
  const nombre = `${prefijo} ${sufijo()}`;
  const r = await c.query("insert into app.proveedor (nombre, telefono) values ($1, '5215500000000') returning id", [nombre]);
  return { id: r.rows[0].id, nombre };
}

/** Producto de inventario o contra pedido con minimo y proveedor, y `piezas` en existencia (costo 10 por pieza). */
export async function producto(
  c: pg.PoolClient,
  o: { modo?: "inventario" | "contra_pedido"; minimo?: number; proveedor?: string | null; piezas?: number; nombre?: string; usuario?: string } = {},
): Promise<ProductoCreado> {
  const p = await productoBase(c, {
    factores: [1, 24], nombre: o.nombre, modo: o.modo, usuario: o.usuario,
    ...(o.piezas ? { costo: "10.00", piezas: o.piezas } : {}),
  });
  await c.query("update app.producto set existencia_minima = $2, proveedor_id = $3 where id = $1", [p.id, o.minimo ?? 0, o.proveedor ?? null]);
  await ponerPrecio(c, p.pf(24), "Menudeo", "400.00"); // para poder pedirlo
  return p;
}

/** Una compra de `cantidad` presentaciones a `costo` (devuelve el id). Sube la existencia: el llamador compensa si lo necesita. */
export async function compra(c: pg.PoolClient, presentacion: string, cantidad: number, costo: string, proveedor?: string): Promise<string> {
  return (await compraBase(c, [{ presentacion_id: presentacion, cantidad, costo_presentacion: costo }], { proveedor })).id;
}

/** Salida `venta` del kardex hace `haceDias` dias, por el disparador de 002 (con candado de existencia, nunca directo). */
export async function ventaKardex(c: pg.PoolClient, productoId: string, piezas: number, haceDias: number, usuario: string): Promise<void> {
  await c.query("select app.fn_bloquear_existencias(1, array[$1::bigint])", [productoId]);
  await c.query(
    `insert into app.movimiento_inventario (sucursal_id, producto_id, tipo, cantidad, costo_unitario, usuario_id, creado_en)
     values (1, $1, 'venta', $2, 0, $3, now() - $4 * interval '1 day')`,
    [productoId, -piezas, usuario, haceDias],
  );
}

export const lin = (presentacion_id: string, cantidad: number) => ({ presentacion_id, cantidad });

/** Confirma el pedido para `fecha`. */
export async function confirmar(c: pg.PoolClient, usuario: string, ped: string, fecha: string): Promise<void> {
  const v = (await fila<{ version: number }>(c, "select version from app.pedido where id = $1", [ped])).version;
  await c.query("select app.fn_confirmar_pedido($1, $2, $3::jsonb)", [usuario, ped, JSON.stringify({ version: v, fecha_entrega: fecha })]);
}

/** Pedido capturado por `usuario` y confirmado para `fecha`. */
export async function pedidoConfirmado(
  c: pg.PoolClient, usuario: string, cli: string, lineas: { presentacion_id: string; cantidad: number }[], fecha: string,
): Promise<string> {
  const p = await pedido(c, cli, lineas, { captura: usuario });
  await confirmar(c, usuario, p, fecha);
  return p;
}

export interface Juego {
  k: CatalogoBase;
  modelo: { id: string; nombre: string };
  abarrotera: { id: string; nombre: string };
  tecate: ProductoCreado;
  cli: string;
  /** Pedidos A, B (esperando_cliente con Victoria en faltante), C, D' (hoy), recibido y propuesto. */
  A: string; B: string; C: string; D: string; recibido: string; propuesto: string;
  /** Linea de Victoria en faltante del pedido B y su propuesta. */
  lineaFaltante: string; propuesta: string;
  hoy: string; manana: string;
}

/**
 * Juego fijo de F5.md. Corona (inventario, minimo 30, Modelo, existencia 60, ultima compra Caja 300.00), Victoria (contra pedido,
 * Modelo, existencia 0, ultima compra Caja 290.00), Tecate (inventario, sin proveedor, existencia 20) y los pedidos de la tabla.
 */
export async function juego(c: pg.PoolClient): Promise<Juego> {
  const k = await catalogoBase(c);
  await c.query(`update app.configuracion set valor = '"1.00"' where clave = 'pedido_minimo'`);
  const modelo = await proveedorNombrado(c, "Modelo");
  const abarrotera = await proveedorNombrado(c, "Abarrotera");
  await c.query("update app.producto set proveedor_id = $2, existencia_minima = 30 where id = $1", [k.corona.id, modelo.id]);
  await c.query("update app.producto set proveedor_id = $2, modo_surtido = 'contra_pedido' where id = $1", [k.victoria.id, modelo.id]);
  // Ultimas compras; cada una sube la existencia 24 y se compensa con una salida para dejar Corona en 60 y Victoria en 0.
  await compra(c, k.caja, 1, "300.00", modelo.id);
  await ajuste(c, k.usuario, k.corona.id, "ajuste_salida", 24);
  await compra(c, k.victoriaCaja, 1, "290.00", modelo.id);
  await ajuste(c, k.usuario, k.victoria.id, "ajuste_salida", 24);
  const tecate = await producto(c, { modo: "inventario", minimo: 0, proveedor: null, piezas: 20, nombre: "Tecate 355 ml lata", usuario: k.usuario });

  const hoy = await dia(c, 0);
  const manana = await dia(c, 1);
  const cli = await cliente(c);
  const A = await pedidoConfirmado(c, k.usuario, cli, [lin(k.caja, 2)], manana);
  const B = await pedidoConfirmado(c, k.usuario, cli, [lin(k.caja, 1), lin(k.victoriaCaja, 1)], manana);
  const lineaFaltante = (await fila<{ id: string }>(c, "select id from app.pedido_linea where pedido_id = $1 and presentacion_id = $2", [B, k.victoriaCaja])).id;
  const version = (await fila<{ version: number }>(c, "select version from app.pedido where id = $1", [B])).version;
  await c.query("select app.fn_proponer_faltantes($1, $2, $3::jsonb)", [k.usuario, B, JSON.stringify({
    version, lineas: [{ pedido_linea_id: lineaFaltante, causa: "sin_existencia", opciones: [{ tipo: "sustituto", presentacion_id: k.caja, cantidad: 1 }] }],
  })]);
  const propuesta = (await fila<{ id: string }>(c, "select id from app.propuesta_faltante where pedido_linea_id = $1", [lineaFaltante])).id;
  const C = await pedidoConfirmado(c, k.usuario, cli, [lin(k.victoriaCaja, 1)], manana);
  const D = await pedidoConfirmado(c, k.usuario, cli, [lin(k.six, 1)], hoy);
  const recibido = await pedido(c, cli, [lin(k.caja, 5)], { captura: k.usuario });
  const propuesto = await pedido(c, cli, [lin(k.caja, 5)], { captura: k.usuario });
  await c.query(
    "update app.pedido set estado = 'propuesto', origen = 'sugerido', creado_por = null, folio = null, propuesto_vence_en = now() + interval '1 day' where id = $1", [propuesto]);
  return { k, modelo, abarrotera, tecate, cli, A, B, C, D, recibido, propuesto, lineaFaltante, propuesta, hoy, manana };
}

/** Filas de fn_lista_surtido (sucursal 1) de los productos dados, por producto. */
export async function lista(c: pg.PoolClient, fecha: string, productos: string[], ruta: string | null = null): Promise<Record<string, Record<string, unknown>>> {
  const r = await c.query("select * from app.fn_lista_surtido(1, $1::date, $2) where producto_id = any($3) order by producto_id", [fecha, ruta, productos]);
  return Object.fromEntries(r.rows.map((f) => [f.producto_id as string, f]));
}


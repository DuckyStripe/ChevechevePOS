import type pg from "pg";
import { ROL3, pedido, usuarioF3 } from "./ayuda-pedidos.js";

// F6: se reutiliza ayuda-pedidos.ts (catalogoBase, cliente, pedido, fila...). Aqui solo lo propio de rutas.
export { ROL3, catalogoBase, cliente, fila, pedido, usuarioF3, type CatalogoBase } from "./ayuda-pedidos.js";

let n = 0;

/** Vehiculo activo (nombre unico por prueba). `capacidad` null = sin capacidad. */
export async function vehiculo(c: pg.PoolClient, o: { capacidad?: number | null; activo?: boolean } = {}): Promise<string> {
  const r = await c.query("insert into app.vehiculo (nombre, capacidad_cajas, activo) values ($1, $2, $3) returning id", [
    `Camioneta ${++n}x${process.pid}`, o.capacidad ?? null, o.activo ?? true,
  ]);
  return r.rows[0].id;
}

/** Usuario con el rol Repartidor (solo rutas.operar de las rutas). */
export const repartidor = (c: pg.PoolClient): Promise<string> => usuarioF3(c, ROL3.repartidor);

/** Cliente con telefono y ubicacion fija (lat, lng) y zona opcional (nombre; se crea si no existe). */
export async function clienteEn(c: pg.PoolClient, lat: string | null, lng: string | null, zona?: string | null): Promise<string> {
  let zonaId: string | null = null;
  if (zona) {
    const z = await c.query("select id from app.zona where lower(nombre) = lower($1)", [zona]);
    zonaId = z.rows[0]?.id ?? (await c.query("insert into app.zona (nombre) values ($1) returning id", [zona])).rows[0].id;
  }
  const r = await c.query(
    `insert into app.cliente (nombre, telefono_whatsapp, lista_precio_id, ya_compro, lat, lng, ubicacion_fuente, zona_id)
     values ($1, '5215512345678', (select id from app.lista_precio where nombre = 'Menudeo'), true, $2, $3, $4, $5) returning id`,
    [`Tienda R${++n}x${process.pid}`, lat, lng, lat === null ? null : "mapa", zonaId],
  );
  return r.rows[0].id;
}

/** Pedido capturado y confirmado para `fecha` (sin minimo de pedido, entrega a domicilio). */
export async function pedidoConfirmado(
  c: pg.PoolClient, cli: string, lineas: { presentacion_id: string; cantidad: number }[], fecha: string, usuario?: string,
): Promise<string> {
  await c.query(`update app.configuracion set valor = '"0.00"' where clave = 'pedido_minimo'`);
  const u = usuario ?? (await usuarioF3(c));
  const ped = await pedido(c, cli, lineas, { captura: u });
  await c.query("select app.fn_confirmar_pedido($1, $2, $3::jsonb)", [u, ped, JSON.stringify({ version: 1, fecha_entrega: fecha })]);
  return ped;
}

/** Ruta nueva (fn_crear_ruta). Con `pedidos` los asigna en ese orden. Devuelve su id. */
export async function rutaCon(
  c: pg.PoolClient, pedidos: string[], o: { fecha: string; usuario?: string; repartidor?: string; vehiculo?: string; capacidad?: number | null },
): Promise<{ id: string; usuario: string; repartidor: string }> {
  const usuario = o.usuario ?? (await usuarioF3(c));
  const rep = o.repartidor ?? (await repartidor(c));
  const veh = o.vehiculo ?? (await vehiculo(c, { capacidad: o.capacidad }));
  const r = await c.query("select app.fn_crear_ruta($1, 1, $2::jsonb) as id", [
    usuario, JSON.stringify({ fecha: o.fecha, vehiculo_id: veh, repartidor_id: rep }),
  ]);
  const id = r.rows[0].id as string;
  if (pedidos.length) await c.query("select app.fn_asignar_pedidos($1, $2, $3::bigint[])", [usuario, id, pedidos]);
  return { id, usuario, repartidor: rep };
}

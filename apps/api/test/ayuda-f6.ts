import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { borrarDinero } from "./ayuda-dinero.js";
import { entrar, pool } from "./ayuda.js";
import { hoyMas, sufijo } from "./ayuda-f2.js";
import { catalogoF3, clienteConEnlace, crearUsuarioF3, limpiarF3, pedirPersonal, type CatalogoF3, type ClienteF3, type Snapshot } from "./ayuda-f3.js";

// F6: se reutiliza todo F3 (catalogo, clientes con enlace, limpieza). Aqui solo lo de rutas. Vehiculos y rutas de prueba se llaman `TF6 ...`.

export interface EscenarioF6 {
  k: CatalogoF3;
  hoy: string;
  manana: string;
  vehiculo: string;
  clientes: ClienteF3[];
  /** Un pedido confirmado (1 Six de Corona) para manana por cliente, en el mismo orden que `clientes`. */
  pedidos: string[];
}

export interface Dueno {
  token: string;
  id: string;
}

const ok = async <T extends { statusCode: number; body: string }>(r: T, que: string): Promise<T> => {
  if (r.statusCode >= 300) throw new Error(`${que}: ${r.statusCode} ${r.body}`);
  return r;
};

/** Bodega de la sucursal (la devuelve `limpiarF6`). */
export async function ponerBodega(app: FastifyInstance, dueno: Dueno, lat: string | null, lng: string | null): Promise<void> {
  await ok(await pedirPersonal(app)("PATCH", "/api/configuracion", dueno.token, { sucursal: { lat, lng } }), "bodega");
}

export async function crearVehiculo(app: FastifyInstance, dueno: Dueno, o: { capacidad_cajas?: number } = {}): Promise<string> {
  const r = await ok(await pedirPersonal(app)("POST", "/api/vehiculos", dueno.token, { nombre: `TF6 Camioneta ${sufijo()}`, ...o }), "vehiculo");
  return r.json<{ id: string }>().id;
}

/** Cliente con enlace y ubicacion; `lng` en grados. */
export async function clienteEn(app: FastifyInstance, dueno: Dueno, lat: number | null, lng: number | null, o: { zona_id?: string } = {}): Promise<ClienteF3> {
  const c = await clienteConEnlace(app, dueno, o);
  if (lat !== null && lng !== null) {
    await ok(await pedirPersonal(app)("PUT", `/api/clientes/${c.id}/ubicacion`, dueno.token, { lat: lat.toFixed(6), lng: lng.toFixed(6), fuente: "mapa" }), "ubicacion");
  }
  return c;
}

/** Pedido capturado (1 Six por omision) y confirmado para `fecha`; devuelve su id. */
export async function pedidoConfirmado(
  app: FastifyInstance, dueno: Dueno, k: CatalogoF3, cliente: string, fecha: string, lineas?: { presentacion_id: string; cantidad: number }[],
): Promise<string> {
  const pedir = pedirPersonal(app);
  const p = (await ok(await pedir("POST", "/api/pedidos", dueno.token, {
    clave_idempotencia: randomUUID(), cliente_id: cliente, lineas: lineas ?? [{ presentacion_id: k.corona.six, cantidad: 1 }],
  }), "pedido")).json<{ id: string }>();
  await ok(await pedir("POST", `/api/pedidos/${p.id}/confirmar`, dueno.token, { version: 1, fecha_entrega: fecha }), "confirmar");
  return p.id;
}

/** Juego fijo de F6.md: bodega 19.000000,-99.000000; n clientes en 19.000000, -99 + 0.01·i con 1 pedido de 1 Six para manana; Corona 60 piezas. */
export async function escenarioF6(app: FastifyInstance, dueno: Dueno, o: { n?: number } = {}): Promise<EscenarioF6> {
  const pedir = pedirPersonal(app);
  const k = await catalogoF3(app, dueno.token);
  await ok(await pedir("PATCH", "/api/configuracion", dueno.token, { pedido_minimo: "1.00" }), "minimo");
  await ponerBodega(app, dueno, "19.000000", "-99.000000");
  const vehiculo = await crearVehiculo(app, dueno);
  const manana = await hoyMas(1);
  const clientes: ClienteF3[] = [];
  const pedidos: string[] = [];
  for (let i = 1; i <= (o.n ?? 6); i++) {
    const c = await clienteEn(app, dueno, 19, -99 + 0.01 * i);
    clientes.push(c);
    pedidos.push(await pedidoConfirmado(app, dueno, k, c.id, manana));
  }
  return { k, hoy: await hoyMas(0), manana, vehiculo, clientes, pedidos };
}

/** Respuesta cruda de `POST /api/rutas` (las pruebas de error la miran tal cual). */
export const crearRuta = (
  app: FastifyInstance, token: string, e: Pick<EscenarioF6, "vehiculo" | "manana">, repartidor_id: string, extra: Record<string, unknown> = {},
) => pedirPersonal(app)("POST", "/api/rutas", token, { fecha: e.manana, vehiculo_id: e.vehiculo, repartidor_id, ...extra });

/** Usuario Repartidor con su sesion. */
export async function repartidorF6(app: FastifyInstance): Promise<Dueno> {
  const u = await crearUsuarioF3("Repartidor");
  return { id: u.id, token: await entrar(app, u) };
}

/** Ruta nueva con esos pedidos asignados (en ese orden). Devuelve la ruta. */
export async function rutaConPedidos(app: FastifyInstance, dueno: Dueno, e: Pick<EscenarioF6, "vehiculo" | "manana">, repartidor: string, pedidos: string[]): Promise<RutaApi> {
  const pedir = pedirPersonal(app);
  const r = (await ok(await crearRuta(app, dueno.token, e, repartidor), "ruta")).json<RutaApi>();
  return (await ok(await pedir("POST", `/api/rutas/${r.id}/pedidos`, dueno.token, { pedido_ids: pedidos }), "asignar")).json<RutaApi>();
}

/** Ruta con esos pedidos, ya cargada e iniciada por su repartidor. */
export async function rutaEnCurso(app: FastifyInstance, dueno: Dueno, e: Pick<EscenarioF6, "vehiculo" | "manana">, rep: Dueno, pedidos: string[]): Promise<RutaApi> {
  const pedir = pedirPersonal(app);
  const r = await rutaConPedidos(app, dueno, e, rep.id, pedidos);
  await ok(await pedir("POST", `/api/rutas/${r.id}/cargar`, dueno.token), "cargar");
  return (await ok(await pedir("POST", `/api/rutas/${r.id}/iniciar`, rep.token, {}), "iniciar")).json<{ ruta: RutaApi }>().ruta;
}

export interface RutaApi {
  id: string;
  folio: string;
  estado: string;
  paradas: { id: string; orden: number; estado: string; pedido: { id: string } | null; cliente: { id: string }; km_desde_anterior: string | null; navegar: { google: string; waze: string } | null }[];
  navegar_ruta: string[];
  [k: string]: unknown;
}

export interface BodegaAntes {
  lat: string | null;
  lng: string | null;
}

export async function bodegaAntes(): Promise<BodegaAntes> {
  return (await pool.query<BodegaAntes>("select lat, lng from app.sucursal where id = 1")).rows[0]!;
}

/** Quita rutas y vehiculos `TF6 ...` (y lo que cuelga de ellos), devuelve la bodega y llama a `limpiarF3`. */
export async function limpiarF6(app: FastifyInstance | undefined, antes: Snapshot, bodega: BodegaAntes): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const rutasSql = "select r.id from app.ruta r join app.vehiculo v on v.id = r.vehiculo_id where v.nombre like 'TF6 %'";
    const rutas = `(${rutasSql})`;
    // F7: turnos, ventas y cobros de esas rutas y de los clientes y usuarios de prueba, antes de soltar pedidos y rutas.
    await borrarDinero(c, { clientes: "select id from app.cliente where nombre like 'TF3 %'", usuarios: "select id from app.usuario where usuario like 'tf3\\_%'", rutas: rutasSql });
    await c.query(`update app.pedido set ruta_id = null where ruta_id in ${rutas}`);
    await c.query(`delete from app.ruta_parada where ruta_id in ${rutas}`);
    await c.query(`delete from app.ruta where id in ${rutas}`);
    await c.query("delete from app.vehiculo where nombre like 'TF6 %'");
    await c.query("delete from app.folio where serie = 'R' and not exists (select 1 from app.ruta)");
    await c.query("update app.sucursal set lat = $1, lng = $2 where id = 1", [bodega.lat, bodega.lng]);
    await c.query("commit");
  } catch (err) {
    await c.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
  await limpiarF3(app, antes);
}

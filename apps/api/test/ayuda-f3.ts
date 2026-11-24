import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { cifrar, hashToken, nuevoToken } from "../src/modulos/clientes/token.js";
import { olvidarFallosDeEnlace } from "../src/comun/permisos.js";
import { borrarDinero } from "./ayuda-dinero.js";
import { auth, entrar, marcaAuditoria, pool, type NombreRol, type UsuarioPrueba } from "./ayuda.js";
import { ayudaF2, sufijo } from "./ayuda-f2.js";

// Prefijo propio de F3 (F1 usa tapi_, F2 tf2_, las pruebas SQL tf3_sql). Los usuarios no se pueden borrar (kardex, precios): `limpiarF3` los desactiva.
const PREFIJO = "tf3_";
const HASH = bcrypt.hashSync("clave-de-prueba-1", 4);
let n = 0;

export async function crearUsuarioF3(rol: NombreRol | { permisos: string[] }): Promise<UsuarioPrueba> {
  const usuario = `${PREFIJO}${process.pid}_${++n}_${sufijo()}`;
  let rolId: string;
  if (typeof rol === "string") {
    rolId = (await pool.query<{ id: string }>("select id from app.rol where nombre = $1", [rol])).rows[0]!.id;
  } else {
    rolId = (await pool.query<{ id: string }>("insert into app.rol (nombre) values ($1) returning id", [`${PREFIJO}rol_${usuario}`])).rows[0]!.id;
    for (const p of rol.permisos) await pool.query("insert into app.rol_permiso (rol_id, permiso_codigo) values ($1, $2)", [rolId, p]);
  }
  const r = await pool.query<{ id: string }>(
    "insert into app.usuario (usuario, nombre, contrasena_hash, rol_id, sucursal_id, debe_cambiar_contrasena) values ($1, $2, $3, $4, 1, false) returning id",
    [usuario, `Prueba F3 ${n}`, HASH, rolId],
  );
  return { id: r.rows[0]!.id, usuario, contrasena: "clave-de-prueba-1" };
}

export async function tokenF3(app: FastifyInstance, rol: NombreRol | { permisos: string[] }): Promise<string> {
  return entrar(app, await crearUsuarioF3(rol));
}

const ipAleatoria = () => `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

/** Peticion del personal (IP distinta por llamada: el limite global es por IP). */
export function pedirPersonal(app: FastifyInstance) {
  return (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, token?: string, payload?: object) =>
    app.inject({ method, url, headers: { ...(token ? auth(token) : {}), "x-visitante-ip": ipAleatoria() }, ...(payload ? { payload } : {}) });
}

export interface Credenciales {
  token: string;
  dispositivo?: string;
  ip?: string;
  extra?: Record<string, string>;
}
export const cabecerasCliente = (token: string, dispositivo?: string, ip?: string): Record<string, string> => ({
  "x-cliente-token": token,
  ...(dispositivo ? { "x-cliente-dispositivo": dispositivo } : {}),
  "x-visitante-ip": ip ?? ipAleatoria(),
});

/** Peticion del cliente (enlace). La IP es fija por credencial salvo que se pase otra. */
export function pedirCliente(app: FastifyInstance) {
  return (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, c: Credenciales, payload?: object) =>
    app.inject({ method, url, headers: { ...cabecerasCliente(c.token, c.dispositivo, c.ip), ...c.extra }, ...(payload ? { payload } : {}) });
}

export interface ClienteF3 {
  id: string;
  nombre: string;
  token: string;
  enlace_id: string;
}

/** Cliente por la API y su enlace por SQL (la API nunca devuelve el token): `{cliente, token}`. Con `pin` el cliente ya eligio PIN y trae su dispositivo. */
export async function clienteConEnlace(
  app: FastifyInstance,
  dueno: { token: string; id: string },
  o: { ya_compro?: boolean; lista_precio_id?: string; telefono?: string | null; zona_id?: string; dias_visita?: number[]; nombre?: string } = {},
): Promise<ClienteF3 & { dispositivo?: string }> {
  const pedir = pedirPersonal(app);
  const nombre = o.nombre ?? `TF3 Tienda ${sufijo()}`;
  const r = await pedir("POST", "/api/clientes", dueno.token, {
    nombre,
    telefono_whatsapp: o.telefono === undefined ? "5215512345678" : o.telefono,
    ...(o.lista_precio_id ? { lista_precio_id: o.lista_precio_id } : {}),
    ...(o.zona_id ? { zona_id: o.zona_id } : {}),
    ...(o.dias_visita ? { dias_visita: o.dias_visita } : {}),
  });
  if (r.statusCode !== 201) throw new Error(`cliente: ${r.statusCode} ${r.body}`);
  const id = r.json<{ id: string }>().id;
  if (o.ya_compro ?? true) await pool.query("update app.cliente set ya_compro = true where id = $1", [id]);
  const token = nuevoToken();
  const e = await pool.query<{ id: string }>("select app.fn_generar_enlace($1, $2, $3, $4, true) as id", [dueno.id, id, hashToken(token), cifrar(token)]);
  return { id, nombre, token, enlace_id: e.rows[0]!.id };
}

/** El cliente elige su PIN en un navegador nuevo y recibe su token de dispositivo. */
export async function activarCliente(app: FastifyInstance, c: ClienteF3, pin = "1234"): Promise<Credenciales> {
  const r = await pedirCliente(app)("POST", "/api/publico/pin/elegir", { token: c.token }, { pin });
  if (r.statusCode !== 200) throw new Error(`pin/elegir: ${r.statusCode} ${r.body}`);
  return { token: c.token, dispositivo: r.json<{ dispositivo_token: string }>().dispositivo_token, ip: ipAleatoria() };
}

export interface ProductoF3 {
  id: string;
  nombre: string;
  pieza: string;
  por: (factor: number) => string;
}
export interface CatalogoF3 {
  corona: ProductoF3 & { six: string; caja: string };
  victoria: ProductoF3 & { caja: string };
  menudeo: string;
  mayoreo: string;
}

/** Juego fijo de F3.md por la API: config, Corona (Six 110, Caja 420/400, 60 piezas), Victoria (Caja 410) y equivalente. */
export async function catalogoF3(app: FastifyInstance, dueno: string): Promise<CatalogoF3> {
  const h = ayudaF2(app);
  const pedir = pedirPersonal(app);
  const ok = async (r: { statusCode: number; body: string }, que: string) => {
    if (r.statusCode >= 300) throw new Error(`${que}: ${r.statusCode} ${r.body}`);
  };
  await ok(await pedir("PATCH", "/api/configuracion", dueno, { pedido_minimo: "500.00", faltante_minutos_respuesta: 60, faltante_accion_predeterminada: "quitar", enlace_tras_primera_compra: true }), "config");
  const listas = (await pedir("GET", "/api/listas-precio", dueno)).json().items as { id: string; nombre: string }[];
  const menudeo = listas.find((l) => l.nombre === "Menudeo")!.id;
  const mayoreo = listas.find((l) => l.nombre === "Mayoreo")!.id;
  const s = sufijo();
  const categoria = await h.crearCategoria(dueno);
  const nuevo = async (nombre: string, factores: number[]): Promise<ProductoF3> => {
    const p = await h.crearProducto(dueno, { nombre, factores, categoria_id: categoria.id });
    const pieza = p.por(1).id;
    await ok(await pedir("PATCH", `/api/presentaciones/${pieza}`, dueno, { se_vende: false }), "pieza");
    return { id: p.id, nombre, pieza, por: (f) => p.por(f).id };
  };
  const corona = await nuevo(`TF3 Corona Extra ${s}`, [6, 24]);
  const victoria = await nuevo(`TF3 Victoria ${s}`, [24]);
  await ok(await pedir("PUT", "/api/precios", dueno, { precios: [
    { presentacion_id: corona.por(6), lista_precio_id: menudeo, precio: "110.00" },
    { presentacion_id: corona.por(24), lista_precio_id: menudeo, precio: "420.00" },
    { presentacion_id: corona.por(24), lista_precio_id: mayoreo, precio: "400.00" },
    { presentacion_id: victoria.por(24), lista_precio_id: menudeo, precio: "410.00" },
  ] }), "precios");
  await ok(await pedir("PUT", `/api/productos/${corona.id}/equivalentes`, dueno, { equivalentes: [{ producto_id: victoria.id, orden: 1 }] }), "equivalentes");
  await ok(await pedir("POST", "/api/inventario/ajustes", dueno, { producto_id: corona.id, tipo: "inventario_inicial", piezas: 60, costo_unitario: "12.50", clave_idempotencia: randomUUID() }), "existencia");
  return {
    corona: { ...corona, six: corona.por(6), caja: corona.por(24) },
    victoria: { ...victoria, caja: victoria.por(24) },
    menudeo,
    mayoreo,
  };
}

/**
 * Inserta DIRECTO un pedido `entregado` (historial de entregas). Desde 008 el pedido apunta a una venta real: se crea una de mostrador en un
 * turno ya cerrado de una caja `TF7 ...` (la limpia `borrarDinero`), solo para cumplir la llave; no mueve inventario. Devuelve su id.
 */
export async function pedidoEntregadoF3(clienteId: string, o: { hace_dias: number; lineas: { presentacion_id: string; cantidad: number; precio: string }[] }): Promise<string> {
  const c = await pool.connect();
  let pedidoId: string;
  try {
    await c.query("begin");
    await c.query("select app.fn_dinero_escribir()");
    const caja = await c.query<{ id: string }>("insert into app.caja (sucursal_id, nombre) values (1, $1) returning id", [`TF7 entregas ${randomUUID()}`]);
    const turno = await c.query<{ id: string }>(
      `insert into app.turno_caja (tipo, caja_id, usuario_id, estado, fondo_inicial, cerrado_en, cerrado_por, efectivo_esperado, efectivo_contado, diferencia)
       select 'mostrador', $1, u.id, 'cerrado', 0, now(), u.id, 0, 0, 0 from (select id from app.usuario order by id limit 1) u returning id`,
      [caja.rows[0]!.id],
    );
    // El historial se fabrica en un turno ya cerrado: se apaga un momento el disparador que lo impide.
    await c.query("alter table app.venta disable trigger trg_venta_turno_abierto");
    const venta = await c.query<{ id: string }>(
      `insert into app.venta (sucursal_id, folio, origen, turno_caja_id, cliente_id, lista_precio_id, usuario_id, clave_idempotencia, hash_solicitud)
       select 1, app.fn_siguiente_folio(1, 'V'), 'mostrador', $2::bigint, cl.id, cl.lista_precio_id, (select id from app.usuario order by id limit 1), $3::uuid, 'x'
         from app.cliente cl where cl.id = $1 returning id`,
      [clienteId, turno.rows[0]!.id, randomUUID()],
    );
    await c.query("alter table app.venta enable trigger trg_venta_turno_abierto");
    const p = await c.query<{ id: string }>(
      `insert into app.pedido (sucursal_id, folio, cliente_id, origen, estado, fecha_entrega, lista_precio_id, clave_idempotencia, hash_solicitud, venta_id, creado_en, entregado_en)
       select 1, app.fn_siguiente_folio(1, 'P'), cl.id, 'enlace', 'entregado', app.fn_fecha_local(now()), cl.lista_precio_id, $2, 'x',
              $4, now() - $3 * interval '1 day', now() - $3 * interval '1 day'
         from app.cliente cl where cl.id = $1 returning id`,
      [clienteId, randomUUID(), o.hace_dias, venta.rows[0]!.id],
    );
    await c.query("commit");
    pedidoId = p.rows[0]!.id;
  } catch (err) {
    await c.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
  const p = { rows: [{ id: pedidoId }] };
  for (const [i, l] of o.lineas.entries()) {
    await pool.query(
      `insert into app.pedido_linea (pedido_id, numero, presentacion_id, producto_id, factor, cantidad_pedida, cantidad, precio_lista, precio_unitario, cantidad_entregada, motivo_ajuste)
       select $1, $2, pz.id, pz.producto_id, pz.factor, $3, $3, $4, $4, $3, 'prueba' from app.presentacion pz where pz.id = $5`,
      [p.rows[0]!.id, i + 1, l.cantidad, l.precio, l.presentacion_id],
    );
  }
  return p.rows[0]!.id;
}

export interface Snapshot {
  marca: string;
  configuracion: Array<{ clave: string; valor: unknown; actualizado_en: Date }>;
  plantillas: Array<{ clave: string; titulo: string | null; texto: string; actualizado_en: Date }>;
}

export async function snapshotF3(): Promise<Snapshot> {
  return {
    marca: await marcaAuditoria(),
    configuracion: (await pool.query("select clave, valor, actualizado_en from app.configuracion")).rows,
    plantillas: (await pool.query("select clave, titulo, texto, actualizado_en from app.plantilla")).rows,
  };
}

/**
 * Deja la base como estaba para las demas suites (que no se pisen por el orden): borra en orden de llaves foraneas todo lo de los
 * clientes `TF3 %`, devuelve configuracion y plantillas, desactiva productos y usuarios `tf3_` (el kardex y los precios los referencian),
 * quita la bitacora que generaron y reinicia el folio P si no queda ningun pedido. Sin session_replication_role.
 */
export async function limpiarF3(app: FastifyInstance | undefined, antes: Snapshot): Promise<void> {
  await app?.close();
  olvidarFallosDeEnlace();
  const c = await pool.connect();
  try {
    await c.query("begin");
    const clientes = "(select id from app.cliente where nombre like 'TF3 %')";
    const pedidos = `(select id from app.pedido where cliente_id in ${clientes})`;
    const usuarios = "(select id from app.usuario where usuario like 'tf3\\_%')";
    await c.query(`delete from app.notificacion where usuario_id in ${usuarios}`);
    await c.query(`delete from app.aviso_cliente where cliente_id in ${clientes} or usuario_id in ${usuarios}`);
    // F7: ventas, cobros y turnos de esos clientes y usuarios (cuelgan de pedidos, clientes y rutas).
    await borrarDinero(c, { clientes: `select id from app.cliente where nombre like 'TF3 %'`, usuarios: `select id from app.usuario where usuario like 'tf3\\_%'`, rutas: "select id from app.ruta where false" });
    await c.query("alter table app.pedido_evento disable trigger trg_pedido_evento_inmutable");
    await c.query(`delete from app.pedido_evento where pedido_id in ${pedidos}`);
    await c.query("alter table app.pedido_evento enable trigger trg_pedido_evento_inmutable");
    const lineas = `(select id from app.pedido_linea where pedido_id in ${pedidos})`;
    await c.query(`update app.propuesta_faltante set opcion_elegida_id = null where pedido_linea_id in ${lineas}`);
    await c.query(`delete from app.propuesta_opcion where propuesta_id in (select id from app.propuesta_faltante where pedido_linea_id in ${lineas})`);
    await c.query(`delete from app.propuesta_faltante where pedido_linea_id in ${lineas}`);
    await c.query(`update app.pedido_linea set sustituye_linea_id = null where pedido_id in ${pedidos}`);
    await c.query(`delete from app.pedido_linea where pedido_id in ${pedidos}`);
    await c.query(`delete from app.pedido where cliente_id in ${clientes}`);
    for (const t of ["cliente_alias", "cliente_favorito", "cliente_visita"]) await c.query(`delete from app.${t} where cliente_id in ${clientes}`);
    const enlaces = `(select id from app.cliente_enlace where cliente_id in ${clientes})`;
    await c.query(`delete from app.cliente_pin_espera where cliente_enlace_id in ${enlaces}`);
    await c.query(`delete from app.cliente_pin_fallo where cliente_enlace_id in ${enlaces}`);
    await c.query(`delete from app.cliente_dispositivo where cliente_enlace_id in ${enlaces}`);
    await c.query(`delete from app.cliente_enlace where cliente_id in ${clientes}`);
    await c.query(`delete from app.cliente where nombre like 'TF3 %'`);
    await c.query("delete from app.zona where nombre like 'TF3 %'");
    await c.query("delete from app.producto_equivalente where producto_id in (select id from app.producto where nombre like 'TF3 %') or equivalente_id in (select id from app.producto where nombre like 'TF3 %')");
    await c.query("update app.presentacion set activa = false where producto_id in (select id from app.producto where nombre like 'TF3 %')");
    await c.query("update app.producto set activo = false where nombre like 'TF3 %'");
    // Usuarios: desactivados (no se pueden borrar) y sus roles de prueba fuera.
    const roles = "(select id from app.rol where nombre like 'tf3\\_%')";
    await c.query("alter table app.usuario disable trigger trg_ultimo_dueno");
    await c.query(`update app.usuario set rol_id = (select id from app.rol where nombre = 'Cajero') where rol_id in ${roles}`);
    await c.query("update app.usuario set activo = false where usuario like 'tf3\\_%'");
    await c.query("alter table app.usuario enable trigger trg_ultimo_dueno");
    await c.query(`delete from app.rol_permiso where rol_id in ${roles}`);
    await c.query("delete from app.rol where nombre like 'tf3\\_%'");
    for (const f of antes.configuracion) {
      await c.query("update app.configuracion set valor = $2::jsonb, actualizado_en = $3 where clave = $1", [f.clave, JSON.stringify(f.valor), f.actualizado_en]);
    }
    for (const f of antes.plantillas) {
      await c.query("update app.plantilla set titulo = $2, texto = $3, actualizado_en = $4 where clave = $1", [f.clave, f.titulo, f.texto, f.actualizado_en]);
    }
    await c.query("update app.configuracion set actualizado_por = null where actualizado_por in " + usuarios);
    await c.query("update app.plantilla set actualizado_por = null where actualizado_por in " + usuarios);
    await c.query("delete from app.auditoria where id > $1", [antes.marca]);
    await c.query("delete from app.folio where serie = 'P' and not exists (select 1 from app.pedido)");
    await c.query("commit");
  } catch (err) {
    await c.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

export const hashDe = hashToken;
void randomBytes;

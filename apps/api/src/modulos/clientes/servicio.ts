import type pg from "pg";
import { AppError } from "../../comun/errores.js";
import { listadoDeFilas, offset, type Pagina } from "../../comun/paginacion.js";
import { conUsuario } from "../../comun/transaccion.js";
import { consulta, pool } from "../../db/database.js";
import { avisoPorId } from "../avisos/servicio.js";
import { cifrar, hashToken, nuevoToken } from "./token.js";
import { resolverUbicacion, type FetchUbicacion } from "./ubicacion.js";

type Q = pg.Pool | pg.PoolClient;

/** Ultimo pedido real (no propuesto ni cancelado) con lo que de verdad recibio: base de «Repetir mi ultimo pedido». Compartido con el catalogo del enlace. */
export const ULTIMO_PEDIDO = (cliente: string) => `(select json_build_object('id', p.id::text, 'folio', p.folio, 'fecha', app.fn_fecha_local(p.creado_en)::text,
    'lineas', (select coalesce(json_agg(json_build_object('presentacion_id', l.presentacion_id::text, 'cantidad', coalesce(l.cantidad_entregada, l.cantidad)) order by l.numero), '[]'::json)
                 from app.pedido_linea l where l.pedido_id = p.id and l.estado = 'activa' and coalesce(l.cantidad_entregada, l.cantidad) > 0))
  from app.pedido p where p.cliente_id = ${cliente} and p.estado not in ('propuesto','cancelado') order by p.creado_en desc, p.id desc limit 1)`;

const ALERTA = `case a.tipo when 'visitas_sin_pedido' then 'visitas' when 'cliente_inactivo' then 'inactivo' else 'dispositivo_nuevo' end`;
const REF = (alias: string) => `case when ${alias}.id is null then null else json_build_object('id', ${alias}.id::text, 'nombre', ${alias}.nombre) end`;

const ENLACE = `case when ult.id is null then json_build_object('estado', 'sin_link', 'baja', null)
  else json_build_object('estado', case when ult.revocado_en is null then (case when ult.pin_hash is not null then 'activo' else 'sin_activar' end) else 'dado_de_baja' end,
    'baja', case when ult.revocado_en is null then null else json_build_object('en', ult.revocado_en, 'motivo', ult.motivo_revocacion, 'nota', ult.nota_revocacion, 'por', ${REF("ur")}) end) end`;

const DESDE = `from app.cliente c
  left join app.zona z on z.id = c.zona_id
  join app.lista_precio lp on lp.id = c.lista_precio_id
  left join lateral (select * from app.cliente_enlace e where e.cliente_id = c.id order by e.id desc limit 1) ult on true
  left join app.usuario ur on ur.id = ult.revocado_por
  left join al on al.cliente_id = c.id
  left join app.v_saldo_cliente vs on vs.cliente_id = c.id`;
const WITH_ALERTAS = `with al as (select a.cliente_id, array_agg(distinct ${ALERTA}) as arr from app.v_alerta_cliente a group by a.cliente_id)`;

// `lista_precio` la ve quien ve clientes (el catalogo de venta necesita saber con que lista cotiza); limite y dias de credito solo con clientes.credito.
const base = (credito: boolean) => `c.id, c.nombre, c.tipo_negocio, ${REF("z")} as zona, c.telefono_whatsapp, c.dias_visita,
  (c.lat is not null) as tiene_ubicacion, (c.lat_propuesta is not null) as tiene_propuesta, (ult.id is not null and ult.revocado_en is null) as tiene_enlace,
  json_build_object('id', lp.id::text, 'nombre', lp.nombre) as lista_precio, c.activo${credito ? ", c.limite_credito::text as limite_credito" : ""}`;

export interface FiltrosClientes extends Pagina {
  con_saldo?: boolean;
  buscar?: string; zona_id?: string; dia_visita?: number; sin_ubicacion?: boolean; con_propuesta?: boolean; alerta?: string; enlace?: string; activo?: boolean;
}

/** `saldo` y `vencido` (v_saldo_cliente) solo para quien ve cobranza o maneja credito (`veSaldo`). */
const SALDO = ", vs.saldo::text as saldo, vs.vencido::text as vencido";

export async function listarClientes(veCredito: boolean, veSaldo: boolean, f: FiltrosClientes) {
  const p: unknown[] = [];
  const arg = (v: unknown) => (p.push(v), `$${p.length}`);
  const donde: string[] = [];
  if (f.buscar) {
    const t = arg(f.buscar);
    const digitos = f.buscar.replace(/\D/g, "");
    donde.push(`(app.fn_normalizar(c.nombre) like '%' || app.fn_normalizar(${t}) || '%'${digitos.length >= 4 ? ` or c.telefono_whatsapp like '%' || ${arg(digitos)} || '%'` : ""})`);
  }
  if (f.zona_id) donde.push(`c.zona_id = ${arg(f.zona_id)}`);
  if (f.dia_visita) donde.push(`${arg(f.dia_visita)}::smallint = any(c.dias_visita)`);
  if (f.sin_ubicacion !== undefined) donde.push(f.sin_ubicacion ? "c.lat is null" : "c.lat is not null");
  if (f.con_propuesta !== undefined) donde.push(f.con_propuesta ? "c.lat_propuesta is not null" : "c.lat_propuesta is null");
  if (f.alerta) donde.push(`${arg(f.alerta)} = any(coalesce(al.arr, '{}'))`);
  if (f.enlace) donde.push(`(${ENLACE})->>'estado' = ${arg(f.enlace)}`);
  if (f.activo !== undefined) donde.push(`c.activo = ${arg(f.activo)}`);
  if (f.con_saldo !== undefined) donde.push(f.con_saldo ? "vs.saldo > 0" : "vs.saldo = 0");
  const limite = arg(f.por_pagina);
  const desplazo = arg(offset(f));
  const r = await consulta<{ total: string }>(
    `${WITH_ALERTAS} select ${base(veCredito)}${veSaldo ? SALDO : ""}, coalesce(al.arr, '{}') as alertas, (${ENLACE}) as enlace, count(*) over() as total ${DESDE}
      ${donde.length ? `where ${donde.join(" and ")}` : ""} order by c.nombre, c.id limit ${limite} offset ${desplazo}`,
    p,
  );
  return listadoDeFilas(r.rows, f);
}

export async function detalleCliente(q: Q, id: string, veCredito: boolean, veSaldo = false) {
  const r = await q.query(
    `${WITH_ALERTAS} select ${base(veCredito)}${veSaldo ? `${SALDO}, vs.disponible::text as disponible,
            (select json_build_object('color', k.color, 'dias_promedio_pago', k.dias_promedio_pago::text, 'max_dias_vencido', k.max_dias_vencido, 'limite_sugerido', k.limite_sugerido::text)
               from app.v_semaforo_cliente k where k.cliente_id = c.id) as semaforo` : ""}, coalesce(al.arr, '{}') as alertas, c.contacto, c.direccion, c.referencias, c.notas, c.sugerir_pedido,
            c.lista_precio_id::text as lista_precio_id, ${veCredito ? "c.dias_credito, " : ""}c.lat::text as lat, c.lng::text as lng, c.ubicacion_fuente,
            c.lat_propuesta::text as lat_propuesta, c.lng_propuesta::text as lng_propuesta, app.fn_proxima_visita(c.id)::text as proxima_visita,
            case when ult.id is null or ult.revocado_en is not null then null
                 else json_build_object('creado_en', ult.creado_en, 'ultimo_uso_en', ult.ultimo_uso_en, 'estado', case when ult.pin_hash is not null then 'activo' else 'sin_activar' end, 'tiene_pin', ult.pin_hash is not null) end as enlace,
            (select coalesce(json_agg(json_build_object('presentacion_id', f.presentacion_id::text, 'veces', f.veces, 'ultima_cantidad', f.ultima_cantidad) order by f.n), '[]'::json)
               from (select x.*, row_number() over () as n from app.fn_frecuentes(c.id) x) f) as frecuentes,
            ${ULTIMO_PEDIDO("c.id")} as ultimo_pedido
       ${DESDE} where c.id = $1`,
    [id],
  );
  if (!r.rows[0]) throw new AppError("NO_ENCONTRADO");
  return r.rows[0];
}

export const obtenerCliente = (id: string, veCredito: boolean, veSaldo: boolean) => detalleCliente(pool, id, veCredito, veSaldo);

const invalido = (campo: string, mensaje: string) => new AppError("VALIDACION", [{ path: [campo], message: mensaje }]);

async function exigirReferencias(c: pg.PoolClient, d: { zona_id?: string | null; lista_precio_id?: string }) {
  if (d.zona_id != null && !(await c.query("select 1 from app.zona where id = $1", [d.zona_id])).rowCount) throw invalido("zona_id", "No existe");
  if (d.lista_precio_id != null && !(await c.query("select 1 from app.lista_precio where id = $1 and activa", [d.lista_precio_id])).rowCount) throw invalido("lista_precio_id", "No existe");
}

export async function crearCliente(actor: string, veCredito: boolean, d: Record<string, unknown>) {
  return conUsuario(actor, async (c) => {
    await exigirReferencias(c, d as { zona_id?: string | null; lista_precio_id?: string });
    const r = await c.query<{ id: string }>(
      `insert into app.cliente (nombre, tipo_negocio, contacto, telefono_whatsapp, direccion, referencias, notas, zona_id, dias_visita,
                                lista_precio_id, limite_credito, dias_credito, sugerir_pedido, activo)
       values ($1, coalesce($2::text, 'tienda'), $3, $4, $5, $6, $7, $8, coalesce($9::smallint[], '{}'),
               coalesce($10::bigint, (select id from app.lista_precio where es_predeterminada)), coalesce($11::numeric, 0), coalesce($12::integer, 0),
               coalesce($13::boolean, true), coalesce($14::boolean, true)) returning id`,
      [d.nombre, d.tipo_negocio ?? null, d.contacto ?? null, d.telefono_whatsapp ?? null, d.direccion ?? null, d.referencias ?? null, d.notas ?? null,
       d.zona_id ?? null, d.dias_visita ?? null, d.lista_precio_id ?? null, d.limite_credito ?? null, d.dias_credito ?? null, d.sugerir_pedido ?? null, d.activo ?? null],
    );
    return detalleCliente(c, r.rows[0]!.id, veCredito);
  });
}

const COLUMNAS_EDITABLES = new Set(["nombre", "tipo_negocio", "contacto", "telefono_whatsapp", "direccion", "referencias", "notas", "zona_id", "dias_visita",
  "lista_precio_id", "limite_credito", "dias_credito", "sugerir_pedido", "activo"]);

/** `activo` aqui es una decision explicita del personal (C21): ninguna tarea automatica lo toca. */
export async function editarCliente(actor: string, veCredito: boolean, id: string, d: Record<string, unknown>) {
  return conUsuario(actor, async (c) => {
    await detalleCliente(c, id, false);
    await exigirReferencias(c, d as { zona_id?: string | null; lista_precio_id?: string });
    const sets: string[] = [];
    const p: unknown[] = [id];
    for (const [col, v] of Object.entries(d)) {
      if (v === undefined || !COLUMNAS_EDITABLES.has(col)) continue;
      p.push(v);
      sets.push(`${col} = $${p.length}`);
    }
    await c.query(`update app.cliente set ${[...sets, "actualizado_en = now()"].join(", ")} where id = $1`, p);
    return detalleCliente(c, id, veCredito);
  });
}

/* ---------------------------------------------------------------- ubicacion */

export async function fijarUbicacion(
  actor: string, veCredito: boolean, id: string,
  d: { texto: string } | { lat: number; lng: number; fuente: "mapa" | "app" },
  fetchFn?: FetchUbicacion,
) {
  const punto = "texto" in d ? { ...(await resolverUbicacion(d.texto, fetchFn)), fuente: "mapa" as const } : { lat: d.lat.toFixed(6), lng: d.lng.toFixed(6), fuente: d.fuente };
  return conUsuario(actor, async (c) => {
    await c.query("select app.fn_fijar_ubicacion($1::bigint, $2::bigint, $3::numeric, $4::numeric, $5::text)", [actor, id, punto.lat, punto.lng, punto.fuente]);
    return detalleCliente(c, id, veCredito);
  });
}

export async function aceptarUbicacion(actor: string, veCredito: boolean, id: string) {
  return conUsuario(actor, async (c) => {
    await c.query("select app.fn_fijar_ubicacion($1::bigint, $2::bigint, null, null, 'cliente')", [actor, id]);
    return detalleCliente(c, id, veCredito);
  });
}

/* ---------------------------------------------------------------- enlace, dispositivos y PIN (solo acciones del personal: C21) */

/** Genera el enlace. El token en claro nunca sale de aqui: solo dentro del texto del aviso (que lo arma `avisos/servicio`). */
export async function generarEnlace(actor: string, clienteId: string, forzar: boolean) {
  const token = nuevoToken();
  return conUsuario(actor, async (c) => {
    const r = await c.query<{ id: string }>("select app.fn_generar_enlace($1::bigint, $2::bigint, $3::text, $4::bytea, $5::boolean) as id", [
      actor, clienteId, hashToken(token), cifrar(token), forzar,
    ]);
    const a = await c.query<{ id: string }>("select id from app.aviso_cliente where clave = $1", [`wa_enlace_cliente:c${clienteId}:e${r.rows[0]!.id}`]);
    return { aviso: await avisoPorId(c, a.rows[0]!.id) };
  });
}

export async function revocarEnlaces(actor: string, d: { cliente_ids: string[]; motivo: string; nota?: string }) {
  return conUsuario(actor, async (c) => {
    const r = await c.query<{ n: number }>("select app.fn_revocar_enlace($1::bigint, $2::bigint[], $3::text, $4::text) as n", [actor, d.cliente_ids, d.motivo, d.nota ?? null]);
    return { dados_de_baja: r.rows[0]!.n };
  });
}

async function exigirCliente(q: Q, id: string) {
  if (!(await q.query("select 1 from app.cliente where id = $1", [id])).rowCount) throw new AppError("NO_ENCONTRADO");
}

export async function listarDispositivos(clienteId: string) {
  await exigirCliente(pool, clienteId);
  const r = await consulta(
    `select d.id, d.navegador, d.primer_uso_en, d.ultimo_uso_en from app.cliente_dispositivo d
       join app.cliente_enlace e on e.id = d.cliente_enlace_id
      where e.cliente_id = $1 and e.revocado_en is null and d.quitado_en is null order by d.id`,
    [clienteId],
  );
  return r.rows;
}

export async function quitarDispositivo(actor: string, clienteId: string, dispositivoId: string) {
  await conUsuario(actor, async (c) => {
    const d = await c.query(
      `select 1 from app.cliente_dispositivo d join app.cliente_enlace e on e.id = d.cliente_enlace_id where d.id = $1 and e.cliente_id = $2`,
      [dispositivoId, clienteId],
    );
    if (!d.rowCount) throw new AppError("NO_ENCONTRADO");
    await c.query("select app.fn_quitar_dispositivo($1::bigint, $2::bigint)", [actor, dispositivoId]);
  });
}

export async function restablecerPin(actor: string, clienteId: string) {
  await conUsuario(actor, async (c) => {
    await exigirCliente(c, clienteId);
    await c.query("select app.fn_restablecer_pin($1::bigint, $2::bigint)", [actor, clienteId]);
  });
}

/* ---------------------------------------------------------------- zonas */

export async function listarZonas(f: Pagina & { activa?: boolean }) {
  const r = await consulta<{ total: string }>(
    `select id::text as id, nombre, activa, count(*) over() as total from app.zona
      where ($1::boolean is null or activa = $1) order by lower(nombre), id limit $2 offset $3`,
    [f.activa ?? null, f.por_pagina, offset(f)],
  );
  return listadoDeFilas(r.rows, f);
}

export async function crearZona(actor: string, d: { nombre: string; activa?: boolean }) {
  return conUsuario(actor, async (c) => (await c.query("insert into app.zona (nombre, activa) values ($1, coalesce($2::boolean, true)) returning id::text as id, nombre, activa", [d.nombre, d.activa ?? null])).rows[0]);
}

export async function editarZona(actor: string, id: string, d: { nombre?: string; activa?: boolean }) {
  return conUsuario(actor, async (c) => {
    const r = await c.query("update app.zona set nombre = coalesce($2, nombre), activa = coalesce($3, activa) where id = $1 returning id::text as id, nombre, activa", [id, d.nombre ?? null, d.activa ?? null]);
    if (!r.rows[0]) throw new AppError("NO_ENCONTRADO");
    return r.rows[0];
  });
}

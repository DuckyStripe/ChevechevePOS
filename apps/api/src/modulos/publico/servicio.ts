import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type pg from "pg";
import { AppError } from "../../comun/errores.js";
import { hashSolicitud } from "../../comun/idempotencia.js";
import { datosPublicos } from "../../comun/negocio-publico.js";
import type { ClienteEnlace } from "../../comun/permisos.js";
import { conCliente } from "../../comun/transaccion.js";
import { env } from "../../config/env.js";
import { consulta, pool } from "../../db/database.js";
import { resumenNavegador } from "../clientes/navegador.js";

type Q = pg.Pool | pg.PoolClient;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/* ---------------------------------------------------------------- PIN y dispositivos */

const COSTO_BCRYPT = 10;
/** Cada acierto emite un token de dispositivo NUEVO: nunca se reutiliza el de una cookie anterior (un dispositivo quitado o de otro enlace no revive). */
const nuevoDispositivo = () => randomBytes(32).toString("base64url");

export async function elegirPin(c: ClienteEnlace, pin: string, userAgent: string | undefined) {
  const dispositivo = nuevoDispositivo();
  const pinHash = await bcrypt.hash(pin, COSTO_BCRYPT);
  await conCliente(c.cliente_id, (t) =>
    t.query("select app.fn_elegir_pin($1::bigint, $2::text, $3::text, $4::text)", [c.cliente_enlace_id, pinHash, sha256(dispositivo), resumenNavegador(userAgent)]),
  );
  return { dispositivo_token: dispositivo };
}

/**
 * Compara el PIN con bcrypt y deja que SQL cuente fallos y esperas. `fn_entrar_con_pin` DEVUELVE el resultado en vez de lanzar
 * (un fallo lanzado revertiria el contador): se confirma la transaccion primero y despues se traduce a 401/429.
 */
export async function entrarConPin(c: ClienteEnlace, pin: string, ipHash: string, userAgent: string | undefined) {
  const fila = await consulta<{ pin_hash: string | null }>("select pin_hash from app.cliente_enlace where id = $1", [c.cliente_enlace_id]);
  const pinHash = fila.rows[0]?.pin_hash;
  if (!pinHash) throw new AppError("ESTADO_NO_VALIDO", { motivo: "sin_pin" });
  const ok = await bcrypt.compare(pin, pinHash);
  const dispositivo = nuevoDispositivo();
  const r = await conCliente(c.cliente_id, (t) =>
    t.query<{ r: { codigo: string; intentos_restantes?: number; segundos?: number } }>(
      "select app.fn_entrar_con_pin($1::bigint, $2::text, $3::boolean, $4::text, $5::text) as r",
      [c.cliente_enlace_id, ipHash, ok, sha256(dispositivo), resumenNavegador(userAgent)],
    ),
  ); // la transaccion ya se confirmo aqui
  const res = r.rows[0]!.r;
  if (res.codigo === "OK") return { dispositivo_token: dispositivo };
  if (res.codigo === "PIN_EN_ESPERA") throw new AppError("PIN_EN_ESPERA", { segundos: res.segundos });
  throw new AppError("PIN_INCORRECTO", { intentos_restantes: res.intentos_restantes });
}

export const hashIp = (ip: string) => sha256(ip + env.JWT_SECRET);

/* ---------------------------------------------------------------- perfil */

// shortcut: memoria de un proceso con tope; con varias replicas la apertura puede contarse una vez por replica. Pasar a tabla si se escala.
const aperturas = new Map<string, number>();
const MAX_APERTURAS = 5000;
const MEDIA_HORA = 30 * 60_000;

export async function registrarApertura(c: ClienteEnlace, dispositivo: string): Promise<void> {
  const k = `${c.cliente_enlace_id}:${sha256(dispositivo)}`;
  const antes = aperturas.get(k);
  if (antes && Date.now() - antes < MEDIA_HORA) return;
  aperturas.delete(k);
  aperturas.set(k, Date.now());
  if (aperturas.size > MAX_APERTURAS) aperturas.delete(aperturas.keys().next().value!);
  await consulta("select app.fn_registrar_visita($1::bigint, 'apertura')", [c.cliente_id]);
}

export async function perfilCliente(c: ClienteEnlace) {
  const r = await consulta(
    `select c.id::text as id, c.nombre, c.dias_visita, (c.lat is not null) as tiene_ubicacion, app.fn_proxima_visita(c.id)::text as proxima_visita,
            app.fn_config('negocio_nombre') as negocio_nombre, app.fn_config('negocio_whatsapp') as negocio_whatsapp,
            app.fn_config('pedido_minimo') as pedido_minimo, app.fn_config('hora_corte') as hora_corte,
            app.fn_config('faltante_accion_predeterminada') as faltante_accion_predeterminada,
            app.fn_config('faltante_minutos_respuesta')::int as faltante_minutos_respuesta,
            (select texto from app.fn_render_plantilla('pantalla_bienvenida', jsonb_build_object('cliente', c.nombre, 'negocio', app.fn_config('negocio_nombre')))) as bienvenida,
            (select texto from app.fn_render_plantilla('pantalla_aviso_ubicacion', jsonb_build_object('negocio', app.fn_config('negocio_nombre')))) as aviso_ubicacion,
            (select p.id::text from app.pedido p where p.cliente_id = c.id and p.estado = 'propuesto' and p.propuesto_vence_en > now() order by p.id desc limit 1) as propuesto
       from app.cliente c where c.id = $1`,
    [c.cliente_id],
  );
  const f = r.rows[0];
  if (!f) throw new AppError("ENLACE_INVALIDO", await datosPublicos());
  return {
    id: f.id,
    nombre: f.nombre,
    negocio: { nombre: f.negocio_nombre ?? "", whatsapp: f.negocio_whatsapp ?? "" },
    pedido_minimo: f.pedido_minimo,
    hora_corte: f.hora_corte,
    dias_visita: f.dias_visita,
    proxima_visita: f.proxima_visita,
    tiene_ubicacion: f.tiene_ubicacion,
    credito: null as null, // el saldo llega con 008 (F7)
    faltante_accion_predeterminada: f.faltante_accion_predeterminada,
    faltante_minutos_respuesta: f.faltante_minutos_respuesta,
    textos: { bienvenida: f.bienvenida, aviso_ubicacion: f.aviso_ubicacion },
    pedido_propuesto: f.propuesto ? { id: f.propuesto } : null,
  };
}

/* ---------------------------------------------------------------- catalogo */

type Vista = { lineas: { presentacion_id: number | string }[] } & Record<string, unknown>;
/** Los ids de `fn_vista_borrador` salen de jsonb como numero; en las respuestas del enlace viajan como string. */
const vistaConIdsTexto = (v: Vista): Vista => ({ ...v, lineas: v.lineas.map((l) => ({ ...l, presentacion_id: String(l.presentacion_id) })) });

/** Sin existencias ni costos. Una sola respuesta: su hash es la `version` y el ETag. */
export async function catalogoCliente(c: ClienteEnlace) {
  const lista = c.lista_precio_id;
  const art = await consulta(
    `select pz.id::text as presentacion_id, p.nombre as producto, pz.nombre as presentacion, pz.factor, p.categoria_id::text as categoria_id,
            m.nombre as marca, p.contenido_ml, p.tipo_envase,
            case when p.imagen is null then null else regexp_replace(p.imagen, '\\.(jpg|png|webp)$', '-240.\\1') end as miniatura, p.imagen,
            pr.precio::text as precio, (f.cliente_id is not null) as favorito,
            app.fn_normalizar(p.nombre || ' ' || coalesce(m.nombre, '') || ' ' || array_to_string(p.alias, ' ')) as buscar,
            case when o.precio is not null and o.precio < base.precio then json_build_object('precio_normal', base.precio::text, 'hasta', o.hasta::text) end as oferta
       from app.presentacion pz
       join app.producto p on p.id = pz.producto_id and p.activo
       join app.categoria ca on ca.id = p.categoria_id and ca.activa
       left join app.marca m on m.id = p.marca_id
       left join app.cliente_favorito f on f.cliente_id = $1 and f.presentacion_id = pz.id
       cross join lateral (select app.fn_precio(pz.id, $2::bigint) as precio) pr
       cross join lateral (select coalesce(
           (select x.precio from app.precio x where x.presentacion_id = pz.id and x.lista_precio_id = $2::bigint),
           (select x.precio from app.precio x join app.lista_precio l on l.id = x.lista_precio_id and l.es_predeterminada where x.presentacion_id = pz.id)) as precio) base
       left join lateral (select oo.precio, oo.hasta from app.precio_oferta oo
                           where oo.presentacion_id = pz.id and (oo.lista_precio_id = $2::bigint or oo.lista_precio_id is null)
                             and app.fn_fecha_local(now()) between oo.desde and oo.hasta order by oo.precio, oo.hasta desc limit 1) o on true
      where pz.activa and pz.se_vende and pr.precio is not null
      order by (o.precio is not null and o.precio < base.precio) desc, p.nombre, pz.factor, pz.id`,
    [c.cliente_id, lista],
  );
  const catIds = [...new Set(art.rows.map((a) => a.categoria_id as string))];
  const cats = catIds.length
    ? (await consulta("select id::text as id, nombre from app.categoria where id = any($1::bigint[]) order by orden, nombre, id", [catIds])).rows
    : [];
  const frec = await consulta("select presentacion_id::text as presentacion_id, ultima_cantidad from app.fn_frecuentes($1, 12)", [c.cliente_id]);

  const ult = await consulta<{ folio: string; fecha: string; lineas: { presentacion_id: string; cantidad: number }[] }>(
    `select p.folio, app.fn_fecha_local(p.creado_en)::text as fecha,
            (select coalesce(json_agg(json_build_object('presentacion_id', l.presentacion_id::text, 'cantidad', coalesce(l.cantidad_entregada, l.cantidad)) order by l.numero), '[]'::json)
               from app.pedido_linea l where l.pedido_id = p.id and l.estado = 'activa' and coalesce(l.cantidad_entregada, l.cantidad) > 0) as lineas
       from app.pedido p where p.cliente_id = $1 and p.estado not in ('propuesto','cancelado') order by p.creado_en desc, p.id desc limit 1`,
    [c.cliente_id],
  );
  let ultimo_pedido: { folio: string; fecha: string; vista: unknown } | null = null;
  if (ult.rows[0] && ult.rows[0].lineas.length) {
    const v = await consulta<{ v: unknown }>("select app.fn_vista_borrador($1::bigint, $2::jsonb) as v", [c.cliente_id, JSON.stringify(ult.rows[0].lineas)]);
    ultimo_pedido = { folio: ult.rows[0].folio, fecha: ult.rows[0].fecha, vista: vistaConIdsTexto(v.rows[0]!.v as Vista) };
  }

  const cuerpo = { categorias: cats, articulos: art.rows, frecuentes: frec.rows, ultimo_pedido };
  const version = sha256(JSON.stringify(cuerpo));
  return { cuerpo: { ...cuerpo, version }, version };
}

export async function ponerFavorito(c: ClienteEnlace, presentacionId: string, poner: boolean): Promise<void> {
  const ok = await consulta("select 1 from app.presentacion pz join app.producto p on p.id = pz.producto_id where pz.id = $1 and pz.activa and pz.se_vende and p.activo", [presentacionId]);
  if (!ok.rowCount) throw new AppError("NO_ENCONTRADO");
  if (poner) await consulta("insert into app.cliente_favorito (cliente_id, presentacion_id) values ($1, $2) on conflict do nothing", [c.cliente_id, presentacionId]);
  else await consulta("delete from app.cliente_favorito where cliente_id = $1 and presentacion_id = $2", [c.cliente_id, presentacionId]);
}

/* ---------------------------------------------------------------- pedidos */

export async function listarPedidosCliente(c: ClienteEnlace) {
  const r = await consulta(
    `select p.id::text as id, p.folio, app.fn_etapa_pedido(p.id) as etapa, pl.texto as etiqueta, p.total::text as total, p.fecha_entrega::text as fecha_entrega, p.creado_en,
            (p.estado = 'recibido') as editable,
            (select count(*)::int from app.propuesta_faltante f join app.pedido_linea l on l.id = f.pedido_linea_id where l.pedido_id = p.id and f.estado = 'pendiente') as faltantes_pendientes,
            (app.fn_reparto_pedido(p.id) - 'antes_que_tu' - 'llegada_estimada_desde' - 'llegada_estimada_hasta') as reparto
       from app.pedido p left join app.plantilla pl on pl.clave = 'estado_' || app.fn_etapa_pedido(p.id)
      where p.cliente_id = $1 and p.estado <> 'propuesto'
      order by (p.estado in ('entregado','cancelado','no_entregado')), p.creado_en desc, p.id desc limit 20`,
    [c.cliente_id],
  );
  return { items: r.rows, total: r.rows.length, pagina: 1, por_pagina: 20 };
}

interface SeguimientoSql {
  lineas: Record<string, unknown>[];
  faltantes: { propuesta_id: number; opciones: { id: number }[] }[];
  linea_tiempo: { etapa: string }[];
  borrador?: unknown;
  [k: string]: unknown;
}

/** `fn_seguimiento_pedido` + lo que la pantalla necesita y SQL no da: id del pedido, `id` y `presentacion_id` de cada linea, etiquetas de la linea de tiempo e ids como string. */
export async function seguimiento(q: Q, clienteId: string, pedidoId: string) {
  const r = await q.query<{ s: SeguimientoSql }>("select app.fn_seguimiento_pedido($1::bigint, $2::bigint) as s", [clienteId, pedidoId]);
  const s = r.rows[0]!.s;
  const ids = await q.query<{ id: string; presentacion_id: string }>("select id::text as id, presentacion_id::text as presentacion_id from app.pedido_linea where pedido_id = $1 order by numero", [pedidoId]);
  const et = await q.query<{ clave: string; texto: string }>("select clave, texto from app.plantilla where clave like 'estado\\_%'");
  const etiquetas = new Map(et.rows.map((x) => [x.clave, x.texto]));
  return {
    id: pedidoId,
    ...s,
    lineas: s.lineas.map((l, i) => ({ id: ids.rows[i]?.id, presentacion_id: ids.rows[i]?.presentacion_id, ...l })),
    faltantes: s.faltantes.map((f) => ({ ...f, propuesta_id: String(f.propuesta_id), opciones: f.opciones.map((o) => ({ ...o, id: String(o.id) })) })),
    linea_tiempo: s.linea_tiempo.map((t) => ({ ...t, etiqueta: etiquetas.get(`estado_${t.etapa}`) ?? "" })),
    ...(s.borrador ? { borrador: vistaConIdsTexto(s.borrador as Vista) } : {}),
  };
}

export const seguimientoCliente = (c: ClienteEnlace, pedidoId: string) => seguimiento(pool, c.cliente_id, pedidoId);

async function resumenPedido(q: Q, pedidoId: string) {
  const r = await q.query(
    "select id::text as id, folio, total::text as total, estado, version, fecha_entrega::text as fecha_entrega, (estado = 'recibido') as editable from app.pedido where id = $1",
    [pedidoId],
  );
  return r.rows[0]!;
}

const soloDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export async function crearPedidoCliente(c: ClienteEnlace, d: Record<string, unknown>) {
  const hash = hashSolicitud(d);
  const { pedido, repetida } = await conCliente(c.cliente_id, async (t) => {
    const r = await t.query<{ pedido_id: string; repetida: boolean }>("select pedido_id, repetida from app.fn_registrar_pedido($1::bigint, null, $2::jsonb, $3::text)", [
      c.cliente_id, JSON.stringify(d), hash,
    ]);
    return { pedido: await resumenPedido(t, r.rows[0]!.pedido_id), repetida: r.rows[0]!.repetida };
  });
  const t = await consulta<{ confirmacion: string; aviso: string; whatsapp: string | null }>(
    `select (select texto from app.fn_render_plantilla('pantalla_pedido_enviado', jsonb_build_object('cliente', c.nombre, 'folio', $2::text, 'negocio', app.fn_config('negocio_nombre'), 'limite', app.fn_config('hora_corte')))) as confirmacion,
            (select texto from app.fn_render_plantilla('wa_cliente_avisa_pedido', jsonb_build_object('cliente', c.nombre, 'folio', $2::text))) as aviso,
            app.fn_config('negocio_whatsapp') as whatsapp
       from app.cliente c where c.id = $1`,
    [c.cliente_id, pedido.folio],
  );
  const f = t.rows[0]!;
  const wa = soloDigitos(f.whatsapp);
  return {
    repetida,
    cuerpo: {
      id: pedido.id,
      folio: pedido.folio,
      total: pedido.total,
      estado: pedido.estado,
      texto_confirmacion: f.confirmacion,
      avisar_negocio: wa ? { url: `https://wa.me/${wa}?text=${encodeURIComponent(f.aviso)}` } : null,
    },
  };
}

export async function editarPedidoCliente(c: ClienteEnlace, pedidoId: string, d: Record<string, unknown>) {
  return conCliente(c.cliente_id, async (t) => {
    await t.query("select app.fn_editar_pedido_cliente($1::bigint, $2::bigint, $3::jsonb)", [c.cliente_id, pedidoId, JSON.stringify(d)]);
    return resumenPedido(t, pedidoId);
  });
}

export async function cancelarPedidoCliente(c: ClienteEnlace, pedidoId: string, motivo: string | undefined) {
  return conCliente(c.cliente_id, async (t) => {
    await t.query("select app.fn_cancelar_pedido_cliente($1::bigint, $2::bigint, $3::text)", [c.cliente_id, pedidoId, motivo ?? null]);
    return resumenPedido(t, pedidoId);
  });
}

export async function aceptarPropuesto(c: ClienteEnlace, pedidoId: string, totalVisto: string) {
  return conCliente(c.cliente_id, async (t) => {
    await t.query("select app.fn_aceptar_propuesto($1::bigint, $2::bigint, $3::numeric)", [c.cliente_id, pedidoId, totalVisto]);
    return seguimiento(t, c.cliente_id, pedidoId);
  });
}

export async function responderFaltanteCliente(c: ClienteEnlace, propuestaId: string, opcionId: string | null) {
  return conCliente(c.cliente_id, async (t) => {
    const r = await t.query<{ r: { pedido: { id: number } } }>("select app.fn_responder_faltante($1::bigint, null, $2::bigint, $3::bigint) as r", [c.cliente_id, propuestaId, opcionId]);
    return seguimiento(t, c.cliente_id, String(r.rows[0]!.r.pedido.id));
  });
}

export async function proponerUbicacion(c: ClienteEnlace, lat: number, lng: number): Promise<void> {
  await conCliente(c.cliente_id, (t) => t.query("select app.fn_proponer_ubicacion($1::bigint, $2::numeric, $3::numeric)", [c.cliente_id, lat.toFixed(6), lng.toFixed(6)]));
}

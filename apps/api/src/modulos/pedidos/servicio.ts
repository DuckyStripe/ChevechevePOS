import type pg from "pg";
import { AppError } from "../../comun/errores.js";
import { hashSolicitud } from "../../comun/idempotencia.js";
import { listado, offset, type Pagina } from "../../comun/paginacion.js";
import { conUsuario } from "../../comun/transaccion.js";
import { consulta, pool } from "../../db/database.js";
import { avisoDePedido } from "../avisos/servicio.js";
import { interpretarMensaje } from "./interpretar.js";

type Q = pg.Pool | pg.PoolClient;

/** Forma `PedidoFila` (CONTRATOS §4.4). `requiere_surtido` es false hasta F5 (lista de surtido). `ruta` llega con F6. */
const FILA = `p.id, p.folio,
  json_build_object('id', c.id::text, 'nombre', c.nombre) as cliente,
  case when z.id is null then null else json_build_object('id', z.id::text, 'nombre', z.nombre) end as zona,
  p.origen, p.estado, p.entrega_tipo, p.fecha_solicitada::text as fecha_solicitada, p.fecha_entrega::text as fecha_entrega,
  p.total, (select count(*)::int from app.pedido_linea l where l.pedido_id = p.id and l.estado in ('activa','faltante')) as num_lineas,
  false as requiere_surtido,
  (select count(*)::int from app.propuesta_faltante f join app.pedido_linea l on l.id = f.pedido_linea_id
    where l.pedido_id = p.id and f.estado = 'pendiente') as faltantes_pendientes,
  p.creado_en, p.version`;
const DESDE = `from app.pedido p join app.cliente c on c.id = p.cliente_id left join app.zona z on z.id = c.zona_id`;

export interface FiltrosPedidos extends Pagina {
  estado?: string; fecha_entrega?: string; desde?: string; hasta?: string; cliente_id?: string; zona_id?: string;
  ruta_id?: string; sin_ruta?: boolean; origen?: string;
}

export async function listarPedidos(sucursal: string, f: FiltrosPedidos) {
  const p: unknown[] = [sucursal];
  const arg = (v: unknown) => (p.push(v), `$${p.length}`);
  const donde = ["p.sucursal_id = $1"];
  // Un propuesto («lo de siempre» sin aceptar) no es un pedido: solo sale si se pide ese estado.
  if (f.estado) donde.push(`p.estado = ${arg(f.estado)}`);
  else donde.push("p.estado <> 'propuesto'");
  if (f.fecha_entrega) donde.push(`p.fecha_entrega = ${arg(f.fecha_entrega)}::date`);
  if (f.desde) donde.push(`app.fn_fecha_local(p.creado_en) >= ${arg(f.desde)}::date`);
  if (f.hasta) donde.push(`app.fn_fecha_local(p.creado_en) <= ${arg(f.hasta)}::date`);
  if (f.cliente_id) donde.push(`p.cliente_id = ${arg(f.cliente_id)}`);
  if (f.zona_id) donde.push(`c.zona_id = ${arg(f.zona_id)}`);
  if (f.ruta_id) donde.push(`p.ruta_id = ${arg(f.ruta_id)}`);
  if (f.sin_ruta !== undefined) donde.push(f.sin_ruta ? "p.ruta_id is null" : "p.ruta_id is not null");
  if (f.origen) donde.push(`p.origen = ${arg(f.origen)}`);
  const limite = arg(f.por_pagina);
  const desplazo = arg(offset(f));
  // Con un estado filtrado: lo mas viejo primero (el que lleva mas esperando); sin estado: lo mas nuevo primero.
  const orden = f.estado ? "p.fecha_entrega asc nulls first, p.creado_en asc, p.id asc" : "p.creado_en desc, p.id desc";
  // `total` del pedido choca con el `total` del conteo: el conteo se llama `total_filas`.
  const r = await consulta<{ total_filas: string }>(
    `select ${FILA}, count(*) over() as total_filas ${DESDE} where ${donde.join(" and ")} order by ${orden} limit ${limite} offset ${desplazo}`,
    p,
  );
  const items = r.rows.map((fila) => {
    const copia: Partial<typeof fila> = { ...fila };
    delete copia.total_filas;
    return copia;
  });
  return listado(items, r.rows[0]?.total_filas ?? 0, f);
}

/** `PedidoDetalle`: fila + notas + lineas (con disponible) + eventos + propuestas (con opciones) + cliente. */
export async function detallePedido(q: Q, id: string) {
  const r = await q.query(
    `select ${FILA}, p.notas, p.notas_internas, p.respuesta_limite_en,
            json_build_object('id', c.id::text, 'nombre', c.nombre, 'telefono_whatsapp', c.telefono_whatsapp) as cliente_detalle
       ${DESDE} where p.id = $1`,
    [id],
  );
  const base = r.rows[0];
  if (!base) throw new AppError("NO_ENCONTRADO");
  const { cliente_detalle, ...resto } = base;
  const lineas = await q.query(
      `select l.id, l.numero, l.presentacion_id::text as presentacion_id, pr.nombre as producto, pz.nombre as presentacion, l.factor,
              l.cantidad_pedida, l.cantidad, l.precio_unitario, l.importe, l.estado, l.motivo_ajuste,
              coalesce(d.disponible, 0) as disponible_piezas
         from app.pedido_linea l
         join app.presentacion pz on pz.id = l.presentacion_id
         join app.producto pr on pr.id = l.producto_id
         left join app.v_disponible d on d.producto_id = l.producto_id and d.sucursal_id = (select sucursal_id from app.pedido where id = l.pedido_id)
        where l.pedido_id = $1 order by l.numero`,
      [id],
    );
  const eventos = await q.query(
      `select e.id, e.tipo, e.detalle, e.publico,
              case when u.id is null then null else json_build_object('id', u.id::text, 'nombre', u.nombre) end as usuario, e.creado_en
         from app.pedido_evento e left join app.usuario u on u.id = e.usuario_id where e.pedido_id = $1 order by e.id`,
      [id],
    );
  const propuestas = await q.query(
      `select f.id, f.pedido_linea_id::text as pedido_linea_id, f.estado, f.causa, f.nota, f.limite_en, f.opcion_elegida_id::text as opcion_elegida_id,
              coalesce((select json_agg(json_build_object('id', o.id::text, 'tipo', o.tipo, 'producto', pr.nombre, 'presentacion', pz.nombre,
                          'imagen', pr.imagen, 'cantidad', o.cantidad, 'precio_unitario', o.precio_unitario::text, 'importe', o.importe::text)
                          order by o.orden, o.id)
                 from app.propuesta_opcion o join app.presentacion pz on pz.id = o.presentacion_id join app.producto pr on pr.id = pz.producto_id
                where o.propuesta_id = f.id), '[]'::json) as opciones
         from app.propuesta_faltante f join app.pedido_linea l on l.id = f.pedido_linea_id where l.pedido_id = $1 order by f.id`,
      [id],
    );
  return { ...resto, cliente: cliente_detalle, lineas: lineas.rows, eventos: eventos.rows, propuestas: propuestas.rows };
}

export const obtenerPedido = (id: string) => detallePedido(pool, id);

export async function registrarPedido(actor: string, d: Record<string, unknown>) {
  const hash = hashSolicitud(d);
  return conUsuario(actor, async (c) => {
    const r = await c.query<{ pedido_id: string; repetida: boolean }>("select pedido_id, repetida from app.fn_registrar_pedido(null, $1::bigint, $2::jsonb, $3::text)", [
      actor, JSON.stringify(d), hash,
    ]);
    const { pedido_id, repetida } = r.rows[0]!;
    return { pedido: await detallePedido(c, pedido_id), repetida };
  });
}

export async function confirmarPedido(actor: string, id: string, d: Record<string, unknown> & { notas_internas?: string }) {
  const { notas_internas, ...datos } = d;
  return conUsuario(actor, async (c) => {
    const r = await c.query<{ r: { advertencias: unknown[] } }>("select app.fn_confirmar_pedido($1::bigint, $2::bigint, $3::jsonb) as r", [actor, id, JSON.stringify(datos)]);
    if (notas_internas) await c.query("update app.pedido set notas_internas = $2 where id = $1", [id, notas_internas]);
    return { pedido: await detallePedido(c, id), advertencias: r.rows[0]!.r.advertencias };
  });
}

export async function ajustarPedido(actor: string, id: string, d: Record<string, unknown>) {
  return conUsuario(actor, async (c) => {
    const r = await c.query<{ r: { advertencias: unknown[] } }>("select app.fn_ajustar_pedido($1::bigint, $2::bigint, $3::jsonb) as r", [actor, id, JSON.stringify(d)]);
    return { pedido: await detallePedido(c, id), advertencias: r.rows[0]!.r.advertencias, aviso: await avisoDePedido(c, id, "wa_pedido_ajustado") };
  });
}

export async function proponerFaltantes(actor: string, id: string, d: Record<string, unknown>) {
  return conUsuario(actor, async (c) => {
    await c.query("select app.fn_proponer_faltantes($1::bigint, $2::bigint, $3::jsonb)", [actor, id, JSON.stringify(d)]);
    return { pedido: await detallePedido(c, id), aviso: await avisoDePedido(c, id, "wa_pedido_faltante") };
  });
}

async function pedidoDePropuesta(c: pg.PoolClient, propuestaId: string): Promise<string> {
  const r = await c.query<{ pedido_id: string }>("select l.pedido_id from app.propuesta_faltante f join app.pedido_linea l on l.id = f.pedido_linea_id where f.id = $1", [propuestaId]);
  if (!r.rows[0]) throw new AppError("NO_ENCONTRADO");
  return r.rows[0].pedido_id;
}

/** El personal responde por el cliente (llamada). */
export async function responderPorCliente(actor: string, propuestaId: string, opcionId: string | null) {
  return conUsuario(actor, async (c) => {
    const pid = await pedidoDePropuesta(c, propuestaId);
    await c.query("select app.fn_responder_faltante(null::bigint, $1::bigint, $2::bigint, $3::bigint)", [actor, propuestaId, opcionId]);
    return detallePedido(c, pid);
  });
}

export async function cancelarPropuesta(actor: string, propuestaId: string) {
  return conUsuario(actor, async (c) => {
    const pid = await pedidoDePropuesta(c, propuestaId);
    await c.query("select app.fn_cancelar_faltante($1::bigint, $2::bigint)", [actor, propuestaId]);
    return detallePedido(c, pid);
  });
}

export async function cancelarPedido(actor: string, id: string, motivo: string) {
  return conUsuario(actor, async (c) => {
    await c.query("select app.fn_cancelar_pedido($1::bigint, $2::bigint, $3::text)", [actor, id, motivo]);
    return detallePedido(c, id);
  });
}

export async function reprogramarPedido(actor: string, id: string, fecha: string) {
  return conUsuario(actor, async (c) => {
    await c.query("select app.fn_reprogramar_pedido($1::bigint, $2::bigint, $3::date)", [actor, id, fecha]);
    return detallePedido(c, id);
  });
}

/** `GET /pedidos/:id/sugerencias`: equivalentes vendibles de la linea, mismo factor primero; el personal elige. */
export async function sugerenciasDeLinea(pedidoId: string, lineaId: string) {
  const ok = await consulta("select 1 from app.pedido_linea where id = $1 and pedido_id = $2", [lineaId, pedidoId]);
  if (!ok.rowCount) throw new AppError("NO_ENCONTRADO");
  const r = await consulta(
    `select s.presentacion_id::text as presentacion_id, s.producto, s.presentacion, s.factor, s.precio_unitario as precio,
            s.disponible_piezas, p.imagen
       from (select x.*, row_number() over () as n from app.fn_sugerencias_linea($1) x) s
       join app.producto p on p.id = s.producto_id order by s.n`,
    [lineaId],
  );
  return r.rows;
}

export async function interpretar(clienteId: string, texto: string) {
  const c = await consulta("select 1 from app.cliente where id = $1", [clienteId]);
  if (!c.rowCount) throw new AppError("NO_ENCONTRADO");
  return interpretarMensaje(pool, clienteId, texto);
}

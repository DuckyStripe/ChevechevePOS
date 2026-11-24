import type pg from "pg";
import { AppError } from "../../comun/errores.js";
import { hashSolicitud } from "../../comun/idempotencia.js";
import { listadoDeFilas, offset, type Pagina } from "../../comun/paginacion.js";
import type { UsuarioSesion } from "../../comun/permisos.js";
import { conUsuario } from "../../comun/transaccion.js";
import { consulta } from "../../db/database.js";

type Q = pg.Pool | pg.PoolClient;

const verTodas = (u: UsuarioSesion) => u.permisos.includes("ventas.ver_todas");
const veCostos = (u: UsuarioSesion) => u.permisos.includes("costos.ver");

const FILA = `v.id::text as id, v.folio, v.creado_en, v.origen, v.estado, v.total::text as total,
  case when c.id is null then null else json_build_object('id', c.id::text, 'nombre', c.nombre) end as cliente,
  json_build_object('id', u.id::text, 'nombre', u.nombre) as usuario`;
const DESDE = "from app.venta v left join app.cliente c on c.id = v.cliente_id join app.usuario u on u.id = v.usuario_id";

export async function listarVentas(u: UsuarioSesion, f: Pagina & { desde?: string; hasta?: string; usuario_id?: string; cliente_id?: string; origen?: string; estado?: string; folio?: string }) {
  const p: unknown[] = [u.sucursal_id];
  const arg = (v: unknown) => (p.push(v), `$${p.length}`);
  const donde = ["v.sucursal_id = $1"];
  if (!verTodas(u)) donde.push(`v.usuario_id = ${arg(u.id)}`);
  if (f.usuario_id) donde.push(`v.usuario_id = ${arg(f.usuario_id)}`);
  if (f.cliente_id) donde.push(`v.cliente_id = ${arg(f.cliente_id)}`);
  if (f.origen) donde.push(`v.origen = ${arg(f.origen)}`);
  if (f.estado) donde.push(`v.estado = ${arg(f.estado)}`);
  if (f.folio) donde.push(`v.folio = upper(${arg(f.folio)})`);
  if (f.desde) donde.push(`v.creado_en >= app.fn_inicio_dia(${arg(f.desde)}::date)`);
  if (f.hasta) donde.push(`v.creado_en < app.fn_inicio_dia(${arg(f.hasta)}::date + 1)`);
  const limite = arg(f.por_pagina);
  const desplazo = arg(offset(f));
  const r = await consulta<{ total: string }>(`select ${FILA}, count(*) over() as total ${DESDE} where ${donde.join(" and ")} order by v.creado_en desc, v.id desc limit ${limite} offset ${desplazo}`, p);
  return listadoDeFilas(r.rows, f);
}

/** Venta de la sucursal; sin `ventas.ver_todas`, solo las propias (ajena = 404). */
async function ventaVisible(q: Q, u: UsuarioSesion, id: string): Promise<void> {
  const r = await q.query<{ usuario_id: string }>("select usuario_id::text as usuario_id from app.venta where id = $1 and sucursal_id = $2", [id, u.sucursal_id]);
  if (!r.rows[0] || (!verTodas(u) && r.rows[0].usuario_id !== u.id)) throw new AppError("NO_ENCONTRADO");
}

const PAGOS = `coalesce((select json_agg(json_build_object('metodo', p.metodo, 'monto', p.monto::text, 'referencia', p.referencia, 'comprobante', p.comprobante,
  'verificado', p.verificado_en is not null) order by p.id) from app.venta_pago p where p.venta_id = v.id), '[]'::json)`;

export async function detalleVenta(q: Q, u: UsuarioSesion, id: string) {
  await ventaVisible(q, u, id);
  const costos = veCostos(u);
  const r = await q.query(
    `select ${FILA}, v.pedido_id::text as pedido_id, v.turno_caja_id::text as turno_id, v.efectivo_recibido::text as efectivo_recibido, v.cambio::text as cambio, v.notas,
            v.motivo_cancelacion, v.cancelada_en, ${PAGOS} as pagos,
            coalesce((select json_agg(json_build_object('id', l.id::text, 'cantidad', l.cantidad, 'presentacion', pz.nombre, 'producto', pr.nombre,
                        'precio_unitario', l.precio_unitario::text, 'importe', l.importe::text, 'piezas', l.piezas, 'piezas_devueltas', l.piezas_devueltas
                        ${costos ? ", 'costo_total', l.costo_total::text" : ""}) order by l.numero)
                        from app.venta_linea l join app.presentacion pz on pz.id = l.presentacion_id join app.producto pr on pr.id = l.producto_id where l.venta_id = v.id), '[]'::json) as lineas,
            coalesce((select json_agg(json_build_object('id', d.id::text, 'folio', d.folio, 'total', d.total::text, 'creado_en', d.creado_en) order by d.id)
                        from app.devolucion d where d.venta_id = v.id), '[]'::json) as devoluciones
            ${costos ? ", (select (sum(l.importe) - sum(l.costo_total))::text from app.venta_linea l where l.venta_id = v.id) as utilidad" : ""}
       ${DESDE} where v.id = $1`,
    [id],
  );
  return r.rows[0];
}

export async function ticketVenta(q: Q, u: UsuarioSesion, id: string) {
  await ventaVisible(q, u, id);
  const r = await q.query(
    `select v.id::text as venta_id, v.folio, v.creado_en as fecha, v.estado,
            json_build_object('nombre', app.fn_config('negocio_nombre'), 'direccion', app.fn_config('negocio_direccion'),
                              'telefono', app.fn_config('negocio_telefono'), 'pie', app.fn_config('ticket_pie')) as negocio,
            json_build_object('id', u.id::text, 'nombre', u.nombre) as usuario,
            case when c.id is null then null else json_build_object('id', c.id::text, 'nombre', c.nombre) end as cliente,
            coalesce((select json_agg(json_build_object('cantidad', l.cantidad, 'presentacion', pz.nombre, 'producto', pr.nombre,
                        'precio_unitario', l.precio_unitario::text, 'importe', l.importe::text) order by l.numero)
                        from app.venta_linea l join app.presentacion pz on pz.id = l.presentacion_id join app.producto pr on pr.id = l.producto_id where l.venta_id = v.id), '[]'::json) as lineas,
            v.total::text as total,
            coalesce((select json_agg(json_build_object('metodo', p.metodo, 'monto', p.monto::text, 'referencia', p.referencia) order by p.id)
                        from app.venta_pago p where p.venta_id = v.id), '[]'::json) as pagos,
            v.efectivo_recibido::text as efectivo_recibido, v.cambio::text as cambio,
            (select s.saldo::text from app.v_saldo_cliente s where s.cliente_id = v.cliente_id) as saldo_credito
       ${DESDE} where v.id = $1`,
    [id],
  );
  return r.rows[0];
}

export async function crearVenta(u: UsuarioSesion, d: Record<string, unknown>) {
  const hash = hashSolicitud(d);
  return conUsuario(u.id, async (c) => {
    const r = await c.query<{ venta_id: string; repetida: boolean }>("select venta_id::text as venta_id, repetida from app.fn_registrar_venta($1::bigint, $2::jsonb, $3)", [u.id, JSON.stringify(d), hash]);
    return { ticket: await ticketVenta(c, u, r.rows[0]!.venta_id), repetida: r.rows[0]!.repetida };
  });
}

export async function cancelarVenta(u: UsuarioSesion, id: string, motivo: string) {
  return conUsuario(u.id, async (c) => {
    const r = await c.query<{ r: { reembolso_efectivo: string; reembolso_otros: string } }>("select app.fn_cancelar_venta($1::bigint, $2::bigint, $3) as r", [u.id, id, motivo]);
    const v = await c.query("select id::text as id, folio, estado, cancelada_en from app.venta where id = $1", [id]);
    return { venta: v.rows[0], ...r.rows[0]!.r };
  });
}

export async function devolverVenta(u: UsuarioSesion, id: string, d: Record<string, unknown>) {
  const hash = hashSolicitud({ ...d, venta_id: id });
  return conUsuario(u.id, async (c) => {
    await ventaVisible(c, u, id); // una venta que no ve es 404, igual que al consultarla (SQL lo vuelve a exigir)
    const r = await c.query<{ devolucion_id: string; repetida: boolean }>("select devolucion_id::text as devolucion_id, repetida from app.fn_registrar_devolucion($1::bigint, $2::bigint, $3::jsonb, $4)", [u.id, id, JSON.stringify(d), hash]);
    const f = await c.query("select id::text as id, folio, total::text as total, abono_credito::text as abono_credito, reembolso_efectivo::text as reembolso_efectivo, creado_en from app.devolucion where id = $1", [r.rows[0]!.devolucion_id]);
    return { devolucion: f.rows[0], repetida: r.rows[0]!.repetida };
  });
}


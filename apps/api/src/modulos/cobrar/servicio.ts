import { AppError } from "../../comun/errores.js";
import type { UsuarioSesion } from "../../comun/permisos.js";
import { consulta } from "../../db/database.js";

const CLIENTE = `json_build_object('id', c.id::text, 'nombre', c.nombre, 'saldo', s.saldo::text, 'vencido', s.vencido::text, 'disponible', s.disponible::text,
    'limite', s.limite_credito::text, 'dias_credito', c.dias_credito, 'cuentas_pendientes', s.cuentas_pendientes,
    'semaforo', json_build_object('color', k.color, 'dias_promedio_pago', k.dias_promedio_pago::text, 'max_dias_vencido', k.max_dias_vencido, 'limite_sugerido', k.limite_sugerido::text))`;
const DESDE_CLIENTE = `from app.cliente c join app.v_saldo_cliente s on s.cliente_id = c.id join app.v_semaforo_cliente k on k.cliente_id = c.id`;

async function turnoDe(u: UsuarioSesion) {
  const r = await consulta("select id::text as id, tipo, caja_id::text as caja_id, ruta_id::text as ruta_id from app.turno_caja where usuario_id = $1 and estado = 'abierto'", [u.id]);
  return r.rows[0] ?? null;
}

/** Metodos que esta persona puede usar (la lista de la pantalla; SQL decide al guardar). */
const metodos = (u: UsuarioSesion, abono: boolean): string[] => [
  "efectivo", "transferencia", "tarjeta", ...(!abono && u.permisos.includes("ventas.credito") ? ["credito"] : []),
];

/**
 * `GET /cobrar/contexto`: una sola lectura para `/cobrar`. Con `pedido`: lo que hace falta para entregar y cobrar (misma regla de quien puede
 * cobrarlo que la entrega: `fn_pedido_cobrable`). Con `cliente`: lo que debe y sus cuentas para abonar (`fn_puede_ver_cuenta`).
 */
export async function contexto(u: UsuarioSesion, q: { pedido?: string; cliente?: string; parada?: string }) {
  if (q.pedido) {
    await consulta("select id from app.fn_pedido_cobrable($1::bigint, $2::bigint)", [u.id, q.pedido]);
    const p = await consulta(
      `select p.id::text as id, p.folio, p.estado, p.entrega_tipo, p.total::text as total, p.ruta_id::text as ruta_id,
              ${CLIENTE} as cliente,
              (p.ruta_id is not null and p.estado = 'en_ruta') or (p.ruta_id is null and p.entrega_tipo = 'recoge' and p.estado = 'confirmado') as entregable,
              coalesce((select json_agg(json_build_object('id', l.id::text, 'producto', pr.nombre, 'presentacion', pz.nombre, 'cantidad', l.cantidad,
                          'precio_unitario', l.precio_unitario::text, 'importe', l.importe::text) order by l.numero)
                          from app.pedido_linea l join app.presentacion pz on pz.id = l.presentacion_id join app.producto pr on pr.id = l.producto_id
                         where l.pedido_id = p.id and l.estado = 'activa' and l.cantidad > 0), '[]'::json) as lineas,
              case when p.ruta_id is not null then (select json_build_object('producto', g.r #>> '{regalo,producto}', 'presentacion', g.r #>> '{regalo,presentacion}', 'cantidad', 1)
                      from (select app.fn_lealtad_cliente(p.cliente_id) as r) g where (g.r ->> 'premio')::boolean) end as regalo_pendiente
         from app.pedido p ${DESDE_CLIENTE.replace("from app.cliente c", "join app.cliente c on c.id = p.cliente_id")}
        where p.id = $1`,
      [q.pedido],
    );
    const f = p.rows[0]!;
    const { id, folio, estado, entrega_tipo, total, ruta_id, entregable, cliente, lineas, regalo_pendiente } = f;
    return { modo: "entrega", pedido: { id, folio, estado, entrega_tipo, total, ruta_id, entregable }, cliente, lineas, regalo_pendiente, turno: await turnoDe(u), metodos: metodos(u, false) };
  }
  const cliente = q.cliente!;
  if (!u.permisos.includes("cobranza.abonar")) throw new AppError("SIN_PERMISO", { permiso: "cobranza.abonar" });
  const ok = await consulta<{ ok: boolean }>("select app.fn_puede_ver_cuenta($1::bigint, $2::bigint) as ok", [u.id, cliente]);
  if (!ok.rows[0]!.ok) throw new AppError("NO_ENCONTRADO");
  const c = await consulta(
    `select ${CLIENTE} as cliente,
            coalesce((select json_agg(json_build_object('id', x.id::text, 'venta_folio', v.folio, 'concepto', x.concepto, 'vence_el', x.vence_el::text, 'saldo', x.saldo::text,
                        'dias_vencida', greatest(0, app.fn_fecha_local(now()) - x.vence_el)) order by x.vence_el, x.id)
                        from app.cuenta_por_cobrar x left join app.venta v on v.id = x.venta_id where x.cliente_id = c.id and x.estado = 'pendiente'), '[]'::json) as cuentas
       ${DESDE_CLIENTE} where c.id = $1`,
    [cliente],
  );
  if (!c.rows[0]) throw new AppError("NO_ENCONTRADO");
  let parada: { id: string; ruta_id: string } | null = null;
  if (q.parada) {
    const r = await consulta<{ id: string; ruta_id: string }>(
      `select pa.id::text as id, pa.ruta_id::text as ruta_id from app.ruta_parada pa join app.ruta r on r.id = pa.ruta_id
        where pa.id = $1 and pa.cliente_id = $2 and r.repartidor_id = $3 and r.estado = 'en_curso'`,
      [q.parada, cliente, u.id],
    );
    if (!r.rows[0]) throw new AppError("NO_ENCONTRADO");
    parada = r.rows[0];
  }
  return { modo: "abono", cliente: c.rows[0].cliente, cuentas: c.rows[0].cuentas, parada, turno: await turnoDe(u), metodos: metodos(u, true) };
}

/** `POST /cobrar/vista`: totales, cambio y credito calculados en SQL (`fn_vista_cobro` para una entrega, `fn_vista_venta` para el mostrador). Nada se guarda. */
export async function vista(u: UsuarioSesion, d: { pedido_id?: string } & Record<string, unknown>) {
  const { pedido_id, ...resto } = d;
  const r = pedido_id
    ? await consulta<{ v: unknown }>("select app.fn_vista_cobro($1::bigint, $2::bigint, $3::jsonb) as v", [u.id, pedido_id, JSON.stringify(resto)])
    : await consulta<{ v: unknown }>("select app.fn_vista_venta($1::bigint, $2::jsonb) as v", [u.id, JSON.stringify(resto)]);
  return r.rows[0]!.v;
}

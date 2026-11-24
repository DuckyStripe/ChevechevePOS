import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { comprobanteNombre, dinero, SALDO_CLIENTE } from "../../comun/dinero.js";
import { AppError } from "../../comun/errores.js";
import { hashSolicitud } from "../../comun/idempotencia.js";
import { idEsquema, paramId } from "../../comun/ids.js";
import { booleanoQuery, esquemaPagina, listadoDeFilas, offset } from "../../comun/paginacion.js";
import type { UsuarioSesion } from "../../comun/permisos.js";
import { conUsuario } from "../../comun/transaccion.js";
import { consulta } from "../../db/database.js";

const esquemaCxc = esquemaPagina.extend({
  cliente_id: idEsquema.optional(), zona_id: idEsquema.optional(), estado: z.enum(["pendiente", "saldada", "cancelada"]).default("pendiente"),
  vencidas: booleanoQuery.optional(),
});
const esquemaAbonos = esquemaPagina.extend({
  cliente_id: idEsquema.optional(), desde: z.iso.date().optional(), hasta: z.iso.date().optional(), estado: z.enum(["aplicado", "cancelado"]).optional(),
  metodo: z.enum(["efectivo", "transferencia", "tarjeta"]).optional(), verificado: booleanoQuery.optional(),
});
const esquemaAbono = z.object({
  clave_idempotencia: z.uuid(),
  cliente_id: idEsquema,
  metodo: z.enum(["efectivo", "transferencia", "tarjeta"]),
  monto: dinero,
  referencia: z.string().trim().min(1).max(80).optional(),
  comprobante: comprobanteNombre.optional(),
  ruta_parada_id: idEsquema.optional(),
  cuentas: z.array(z.object({ cuenta_por_cobrar_id: idEsquema, monto: dinero })).max(200).optional(),
});
const esquemaCancelar = z.object({ motivo: z.string().trim().min(1).max(200) });
const esquemaTransferencias = esquemaPagina.extend({ verificado: booleanoQuery.optional(), desde: z.iso.date().optional(), hasta: z.iso.date().optional() });
const esquemaVerificar = z.object({ tabla: z.enum(["venta_pago", "abono"]), id: idEsquema });
const esquemaSaldoInicial = z.object({ monto: dinero, vence_el: z.iso.date(), concepto: z.string().trim().min(1).max(200) });
const esquemaEstado = z.object({ desde: z.iso.date().optional(), hasta: z.iso.date().optional() });

async function listarCxc(u: UsuarioSesion, f: z.infer<typeof esquemaCxc>) {
  const p: unknown[] = [u.sucursal_id, f.estado];
  const arg = (v: unknown) => (p.push(v), `$${p.length}`);
  const donde = ["x.estado = $2"];
  if (f.cliente_id) donde.push(`x.cliente_id = ${arg(f.cliente_id)}`);
  if (f.zona_id) donde.push(`c.zona_id = ${arg(f.zona_id)}`);
  if (f.vencidas) donde.push("x.estado = 'pendiente' and x.vence_el < app.fn_fecha_local(now())");
  const limite = arg(f.por_pagina);
  const desplazo = arg(offset(f));
  const r = await consulta<{ total: string }>(
    `select x.id::text as id, json_build_object('id', c.id::text, 'nombre', c.nombre) as cliente, x.cliente_id::text as cliente_id, x.origen, v.folio as venta_folio,
            x.concepto, x.creado_en, x.vence_el::text as vence_el, x.monto::text as monto, x.saldo::text as saldo, x.estado,
            case when x.estado = 'pendiente' then greatest(0, app.fn_fecha_local(now()) - x.vence_el) else 0 end as dias_vencida,
            k.color as semaforo, count(*) over() as total
       from app.cuenta_por_cobrar x join app.cliente c on c.id = x.cliente_id join app.v_semaforo_cliente k on k.cliente_id = c.id
       left join app.venta v on v.id = x.venta_id
      where ${donde.join(" and ")} and exists (select 1 from app.v_cxc_sucursal cs where cs.cuenta_por_cobrar_id = x.id and cs.sucursal_id = $1)
      order by lower(c.nombre), c.id, x.vence_el, x.id limit ${limite} offset ${desplazo}`,
    p,
  );
  return listadoDeFilas(r.rows, f);
}

async function listarAbonos(u: UsuarioSesion, f: z.infer<typeof esquemaAbonos>) {
  const p: unknown[] = [u.sucursal_id];
  const arg = (v: unknown) => (p.push(v), `$${p.length}`);
  const donde = ["a.sucursal_id = $1"];
  if (f.cliente_id) donde.push(`a.cliente_id = ${arg(f.cliente_id)}`);
  if (f.estado) donde.push(`a.estado = ${arg(f.estado)}`);
  if (f.metodo) donde.push(`a.metodo = ${arg(f.metodo)}`);
  if (f.verificado !== undefined) donde.push(`a.metodo = 'transferencia' and (a.verificado_en is not null) = ${arg(f.verificado)}::boolean`);
  if (f.desde) donde.push(`a.creado_en >= app.fn_inicio_dia(${arg(f.desde)}::date)`);
  if (f.hasta) donde.push(`a.creado_en < app.fn_inicio_dia(${arg(f.hasta)}::date + 1)`);
  const limite = arg(f.por_pagina);
  const desplazo = arg(offset(f));
  const r = await consulta<{ total: string }>(
    `select a.id::text as id, a.folio, json_build_object('id', c.id::text, 'nombre', c.nombre) as cliente, a.metodo, a.monto::text as monto, a.referencia, a.comprobante,
            a.estado, a.creado_en, a.verificado_en is not null as verificado, json_build_object('id', u.id::text, 'nombre', u.nombre) as usuario, count(*) over() as total
       from app.abono a join app.cliente c on c.id = a.cliente_id join app.usuario u on u.id = a.usuario_id
      where ${donde.join(" and ")} order by a.creado_en desc, a.id desc limit ${limite} offset ${desplazo}`,
    p,
  );
  return listadoDeFilas(r.rows, f);
}

async function crearAbono(u: UsuarioSesion, d: z.infer<typeof esquemaAbono>) {
  const hash = hashSolicitud(d);
  return conUsuario(u.id, async (c) => {
    const r = await c.query<{ abono_id: string; repetida: boolean }>("select abono_id::text as abono_id, repetida from app.fn_registrar_abono($1::bigint, $2::jsonb, $3)", [u.id, JSON.stringify(d), hash]);
    const { abono_id, repetida } = r.rows[0]!;
    const f = await c.query(
      `select a.id::text as id, a.folio, a.metodo, a.monto::text as monto, a.estado,
              coalesce((select json_agg(json_build_object('cuenta_por_cobrar_id', ap.cuenta_por_cobrar_id::text, 'monto', ap.monto::text) order by ap.cuenta_por_cobrar_id)
                          from app.abono_aplicacion ap where ap.abono_id = a.id), '[]'::json) as aplicaciones,
              (select ${SALDO_CLIENTE("s")} from app.v_saldo_cliente s where s.cliente_id = a.cliente_id) as saldo_cliente
         from app.abono a where a.id = $1`,
      [abono_id],
    );
    return { cuerpo: f.rows[0], repetida };
  });
}

async function listarTransferencias(u: UsuarioSesion, f: z.infer<typeof esquemaTransferencias>) {
  const p: unknown[] = [u.sucursal_id];
  const arg = (v: unknown) => (p.push(v), `$${p.length}`);
  const donde: string[] = [];
  if (f.verificado !== undefined) donde.push(`t.verificado_en is ${f.verificado ? "not null" : "null"}`);
  if (f.desde) donde.push(`t.creado_en >= app.fn_inicio_dia(${arg(f.desde)}::date)`);
  if (f.hasta) donde.push(`t.creado_en < app.fn_inicio_dia(${arg(f.hasta)}::date + 1)`);
  const limite = arg(f.por_pagina);
  const desplazo = arg(offset(f));
  const r = await consulta<{ total: string }>(
    `select t.tabla, t.id::text as id, t.folio, c.nombre as cliente, t.monto::text as monto, t.referencia, t.comprobante, r.folio as ruta, t.verificado_en, t.creado_en,
            count(*) over() as total
       from app.v_transferencia t left join app.cliente c on c.id = t.cliente_id left join app.turno_caja tc on tc.id = t.turno_caja_id left join app.ruta r on r.id = tc.ruta_id
      where ${["t.sucursal_id = $1", ...donde].join(" and ")} order by t.creado_en desc, t.id desc limit ${limite} offset ${desplazo}`,
    p,
  );
  return listadoDeFilas(r.rows, f);
}

export async function rutasCobranza(app: FastifyInstance): Promise<void> {
  app.get("/cuentas-por-cobrar", { config: { permiso: "cobranza.ver" } }, async (req) => listarCxc(req.usuario!, esquemaCxc.parse(req.query)));
  app.get("/abonos", { config: { permiso: "cobranza.ver" } }, async (req) => listarAbonos(req.usuario!, esquemaAbonos.parse(req.query)));

  app.post("/abonos", { config: { permiso: "cobranza.abonar" } }, async (req, reply) => {
    const { cuerpo, repetida } = await crearAbono(req.usuario!, esquemaAbono.parse(req.body));
    return reply.code(repetida ? 200 : 201).send(cuerpo);
  });

  app.post("/abonos/:id/cancelar", { config: { permiso: "cobranza.cancelar_abono" } }, async (req) => {
    const { id } = paramId.parse(req.params);
    const { motivo } = esquemaCancelar.parse(req.body);
    return conUsuario(req.usuario!.id, async (c) => {
      await c.query("select app.fn_cancelar_abono($1::bigint, $2::bigint, $3)", [req.usuario!.id, id, motivo]);
      return (await c.query("select id::text as id, folio, estado, cancelado_en, motivo_cancelacion from app.abono where id = $1", [id])).rows[0];
    });
  });

  app.get("/transferencias", { config: { permiso: "cobranza.verificar" } }, async (req) => listarTransferencias(req.usuario!, esquemaTransferencias.parse(req.query)));
  app.post("/transferencias/verificar", { config: { permiso: "cobranza.verificar" } }, async (req, reply) => {
    const d = esquemaVerificar.parse(req.body);
    await conUsuario(req.usuario!.id, (c) => c.query("select app.fn_verificar_pago($1::bigint, $2, $3::bigint)", [req.usuario!.id, d.tabla, d.id]));
    return reply.code(204).send();
  });

  app.post("/clientes/:id/saldo-inicial", { config: { permiso: "clientes.credito" } }, async (req, reply) => {
    const { id } = paramId.parse(req.params);
    const d = esquemaSaldoInicial.parse(req.body);
    const cxc = await conUsuario(req.usuario!.id, async (c) => {
      const r = await c.query<{ id: string }>("select app.fn_saldo_inicial($1::bigint, $2::bigint, $3::numeric, $4::date, $5)::text as id", [req.usuario!.id, id, d.monto, d.vence_el, d.concepto]);
      return (await c.query(
        "select id::text as id, cliente_id::text as cliente_id, origen, concepto, monto::text as monto, saldo::text as saldo, vence_el::text as vence_el, estado from app.cuenta_por_cobrar where id = $1", [r.rows[0]!.id])).rows[0];
    });
    return reply.code(201).send(cxc);
  });

  // Quien ve la cuenta de un cliente lo decide una sola funcion de SQL (cobranza.ver, o el repartidor con ese cliente en su ruta en curso).
  app.get("/clientes/:id/estado-cuenta", { config: { permiso: ["cobranza.ver", "rutas.operar"] } }, async (req) => {
    const { id } = paramId.parse(req.params);
    const q = esquemaEstado.parse(req.query);
    const ok = await consulta<{ ok: boolean }>("select app.fn_puede_ver_cuenta($1::bigint, $2::bigint) as ok", [req.usuario!.id, id]);
    if (!ok.rows[0]!.ok) throw new AppError("NO_ENCONTRADO");
    const r = await consulta<{ e: Record<string, unknown>; cliente: unknown; negocio: unknown }>(
      `select app.fn_estado_cuenta(c.id, $2::date, $3::date) as e, json_build_object('id', c.id::text, 'nombre', c.nombre) as cliente,
              json_build_object('nombre', app.fn_config('negocio_nombre')) as negocio
         from app.cliente c where c.id = $1`,
      [id, q.desde ?? null, q.hasta ?? null],
    );
    if (!r.rows[0]) throw new AppError("NO_ENCONTRADO");
    return { ...r.rows[0].e, cliente: r.rows[0].cliente, negocio: r.rows[0].negocio };
  });
}

import type pg from "pg";
import { AppError } from "../../comun/errores.js";
import { listado, offset, type Pagina } from "../../comun/paginacion.js";
import type { UsuarioSesion } from "../../comun/permisos.js";
import { conUsuario } from "../../comun/transaccion.js";
import { consulta, pool } from "../../db/database.js";
import { descifrar } from "../clientes/token.js";

type Q = pg.Pool | pg.PoolClient;

export interface Aviso {
  id: string;
  cliente: { id: string; nombre: string } | null;
  pedido_folio: string | null;
  plantilla: string;
  estado: string;
  creado_en: string;
  telefono_completo: boolean;
  texto: string;
  url: string;
}

interface Fila {
  id: string;
  estado: string;
  plantilla: string;
  vars: Record<string, unknown>;
  creado_en: string;
  pedido_id: string | null;
  cliente: { id: string; nombre: string } | null;
  pedido_folio: string | null;
  telefono: string | null;
  token_cifrado: Buffer | null;
}

/**
 * Unico lugar (TS) donde se filtra que avisos ve alguien (`GET /avisos`, contadores de `GET /despacho`, marcar): la regla vive
 * en SQL (`fn_puede_ver_aviso`: `pedidos.ver` ve todos; el Repartidor, solo los de pedidos de sus rutas). `ph` = marcador del usuario.
 */
// Un aviso dirigido a una persona (el resumen del dia al dueño) solo lo ve esa persona.
export const condicionAvisosVisibles = (ph: string): string => `app.fn_puede_ver_aviso(${ph}::bigint, a.pedido_id, a.plantilla) and (a.usuario_id is null or a.usuario_id = ${ph}::bigint)`;

const COLUMNAS = `a.id, a.estado, a.plantilla, a.vars, a.creado_en, a.pedido_id,
  case when c.id is null then null else json_build_object('id', c.id::text, 'nombre', c.nombre) end as cliente,
  pd.folio as pedido_folio, coalesce(c.telefono_whatsapp, u.telefono) as telefono, e.token_cifrado`;
const DESDE = `from app.aviso_cliente a
  left join app.cliente c on c.id = a.cliente_id
  left join app.usuario u on u.id = a.usuario_id
  left join app.pedido pd on pd.id = a.pedido_id
  left join app.cliente_enlace e on e.cliente_id = c.id and e.revocado_en is null`;

/** Texto renderizado al momento (vars + `enlace` = url_publica/p/<token descifrado>) y URL de wa.me. El token solo vive aqui, dentro del texto. */
async function renderizar(q: Q, filas: Fila[]): Promise<Aviso[]> {
  if (filas.length === 0) return [];
  const cfg = await q.query<{ v: string | null }>("select valor #>> '{}' as v from app.configuracion where clave = 'url_publica'");
  const base = (cfg.rows[0]?.v ?? "").replace(/\/+$/, "");
  const entradas = filas.map((f) => {
    let enlace = "";
    if (f.token_cifrado) {
      try {
        const destino = f.plantilla === "wa_lo_de_siempre" && f.pedido_id ? `?ir=pedido-${f.pedido_id}` : ["wa_estado_cuenta", "wa_recordatorio_saldo"].includes(f.plantilla) ? "?ir=estado-cuenta" : "";
        enlace = `${base}/p/${descifrar(f.token_cifrado)}${destino}`;
      } catch {
        enlace = ""; // dato alterado: el aviso sale sin enlace en vez de romper la lista
      }
    }
    return { id: f.id, plantilla: f.plantilla, vars: { ...f.vars, enlace } };
  });
  const r = await q.query<{ id: string; texto: string }>(
    `select t.id, r.texto from jsonb_to_recordset($1::jsonb) as t(id text, plantilla text, vars jsonb)
       cross join lateral app.fn_render_plantilla(t.plantilla, t.vars) r`,
    [JSON.stringify(entradas)],
  );
  const textos = new Map(r.rows.map((x) => [x.id, x.texto]));
  return filas.map((f) => {
    const texto = textos.get(String(f.id)) ?? "";
    return {
      id: f.id,
      cliente: f.cliente,
      pedido_folio: f.pedido_folio,
      plantilla: f.plantilla,
      estado: f.estado,
      creado_en: f.creado_en,
      telefono_completo: !!f.telefono,
      texto,
      url: `https://wa.me/${f.telefono ?? ""}?text=${encodeURIComponent(texto)}`,
    };
  });
}

export async function avisoPorId(q: Q, id: string): Promise<Aviso> {
  const r = await q.query<Fila>(`select ${COLUMNAS} ${DESDE} where a.id = $1`, [id]);
  if (!r.rows[0]) throw new AppError("NO_ENCONTRADO");
  return (await renderizar(q, r.rows))[0]!;
}

/** El aviso mas reciente de un pedido y plantilla (el que acaba de crear una funcion de negocio). */
export async function avisoDePedido(q: Q, pedidoId: string, plantilla: string): Promise<Aviso | null> {
  const r = await q.query<Fila>(`select ${COLUMNAS} ${DESDE} where a.pedido_id = $1 and a.plantilla = $2 order by a.id desc limit 1`, [pedidoId, plantilla]);
  return r.rows[0] ? (await renderizar(q, r.rows))[0]! : null;
}

export async function listarAvisos(
  u: UsuarioSesion,
  f: Pagina & { estado: string; cliente_id?: string; pedido_id?: string },
) {
  const p: unknown[] = [f.estado];
  const arg = (v: unknown) => (p.push(v), `$${p.length}`);
  const donde = ["a.estado = $1", condicionAvisosVisibles(arg(u.id))];
  if (f.cliente_id) donde.push(`a.cliente_id = ${arg(f.cliente_id)}`);
  if (f.pedido_id) donde.push(`a.pedido_id = ${arg(f.pedido_id)}`);
  const limite = arg(f.por_pagina);
  const desplazo = arg(offset(f));
  const r = await consulta<Fila & { total: string }>(
    `select ${COLUMNAS}, count(*) over() as total ${DESDE} where ${donde.join(" and ")}
      order by ${f.estado === "pendiente" ? "a.id asc" : "a.id desc"} limit ${limite} offset ${desplazo}`,
    p,
  );
  return listado(await renderizar(pool, r.rows), r.rows[0]?.total ?? 0, f);
}

/** Cuantos avisos pendientes ve este usuario (contador de `/despacho`). */
export async function contarPendientes(u: UsuarioSesion): Promise<number> {
  const r = await consulta<{ n: number }>(`select count(*)::int as n from app.aviso_cliente a where a.estado = 'pendiente' and ${condicionAvisosVisibles("$1")}`, [u.id]);
  return r.rows[0]!.n;
}

/** Marca enviado/descartado. Repetir el mismo estado es 204; el contrario sobre uno ya cerrado es AVISO_NO_PENDIENTE (SQL). */
export async function marcarAviso(u: UsuarioSesion, id: string, estado: "enviado" | "descartado"): Promise<void> {
  const visible = await consulta<{ estado: string }>(`select a.estado from app.aviso_cliente a where a.id = $1 and ${condicionAvisosVisibles("$2")}`, [id, u.id]);
  if (!visible.rows[0]) throw new AppError("NO_ENCONTRADO");
  if (visible.rows[0].estado === estado) return;
  await conUsuario(u.id, (c) => c.query("select app.fn_marcar_aviso($1::bigint, $2::bigint, $3::text)", [u.id, id, estado]));
}

const VARS_MANUAL = `jsonb_strip_nulls(jsonb_build_object('cliente', c.nombre, 'negocio', app.fn_config('negocio_nombre'),
    'banco', app.fn_config('transferencia_banco'), 'titular', app.fn_config('transferencia_titular'), 'clabe', app.fn_config('transferencia_clabe'),
    'monto', pd.total::text, 'referencia', pd.folio, 'saldo', sc.saldo::text, 'vencido', sc.vencido::text))`;

/** Aviso manual (unico lugar que los crea, P9). Clave `manual:<uuid>`: repetir la clave devuelve el mismo aviso (200). */
export async function crearAvisoManual(
  actor: string,
  d: { clave_idempotencia: string; cliente_id: string; plantilla: string; pedido_id?: string },
): Promise<{ aviso: Aviso; repetido: boolean }> {
  return conUsuario(actor, async (c) => {
    const clave = `manual:${d.clave_idempotencia}`;
    const previo = await c.query<{ id: string; cliente_id: string }>("select id, cliente_id from app.aviso_cliente where clave = $1", [clave]);
    if (previo.rows[0]) {
      if (previo.rows[0].cliente_id !== d.cliente_id) throw new AppError("IDEMPOTENCIA_CONFLICTO");
      return { aviso: await avisoPorId(c, previo.rows[0].id), repetido: true };
    }
    const vars = await c.query<{ vars: unknown }>(
      `select ${VARS_MANUAL} as vars from app.cliente c join app.v_saldo_cliente sc on sc.cliente_id = c.id left join app.pedido pd on pd.id = $2 and pd.cliente_id = c.id where c.id = $1`,
      [d.cliente_id, d.pedido_id ?? null],
    );
    if (!vars.rows[0]) throw new AppError("NO_ENCONTRADO");
    if (d.pedido_id && !(await c.query("select 1 from app.pedido where id = $1 and cliente_id = $2", [d.pedido_id, d.cliente_id])).rowCount) throw new AppError("NO_ENCONTRADO");
    const r = await c.query<{ id: string }>("select app.fn_aviso_cliente($1::bigint, $2::bigint, $3::text, $4::text, $5::jsonb) as id", [
      d.cliente_id, d.pedido_id ?? null, d.plantilla, clave, JSON.stringify(vars.rows[0].vars),
    ]);
    return { aviso: await avisoPorId(c, r.rows[0]!.id), repetido: false };
  });
}

/** Resumen del dia para el dueño (`fn_aviso_resumen_dia`: SQL resuelve al destinatario y arma las variables). Repetir el mismo dia devuelve el mismo aviso. */
export async function crearAvisoResumenDia(actor: string, fecha: string | undefined): Promise<{ aviso: Aviso; repetido: boolean }> {
  return conUsuario(actor, async (c) => {
    const r = await c.query<{ aviso_id: string; repetido: boolean }>(
      "select aviso_id::text as aviso_id, repetido from app.fn_aviso_resumen_dia($1::bigint, coalesce($2::date, app.fn_fecha_local(now())))", [actor, fecha ?? null]);
    return { aviso: await avisoPorId(c, r.rows[0]!.aviso_id), repetido: r.rows[0]!.repetido };
  });
}

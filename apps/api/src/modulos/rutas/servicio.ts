import type pg from "pg";
import { AppError } from "../../comun/errores.js";
import { listadoDeFilas, offset, type Pagina } from "../../comun/paginacion.js";
import type { UsuarioSesion } from "../../comun/permisos.js";
import { conUsuario } from "../../comun/transaccion.js";
import { consulta, pool } from "../../db/database.js";
import { navegarParada, navegarRuta } from "./navegar.js";
import { ordenarParadas } from "./optimizar.js";

type Q = pg.Pool | pg.PoolClient;

/** Sin `rutas.ver`, `rutas.operar` solo ve las rutas donde es el repartidor. */
export const soloPropias = (u: UsuarioSesion): boolean => !u.permisos.includes("rutas.ver");

const FILA_LISTA = `r.id::text as id, r.folio, r.fecha::text as fecha, r.nombre,
  json_build_object('id', v.id::text, 'nombre', v.nombre) as vehiculo,
  json_build_object('id', u.id::text, 'nombre', u.nombre) as repartidor,
  r.estado,
  (select count(*)::int from app.ruta_parada pa where pa.ruta_id = r.id) as paradas,
  (select count(*)::int from app.ruta_parada pa where pa.ruta_id = r.id and pa.estado = 'visitada') as entregadas,
  app.fn_ruta_distancia(r.id) as distancia_km`;
const DESDE_LISTA = `from app.ruta r join app.vehiculo v on v.id = r.vehiculo_id join app.usuario u on u.id = r.repartidor_id`;

export async function listarRutas(u: UsuarioSesion, f: Pagina & { fecha?: string; estado?: string; repartidor_id?: string }) {
  const p: unknown[] = [u.sucursal_id];
  const arg = (v: unknown) => (p.push(v), `$${p.length}`);
  const donde = ["r.sucursal_id = $1"];
  if (soloPropias(u)) donde.push(`r.repartidor_id = ${arg(u.id)}`);
  if (f.fecha) donde.push(`r.fecha = ${arg(f.fecha)}::date`);
  if (f.estado) donde.push(`r.estado = ${arg(f.estado)}`);
  if (f.repartidor_id) donde.push(`r.repartidor_id = ${arg(f.repartidor_id)}`);
  const limite = arg(f.por_pagina);
  const desplazo = arg(offset(f));
  const r = await consulta<{ total: string }>(
    `select ${FILA_LISTA}, count(*) over() as total ${DESDE_LISTA} where ${donde.join(" and ")} order by r.fecha desc, r.id desc limit ${limite} offset ${desplazo}`,
    p,
  );
  return listadoDeFilas(r.rows, f);
}

interface ParadaFila {
  id: string;
  orden: number;
  tipo: string;
  estado: string;
  km_desde_anterior: string | null;
  nota: string | null;
  cliente: { id: string; nombre: string; direccion: string | null; referencias: string | null; telefono_whatsapp: string | null; lat: string | null; lng: string | null; zona: { id: string; nombre: string } | null };
  pedido: { id: string; folio: string; total: string; estado: string; lineas: { cantidad: number; presentacion: string; producto: string }[] } | null;
}

/** Ruta con sus paradas y enlaces de navegacion. Otra sucursal o, sin `rutas.ver`, una ruta ajena: 404. */
export async function detalleRuta(q: Q, id: string, u: UsuarioSesion) {
  const r = await q.query(
    `select ${FILA_LISTA}, r.sucursal_id::text as sucursal_id, r.repartidor_id::text as repartidor_id, v.capacidad_cajas,
            r.optimizada_en, r.cargada_en, r.iniciada_en, r.terminada_en, r.creado_en,
            (app.fn_orden_carga(r.id) ->> 'cajas_totales')::int as cajas_totales
       ${DESDE_LISTA} where r.id = $1`,
    [id],
  );
  const ruta = r.rows[0];
  // Unico filtro de sucursal y de «solo las propias» de la lectura de rutas.
  if (!ruta || ruta.sucursal_id !== u.sucursal_id || (soloPropias(u) && ruta.repartidor_id !== u.id)) throw new AppError("NO_ENCONTRADO");
  const ps = await q.query<ParadaFila>(
    `select pa.id::text as id, pa.orden, pa.tipo, pa.estado, pa.km_desde_anterior, pa.nota,
            json_build_object('id', c.id::text, 'nombre', c.nombre, 'direccion', c.direccion, 'referencias', c.referencias,
              'telefono_whatsapp', c.telefono_whatsapp, 'lat', c.lat::text, 'lng', c.lng::text,
              'zona', case when z.id is null then null else json_build_object('id', z.id::text, 'nombre', z.nombre) end) as cliente,
            case when p.id is null then null else json_build_object('id', p.id::text, 'folio', p.folio, 'total', p.total::text, 'estado', p.estado,
              'lineas', coalesce((select json_agg(json_build_object('cantidad', l.cantidad, 'presentacion', pz.nombre, 'producto', pr.nombre) order by l.numero)
                                    from app.pedido_linea l join app.presentacion pz on pz.id = l.presentacion_id join app.producto pr on pr.id = l.producto_id
                                   where l.pedido_id = p.id and l.estado = 'activa' and l.cantidad > 0), '[]'::json)) end as pedido
       from app.ruta_parada pa
       join app.cliente c on c.id = pa.cliente_id
       left join app.zona z on z.id = c.zona_id
       left join app.pedido p on p.id = pa.pedido_id
      where pa.ruta_id = $1 order by pa.orden`,
    [id],
  );
  const bodega = await q.query<{ lat: string | null; lng: string | null }>("select lat::text as lat, lng::text as lng from app.sucursal where id = $1", [ruta.sucursal_id]);
  const paradas = ps.rows.map((p) => ({ ...p, navegar: navegarParada(p.cliente) }));
  const pendientes = paradas.filter((p) => p.estado === "pendiente").map((p) => p.cliente);
  const { sucursal_id: _s, repartidor_id: _r, ...resto } = ruta;
  void _s;
  void _r;
  return { ...resto, paradas, navegar_ruta: navegarRuta(bodega.rows[0] ?? { lat: null, lng: null }, pendientes) };
}

export const obtenerRuta = (u: UsuarioSesion, id: string) => detalleRuta(pool, id, u);

export async function repartidores(sucursal: string) {
  const r = await consulta(
    `select u.id::text as id, u.nombre from app.usuario u
      where u.activo and u.sucursal_id = $1 and app.fn_tiene_permiso(u.id, 'rutas.operar') order by lower(u.nombre), u.id`,
    [sucursal],
  );
  return r.rows;
}

/** Pedidos que `fn_asignar_pedidos` aceptaria (misma funcion SQL), agrupados por zona. */
export async function candidatos(u: UsuarioSesion, id: string) {
  const ok = await consulta("select 1 from app.ruta where id = $1 and sucursal_id = $2", [id, u.sucursal_id]);
  if (!ok.rowCount) throw new AppError("NO_ENCONTRADO");
  const r = await consulta<{
    zona_id: string | null; zona: string | null;
    pedido: { id: string; folio: string; cliente: { id: string; nombre: string }; estado: string; total: string; tiene_ubicacion: boolean };
  }>(
    `select z.id::text as zona_id, z.nombre as zona,
            json_build_object('id', p.id::text, 'folio', p.folio, 'cliente', json_build_object('id', c.id::text, 'nombre', c.nombre),
              'estado', p.estado, 'total', p.total::text, 'tiene_ubicacion', c.lat is not null) as pedido
       from app.fn_pedidos_asignables($1) a(id)
       join app.pedido p on p.id = a.id
       join app.cliente c on c.id = p.cliente_id
       left join app.zona z on z.id = c.zona_id
      order by (z.id is null), lower(z.nombre), z.id, lower(c.nombre), p.id`,
    [id],
  );
  const zonas: { zona: { id: string; nombre: string } | null; pedidos: unknown[] }[] = [];
  for (const f of r.rows) {
    let g = zonas.find((x) => (x.zona?.id ?? null) === f.zona_id);
    if (!g) zonas.push((g = { zona: f.zona_id ? { id: f.zona_id, nombre: f.zona! } : null, pedidos: [] }));
    g.pedidos.push(f.pedido);
  }
  return { zonas };
}

export async function crearRuta(u: UsuarioSesion, d: { fecha: string; nombre?: string; vehiculo_id: string; repartidor_id: string }) {
  return conUsuario(u.id, async (c) => {
    const r = await c.query<{ id: string }>("select app.fn_crear_ruta($1::bigint, $2::bigint, $3::jsonb) as id", [u.id, u.sucursal_id, JSON.stringify(d)]);
    return detalleRuta(c, r.rows[0]!.id, u);
  });
}

export async function asignarPedidos(u: UsuarioSesion, id: string, pedidoIds: string[]) {
  return conUsuario(u.id, async (c) => {
    await c.query("select app.fn_asignar_pedidos($1::bigint, $2::bigint, $3::bigint[])", [u.id, id, pedidoIds]);
    return detalleRuta(c, id, u);
  });
}

export async function quitarParada(u: UsuarioSesion, paradaId: string) {
  return conUsuario(u.id, async (c) => {
    const r = await c.query<{ ruta_id: string }>("select ruta_id::text as ruta_id from app.ruta_parada where id = $1", [paradaId]);
    if (!r.rows[0]) throw new AppError("NO_ENCONTRADO");
    await c.query("select app.fn_quitar_parada($1::bigint, $2::bigint)", [u.id, paradaId]);
    return detalleRuta(c, r.rows[0].ruta_id, u);
  });
}

export async function ordenarManual(u: UsuarioSesion, id: string, paradas: string[]) {
  return conUsuario(u.id, async (c) => {
    await c.query("select app.fn_ordenar_ruta($1::bigint, $2::bigint, $3::bigint[])", [u.id, id, paradas]);
    return detalleRuta(c, id, u);
  });
}

/** Lee bodega y paradas, ordena en TS (`ordenarParadas`) y guarda con `fn_ordenar_ruta(..., p_optimizada = true)`. */
export async function optimizar(u: UsuarioSesion, id: string) {
  return conUsuario(u.id, async (c) => {
    const r = await c.query<{ estado: string; distancia_km: string | null; lat: string | null; lng: string | null }>(
      "select r.estado, app.fn_ruta_distancia(r.id)::text as distancia_km, s.lat::text as lat, s.lng::text as lng from app.ruta r join app.sucursal s on s.id = r.sucursal_id where r.id = $1 and r.sucursal_id = $2",
      [id, u.sucursal_id],
    );
    const ruta = r.rows[0];
    if (!ruta) throw new AppError("NO_ENCONTRADO");
    if (ruta.estado !== "planeada") throw new AppError("RUTA_NO_EDITABLE", { ruta_id: id, estado: ruta.estado });
    if (ruta.lat === null || ruta.lng === null) throw new AppError("BODEGA_SIN_UBICACION");
    const ps = await c.query<{ id: string; cliente_id: string; lat: string | null; lng: string | null; nombre: string }>(
      `select pa.id::text as id, pa.cliente_id::text as cliente_id, cl.lat::text as lat, cl.lng::text as lng, cl.nombre
         from app.ruta_parada pa join app.cliente cl on cl.id = pa.cliente_id where pa.ruta_id = $1 order by pa.orden`,
      [id],
    );
    const num = (x: string | null) => (x === null ? null : Number(x));
    const res = ordenarParadas(
      { lat: Number(ruta.lat), lng: Number(ruta.lng) },
      ps.rows.map((p) => ({ id: p.id, cliente_id: p.cliente_id, lat: num(p.lat), lng: num(p.lng) })),
    );
    await c.query("select app.fn_ordenar_ruta($1::bigint, $2::bigint, $3::bigint[], $4::numeric[], true)", [u.id, id, res.orden, res.km]);
    const nueva = await c.query<{ distancia_km: string | null }>("select app.fn_ruta_distancia(id)::text as distancia_km from app.ruta where id = $1", [id]);
    const nombres = new Map(ps.rows.map((p) => [p.id, p.nombre]));
    return {
      ruta: await detalleRuta(c, id, u),
      distancia_km: nueva.rows[0]!.distancia_km,
      distancia_anterior_km: ruta.distancia_km,
      sin_ubicacion: res.sin_ubicacion,
      advertencias: res.sin_ubicacion.map((pid) => ({ codigo: "sin_ubicacion", parada_id: pid, cliente: nombres.get(pid) })),
    };
  });
}

export async function cargarRuta(u: UsuarioSesion, id: string) {
  return conUsuario(u.id, async (c) => {
    const r = await c.query<{ r: { advertencias: unknown[] } & Record<string, unknown> }>("select app.fn_cargar_ruta($1::bigint, $2::bigint) as r", [u.id, id]);
    const { advertencias, ...carga } = r.rows[0]!.r;
    return { ruta: await detalleRuta(c, id, u), carga, advertencias };
  });
}

export async function ordenCarga(u: UsuarioSesion, id: string) {
  await detalleRutaVisible(u, id);
  return (await consulta<{ r: unknown }>("select app.fn_orden_carga($1::bigint) as r", [id])).rows[0]!.r;
}

async function detalleRutaVisible(u: UsuarioSesion, id: string): Promise<void> {
  const r = await consulta<{ repartidor_id: string }>("select repartidor_id::text as repartidor_id from app.ruta where id = $1 and sucursal_id = $2", [id, u.sucursal_id]);
  if (!r.rows[0] || (soloPropias(u) && r.rows[0].repartidor_id !== u.id)) throw new AppError("NO_ENCONTRADO");
}

export async function cancelarRuta(u: UsuarioSesion, id: string) {
  return conUsuario(u.id, async (c) => {
    await c.query("select app.fn_cancelar_ruta($1::bigint, $2::bigint)", [u.id, id]);
    return detalleRuta(c, id, u);
  });
}

/** F6: sin turno de caja (llega con 008); `fondo_inicial` se ignora. */
export async function iniciarRuta(u: UsuarioSesion, id: string) {
  return conUsuario(u.id, async (c) => {
    await c.query("select app.fn_iniciar_ruta($1::bigint, $2::bigint)", [u.id, id]);
    return { ruta: await detalleRuta(c, id, u), turno: null };
  });
}

export async function terminarRuta(u: UsuarioSesion, id: string) {
  return conUsuario(u.id, async (c) => {
    await c.query("select app.fn_terminar_ruta($1::bigint, $2::bigint)", [u.id, id]);
    return detalleRuta(c, id, u);
  });
}

/** Idempotente por estado: una parada ya fallida responde la misma parada. */
export async function noEntregado(u: UsuarioSesion, paradaId: string, motivo: string, nota?: string) {
  return conUsuario(u.id, async (c) => {
    await c.query("select app.fn_marcar_no_entregado($1::bigint, $2::bigint, $3::text, $4::text)", [u.id, paradaId, motivo, nota ?? null]);
    const r = await c.query(
      "select id::text as id, ruta_id::text as ruta_id, orden, tipo, estado, pedido_id::text as pedido_id, cliente_id::text as cliente_id, nota, visitada_en from app.ruta_parada where id = $1",
      [paradaId],
    );
    return r.rows[0];
  });
}

-- 003: compras con caducidad opcional, cancelacion, margenes sugeridos y vista de por caducar.
-- DDL de CONTRATOS §2.3 y §2.12 A1. Depende de 002 (movimiento_inventario, fn_precio, fn_margen_objetivo).

-- ---------------------------------------------------------------- tablas

create table app.compra (
  id bigint generated always as identity primary key,
  sucursal_id bigint not null references app.sucursal(id),
  folio text not null,
  proveedor_id bigint not null references app.proveedor(id),
  folio_proveedor text,
  fecha date not null,
  condicion_pago text not null check (condicion_pago in ('contado','credito')),
  estado text not null default 'registrada' check (estado in ('registrada','cancelada')),
  total numeric(12,2) not null default 0 check (total >= 0),
  fecha_surtido date,
  notas text,
  clave_idempotencia uuid not null constraint uq_compra_clave unique,
  hash_solicitud text not null,
  usuario_id bigint not null references app.usuario(id),
  creado_en timestamptz not null default now(),
  cancelada_en timestamptz,
  cancelada_por bigint references app.usuario(id),
  motivo_cancelacion text,
  constraint uq_compra_folio unique (sucursal_id, folio),
  constraint ck_compra_cancelada check ((estado = 'cancelada') = (cancelada_en is not null))
);
create index idx_compra_fecha on app.compra (sucursal_id, fecha desc);
create index idx_compra_proveedor on app.compra (proveedor_id, fecha desc);

create table app.compra_linea (
  id bigint generated always as identity primary key,
  compra_id bigint not null references app.compra(id),
  presentacion_id bigint not null references app.presentacion(id),
  producto_id bigint not null references app.producto(id),
  factor integer not null check (factor > 0),
  cantidad integer not null check (cantidad > 0),
  piezas integer generated always as (cantidad * factor) stored,
  costo_presentacion numeric(12,2) not null check (costo_presentacion >= 0),
  importe numeric(12,2) generated always as (round(cantidad * costo_presentacion, 2)) stored,
  costo_unitario numeric(14,6) not null,
  caduca_el date
);
create index idx_compra_linea_compra on app.compra_linea (compra_id);
create index idx_compra_linea_producto on app.compra_linea (producto_id);

-- ---------------------------------------------------------------- funciones

-- Candados: clave de idempotencia -> folio -> existencias en orden de producto_id.
create function app.fn_registrar_compra(p_usuario_id bigint, p_sucursal_id bigint, p_datos jsonb, p_hash text)
returns table(compra_id bigint, repetida boolean)
language plpgsql as $$
#variable_conflict use_column
declare
  v_clave uuid := (p_datos ->> 'clave_idempotencia')::uuid;
  v_previa app.compra;
  v_id bigint;
  v_total numeric(12,2);
  v_malas bigint[];
begin
  perform pg_advisory_xact_lock(hashtext(v_clave::text));

  select * into v_previa from app.compra c where c.clave_idempotencia = v_clave;
  if found then
    -- Repetir solo vale para el mismo usuario, sucursal y cuerpo.
    if v_previa.hash_solicitud = p_hash and v_previa.usuario_id = p_usuario_id and v_previa.sucursal_id = p_sucursal_id then
      return query select v_previa.id, true;
      return;
    end if;
    raise exception 'IDEMPOTENCIA_CONFLICTO' using errcode = 'P0001',
      detail = jsonb_build_object('compra_id', v_previa.id)::text;
  end if;

  -- 409 ESTADO_NO_VALIDO: el contrato no define un codigo para proveedor inactivo.
  if not exists (select 1 from app.proveedor pv where pv.id = (p_datos ->> 'proveedor_id')::bigint and pv.activo) then
    raise exception 'ESTADO_NO_VALIDO' using errcode = 'P0001',
      detail = jsonb_build_object('proveedor_id', (p_datos ->> 'proveedor_id')::bigint, 'motivo', 'proveedor_inactivo')::text;
  end if;

  if jsonb_typeof(p_datos -> 'lineas') is distinct from 'array' or jsonb_array_length(p_datos -> 'lineas') = 0 then
    raise exception 'COMPRA_VACIA' using errcode = 'P0001', detail = '{}';
  end if;

  select array_agg(distinct (j ->> 'presentacion_id')::bigint) into v_malas
  from jsonb_array_elements(p_datos -> 'lineas') as t(j)
  where not exists (
    select 1 from app.presentacion pz
    where pz.id = (t.j ->> 'presentacion_id')::bigint and pz.activa and pz.se_compra);
  if v_malas is not null then
    raise exception 'PRESENTACION_NO_VALIDA' using errcode = 'P0001',
      detail = jsonb_build_object('presentacion_ids', v_malas)::text;
  end if;

  -- El costo se redondea a centavos antes de cualquier cuenta (igual que la columna): importe y total cuadran.
  select coalesce(sum(round((t.j ->> 'cantidad')::integer * (t.j ->> 'costo_presentacion')::numeric(12,2), 2)), 0)
  into v_total from jsonb_array_elements(p_datos -> 'lineas') as t(j);

  insert into app.compra (sucursal_id, folio, proveedor_id, folio_proveedor, fecha, condicion_pago, total,
                          fecha_surtido, notas, clave_idempotencia, hash_solicitud, usuario_id)
  values (p_sucursal_id, app.fn_siguiente_folio(p_sucursal_id, 'C'),
          (p_datos ->> 'proveedor_id')::bigint, nullif(p_datos ->> 'folio_proveedor', ''),
          (p_datos ->> 'fecha')::date, p_datos ->> 'condicion_pago', v_total,
          nullif(p_datos ->> 'fecha_surtido', '')::date, nullif(p_datos ->> 'notas', ''),
          v_clave, p_hash, p_usuario_id)
  returning id into v_id;

  insert into app.compra_linea (compra_id, presentacion_id, producto_id, factor, cantidad, costo_presentacion, costo_unitario, caduca_el)
  select v_id, pz.id, pz.producto_id, pz.factor, l.cantidad, l.costo,
         round(round(l.cantidad * l.costo, 2) / (l.cantidad * pz.factor), 6),
         l.caduca_el
  from jsonb_array_elements(p_datos -> 'lineas') with ordinality as t(j, ord)
  cross join lateral (select (t.j ->> 'presentacion_id')::bigint as presentacion_id,
                             (t.j ->> 'cantidad')::integer as cantidad,
                             (t.j ->> 'costo_presentacion')::numeric(12,2) as costo,
                             nullif(t.j ->> 'caduca_el', '')::date as caduca_el) l
  join app.presentacion pz on pz.id = l.presentacion_id
  order by t.ord;

  -- Primero todos los candados de existencia (orden de producto_id), luego los movimientos.
  perform app.fn_bloquear_existencias(p_sucursal_id,
    array(select distinct cl.producto_id from app.compra_linea cl where cl.compra_id = v_id));

  insert into app.movimiento_inventario
    (sucursal_id, producto_id, tipo, cantidad, costo_unitario, referencia_tabla, referencia_id, usuario_id)
  select p_sucursal_id, cl.producto_id, 'compra', cl.piezas, cl.costo_unitario, 'compra_linea', cl.id, p_usuario_id
  from app.compra_linea cl where cl.compra_id = v_id
  order by cl.producto_id, cl.id;

  return query select v_id, false;
end $$;

-- Revierte la compra con sus propios movimientos del kardex, exactamente al costo de cada linea.
-- Solo si despues de ella no hubo salidas ni revaluaciones del producto (si no, el promedio quedaria mal):
-- COMPRA_CON_SALIDAS {producto_id}. Todo o nada. La cancelacion de una compra POSTERIOR no cuenta como salida
-- (ya devolvio al promedio lo suyo): asi se cancela de la mas nueva a la mas vieja.
create function app.fn_cancelar_compra(p_usuario_id bigint, p_compra_id bigint, p_motivo text) returns void
language plpgsql as $$
declare
  v_c app.compra;
  r record;
begin
  select * into v_c from app.compra c where c.id = p_compra_id for update;
  if not found then
    raise exception 'NO_ENCONTRADO' using errcode = 'P0001',
      detail = jsonb_build_object('compra_id', p_compra_id)::text;
  end if;
  if v_c.estado = 'cancelada' then
    raise exception 'COMPRA_YA_CANCELADA' using errcode = 'P0001',
      detail = jsonb_build_object('compra_id', p_compra_id)::text;
  end if;

  -- Movimientos propios de la compra (tipo 'compra', ligados a sus lineas).
  perform app.fn_bloquear_existencias(v_c.sucursal_id, array(
    select distinct m.producto_id
    from app.compra_linea cl
    join app.movimiento_inventario m on m.referencia_tabla = 'compra_linea' and m.referencia_id = cl.id and m.tipo = 'compra'
    where cl.compra_id = p_compra_id));

  for r in
    select m.producto_id, min(m.id) as primero
    from app.compra_linea cl
    join app.movimiento_inventario m on m.referencia_tabla = 'compra_linea' and m.referencia_id = cl.id and m.tipo = 'compra'
    where cl.compra_id = p_compra_id
    group by m.producto_id order by m.producto_id
  loop
    if exists (
      select 1 from app.movimiento_inventario s
      where s.sucursal_id = v_c.sucursal_id and s.producto_id = r.producto_id and s.id > r.primero
        and (s.cantidad < 0 or s.tipo = 'revaluacion')
        and not (s.tipo = 'cancelacion_compra' and exists (
          select 1 from app.compra_linea cl2
          where cl2.id = s.referencia_id and s.referencia_tabla = 'compra_linea' and cl2.compra_id > p_compra_id))
    ) then
      raise exception 'COMPRA_CON_SALIDAS' using errcode = 'P0001',
        detail = jsonb_build_object('producto_id', r.producto_id)::text;
    end if;
  end loop;

  insert into app.movimiento_inventario
    (sucursal_id, producto_id, tipo, cantidad, costo_unitario, referencia_tabla, referencia_id, motivo, usuario_id)
  select v_c.sucursal_id, m.producto_id, 'cancelacion_compra', -m.cantidad, m.costo_unitario,
         'compra_linea', m.referencia_id, p_motivo, p_usuario_id
  from app.compra_linea cl
  join app.movimiento_inventario m on m.referencia_tabla = 'compra_linea' and m.referencia_id = cl.id and m.tipo = 'compra'
  where cl.compra_id = p_compra_id
  order by m.producto_id, m.id;

  update app.compra c
  set estado = 'cancelada', cancelada_en = now(), cancelada_por = p_usuario_id, motivo_cancelacion = p_motivo
  where c.id = p_compra_id;
end $$;

-- Regla unica del precio sugerido (A1): ceil(costo / (1 - objetivo) / paso) * paso. Sin costo, con objetivo >= 1 o
-- sin `precio_redondeo` utilizable (falta la llave o es 0) no hay sugerido (null).
create function app.fn_precio_sugerido(p_costo_presentacion numeric, p_objetivo numeric) returns numeric
language sql stable as $$
  select case when p_costo_presentacion is not null and p_objetivo is not null and p_objetivo < 1
              then ceil(p_costo_presentacion / (1 - p_objetivo) / r.paso) * r.paso end
  from (select (select nullif((cf.valor #>> '{}')::numeric, 0) from app.configuracion cf where cf.clave = 'precio_redondeo') as paso) r
$$;

-- A1: una fila por presentacion activa x lista activa de cada producto de la compra.
create function app.fn_margenes_compra(p_compra_id bigint)
returns table(producto_id bigint, producto text, costo_anterior numeric, costo_nuevo numeric,
              presentacion_id bigint, presentacion text, lista_precio_id bigint, lista text,
              precio numeric, costo_presentacion numeric, margen numeric, objetivo numeric,
              alerta text, precio_sugerido numeric)
language sql stable as $$
  with c as (
    select id, sucursal_id from app.compra where id = p_compra_id
  ), mov as (
    select cl.producto_id, c.sucursal_id, min(m.id) as primero, max(m.id) as ultimo
    from c
    join app.compra_linea cl on cl.compra_id = c.id
    join app.movimiento_inventario m
      on m.referencia_tabla = 'compra_linea' and m.referencia_id = cl.id and m.tipo = 'compra'
    group by cl.producto_id, c.sucursal_id
  ), costos as (
    select mv.producto_id,
      (select a.costo_promedio_resultante from app.movimiento_inventario a
        where a.sucursal_id = mv.sucursal_id and a.producto_id = mv.producto_id and a.id < mv.primero
        order by a.id desc limit 1) as costo_anterior,
      (select n.costo_promedio_resultante from app.movimiento_inventario n where n.id = mv.ultimo) as costo_nuevo
    from mov mv
  ), base as (
    select p.id as producto_id, p.nombre as producto, k.costo_anterior, k.costo_nuevo,
           pz.id as presentacion_id, pz.nombre as presentacion, l.id as lista_precio_id, l.nombre as lista,
           app.fn_precio(pz.id, l.id) as precio,
           round(k.costo_nuevo * pz.factor, 2) as costo_presentacion,
           app.fn_margen_objetivo(p.id) as objetivo
    from costos k
    join app.producto p on p.id = k.producto_id
    join app.presentacion pz on pz.producto_id = p.id and pz.activa
    cross join app.lista_precio l
    where l.activa
  )
  select b.producto_id, b.producto, b.costo_anterior, b.costo_nuevo,
         b.presentacion_id, b.presentacion, b.lista_precio_id, b.lista,
         b.precio, b.costo_presentacion,
         case when b.precio > 0 then (b.precio - b.costo_presentacion) / b.precio end as margen,
         b.objetivo,
         case when b.precio is null then null
              when b.precio < b.costo_presentacion then 'bajo_costo'
              when b.precio > 0 and (b.precio - b.costo_presentacion) / b.precio < b.objetivo then 'margen_bajo'
         end as alerta,
         app.fn_precio_sugerido(b.costo_presentacion, b.objetivo) as precio_sugerido
  from base b
  order by b.producto_id, b.presentacion_id, b.lista_precio_id
$$;

-- ---------------------------------------------------------------- vista

-- PEPS fisico supuesto: la existencia actual son las compras mas recientes. Todas las lineas de compras
-- registradas ocupan existencia; solo se listan las que traen caduca_el. presentacion_id y sucursal_id van
-- al final (extra al contrato: la pantalla enlaza a /precios?oferta=<presentacion_id>).
create view app.v_por_caducar as
with lineas as (
  select cl.producto_id, cl.presentacion_id, c.sucursal_id, c.folio, cl.piezas, cl.caduca_el,
         sum(cl.piezas) over (partition by c.sucursal_id, cl.producto_id order by c.fecha desc, cl.id desc) as acumulado
  from app.compra_linea cl
  join app.compra c on c.id = cl.compra_id and c.estado = 'registrada'
)
select l.producto_id,
       p.nombre as producto,
       l.folio as compra_folio,
       l.caduca_el,
       least(l.piezas, e.cantidad - (l.acumulado - l.piezas))::integer as piezas_estimadas,
       l.caduca_el - app.fn_fecha_local(now()) as dias_restantes,
       l.presentacion_id,
       l.sucursal_id
from lineas l
join app.producto p on p.id = l.producto_id
join app.existencia e on e.sucursal_id = l.sucursal_id and e.producto_id = l.producto_id
where l.caduca_el is not null
  and l.acumulado - l.piezas < e.cantidad;

-- ---------------------------------------------------------------- protecciones

-- compra_linea nunca cambia ni se borra. compra solo pasa de registrada a cancelada (con sus campos de cancelacion).
create function app.fn_compra_linea_inmutable() returns trigger
language plpgsql as $$
begin
  raise exception 'COMPRA_INMUTABLE' using errcode = 'P0001', detail = '{}';
end $$;

create function app.fn_compra_protegida() returns trigger
language plpgsql as $$
declare
  v_campos text[] := array['estado','cancelada_en','cancelada_por','motivo_cancelacion'];
begin
  if TG_OP = 'UPDATE' and old.estado = 'registrada' and new.estado = 'cancelada'
     and (to_jsonb(new) - v_campos) = (to_jsonb(old) - v_campos) then
    return new;
  end if;
  raise exception 'COMPRA_INMUTABLE' using errcode = 'P0001', detail = '{}';
end $$;

create trigger trg_compra_linea_inmutable before update or delete on app.compra_linea
  for each row execute function app.fn_compra_linea_inmutable();
create trigger trg_compra_protegida before update or delete on app.compra
  for each row execute function app.fn_compra_protegida();
create trigger trg_compra_truncate before truncate on app.compra
  for each statement execute function app.fn_truncate_bloqueado();
create trigger trg_compra_linea_truncate before truncate on app.compra_linea
  for each statement execute function app.fn_truncate_bloqueado();

-- ---------------------------------------------------------------- permisos

alter table app.rol_permiso disable trigger trg_auditar;

insert into app.permiso (codigo, modulo, descripcion) values
  ('compras.ver', 'compras', 'Ver el historial y el detalle de compras'),
  ('compras.registrar', 'compras', 'Registrar compras a proveedores'),
  ('compras.cancelar', 'compras', 'Cancelar compras');

insert into app.rol_permiso (rol_id, permiso_codigo)
select r.id, p.codigo
from app.rol r, app.permiso p
where r.nombre in ('Administrador', 'Almacenista') and p.codigo in ('compras.ver', 'compras.registrar');

alter table app.rol_permiso enable trigger trg_auditar;

create trigger trg_auditar after insert or update or delete on app.compra
  for each row execute function app.fn_auditar();
create trigger trg_auditar after insert or update or delete on app.compra_linea
  for each row execute function app.fn_auditar();

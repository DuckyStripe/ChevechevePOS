-- 006: lista de surtido (compra contra pedido) y compra inteligente (promociones y calendario de demanda).
-- DDL de CONTRATOS §2.6 y §2.12 (B7). Depende de 001 (notificaciones, plantillas, configuracion), 002 (existencia, kardex),
-- 003 (compras) y 004 (pedidos). No usa nada de 007 (rutas): `pedido.ruta_id` ya existe desde 004.
-- No rehace ninguna funcion anterior (la etapa `surtiendo` del seguimiento la pone 007).
-- Errores de negocio: RAISE EXCEPTION '<CODIGO>' USING ERRCODE = 'P0001', DETAIL = <json>.

-- ---------------------------------------------------------------- tablas

create table app.promocion_proveedor (
  id bigint generated always as identity primary key,
  proveedor_id bigint not null references app.proveedor(id),
  presentacion_id bigint not null references app.presentacion(id),
  costo_presentacion numeric(12,2) not null check (costo_presentacion >= 0),
  minimo_cantidad integer not null default 1 check (minimo_cantidad > 0),
  desde date not null,
  hasta date not null,
  notas text check (length(notas) <= 500),
  creado_por bigint not null references app.usuario(id),
  creado_en timestamptz not null default now(),
  constraint ck_promocion_vigencia check (hasta >= desde)
);
create index idx_promocion_presentacion on app.promocion_proveedor (presentacion_id, desde, hasta);
create index idx_promocion_proveedor on app.promocion_proveedor (proveedor_id, hasta desc);

create table app.fecha_demanda (
  fecha date primary key,
  nombre text not null check (length(trim(nombre)) > 0),
  factor numeric(4,2) not null check (factor between 0.1 and 5)
);

-- ---------------------------------------------------------------- semilla del calendario
-- Quincena: dias 14-16 y 29-1 con 1.30; Jueves y Viernes Santo con 1.30 (Pascua por el algoritmo gregoriano anonimo).
-- Semana Santa pisa a la quincena si caen el mismo dia. La auditoria se crea despues: la bitacora arranca vacia.
create function app.fn_sembrar_fechas_demanda(p_anio integer) returns integer
language plpgsql as $$
declare
  a integer; b integer; c integer; d4 integer; e integer; f integer; g integer; h integer; i integer; k integer; l integer; m integer;
  v_pascua date;
begin
  insert into app.fecha_demanda (fecha, nombre, factor)
  select s.dia::date, 'Quincena', 1.30
  from generate_series(make_date(p_anio, 1, 1), make_date(p_anio, 12, 31), interval '1 day') as s(dia)
  where extract(day from s.dia) in (1, 14, 15, 16, 29, 30, 31)
  on conflict (fecha) do nothing;

  a := p_anio % 19; b := p_anio / 100; c := p_anio % 100; d4 := b / 4; e := b % 4; f := (b + 8) / 25;
  g := (b - f + 1) / 3; h := (19 * a + b - d4 - g + 15) % 30; i := c / 4; k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7; m := (a + 11 * h + 22 * l) / 451;
  v_pascua := make_date(p_anio, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);

  insert into app.fecha_demanda (fecha, nombre, factor) values
    (v_pascua - 3, 'Semana Santa', 1.30), (v_pascua - 2, 'Semana Santa', 1.30)
  on conflict (fecha) do update set nombre = excluded.nombre, factor = excluded.factor;
  return (select count(*)::integer from app.fecha_demanda where extract(year from fecha) = p_anio);
end $$;

-- Tarea periodica (idempotente): en diciembre siembra el anio que viene si no tiene ninguna fecha (si el dueno la vacio a proposito en
-- diciembre, vuelve a sembrarla; es el costo de no guardar una bandera). Devuelve cuantas fechas sembro (0 si no tocaba).
create function app.fn_sembrar_fechas_siguiente() returns integer
language plpgsql as $$
declare
  v_hoy date := app.fn_fecha_local(now());
  v_sig integer := extract(year from v_hoy)::integer + 1;
begin
  if extract(month from v_hoy) <> 12 or exists (select 1 from app.fecha_demanda where extract(year from fecha) = v_sig) then
    return 0;
  end if;
  return app.fn_sembrar_fechas_demanda(v_sig);
end $$;

select app.fn_sembrar_fechas_demanda(extract(year from app.fn_fecha_local(now()))::integer);

create trigger trg_auditar after insert or update or delete on app.promocion_proveedor
  for each row execute function app.fn_auditar();
create trigger trg_auditar after insert or update or delete on app.fecha_demanda
  for each row execute function app.fn_auditar('fecha');

-- ---------------------------------------------------------------- una regla: lineas que comprometen existencia
-- Unica definicion de «linea que compromete stock»: linea `activa` de un pedido confirmado, esperando_cliente, cargado o en_ruta
-- (las lineas en faltante, sustituidas y quitadas no cuentan). La usan v_comprometido (y por ende v_disponible), fn_lista_surtido,
-- fn_pedido_requiere_surtido y el bloqueo de desactivar un producto. Misma forma de v_comprometido de 004, ahora encima de esta vista.
create view app.v_linea_comprometida as
select p.sucursal_id, p.id as pedido_id, l.id as linea_id, l.producto_id, l.piezas, p.estado as estado_pedido, p.fecha_entrega, p.ruta_id
from app.pedido p
join app.pedido_linea l on l.pedido_id = p.id and l.estado = 'activa'
where p.estado in ('confirmado','esperando_cliente','cargado','en_ruta');

create or replace view app.v_comprometido as
select v.sucursal_id, v.producto_id,
       coalesce(sum(v.piezas) filter (where v.estado_pedido in ('confirmado','esperando_cliente')), 0)::integer as confirmadas,
       coalesce(sum(v.piezas) filter (where v.estado_pedido in ('cargado','en_ruta')), 0)::integer as cargadas
from app.v_linea_comprometida v
group by v.sucursal_id, v.producto_id;

create index idx_compra_linea_presentacion on app.compra_linea (presentacion_id);

-- Telefono para wa.me: solo digitos; 10 digitos = Mexico (se antepone 52); valido si queda de 12 o 13 digitos. Si no, null.
create function app.fn_normalizar_telefono(p_telefono text) returns text
language sql immutable as $$
  select case when length(d.n) = 10 then '52' || d.n when length(d.n) in (12, 13) then d.n end
  from (select regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g') as n) d
$$;

-- No se desactiva un producto con pedidos pendientes (lo que se confirmo se tiene que surtir y entregar).
create function app.fn_producto_con_pedidos() returns trigger
language plpgsql as $$
begin
  if old.activo and not new.activo and exists (select 1 from app.v_linea_comprometida v where v.producto_id = new.id) then
    perform app.fn_fallar('PRODUCTO_CON_PEDIDOS', jsonb_build_object('producto_id', new.id));
  end if;
  return new;
end $$;
create trigger trg_producto_con_pedidos before update of activo on app.producto
  for each row execute function app.fn_producto_con_pedidos();

-- ---------------------------------------------------------------- lista de surtido
-- Unica regla de "que hay que comprar" (la usan GET /surtido, GET /despacho, fn_publicar_surtido, el mensaje al proveedor
-- y, en 008, fn_resumen_dia). Se calcula al vuelo; no se guarda. `existencia` sale de la misma tabla que v_disponible y las
-- lineas cuentan con la misma regla que v_comprometido (lineas `activa`; confirmado y esperando_cliente comprometen).
-- piezas_pedidas: pedidos de p_fecha (y de la ruta si viene). comprometido_previo: lo cargado/en ruta (cualquier fecha) y lo
-- confirmado de fechas anteriores, que sale antes y se come la existencia primero.
create function app.fn_lista_surtido(p_sucursal_id bigint, p_fecha date, p_ruta_id bigint default null)
returns table(
  proveedor_id bigint, proveedor text, producto_id bigint, producto text, modo_surtido text,
  piezas_pedidas integer, existencia integer, comprometido_previo integer, disponible integer,
  piezas_a_comprar integer, reponer_minimo integer,
  presentacion_id bigint, presentacion text, factor integer, cantidad_sugerida integer,
  ultimo_costo numeric, costo_estimado numeric,
  sugerido_demanda integer, promocion_id bigint, costo_promocion numeric, ahorro numeric,
  sin_presentacion_compra boolean
)
language sql stable as $$
  with param as (
    select greatest(1, coalesce(app.fn_config('compra_cobertura_dias')::integer, 7)) as cobertura,
           greatest(1, coalesce(app.fn_config('compra_promedio_dias')::integer, 28)) as promedio
  ),
  -- Σ factor de los `cobertura` dias desde p_fecha inclusive (1 si la fecha no esta en el calendario).
  demanda as (
    select (select coalesce(sum(coalesce(fd.factor, 1)), 0)
            from generate_series(0, pa.cobertura - 1) as g
            left join app.fecha_demanda fd on fd.fecha = p_fecha + g) as suma_factor,
           pa.promedio
    from param pa
  ),
  ventas as (
    select m.producto_id, sum(-m.cantidad) as vendidas
    from app.movimiento_inventario m, demanda dm
    where m.sucursal_id = p_sucursal_id and m.tipo = 'venta'
      and m.creado_en >= ((app.fn_fecha_local(now()) - dm.promedio + 1)::timestamp at time zone 'America/Mexico_City')
    group by m.producto_id
  ),
  pedidos as (
    select v.producto_id,
      coalesce(sum(v.piezas) filter (where v.estado_pedido in ('confirmado','esperando_cliente') and v.fecha_entrega = p_fecha
                                       and (p_ruta_id is null or v.ruta_id = p_ruta_id)), 0)::integer as pedidas,
      coalesce(sum(v.piezas) filter (where v.estado_pedido in ('cargado','en_ruta')
                                        or (v.estado_pedido in ('confirmado','esperando_cliente') and v.fecha_entrega < p_fecha)), 0)::integer as previo
    from app.v_linea_comprometida v
    where v.sucursal_id = p_sucursal_id
    group by v.producto_id
  ),
  base as (
    select pr.id as pid, pr.nombre as pnombre, pr.modo_surtido as pmodo, pr.proveedor_id as pprov, pr.existencia_minima,
           coalesce(e.cantidad, 0) as exist, coalesce(pe.pedidas, 0) as pedidas, coalesce(pe.previo, 0) as previo,
           coalesce(v.vendidas, 0) as vendidas
    from app.producto pr
    left join app.existencia e on e.sucursal_id = p_sucursal_id and e.producto_id = pr.id
    left join pedidos pe on pe.producto_id = pr.id
    left join ventas v on v.producto_id = pr.id
    where pr.activo
  ),
  calc as (
    select b.*, (b.exist - b.previo) as disp,
           greatest(0, b.pedidas - greatest(0, b.exist - b.previo)) as a_comprar,
           case when b.pmodo = 'inventario'
                then greatest(0, b.existencia_minima - greatest(0, b.exist - b.previo - b.pedidas)) else 0 end as reponer,
           case when b.pmodo = 'inventario' and b.vendidas > 0
                then greatest(0, ceil(b.vendidas::numeric * dm.suma_factor / dm.promedio
                                      - greatest(0, b.exist - b.previo - b.pedidas)))::integer
                else 0 end as demanda
    from base b, demanda dm
  ),
  util as (
    select c.* from calc c where c.a_comprar + c.reponer > 0 or c.demanda > 0
  ),
  con_pres as (
    select u.*, pz.id as pz_id, pz.nombre as pz_nombre, pz.factor as pz_factor,
           case when pz.id is null then null
                else ceil((u.a_comprar + u.reponer)::numeric / pz.factor)::integer end as sugerida
    from util u
    left join lateral (
      select z.id, z.nombre, z.factor from app.presentacion z
      where z.producto_id = u.pid and z.se_compra and z.activa
      order by z.factor desc, z.id limit 1
    ) pz on true
  )
  select cp.pprov, pv.nombre, cp.pid, cp.pnombre, cp.pmodo,
         cp.pedidas, cp.exist, cp.previo, cp.disp, cp.a_comprar, cp.reponer,
         cp.pz_id, cp.pz_nombre, cp.pz_factor, cp.sugerida,
         uc.costo, round(cp.sugerida * uc.costo, 2),
         cp.demanda, pm.id, pm.costo_presentacion,
         round((uc.costo - pm.costo_presentacion) * cp.sugerida, 2),
         (cp.pz_id is null)
  from con_pres cp
  left join app.proveedor pv on pv.id = cp.pprov
  left join lateral (
    select cl.costo_presentacion as costo
    from app.compra_linea cl join app.compra co on co.id = cl.compra_id
    where cl.presentacion_id = cp.pz_id and co.estado = 'registrada' and co.sucursal_id = p_sucursal_id
    order by co.fecha desc, co.id desc, cl.id desc limit 1
  ) uc on true
  left join lateral (
    select pp.id, pp.costo_presentacion from app.promocion_proveedor pp
    where pp.presentacion_id = cp.pz_id and pp.proveedor_id = cp.pprov and p_fecha between pp.desde and pp.hasta and pp.minimo_cantidad <= cp.sugerida
    order by pp.costo_presentacion, pp.id limit 1
  ) pm on true
  order by (cp.pprov is null), pv.nombre, cp.pnombre, cp.pid
$$;

-- Unica regla de «este pedido requiere surtido»: pedido confirmado o esperando_cliente con una linea activa cuyo producto sale en la lista de
-- surtido de SU fecha de entrega y su sucursal con algo que comprar para pedidos (piezas_a_comprar > 0). F6 (fn_requiere_surtido) delega aqui.
create function app.fn_pedido_requiere_surtido(p_pedido_id bigint) returns boolean
language sql stable as $$
  select coalesce((
    select exists (
      select 1 from app.v_linea_comprometida v
      join app.fn_lista_surtido(v.sucursal_id, v.fecha_entrega) s on s.producto_id = v.producto_id and s.piezas_a_comprar > 0
      where v.pedido_id = p_pedido_id and v.estado_pedido in ('confirmado','esperando_cliente') and v.fecha_entrega is not null)
  ), false)
$$;

-- Avisa a quien compra (`compras.registrar`) que la lista de p_fecha esta lista. Clave = fecha + resumen de la lista:
-- publicar dos veces lo mismo no duplica; si cambia un pedido o una existencia, avisa de nuevo. Lista vacia: no avisa.
-- Devuelve cuantos avisos nuevos se crearon.
create function app.fn_publicar_surtido(p_usuario_id bigint, p_sucursal_id bigint, p_fecha date) returns integer
language plpgsql as $$
declare
  v_n integer;
  v_hash text;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'surtido.ver');
  select count(*)::integer,
         md5(coalesce(string_agg(concat_ws(':', l.producto_id, l.piezas_pedidas, l.piezas_a_comprar, l.reponer_minimo,
                                           l.cantidad_sugerida, l.sugerido_demanda), ',' order by l.producto_id), ''))
    into v_n, v_hash
  from app.fn_lista_surtido(p_sucursal_id, p_fecha) l;
  if v_n = 0 then return 0; end if;
  return app.fn_notificar('surtido_listo', 'surtido:' || p_sucursal_id::text || ':' || p_fecha::text || ':' || v_hash,
                          jsonb_build_object('fecha', p_fecha, 'num_productos', v_n));
end $$;

-- Mensaje de WhatsApp al proveedor (plantilla wa_surtido_proveedor). Las lineas se arman aqui, sin precios ni costos:
-- «2 Caja de 24 Corona Extra 355 ml». Un producto sin presentacion de compra va como nota («falta definir como se compra»).
-- `telefono` ya viene normalizado para wa.me (null si falta); `telefono_invalido` = tiene uno pero no sirve. Sin fila = proveedor inexistente.
create function app.fn_mensaje_surtido(p_sucursal_id bigint, p_fecha date, p_proveedor_id bigint)
returns table(telefono text, texto text, telefono_invalido boolean)
language sql stable as $$
  select app.fn_normalizar_telefono(pv.telefono),
         (select r.texto from app.fn_render_plantilla('wa_surtido_proveedor', jsonb_build_object(
            'proveedor', pv.nombre,
            'fecha', to_char(p_fecha, 'DD/MM/YYYY'),
            'lineas', coalesce((
              select string_agg(
                       case when l.cantidad_sugerida is null
                            then (l.piezas_a_comprar + l.reponer_minimo) || ' piezas ' || l.producto || ''
                            else l.cantidad_sugerida || ' ' || l.presentacion || ' ' || l.producto end,
                       E'\n' order by l.producto, l.producto_id)
              from app.fn_lista_surtido(p_sucursal_id, p_fecha) l
              where l.proveedor_id = pv.id and (l.cantidad_sugerida > 0 or (l.cantidad_sugerida is null and l.piezas_a_comprar + l.reponer_minimo > 0))), ''))) r),
         (nullif(trim(coalesce(pv.telefono, '')), '') is not null and app.fn_normalizar_telefono(pv.telefono) is null)
  from app.proveedor pv where pv.id = p_proveedor_id
$$;

-- Reemplaza el calendario de un anio completo (PUT /api/fechas-demanda). Devuelve cuantas fechas quedaron.
create function app.fn_reemplazar_fechas_demanda(p_usuario_id bigint, p_anio integer, p_fechas jsonb) returns integer
language plpgsql as $$
declare
  v_n integer;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'configuracion.editar');
  if exists (select 1 from jsonb_to_recordset(p_fechas) as x(fecha date) where extract(year from x.fecha) <> p_anio) then
    perform app.fn_fallar('FECHA_NO_VALIDA', jsonb_build_object('anio', p_anio));
  end if;
  delete from app.fecha_demanda where extract(year from fecha) = p_anio;
  insert into app.fecha_demanda (fecha, nombre, factor)
  select x.fecha, x.nombre, x.factor from jsonb_to_recordset(p_fechas) as x(fecha date, nombre text, factor numeric);
  select count(*)::integer into v_n from app.fecha_demanda where extract(year from fecha) = p_anio;
  return v_n;
end $$;

-- ---------------------------------------------------------------- permisos

alter table app.rol_permiso disable trigger trg_auditar;

insert into app.permiso (codigo, modulo, descripcion) values
  ('surtido.ver', 'surtido', 'Ver la lista de surtido y publicarla');

insert into app.rol_permiso (rol_id, permiso_codigo)
select r.id, 'surtido.ver' from app.rol r where r.nombre in ('Administrador', 'Almacenista');

alter table app.rol_permiso enable trigger trg_auditar;

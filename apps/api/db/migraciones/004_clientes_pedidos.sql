-- 004: clientes, enlace personal con PIN, pedidos, faltantes y sustituciones, avisos por WhatsApp, "lo de siempre".
-- DDL de CONTRATOS §2.4 y §2.12 (B5, B6). Depende de 001 (notificaciones, folios, plantillas), 002 (precios, existencia)
-- y 003. Errores de negocio: RAISE EXCEPTION '<CODIGO>' USING ERRCODE = 'P0001', DETAIL = <json>.
-- Candados, siempre en este orden: fila de pedido -> propuestas -> lineas. (Ninguna funcion de 004 bloquea existencias: solo las lee.)
-- Ninguna funcion revoca el enlace, quita dispositivos ni desactiva clientes por su cuenta (regla C21): solo
-- fn_generar_enlace, fn_revocar_enlace y fn_quitar_dispositivo, llamadas por una persona.

-- ---------------------------------------------------------------- tablas

create table app.zona (
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) > 0),
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);
create unique index uq_zona_nombre on app.zona (lower(nombre));

create table app.cliente (
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) > 0),
  tipo_negocio text not null default 'tienda'
    check (tipo_negocio in ('tienda','miscelanea','deposito','restaurante','otro')),
  contacto text,
  telefono_whatsapp text check (telefono_whatsapp ~ '^[0-9]{12,13}$'),
  direccion text, referencias text, notas text,
  zona_id bigint references app.zona(id),
  dias_visita smallint[] not null default '{}'
    check (dias_visita <@ '{1,2,3,4,5,6,7}'::smallint[]),
  lat numeric(9,6), lng numeric(9,6),
  ubicacion_fuente text check (ubicacion_fuente in ('mapa','app','cliente')),
  ubicacion_en timestamptz,
  lat_propuesta numeric(9,6), lng_propuesta numeric(9,6), propuesta_en timestamptz,
  lista_precio_id bigint not null references app.lista_precio(id),
  limite_credito numeric(12,2) not null default 0 check (limite_credito >= 0),
  dias_credito integer not null default 0 check (dias_credito between 0 and 365),
  ya_compro boolean not null default false,
  sugerir_pedido boolean not null default true,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint ck_cliente_ubicacion check ((lat is null) = (lng is null) and (lat is null) = (ubicacion_fuente is null)),
  constraint ck_cliente_propuesta check ((lat_propuesta is null) = (lng_propuesta is null) and (lat_propuesta is null) = (propuesta_en is null)),
  constraint ck_cliente_en_mexico check ((lat is null or (lat between 14 and 33 and lng between -119 and -86))
    and (lat_propuesta is null or (lat_propuesta between 14 and 33 and lng_propuesta between -119 and -86)))
);
create index idx_cliente_nombre on app.cliente (lower(nombre) text_pattern_ops);
create index idx_cliente_zona on app.cliente (zona_id);

create table app.cliente_enlace (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references app.cliente(id),
  token_hash text not null constraint uq_enlace_hash unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_cifrado bytea not null,
  creado_por bigint not null references app.usuario(id),
  creado_en timestamptz not null default now(),
  revocado_en timestamptz, revocado_por bigint references app.usuario(id),
  motivo_revocacion text check (motivo_revocacion in ('reenviado','ya_no_es_cliente','solo_cotiza','reemplazado','otro')),
  nota_revocacion text,
  ultimo_uso_en timestamptz,
  pin_hash text,
  constraint ck_enlace_revocado check ((revocado_en is null) = (motivo_revocacion is null))
);
create unique index uq_enlace_vigente on app.cliente_enlace (cliente_id) where revocado_en is null;

create table app.cliente_dispositivo (
  id bigint generated always as identity primary key,
  cliente_enlace_id bigint not null references app.cliente_enlace(id),
  token_hash text not null constraint uq_dispositivo_cliente unique check (token_hash ~ '^[0-9a-f]{64}$'),
  navegador text,
  primer_uso_en timestamptz not null default now(),
  ultimo_uso_en timestamptz not null default now(),
  quitado_en timestamptz, quitado_por bigint references app.usuario(id)
);
create index idx_dispositivo_enlace on app.cliente_dispositivo (cliente_enlace_id) where quitado_en is null;

create table app.cliente_pin_espera (
  cliente_enlace_id bigint not null references app.cliente_enlace(id),
  ip_hash text not null,
  fallos smallint not null default 0,
  espera_hasta timestamptz,
  actualizado_en timestamptz not null default now(),   -- para limpiar filas viejas (fn_alertas_clientes)
  primary key (cliente_enlace_id, ip_hash)               -- ip_hash '*' = espera de TODO el enlace (ataque distribuido)
);

-- Cada PIN malo, para contar contra el enlace sin importar la IP. Se limpia solo (fn_alertas_clientes).
create table app.cliente_pin_fallo (
  id bigint generated always as identity primary key,
  cliente_enlace_id bigint not null references app.cliente_enlace(id),
  creado_en timestamptz not null default now()
);
create index idx_pin_fallo on app.cliente_pin_fallo (cliente_enlace_id, creado_en);

create table app.cliente_visita (
  cliente_id bigint not null references app.cliente(id),
  fecha date not null,
  aperturas integer not null default 0,
  vistas_catalogo integer not null default 0,
  primary key (cliente_id, fecha)
);

create table app.cliente_favorito (
  cliente_id bigint not null references app.cliente(id),
  presentacion_id bigint not null references app.presentacion(id),
  creado_en timestamptz not null default now(),
  primary key (cliente_id, presentacion_id)
);

-- B6: lo que el interprete aprende al corregir. cliente_id null = vale para todos.
create table app.cliente_alias (
  cliente_id bigint references app.cliente(id),
  texto text not null,
  presentacion_id bigint not null references app.presentacion(id),
  veces integer not null default 1,
  actualizado_en timestamptz not null default now(),
  constraint uq_cliente_alias unique nulls not distinct (cliente_id, texto)
);

create table app.producto_equivalente (
  producto_id bigint not null references app.producto(id),
  equivalente_id bigint not null references app.producto(id),
  orden smallint not null default 1,
  primary key (producto_id, equivalente_id),
  constraint ck_equivalente_distinto check (producto_id <> equivalente_id)
);

create table app.pedido (
  id bigint generated always as identity primary key,
  sucursal_id bigint not null references app.sucursal(id),
  folio text,   -- null solo mientras un pedido sugerido esta propuesto (o se cancelo sin aceptarse): el folio P se asigna al aceptar
  cliente_id bigint not null references app.cliente(id),
  origen text not null check (origen in ('enlace','captura','sugerido')),
  estado text not null default 'recibido' check (estado in
    ('propuesto','recibido','esperando_cliente','confirmado','cargado','en_ruta','entregado','no_entregado','cancelado')),
  propuesto_vence_en timestamptz,
  respuesta_limite_en timestamptz,
  entrega_tipo text not null default 'reparto' check (entrega_tipo in ('reparto','recoge')),
  fecha_solicitada date,
  fecha_entrega date,
  lista_precio_id bigint not null references app.lista_precio(id),
  total numeric(12,2) not null default 0 check (total >= 0),
  notas text check (length(notas) <= 500),
  notas_internas text,
  version integer not null default 1,
  ruta_id bigint,
  venta_id bigint constraint uq_pedido_venta unique,
  clave_idempotencia uuid not null constraint uq_pedido_clave unique,
  hash_solicitud text not null,
  creado_por bigint references app.usuario(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  confirmado_en timestamptz, confirmado_por bigint references app.usuario(id),
  entregado_en timestamptz,
  cancelado_en timestamptz, cancelado_por bigint references app.usuario(id),
  motivo text,
  constraint uq_pedido_folio unique (sucursal_id, folio),
  constraint ck_pedido_folio check (folio is not null or origen = 'sugerido'),
  constraint ck_pedido_origen check ((origen = 'captura') = (creado_por is not null)),
  constraint ck_pedido_propuesto check ((estado = 'propuesto') = (propuesto_vence_en is not null)),
  constraint ck_pedido_fecha check (estado in ('propuesto','recibido','cancelado') or fecha_entrega is not null),
  constraint ck_pedido_espera check ((estado = 'esperando_cliente') = (respuesta_limite_en is not null)),
  constraint ck_pedido_venta check ((estado = 'entregado' and venta_id is not null)
    or (estado <> 'entregado' and (venta_id is null or estado = 'cancelado'))),
  constraint ck_pedido_cancelado check ((estado = 'cancelado') = (cancelado_en is not null))
);
create index idx_pedido_bandeja on app.pedido (sucursal_id, estado, fecha_entrega);
create index idx_pedido_cliente on app.pedido (cliente_id, creado_en desc);

create table app.pedido_linea (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references app.pedido(id),
  numero smallint not null,
  presentacion_id bigint not null references app.presentacion(id),
  producto_id bigint not null references app.producto(id),
  factor integer not null check (factor > 0),
  cantidad_pedida integer not null check (cantidad_pedida > 0),
  cantidad integer not null check (cantidad >= 0),
  piezas integer generated always as (cantidad * factor) stored,
  precio_lista numeric(12,2) not null,
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  importe numeric(12,2) generated always as (round(cantidad * precio_unitario, 2)) stored,
  motivo_ajuste text,
  estado text not null default 'activa' check (estado in ('activa','faltante','sustituida','quitada')),
  sustituye_linea_id bigint references app.pedido_linea(id),
  cantidad_entregada integer check (cantidad_entregada between 0 and cantidad),
  constraint uq_pedido_linea_numero unique (pedido_id, numero),
  constraint ck_pedido_linea_ajuste check (cantidad = cantidad_pedida or motivo_ajuste is not null),
  constraint ck_pedido_linea_estado check (estado not in ('sustituida','quitada') or cantidad = 0)
);
create index idx_pedido_linea_producto on app.pedido_linea (producto_id);

create table app.propuesta_faltante (
  id bigint generated always as identity primary key,
  pedido_linea_id bigint not null references app.pedido_linea(id),
  causa text not null check (causa in ('sin_existencia','proveedor_sin_producto','danado','otro')),
  nota text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','aceptada','rechazada','vencida','cancelada')),
  opcion_elegida_id bigint,
  limite_en timestamptz not null,
  creada_por bigint not null references app.usuario(id),
  creado_en timestamptz not null default now(),
  respondida_en timestamptz,
  respondida_por bigint references app.usuario(id),
  constraint ck_propuesta_respuesta check ((estado = 'pendiente') = (respondida_en is null))
);
create unique index uq_propuesta_pendiente on app.propuesta_faltante (pedido_linea_id) where estado = 'pendiente';

create table app.propuesta_opcion (
  id bigint generated always as identity primary key,
  propuesta_id bigint not null references app.propuesta_faltante(id),
  tipo text not null check (tipo in ('sustituto','reducir')),
  presentacion_id bigint not null references app.presentacion(id),
  cantidad integer not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  importe numeric(12,2) generated always as (round(cantidad * precio_unitario, 2)) stored,
  orden smallint not null default 1
);
alter table app.propuesta_faltante add constraint fk_propuesta_opcion
  foreign key (opcion_elegida_id) references app.propuesta_opcion(id);

create table app.aviso_cliente (
  id bigint generated always as identity primary key,
  cliente_id bigint references app.cliente(id),
  usuario_id bigint references app.usuario(id),
  pedido_id bigint references app.pedido(id),
  plantilla text not null references app.plantilla(clave),
  vars jsonb not null default '{}',
  clave text not null constraint uq_aviso_clave unique,
  estado text not null default 'pendiente' check (estado in ('pendiente','enviado','descartado')),
  creado_en timestamptz not null default now(),
  enviado_en timestamptz, enviado_por bigint references app.usuario(id),
  constraint ck_aviso_enviado check ((estado = 'enviado') = (enviado_en is not null)),
  constraint ck_aviso_destino check ((cliente_id is null) <> (usuario_id is null))
);
create index idx_aviso_pendiente on app.aviso_cliente (creado_en) where estado = 'pendiente';

create table app.pedido_evento (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references app.pedido(id),
  tipo text not null check (tipo in ('recibido','editado_cliente','editado','confirmado','ajustado',
    'faltante_propuesto','faltante_respondido','faltante_vencido','asignado_ruta','quitado_ruta','cargado',
    'en_ruta','entregado','no_entregado','reprogramado','cancelado')),
  publico boolean not null default true,
  usuario_id bigint references app.usuario(id),
  detalle jsonb not null default '{}',
  creado_en timestamptz not null default now()
);
create index idx_pedido_evento on app.pedido_evento (pedido_id, id);

-- ---------------------------------------------------------------- evento nuevo: pin_ataque
-- Muchos PIN malos contra un mismo enlace desde varias IP: avisa al personal (clientes.enlace) y alarga la espera; nunca revoca (C21).
alter table app.notificacion drop constraint ck_notificacion_evento;
alter table app.notificacion add constraint ck_notificacion_evento check (evento in ('pedido_nuevo','pedido_modificado','pedido_cancelado_cliente',
  'faltante_respondido','surtido_listo','ruta_asignada','entrega_fallida','ubicacion_propuesta',
  'dispositivo_nuevo','visitas_sin_pedido','cliente_inactivo','pin_ataque'));
alter table app.notificacion_preferencia drop constraint ck_notificacion_preferencia_evento;
alter table app.notificacion_preferencia add constraint ck_notificacion_preferencia_evento check (evento in ('pedido_nuevo','pedido_modificado','pedido_cancelado_cliente',
  'faltante_respondido','surtido_listo','ruta_asignada','entrega_fallida','ubicacion_propuesta',
  'dispositivo_nuevo','visitas_sin_pedido','cliente_inactivo','pin_ataque'));

-- Misma firma que 001: CREATE OR REPLACE. Solo agrega pin_ataque (permiso clientes.enlace, ruta de la ficha del cliente).
create or replace function app.fn_notificar(p_evento text, p_clave text, p_vars jsonb, p_usuario_id bigint default null)
returns integer
language plpgsql as $$
declare
  v_permiso text;
  v_titulo text;
  v_cuerpo text;
  v_ruta text;
  v_n integer;
begin
  v_permiso := case
    when p_evento in ('pedido_nuevo','pedido_modificado','pedido_cancelado_cliente','faltante_respondido','entrega_fallida')
      then 'pedidos.gestionar'
    when p_evento = 'surtido_listo' then 'compras.registrar'
    when p_evento = 'ubicacion_propuesta' then 'clientes.editar'
    when p_evento in ('dispositivo_nuevo','visitas_sin_pedido','cliente_inactivo','pin_ataque') then 'clientes.enlace'
    else null  -- ruta_asignada: solo con p_usuario_id
  end;

  v_ruta := case p_evento
    when 'pedido_nuevo' then '/pedidos/' || coalesce((p_vars ->> 'pedido_id')::bigint::text, '')
    when 'pedido_modificado' then '/pedidos/' || coalesce((p_vars ->> 'pedido_id')::bigint::text, '')
    when 'pedido_cancelado_cliente' then '/pedidos/' || coalesce((p_vars ->> 'pedido_id')::bigint::text, '')
    when 'faltante_respondido' then '/pedidos/' || coalesce((p_vars ->> 'pedido_id')::bigint::text, '')
    when 'entrega_fallida' then '/pedidos/' || coalesce((p_vars ->> 'pedido_id')::bigint::text, '')
    when 'surtido_listo' then '/surtido?fecha=' || coalesce((p_vars ->> 'fecha')::date::text, '')
    when 'ruta_asignada' then '/reparto'
    when 'pin_ataque' then '/clientes/' || coalesce((p_vars ->> 'cliente_id')::bigint::text, '')
    when 'dispositivo_nuevo' then '/clientes/' || coalesce((p_vars ->> 'cliente_id')::bigint::text, '')
    when 'ubicacion_propuesta' then '/clientes/' || coalesce((p_vars ->> 'cliente_id')::bigint::text, '')
    when 'visitas_sin_pedido' then '/clientes?alerta=visitas'
    when 'cliente_inactivo' then '/clientes?alerta=inactivo'
  end;

  select r.titulo, r.texto into v_titulo, v_cuerpo
  from app.fn_render_plantilla('push_' || p_evento, p_vars) r;

  with destino as (
    select u.id from app.usuario u where u.id = p_usuario_id
    union
    select u.id from app.usuario u
    where p_usuario_id is null and u.activo and v_permiso is not null
      and app.fn_tiene_permiso(u.id, v_permiso)
  ), ins as (
    insert into app.notificacion (usuario_id, evento, titulo, cuerpo, datos, clave)
    select d.id, p_evento, v_titulo, v_cuerpo, jsonb_build_object('ruta', v_ruta), p_clave
    from destino d
    on conflict (usuario_id, clave) do nothing
    returning 1
  )
  select count(*)::integer into v_n from ins;
  return v_n;
end $$;

-- ---------------------------------------------------------------- vistas

-- confirmadas = lineas activas de pedidos confirmado o esperando_cliente (las lineas en faltante no cuentan);
-- cargadas = cargado/en_ruta. propuesto y recibido no cuentan.
create view app.v_comprometido as
select p.sucursal_id, l.producto_id,
       coalesce(sum(l.piezas) filter (where p.estado in ('confirmado','esperando_cliente')), 0)::integer as confirmadas,
       coalesce(sum(l.piezas) filter (where p.estado in ('cargado','en_ruta')), 0)::integer as cargadas
from app.pedido p
join app.pedido_linea l on l.pedido_id = p.id and l.estado = 'activa'
where p.estado in ('confirmado','esperando_cliente','cargado','en_ruta')
group by p.sucursal_id, l.producto_id;

-- Unica regla de "disponible" (puede ser negativo: falta comprar).
create view app.v_disponible as
select coalesce(e.sucursal_id, c.sucursal_id) as sucursal_id,
       coalesce(e.producto_id, c.producto_id) as producto_id,
       coalesce(e.cantidad, 0) as existencia,
       coalesce(c.confirmadas, 0) as confirmadas,
       coalesce(c.cargadas, 0) as cargadas,
       coalesce(e.cantidad, 0) - coalesce(c.confirmadas, 0) - coalesce(c.cargadas, 0) as disponible
from app.existencia e
full join app.v_comprometido c on c.sucursal_id = e.sucursal_id and c.producto_id = e.producto_id;

-- B5: de los ultimos 10 pedidos entregados (fecha local de creacion), mediana de dias entre pedidos. Requiere >= 3.
-- mediana_dias es double precision (percentile_cont).
create view app.v_cadencia_cliente as
with ult as (
  select p.cliente_id, app.fn_fecha_local(p.creado_en) as fecha,
         row_number() over (partition by p.cliente_id order by p.creado_en desc, p.id desc) as rn
  from app.pedido p where p.estado = 'entregado'
), dif as (
  select u.cliente_id, u.fecha,
         u.fecha - lag(u.fecha) over (partition by u.cliente_id order by u.rn desc) as dias
  from ult u where u.rn <= 10
), agg as (
  select d.cliente_id, count(*)::integer as num_pedidos, max(d.fecha) as ultima,
         percentile_cont(0.5) within group (order by d.dias) as mediana_dias
  from dif d group by d.cliente_id
)
select a.cliente_id, a.num_pedidos, a.mediana_dias,
       (app.fn_fecha_local(now()) - a.ultima) as dias_desde_ultimo,
       ((app.fn_fecha_local(now()) - a.ultima)
         > a.mediana_dias + (select (cf.valor #>> '{}')::numeric from app.configuracion cf where cf.clave = 'sugerencia_dias_tolerancia')) as atrasado
from agg a where a.num_pedidos >= 3;

-- Las mismas reglas de alerta alimentan fn_alertas_clientes (tarea) y GET /clientes (alertas). Solo informa.
create view app.v_alerta_cliente as
with cfg as (
  select (select (valor #>> '{}')::integer from app.configuracion where clave = 'visitas_umbral') as umbral,
         (select (valor #>> '{}')::integer from app.configuracion where clave = 'visitas_dias') as dias,
         (select (valor #>> '{}')::integer from app.configuracion where clave = 'inactividad_dias') as inactividad,
         app.fn_fecha_local(now()) as hoy
)
select c.id as cliente_id, 'visitas_sin_pedido'::text as tipo,
       'visitas:' || c.id || ':' || to_char(cfg.hoy, 'IYYY"-W"IW') as clave,
       jsonb_build_object('cliente', c.nombre, 'cliente_id', c.id, 'aperturas', v.aperturas, 'dias', cfg.dias) as detalle
from app.cliente c
join app.cliente_enlace e on e.cliente_id = c.id and e.revocado_en is null
cross join cfg
cross join lateral (
  select coalesce(sum(cv.aperturas), 0)::integer as aperturas
  from app.cliente_visita cv where cv.cliente_id = c.id and cv.fecha > cfg.hoy - cfg.dias) v
where c.activo and v.aperturas >= cfg.umbral
  and not exists (select 1 from app.pedido p
                  where p.cliente_id = c.id and p.estado <> 'propuesto' and app.fn_fecha_local(p.creado_en) > cfg.hoy - cfg.dias)
union all
select c.id, 'cliente_inactivo',
       'inactivo:' || c.id || ':' || coalesce(u.id::text, 'e' || e.id),
       jsonb_build_object('cliente', c.nombre, 'cliente_id', c.id,
                          'dias', cfg.hoy - app.fn_fecha_local(coalesce(u.creado_en, e.creado_en)))
from app.cliente c
join app.cliente_enlace e on e.cliente_id = c.id and e.revocado_en is null
cross join cfg
left join lateral (
  select p.id, p.creado_en from app.pedido p
  where p.cliente_id = c.id and p.estado <> 'propuesto' order by p.creado_en desc, p.id desc limit 1) u on true
where c.activo and cfg.hoy - app.fn_fecha_local(coalesce(u.creado_en, e.creado_en)) >= cfg.inactividad
union all
select c.id, 'dispositivo_nuevo', 'dispositivo:' || d.id,
       jsonb_build_object('cliente', c.nombre, 'cliente_id', c.id, 'dispositivo', coalesce(d.navegador, ''))
from app.cliente_dispositivo d
join app.cliente_enlace e on e.id = d.cliente_enlace_id and e.revocado_en is null
join app.cliente c on c.id = e.cliente_id and c.activo
cross join cfg
where d.quitado_en is null
  and d.primer_uso_en >= now() - make_interval(days => cfg.dias)
  and exists (select 1 from app.cliente_dispositivo d0 where d0.cliente_enlace_id = d.cliente_enlace_id and d0.id < d.id);

-- ---------------------------------------------------------------- ayudas internas

create function app.fn_fallar(p_codigo text, p_detalle jsonb default '{}') returns void
language plpgsql as $$
begin
  raise exception '%', p_codigo using errcode = 'P0001', detail = p_detalle::text;
end $$;

create function app.fn_exigir_permiso(p_usuario_id bigint, p_codigo text) returns void
language plpgsql as $$
begin
  if not coalesce(app.fn_tiene_permiso(p_usuario_id, p_codigo), false) then
    perform app.fn_fallar('SIN_PERMISO', jsonb_build_object('permiso', p_codigo));
  end if;
end $$;

create function app.fn_config(p_clave text) returns text
language sql stable as $$
  select cf.valor #>> '{}' from app.configuracion cf where cf.clave = p_clave
$$;

-- Conversiones de JSON que vienen del borde: un valor mal formado es VALIDACION, nunca un 22P02/22007 (500).
create function app.fn_json_entero(p_valor text, p_campo text) returns integer
language plpgsql immutable as $$
begin
  if p_valor is null or p_valor !~ '^-?[0-9]{1,9}$' then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', p_campo));
  end if;
  return p_valor::integer;
end $$;

create function app.fn_json_fecha(p_valor text, p_campo text) returns date
language plpgsql immutable as $$
begin
  if p_valor is null or p_valor !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', p_campo));
  end if;
  begin
    return p_valor::date;
  exception when others then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', p_campo));
  end;
  return null;
end $$;

create function app.fn_json_dinero(p_valor text, p_campo text) returns numeric
language plpgsql immutable as $$
begin
  if p_valor is null or p_valor !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$' then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', p_campo));
  end if;
  return p_valor::numeric;
end $$;

create function app.fn_json_uuid(p_valor text, p_campo text) returns uuid
language plpgsql immutable as $$
begin
  if p_valor is null or p_valor !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', p_campo));
  end if;
  return p_valor::uuid;
end $$;

create function app.fn_pedido_evento(p_pedido_id bigint, p_tipo text, p_usuario_id bigint,
                                     p_detalle jsonb default '{}', p_publico boolean default true) returns void
language sql as $$
  insert into app.pedido_evento (pedido_id, tipo, publico, usuario_id, detalle)
  values (p_pedido_id, p_tipo, p_publico, p_usuario_id, coalesce(p_detalle, '{}'))
$$;

create function app.fn_pedido_resumen(p_pedido_id bigint) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', p.id, 'folio', p.folio, 'cliente_id', p.cliente_id, 'estado', p.estado,
           'version', p.version, 'total', p.total::text, 'fecha_solicitada', p.fecha_solicitada,
           'fecha_entrega', p.fecha_entrega, 'entrega_tipo', p.entrega_tipo,
           'respuesta_limite_en', p.respuesta_limite_en)
  from app.pedido p where p.id = p_pedido_id
$$;

-- Texto "Producto Presentacion: antes -> despues" por cada cambio de [{presentacion, antes, despues}].
create function app.fn_cambios_texto(p_cambios jsonb) returns text
language sql stable as $$
  select coalesce(string_agg(format('%s: %s → %s', j ->> 'presentacion', j ->> 'antes', j ->> 'despues'), E'\n'), '')
  from jsonb_array_elements(p_cambios) j
$$;

-- ---------------------------------------------------------------- avisos al cliente

create function app.fn_aviso_cliente(p_cliente_id bigint, p_pedido_id bigint, p_plantilla text, p_clave text, p_vars jsonb)
returns bigint
language plpgsql as $$
declare
  v_id bigint;
begin
  if not exists (select 1 from app.plantilla pl where pl.clave = p_plantilla and pl.canal = 'whatsapp') then
    perform app.fn_fallar('PLANTILLA_NO_EXISTE', jsonb_build_object('clave', p_plantilla));
  end if;
  insert into app.aviso_cliente (cliente_id, pedido_id, plantilla, vars, clave)
  values (p_cliente_id, p_pedido_id, p_plantilla, coalesce(p_vars, '{}'), p_clave)
  on conflict (clave) do nothing
  returning id into v_id;
  if v_id is null then
    select a.id into v_id from app.aviso_cliente a where a.clave = p_clave;
    return v_id;
  end if;
  -- El aviso nuevo lleva el estado vigente: los pendientes anteriores sobran.
  update app.aviso_cliente a set estado = 'descartado'
  where a.estado = 'pendiente' and a.id <> v_id
    and case when p_pedido_id is not null then a.pedido_id = p_pedido_id
             else a.cliente_id = p_cliente_id and a.plantilla = p_plantilla end;
  return v_id;
end $$;

-- Aviso de un pedido: variables comunes + extra; clave <plantilla>:p<pedido>:v<version>. Sin enlace ni telefono.
create function app.fn_aviso_pedido(p_pedido_id bigint, p_plantilla text, p_extra jsonb default '{}') returns bigint
language sql as $$
  select app.fn_aviso_cliente(p.cliente_id, p.id, p_plantilla, p_plantilla || ':p' || p.id || ':v' || p.version,
    jsonb_strip_nulls(jsonb_build_object('cliente', c.nombre, 'folio', p.folio, 'total', p.total::text,
                                         'fecha_entrega', to_char(p.fecha_entrega, 'DD/MM/YYYY')) || p_extra))
  from app.pedido p join app.cliente c on c.id = p.cliente_id where p.id = p_pedido_id
$$;

create function app.fn_notificar_pedido(p_evento text, p_pedido_id bigint, p_clave text, p_extra jsonb default '{}')
returns integer
language sql as $$
  select app.fn_notificar(p_evento, p_clave,
    jsonb_build_object('cliente', c.nombre, 'folio', p.folio, 'total', p.total::text, 'pedido_id', p.id) || p_extra)
  from app.pedido p join app.cliente c on c.id = p.cliente_id where p.id = p_pedido_id
$$;

create function app.fn_marcar_aviso(p_usuario_id bigint, p_aviso_id bigint, p_estado text) returns void
language plpgsql as $$
declare
  v_a app.aviso_cliente;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'avisos.enviar');
  -- TODO F6: quien tiene avisos.enviar pero no pedidos.ver (el Repartidor) solo podra marcar los avisos de pedidos de SUS rutas;
  -- hasta que existan las rutas, SQL se lo niega.
  perform app.fn_exigir_permiso(p_usuario_id, 'pedidos.ver');
  if p_estado is null or p_estado not in ('enviado','descartado') then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'estado'));
  end if;
  select * into v_a from app.aviso_cliente a where a.id = p_aviso_id for update;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('aviso_id', p_aviso_id));
  end if;
  if v_a.estado <> 'pendiente' then
    perform app.fn_fallar('AVISO_NO_PENDIENTE', jsonb_build_object('aviso_id', p_aviso_id));
  end if;
  update app.aviso_cliente a
  set estado = p_estado,
      enviado_en = case when p_estado = 'enviado' then now() end,
      enviado_por = case when p_estado = 'enviado' then p_usuario_id end
  where a.id = p_aviso_id;
end $$;

-- ---------------------------------------------------------------- enlace, PIN y dispositivos

-- El token lo genera y cifra la API; SQL nunca lo ve en claro.
create function app.fn_generar_enlace(p_usuario_id bigint, p_cliente_id bigint, p_token_hash text,
                                      p_token_cifrado bytea, p_forzar boolean default false) returns bigint
language plpgsql as $$
declare
  v_c app.cliente;
  v_id bigint;
  v_sin_compra boolean;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'clientes.enlace');
  select * into v_c from app.cliente c where c.id = p_cliente_id for update;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('cliente_id', p_cliente_id));
  end if;
  if not v_c.activo then
    perform app.fn_fallar('CLIENTE_INACTIVO', jsonb_build_object('cliente_id', p_cliente_id));
  end if;

  v_sin_compra := app.fn_config('enlace_tras_primera_compra') = 'true' and not v_c.ya_compro
    and not exists (select 1 from app.pedido p where p.cliente_id = p_cliente_id and p.estado = 'entregado');
  if v_sin_compra and not coalesce(p_forzar, false) then
    perform app.fn_fallar('SIN_PRIMERA_COMPRA', jsonb_build_object('cliente_id', p_cliente_id));
  end if;

  -- Revocar el vigente invalida tambien sus dispositivos y su PIN (son del enlace).
  update app.cliente_enlace e
  set revocado_en = now(), revocado_por = p_usuario_id, motivo_revocacion = 'reemplazado'
  where e.cliente_id = p_cliente_id and e.revocado_en is null;

  insert into app.cliente_enlace (cliente_id, token_hash, token_cifrado, creado_por)
  values (p_cliente_id, p_token_hash, p_token_cifrado, p_usuario_id)
  returning id into v_id;

  if v_sin_compra then
    insert into app.auditoria (usuario_id, tabla, registro_id, accion, despues)
    values (p_usuario_id, 'cliente_enlace', v_id::text, 'insertar',
            jsonb_build_object('forzado', true, 'cliente_id', p_cliente_id, 'motivo', 'sin_primera_compra'));
  end if;

  perform app.fn_aviso_cliente(p_cliente_id, null, 'wa_enlace_cliente',
    'wa_enlace_cliente:c' || p_cliente_id || ':e' || v_id,
    jsonb_build_object('cliente', v_c.nombre, 'negocio', app.fn_config('negocio_nombre')));
  return v_id;
end $$;

-- "Dar de baja link". Los clientes sin enlace vigente se saltan; devuelve cuantos se dieron de baja.
create function app.fn_revocar_enlace(p_usuario_id bigint, p_cliente_ids bigint[], p_motivo text, p_nota text default null)
returns integer
language plpgsql as $$
declare
  v_n integer;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'clientes.enlace');
  if p_motivo is null or p_motivo not in ('reenviado','ya_no_es_cliente','solo_cotiza','otro') then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'motivo'));
  end if;
  if p_motivo = 'otro' and nullif(trim(coalesce(p_nota, '')), '') is null then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'nota'));
  end if;
  with t as (
    select e.id from app.cliente_enlace e
    where e.cliente_id = any(p_cliente_ids) and e.revocado_en is null
    order by e.id for update
  )
  update app.cliente_enlace e
  set revocado_en = now(), revocado_por = p_usuario_id, motivo_revocacion = p_motivo,
      nota_revocacion = nullif(trim(coalesce(p_nota, '')), '')
  from t where e.id = t.id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create function app.fn_cliente_por_token(p_token_hash text, p_dispositivo_hash text)
returns table(cliente_id bigint, cliente_enlace_id bigint, lista_precio_id bigint, dispositivo_ok boolean, tiene_pin boolean)
language plpgsql as $$
#variable_conflict use_column
declare
  v_e app.cliente_enlace;
  v_c app.cliente;
  v_ok boolean := false;
begin
  select e.* into v_e
  from app.cliente_enlace e join app.cliente c on c.id = e.cliente_id
  where e.token_hash = p_token_hash and e.revocado_en is null and c.activo;
  if not found then return; end if;
  select c.* into v_c from app.cliente c where c.id = v_e.cliente_id;

  -- Como mucho una vez por minuto (fn_auditar ignora ultimo_uso_en).
  update app.cliente_enlace e set ultimo_uso_en = now()
  where e.id = v_e.id and (e.ultimo_uso_en is null or e.ultimo_uso_en < now() - interval '1 minute');
  if p_dispositivo_hash is not null then
    select exists (select 1 from app.cliente_dispositivo d
                   where d.cliente_enlace_id = v_e.id and d.token_hash = p_dispositivo_hash and d.quitado_en is null)
      into v_ok;
    if v_ok then
      update app.cliente_dispositivo d set ultimo_uso_en = now()
      where d.token_hash = p_dispositivo_hash and d.ultimo_uso_en < now() - interval '1 minute';
    end if;
  end if;
  return query select v_c.id, v_e.id, v_c.lista_precio_id, v_ok, v_e.pin_hash is not null;
end $$;

-- Registra el dispositivo (o devuelve el que ya existe con ese hash). Con p_alertar, uno nuevo avisa al personal.
create function app.fn_dispositivo_registrar(p_enlace_id bigint, p_hash text, p_navegador text, p_alertar boolean)
returns bigint
language plpgsql as $$
declare
  v_id bigint;
  v_nombre text;
begin
  insert into app.cliente_dispositivo (cliente_enlace_id, token_hash, navegador)
  values (p_enlace_id, p_hash, p_navegador)
  on conflict (token_hash) do nothing
  returning id into v_id;
  if v_id is null then
    -- El hash ya existe. Solo se repite (mismo enlace, no quitado) sin alertar; uno ajeno o quitado nunca se reutiliza:
    -- la API siempre manda un token de dispositivo nuevo en cada acierto de PIN.
    select d.id into v_id from app.cliente_dispositivo d
    where d.token_hash = p_hash and d.cliente_enlace_id = p_enlace_id and d.quitado_en is null;
    if v_id is null then
      perform app.fn_fallar('ESTADO_NO_VALIDO', jsonb_build_object('motivo', 'dispositivo_no_reutilizable'));
    end if;
    return v_id;
  end if;
  if p_alertar then
    select c.nombre into v_nombre from app.cliente_enlace e join app.cliente c on c.id = e.cliente_id where e.id = p_enlace_id;
    perform app.fn_notificar('dispositivo_nuevo', 'dispositivo:' || v_id,
      jsonb_build_object('cliente', v_nombre, 'dispositivo', coalesce(p_navegador, ''),
                         'cliente_id', (select e.cliente_id from app.cliente_enlace e where e.id = p_enlace_id)));
  end if;
  return v_id;
end $$;

create function app.fn_elegir_pin(p_cliente_enlace_id bigint, p_pin_hash text, p_dispositivo_hash text, p_navegador text)
returns bigint
language plpgsql as $$
declare
  v_e app.cliente_enlace;
  v_alertar boolean;
begin
  select * into v_e from app.cliente_enlace e where e.id = p_cliente_enlace_id and e.revocado_en is null for update;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('cliente_enlace_id', p_cliente_enlace_id));
  end if;
  if v_e.pin_hash is not null then
    perform app.fn_fallar('PIN_YA_DEFINIDO', jsonb_build_object('cliente_enlace_id', p_cliente_enlace_id));
  end if;
  -- El primer PIN del enlace no alerta; uno elegido tras restablecer (ya hay dispositivos) si.
  v_alertar := exists (select 1 from app.cliente_dispositivo d where d.cliente_enlace_id = p_cliente_enlace_id);
  update app.cliente_enlace e set pin_hash = p_pin_hash where e.id = p_cliente_enlace_id;
  return app.fn_dispositivo_registrar(p_cliente_enlace_id, p_dispositivo_hash, p_navegador, v_alertar);
end $$;

-- Cuenta un PIN malo contra el enlace (sin importar la IP). A los 20 en una hora: espera de 15 minutos para TODO el enlace y aviso al
-- personal (clave por hora). Solo frena y avisa: ni revoca el enlace ni quita dispositivos (C21).
create function app.fn_pin_fallo_global(p_cliente_enlace_id bigint) returns void
language plpgsql as $$
declare
  v_n integer;
  v_cliente bigint;
  v_nombre text;
begin
  insert into app.cliente_pin_fallo (cliente_enlace_id) values (p_cliente_enlace_id);
  select count(*)::integer into v_n from app.cliente_pin_fallo f
  where f.cliente_enlace_id = p_cliente_enlace_id and f.creado_en > now() - interval '1 hour';
  if v_n < 20 then return; end if;
  insert into app.cliente_pin_espera (cliente_enlace_id, ip_hash, espera_hasta) values (p_cliente_enlace_id, '*', now() + interval '15 minutes')
  on conflict (cliente_enlace_id, ip_hash) do update set espera_hasta = excluded.espera_hasta, actualizado_en = now();
  delete from app.cliente_pin_fallo f where f.cliente_enlace_id = p_cliente_enlace_id;
  select c.id, c.nombre into v_cliente, v_nombre from app.cliente_enlace e join app.cliente c on c.id = e.cliente_id where e.id = p_cliente_enlace_id;
  perform app.fn_notificar('pin_ataque', 'pin_ataque:' || p_cliente_enlace_id || ':' || floor(extract(epoch from now()) / 3600)::bigint,
    jsonb_build_object('cliente', v_nombre, 'cliente_id', v_cliente, 'intentos', v_n));
end $$;

-- DEVUELVE el resultado en vez de lanzar: un fallo lanzado revertiria el contador de intentos y la espera no existiria.
-- {codigo:'OK', dispositivo_id} | {codigo:'PIN_INCORRECTO', intentos_restantes} | {codigo:'PIN_EN_ESPERA', segundos}.
-- La API traduce codigo distinto de OK a 401/429 despues de confirmar la transaccion.
create function app.fn_entrar_con_pin(p_cliente_enlace_id bigint, p_ip_hash text, p_pin_ok boolean,
                                      p_dispositivo_hash text, p_navegador text) returns jsonb
language plpgsql as $$
declare
  v_e app.cliente_enlace;
  v_esp app.cliente_pin_espera;
  v_disp bigint;
begin
  select * into v_e from app.cliente_enlace e where e.id = p_cliente_enlace_id and e.revocado_en is null for update;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('cliente_enlace_id', p_cliente_enlace_id));
  end if;
  if v_e.pin_hash is null then
    perform app.fn_fallar('ESTADO_NO_VALIDO', jsonb_build_object('cliente_enlace_id', p_cliente_enlace_id, 'motivo', 'sin_pin'));
  end if;

  -- Espera de todo el enlace (muchos PIN malos desde varias IP): nadie prueba PIN hasta que pase.
  select * into v_esp from app.cliente_pin_espera w where w.cliente_enlace_id = p_cliente_enlace_id and w.ip_hash = '*';
  if found and v_esp.espera_hasta is not null and v_esp.espera_hasta > now() then
    return jsonb_build_object('codigo', 'PIN_EN_ESPERA', 'segundos', ceil(extract(epoch from v_esp.espera_hasta - now()))::integer);
  end if;

  insert into app.cliente_pin_espera (cliente_enlace_id, ip_hash) values (p_cliente_enlace_id, p_ip_hash)
  on conflict do nothing;
  select * into v_esp from app.cliente_pin_espera w
  where w.cliente_enlace_id = p_cliente_enlace_id and w.ip_hash = p_ip_hash for update;

  if v_esp.espera_hasta is not null and v_esp.espera_hasta > now() then
    return jsonb_build_object('codigo', 'PIN_EN_ESPERA',
      'segundos', ceil(extract(epoch from v_esp.espera_hasta - now()))::integer);
  end if;

  if not coalesce(p_pin_ok, false) then
    if v_esp.fallos + 1 >= 5 then
      update app.cliente_pin_espera w set fallos = 0, espera_hasta = now() + interval '15 minutes', actualizado_en = now()
      where w.cliente_enlace_id = p_cliente_enlace_id and w.ip_hash = p_ip_hash;
      perform app.fn_pin_fallo_global(p_cliente_enlace_id);
      return jsonb_build_object('codigo', 'PIN_EN_ESPERA', 'segundos', 900);
    end if;
    update app.cliente_pin_espera w set fallos = w.fallos + 1, espera_hasta = null, actualizado_en = now()
    where w.cliente_enlace_id = p_cliente_enlace_id and w.ip_hash = p_ip_hash;
    perform app.fn_pin_fallo_global(p_cliente_enlace_id);
    return jsonb_build_object('codigo', 'PIN_INCORRECTO', 'intentos_restantes', 5 - (v_esp.fallos + 1));
  end if;

  delete from app.cliente_pin_espera w where w.cliente_enlace_id = p_cliente_enlace_id and w.ip_hash = p_ip_hash;
  v_disp := app.fn_dispositivo_registrar(p_cliente_enlace_id, p_dispositivo_hash, p_navegador, true);
  return jsonb_build_object('codigo', 'OK', 'dispositivo_id', v_disp);
end $$;

create function app.fn_restablecer_pin(p_usuario_id bigint, p_cliente_id bigint) returns void
language plpgsql as $$
declare
  v_id bigint;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'clientes.enlace');
  select e.id into v_id from app.cliente_enlace e
  where e.cliente_id = p_cliente_id and e.revocado_en is null for update;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('cliente_id', p_cliente_id));
  end if;
  update app.cliente_enlace e set pin_hash = null where e.id = v_id;
end $$;

create function app.fn_quitar_dispositivo(p_usuario_id bigint, p_dispositivo_id bigint) returns void
language plpgsql as $$
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'clientes.enlace');
  if not exists (select 1 from app.cliente_dispositivo d where d.id = p_dispositivo_id) then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('dispositivo_id', p_dispositivo_id));
  end if;
  update app.cliente_dispositivo d set quitado_en = now(), quitado_por = p_usuario_id
  where d.id = p_dispositivo_id and d.quitado_en is null;
end $$;

-- ---------------------------------------------------------------- visitas y alertas

create function app.fn_registrar_visita(p_cliente_id bigint, p_tipo text) returns void
language plpgsql as $$
begin
  if p_tipo is null or p_tipo not in ('apertura','catalogo') then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'tipo'));
  end if;
  insert into app.cliente_visita (cliente_id, fecha, aperturas, vistas_catalogo)
  values (p_cliente_id, app.fn_fecha_local(now()), (p_tipo = 'apertura')::integer, (p_tipo = 'catalogo')::integer)
  on conflict (cliente_id, fecha) do update
  set aperturas = cliente_visita.aperturas + (p_tipo = 'apertura')::integer,
      vistas_catalogo = cliente_visita.vistas_catalogo + (p_tipo = 'catalogo')::integer;
end $$;

-- Solo avisa: no toca enlace, dispositivos ni activo (C21). Devuelve cuantas alertas nuevas notifico.
create function app.fn_alertas_clientes() returns integer
language plpgsql as $$
declare
  r record;
  v_n integer := 0;
begin
  -- Limpieza de intentos de PIN viejos (no toca enlaces, dispositivos ni esperas vigentes).
  delete from app.cliente_pin_espera w where w.actualizado_en < now() - interval '1 day' and (w.espera_hasta is null or w.espera_hasta < now());
  delete from app.cliente_pin_fallo f where f.creado_en < now() - interval '1 day';
  for r in select a.* from app.v_alerta_cliente a where a.tipo in ('visitas_sin_pedido','cliente_inactivo') order by a.cliente_id, a.tipo loop
    if app.fn_notificar(r.tipo, r.clave, r.detalle) > 0 then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------- ubicacion

create function app.fn_proponer_ubicacion(p_cliente_id bigint, p_lat numeric, p_lng numeric) returns void
language plpgsql as $$
declare
  v_nombre text;
begin
  update app.cliente c set lat_propuesta = p_lat, lng_propuesta = p_lng, propuesta_en = now(), actualizado_en = now()
  where c.id = p_cliente_id returning c.nombre into v_nombre;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('cliente_id', p_cliente_id));
  end if;
  perform app.fn_notificar('ubicacion_propuesta', 'ubicacion:' || p_cliente_id || ':' || floor(extract(epoch from now()))::bigint,
    jsonb_build_object('cliente', v_nombre, 'cliente_id', p_cliente_id));
end $$;

create function app.fn_fijar_ubicacion(p_usuario_id bigint, p_cliente_id bigint, p_lat numeric, p_lng numeric, p_fuente text)
returns void
language plpgsql as $$
declare
  v_c app.cliente;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'clientes.editar');
  if p_fuente is null or p_fuente not in ('mapa','app','cliente') then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'fuente'));
  end if;
  select * into v_c from app.cliente c where c.id = p_cliente_id for update;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('cliente_id', p_cliente_id));
  end if;
  if p_fuente = 'cliente' then
    if v_c.lat_propuesta is null then
      perform app.fn_fallar('SIN_PROPUESTA', jsonb_build_object('cliente_id', p_cliente_id));
    end if;
    update app.cliente c
    set lat = c.lat_propuesta, lng = c.lng_propuesta, ubicacion_fuente = 'cliente', ubicacion_en = now(),
        lat_propuesta = null, lng_propuesta = null, propuesta_en = null, actualizado_en = now()
    where c.id = p_cliente_id;
  else
    if p_lat is null or p_lng is null then
      perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'coordenadas'));
    end if;
    update app.cliente c
    set lat = p_lat, lng = p_lng, ubicacion_fuente = p_fuente, ubicacion_en = now(), actualizado_en = now()
    where c.id = p_cliente_id;
  end if;
end $$;

-- ---------------------------------------------------------------- lecturas

-- Primer dia desde MANANA (hoy + 1 ... hoy + 7) cuyo isodow esta en dias_visita.
create function app.fn_proxima_visita(p_cliente_id bigint) returns date
language sql stable as $$
  select (app.fn_fecha_local(now()) + i)
  from app.cliente c, generate_series(1, 7) i
  where c.id = p_cliente_id and extract(isodow from app.fn_fecha_local(now()) + i)::smallint = any(c.dias_visita)
  order by i limit 1
$$;

create function app.fn_frecuentes(p_cliente_id bigint, p_limite integer default 12)
returns table(presentacion_id bigint, veces integer, ultima_cantidad integer)
language sql stable as $$
  with h as (
    select l.presentacion_id, count(distinct p.id)::integer as veces, max(p.creado_en) as ultima,
           (array_agg(l.cantidad_pedida order by p.creado_en desc, l.id desc))[1] as ultima_cantidad
    from app.pedido p
    join app.pedido_linea l on l.pedido_id = p.id
    join app.presentacion pz on pz.id = l.presentacion_id and pz.activa and pz.se_vende
    join app.producto pr on pr.id = pz.producto_id and pr.activo
    where p.cliente_id = p_cliente_id
      and p.estado in ('recibido','esperando_cliente','confirmado','cargado','en_ruta','entregado')
      and p.creado_en >= now() - interval '90 days'
    group by l.presentacion_id
  ), sin_historial as (
    select not exists (select 1 from h) as v
  )
  select x.presentacion_id, x.veces, x.ultima_cantidad from (
    select h.presentacion_id, h.veces, h.ultima_cantidad, 1 as grupo, h.ultima as orden from h
    union all
    select f.presentacion_id, 0, 1, 2, f.creado_en
    from app.cliente_favorito f
    join app.presentacion pz on pz.id = f.presentacion_id and pz.activa and pz.se_vende
    join app.producto pr on pr.id = pz.producto_id and pr.activo
    where f.cliente_id = p_cliente_id and (select v from sin_historial)
    union all
    select z.presentacion_id, z.veces, 1, 3, '-infinity'::timestamptz
    from (
      select l.presentacion_id, count(distinct p.id)::integer as veces
      from app.cliente c0
      join app.cliente c on c.zona_id = c0.zona_id and c.id <> p_cliente_id
      join app.pedido p on p.cliente_id = c.id and p.estado = 'entregado' and p.creado_en >= now() - interval '90 days'
      join app.pedido_linea l on l.pedido_id = p.id
      join app.presentacion pz on pz.id = l.presentacion_id and pz.activa and pz.se_vende
      join app.producto pr on pr.id = pz.producto_id and pr.activo
      where c0.id = p_cliente_id and c0.zona_id is not null and (select v from sin_historial)
        and not exists (select 1 from app.cliente_favorito f where f.cliente_id = p_cliente_id and f.presentacion_id = l.presentacion_id)
      group by l.presentacion_id
    ) z
  ) x
  order by x.grupo, x.veces desc, x.orden desc, x.presentacion_id
  limit p_limite
$$;

-- Precios al dia (C20): copia productos y cantidades, nunca precios viejos.
create function app.fn_vista_borrador(p_cliente_id bigint, p_lineas jsonb) returns jsonb
language sql stable as $$
  with c as (
    select c.lista_precio_id from app.cliente c where c.id = p_cliente_id
  ), x as (
    select t.ord, pz.id as presentacion_id, (t.j ->> 'cantidad')::integer as cantidad,
           p.nombre as producto, pz.nombre as presentacion,
           case when pz.activa and pz.se_vende and p.activo then app.fn_precio(pz.id, c.lista_precio_id) end as precio_actual,
           (pz.activa and pz.se_vende and p.activo) as vendible,
           (select pl.precio_unitario from app.pedido_linea pl join app.pedido pd on pd.id = pl.pedido_id
             where pd.cliente_id = p_cliente_id and pd.estado = 'entregado' and pl.presentacion_id = pz.id
             order by pd.creado_en desc, pl.id desc limit 1) as precio_anterior
    from jsonb_array_elements(p_lineas) with ordinality as t(j, ord)
    join app.presentacion pz on pz.id = (t.j ->> 'presentacion_id')::bigint
    join app.producto p on p.id = pz.producto_id
    cross join c
  ), buenas as (
    select x.*, case when x.precio_anterior is null or x.precio_anterior = x.precio_actual then null
                     when x.precio_actual > x.precio_anterior then 'sube' else 'baja' end as cambio
    from x where x.precio_actual is not null
  )
  select jsonb_build_object(
    'lineas', coalesce((select jsonb_agg(jsonb_build_object(
        'presentacion_id', b.presentacion_id, 'producto', b.producto, 'presentacion', b.presentacion,
        'cantidad', b.cantidad, 'precio_actual', b.precio_actual::text, 'precio_anterior', b.precio_anterior::text,
        'cambio', b.cambio) order by b.ord) from buenas b), '[]'),
    'quitadas', coalesce((select jsonb_agg(jsonb_build_object('producto', q.producto,
        'motivo', case when q.vendible then 'sin_precio' else 'ya_no_se_vende' end) order by q.ord)
        from x q where q.precio_actual is null), '[]'),
    'total_actual', (select coalesce(sum(round(b.cantidad * b.precio_actual, 2)), 0)::numeric(12,2)::text from buenas b),
    'hay_cambios', exists (select 1 from buenas b where b.cambio is not null))
$$;

-- B5: presentaciones en >= la mitad de sus ultimos 5 pedidos entregados; cantidad = mediana de lo entregado (round).
create function app.fn_canasta_tipica(p_cliente_id bigint) returns table(presentacion_id bigint, cantidad integer)
language sql stable as $$
  with ult as (
    select p.id from app.pedido p where p.cliente_id = p_cliente_id and p.estado = 'entregado'
    order by p.creado_en desc, p.id desc limit 5
  ), l as (
    select pl.presentacion_id, pl.pedido_id, coalesce(pl.cantidad_entregada, pl.cantidad) as q
    from app.pedido_linea pl join ult on ult.id = pl.pedido_id
    where coalesce(pl.cantidad_entregada, pl.cantidad) > 0
  )
  select l.presentacion_id, round((percentile_cont(0.5) within group (order by l.q))::numeric)::integer
  from l group by l.presentacion_id
  having count(distinct l.pedido_id) * 2 >= (select count(*) from ult)
  order by l.presentacion_id
$$;

-- Sustitutos sugeridos de una linea (el personal elige; no se aplican solos). Mismo factor primero.
create function app.fn_sugerencias_linea(p_pedido_linea_id bigint)
returns table(presentacion_id bigint, producto_id bigint, producto text, presentacion text, factor integer,
              precio_unitario text, disponible_piezas integer, mismo_factor boolean)
language sql stable as $$
  select pz.id, p.id, p.nombre, pz.nombre, pz.factor, app.fn_precio(pz.id, pd.lista_precio_id)::text,
         coalesce(d.disponible, 0)::integer, (pz.factor = l.factor)
  from app.pedido_linea l
  join app.pedido pd on pd.id = l.pedido_id
  join app.producto_equivalente eq on eq.producto_id = l.producto_id
  join app.producto p on p.id = eq.equivalente_id and p.activo
  join app.presentacion pz on pz.producto_id = p.id and pz.activa and pz.se_vende
  left join app.v_disponible d on d.sucursal_id = pd.sucursal_id and d.producto_id = p.id
  where l.id = p_pedido_linea_id and app.fn_precio(pz.id, pd.lista_precio_id) is not null
  order by (pz.factor = l.factor) desc, eq.orden, pz.factor desc, pz.id
$$;

-- Lectura del cliente. etapa 'surtiendo' (confirmado con requiere_surtido) llega con la lista de surtido (F5);
-- reparto llega con las rutas (007): hasta entonces null.
create function app.fn_seguimiento_pedido(p_cliente_id bigint, p_pedido_id bigint) returns jsonb
language plpgsql stable as $$
declare
  v_p app.pedido;
  v_prop boolean;
begin
  select * into v_p from app.pedido p where p.id = p_pedido_id and p.cliente_id = p_cliente_id;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('pedido_id', p_pedido_id));
  end if;
  v_prop := v_p.estado = 'propuesto';
  return jsonb_build_object(
    'folio', v_p.folio,
    'etapa', v_p.estado,
    'etiqueta', (select pl.texto from app.plantilla pl where pl.clave = 'estado_' || v_p.estado),
    'total', case when v_prop then null else v_p.total::text end,
    'fecha_entrega', v_p.fecha_entrega,
    'entrega_tipo', v_p.entrega_tipo,
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'producto', pr.nombre, 'presentacion', pz.nombre, 'cantidad_pedida', l.cantidad_pedida, 'cantidad', l.cantidad,
        'cantidad_entregada', l.cantidad_entregada, 'estado', l.estado, 'motivo_ajuste', l.motivo_ajuste,
        'precio_unitario', case when v_prop then null else l.precio_unitario::text end,
        'importe', case when v_prop then null else l.importe::text end) order by l.numero)
      from app.pedido_linea l
      join app.presentacion pz on pz.id = l.presentacion_id
      join app.producto pr on pr.id = pz.producto_id
      where l.pedido_id = v_p.id), '[]'),
    'faltantes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'propuesta_id', f.id,
        'linea', jsonb_build_object('producto', pr.nombre, 'presentacion', pz.nombre, 'cantidad', l.cantidad),
        'causa', f.causa, 'nota', f.nota, 'limite_en', f.limite_en,
        'opciones', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'tipo', o.tipo, 'producto', op.nombre, 'presentacion', opz.nombre, 'imagen', op.imagen,
            'cantidad', o.cantidad, 'precio_unitario', o.precio_unitario::text, 'importe', o.importe::text)
            order by o.orden, o.id)
          from app.propuesta_opcion o
          join app.presentacion opz on opz.id = o.presentacion_id
          join app.producto op on op.id = opz.producto_id
          where o.propuesta_id = f.id), '[]')) order by f.id)
      from app.propuesta_faltante f
      join app.pedido_linea l on l.id = f.pedido_linea_id
      join app.presentacion pz on pz.id = l.presentacion_id
      join app.producto pr on pr.id = pz.producto_id
      where l.pedido_id = v_p.id and f.estado = 'pendiente'), '[]'),
    'linea_tiempo', coalesce((
      select jsonb_agg(jsonb_build_object('etapa', t.etapa, 'en', t.en) order by t.primero)
      from (
        select m.etapa, min(m.creado_en) as en, min(m.id) as primero
        from (select e.id, case e.tipo when 'faltante_propuesto' then 'esperando_cliente'
                                 when 'recibido' then 'recibido' when 'confirmado' then 'confirmado'
                                 when 'cargado' then 'cargado' when 'en_ruta' then 'en_ruta'
                                 when 'entregado' then 'entregado' when 'no_entregado' then 'no_entregado'
                                 when 'cancelado' then 'cancelado' end as etapa, e.creado_en
              from app.pedido_evento e where e.pedido_id = v_p.id and e.publico) m
        where m.etapa is not null group by m.etapa) t), '[]'),
    'reparto', null,
    'editable', v_p.estado = 'recibido',
    'borrador', case when v_prop then app.fn_vista_borrador(p_cliente_id, (
      select jsonb_agg(jsonb_build_object('presentacion_id', l.presentacion_id, 'cantidad', l.cantidad_pedida) order by l.numero)
      from app.pedido_linea l where l.pedido_id = v_p.id)) end);
end $$;

-- ---------------------------------------------------------------- lineas, total y advertencias

-- Valida e inserta lineas con el precio de la lista (oferta incluida). Una presentacion repetida se suma.
create function app.fn_pedido_insertar_lineas(p_pedido_id bigint, p_lista_precio_id bigint, p_lineas jsonb,
                                              p_motivo text default null) returns void
language plpgsql as $$
declare
  v_malas bigint[];
  v_sin bigint[];
  v_base integer;
begin
  if jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas) = 0 then
    perform app.fn_fallar('PEDIDO_VACIO');
  end if;
  if jsonb_array_length(p_lineas) > 100 or exists (
       select 1 from jsonb_array_elements(p_lineas) j
       where coalesce((j ->> 'presentacion_id') !~ '^[0-9]{1,18}$', true)
          or coalesce((j ->> 'cantidad') !~ '^[1-9][0-9]{0,5}$', true)) then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'lineas'));
  end if;

  select array_agg(distinct t.pid) into v_malas
  from (select (j ->> 'presentacion_id')::bigint as pid from jsonb_array_elements(p_lineas) j) t
  where not exists (select 1 from app.presentacion pz join app.producto p on p.id = pz.producto_id
                    where pz.id = t.pid and pz.activa and pz.se_vende and p.activo);
  if v_malas is not null then
    perform app.fn_fallar('PRESENTACION_NO_VALIDA', jsonb_build_object('presentacion_ids', v_malas));
  end if;

  select array_agg(distinct t.pid) into v_sin
  from (select (j ->> 'presentacion_id')::bigint as pid from jsonb_array_elements(p_lineas) j) t
  where app.fn_precio(t.pid, p_lista_precio_id) is null;
  if v_sin is not null then
    perform app.fn_fallar('PRECIO_NO_DEFINIDO', jsonb_build_object('presentacion_ids', v_sin));
  end if;

  select coalesce(max(l.numero), 0) into v_base from app.pedido_linea l where l.pedido_id = p_pedido_id;
  insert into app.pedido_linea (pedido_id, numero, presentacion_id, producto_id, factor, cantidad_pedida, cantidad,
                                precio_lista, precio_unitario, motivo_ajuste)
  select p_pedido_id, v_base + (row_number() over (order by g.primero))::integer, pz.id, pz.producto_id, pz.factor,
         g.q, g.q, g.precio, g.precio, p_motivo
  from (
    select t.pid, sum(t.q)::integer as q, min(t.ord) as primero, app.fn_precio(t.pid, p_lista_precio_id) as precio
    from (select (j ->> 'presentacion_id')::bigint as pid, (j ->> 'cantidad')::integer as q, ord
          from jsonb_array_elements(p_lineas) with ordinality as e(j, ord)) t
    group by t.pid
  ) g
  join app.presentacion pz on pz.id = g.pid;
end $$;

-- Unico lugar donde se calcula el total del pedido.
create function app.fn_pedido_total() returns trigger
language plpgsql as $$
declare
  v_id bigint := coalesce(new.pedido_id, old.pedido_id);
begin
  update app.pedido p set total = s.t
  from (select coalesce(sum(l.importe), 0) as t from app.pedido_linea l where l.pedido_id = v_id) s
  where p.id = v_id and p.total <> s.t;
  return null;
end $$;

create function app.fn_pedido_evento_inmutable() returns trigger
language plpgsql as $$
begin
  raise exception 'ESTADO_NO_VALIDO' using errcode = 'P0001',
    detail = jsonb_build_object('motivo', 'historial_inmutable')::text;
end $$;

-- Mismos casos de 002/003 + pedido_evento. Misma firma: CREATE OR REPLACE.
create or replace function app.fn_truncate_bloqueado() returns trigger
language plpgsql as $$
declare
  v_codigo text := case TG_TABLE_NAME
    when 'movimiento_inventario' then 'MOVIMIENTO_INMUTABLE'
    when 'existencia' then 'EXISTENCIA_SOLO_POR_MOVIMIENTO'
    when 'pedido_evento' then 'ESTADO_NO_VALIDO'
    else 'COMPRA_INMUTABLE' end;
begin
  raise exception '%', v_codigo using errcode = 'P0001', detail = '{}';
end $$;

-- Advertencias de disponible: por producto del pedido (lineas activas), requeridas vs lo libre SIN contar este pedido.
create function app.fn_advertencias_pedido(p_pedido_id bigint) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('producto_id', x.producto_id, 'producto', x.producto,
           'requeridas', x.requeridas, 'disponibles', x.disponibles) order by x.producto_id), '[]')
  from (
    select l.producto_id, pr.nombre as producto, sum(l.piezas)::integer as requeridas,
           (coalesce(d.disponible, 0) + case when p.estado in ('confirmado','esperando_cliente','cargado','en_ruta') then sum(l.piezas) else 0 end)::integer as disponibles
    from app.pedido p
    join app.pedido_linea l on l.pedido_id = p.id and l.estado = 'activa'
    join app.producto pr on pr.id = l.producto_id
    left join app.v_disponible d on d.sucursal_id = p.sucursal_id and d.producto_id = l.producto_id
    where p.id = p_pedido_id
    group by l.producto_id, pr.nombre, d.disponible, p.estado
  ) x
  where x.requeridas > x.disponibles
$$;

-- Aplica {lineas:[{pedido_linea_id, cantidad, precio_unitario?, motivo_ajuste?}], agregar:[{presentacion_id, cantidad}]}.
-- El pedido ya viene bloqueado. Devuelve [{pedido_linea_id, presentacion, antes, despues}].
create function app.fn_pedido_aplicar_ajustes(p_usuario_id bigint, p_pedido_id bigint, p_datos jsonb, p_solo_bajar boolean)
returns jsonb
language plpgsql as $$
declare
  v_p app.pedido;
  r record;
  l app.pedido_linea;
  v_nueva integer;
  v_precio numeric;
  v_motivo text;
  v_max integer;
  v_cambios jsonb := '[]';
begin
  select * into v_p from app.pedido p where p.id = p_pedido_id;
  perform 1 from app.pedido_linea pl where pl.pedido_id = p_pedido_id order by pl.id for update;
  select coalesce(max(pl.numero), 0) into v_max from app.pedido_linea pl where pl.pedido_id = p_pedido_id;

  for r in select t.j from jsonb_array_elements(coalesce(p_datos -> 'lineas', '[]')) with ordinality as t(j, ord) order by t.ord loop
    select * into l from app.pedido_linea pl
    where pl.id = app.fn_json_entero(r.j ->> 'pedido_linea_id', 'pedido_linea_id') and pl.pedido_id = p_pedido_id;
    if not found or l.estado <> 'activa' then
      perform app.fn_fallar('LINEA_NO_VALIDA', jsonb_build_object('pedido_linea_id', nullif(r.j ->> 'pedido_linea_id', '')::bigint));
    end if;
    v_nueva := case when nullif(r.j ->> 'cantidad', '') is null then l.cantidad else app.fn_json_entero(r.j ->> 'cantidad', 'cantidad') end;
    v_precio := case when nullif(r.j ->> 'precio_unitario', '') is null then l.precio_unitario else app.fn_json_dinero(r.j ->> 'precio_unitario', 'precio_unitario') end;
    v_motivo := nullif(trim(coalesce(r.j ->> 'motivo_ajuste', '')), '');
    if v_nueva < 0 or v_precio < 0 then
      perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'lineas'));
    end if;
    if v_nueva = l.cantidad and v_precio = l.precio_unitario then continue; end if;
    if p_solo_bajar and (v_nueva > l.cantidad or v_precio <> l.precio_unitario) then
      perform app.fn_fallar('AJUSTE_NO_VALIDO', jsonb_build_object('pedido_linea_id', l.id));
    end if;
    if v_precio <> l.precio_unitario and v_precio <> l.precio_lista
       and not app.fn_tiene_permiso(p_usuario_id, 'pedidos.cambiar_precio') then
      perform app.fn_fallar('SIN_PERMISO_PRECIO', jsonb_build_object('pedido_linea_id', l.id));
    end if;
    if v_motivo is null and (v_nueva <> l.cantidad_pedida or v_precio <> l.precio_unitario) then
      perform app.fn_fallar('AJUSTE_NO_VALIDO', jsonb_build_object('pedido_linea_id', l.id, 'motivo', 'motivo_requerido'));
    end if;
    update app.pedido_linea pl
    set cantidad = v_nueva, precio_unitario = v_precio, motivo_ajuste = coalesce(v_motivo, pl.motivo_ajuste),
        estado = case when v_nueva = 0 then 'quitada' else pl.estado end
    where pl.id = l.id;
    v_cambios := v_cambios || jsonb_build_object(
      'pedido_linea_id', l.id,
      'presentacion', (select pr.nombre || ' ' || pz.nombre from app.presentacion pz join app.producto pr on pr.id = pz.producto_id where pz.id = l.presentacion_id),
      'antes', l.cantidad, 'despues', v_nueva,
      'precio_antes', l.precio_unitario::text, 'precio_despues', v_precio::text);
  end loop;

  if jsonb_array_length(coalesce(p_datos -> 'agregar', '[]')) > 0 then
    if p_solo_bajar then
      perform app.fn_fallar('AJUSTE_NO_VALIDO', jsonb_build_object('motivo', 'agregar_en_cargado'));
    end if;
    perform app.fn_pedido_insertar_lineas(p_pedido_id, v_p.lista_precio_id, p_datos -> 'agregar', 'agregado por despacho');
    v_cambios := v_cambios || coalesce((
      select jsonb_agg(jsonb_build_object('pedido_linea_id', n.id, 'presentacion', pr.nombre || ' ' || pz.nombre,
                                          'antes', 0, 'despues', n.cantidad) order by n.numero)
      from app.pedido_linea n
      join app.presentacion pz on pz.id = n.presentacion_id
      join app.producto pr on pr.id = pz.producto_id
      where n.pedido_id = p_pedido_id and n.numero > v_max), '[]');
  end if;
  -- Un ajuste no puede dejar el pedido sin nada que entregar (lo que se cancela, se cancela).
  if not exists (select 1 from app.pedido_linea pl where pl.pedido_id = p_pedido_id and pl.estado in ('activa','faltante') and pl.cantidad > 0) then
    perform app.fn_fallar('PEDIDO_VACIO', jsonb_build_object('pedido_id', p_pedido_id));
  end if;
  return v_cambios;
end $$;

-- ---------------------------------------------------------------- pedido: captura y edicion del cliente

-- p_usuario_id null = enlace (el cliente); si no, captura del personal (pedidos.capturar).
-- p_datos: {clave_idempotencia, cliente_id? (captura), lineas, notas?, entrega_tipo?, fecha_solicitada?,
--           correcciones?, total_visto? (si no coincide con el total real: PRECIOS_CAMBIARON y nada se guarda)}.
create function app.fn_registrar_pedido(p_cliente_id bigint, p_usuario_id bigint, p_datos jsonb, p_hash text)
returns table(pedido_id bigint, repetida boolean)
language plpgsql as $$
#variable_conflict use_column
declare
  v_clave uuid;
  v_cliente_id bigint;
  v_previa app.pedido;
  v_c app.cliente;
  v_id bigint;
  v_sucursal bigint;
  v_fecha date;
  v_entrega text := coalesce(nullif(p_datos ->> 'entrega_tipo', ''), 'reparto');
  v_total numeric(12,2);
  v_min numeric(12,2);
  v_visto numeric;
begin
  v_clave := app.fn_json_uuid(p_datos ->> 'clave_idempotencia', 'clave_idempotencia');
  if p_usuario_id is null then
    -- Cliente del enlace: el cliente lo resolvio la API desde el token; el cuerpo nunca elige cliente. Y siempre dice que total vio.
    if p_cliente_id is null then
      perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'cliente_id'));
    end if;
    v_cliente_id := p_cliente_id;
    v_visto := app.fn_json_dinero(p_datos ->> 'total_visto', 'total_visto');
  else
    perform app.fn_exigir_permiso(p_usuario_id, 'pedidos.capturar');
    v_cliente_id := coalesce(p_cliente_id, case when nullif(p_datos ->> 'cliente_id', '') ~ '^[0-9]{1,18}$' then (p_datos ->> 'cliente_id')::bigint end);
    if v_cliente_id is null then
      perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'cliente_id'));
    end if;
    if p_datos ? 'total_visto' then v_visto := app.fn_json_dinero(p_datos ->> 'total_visto', 'total_visto'); end if;
  end if;
  v_fecha := case when nullif(p_datos ->> 'fecha_solicitada', '') is null then null else app.fn_json_fecha(p_datos ->> 'fecha_solicitada', 'fecha_solicitada') end;
  perform pg_advisory_xact_lock(hashtext(v_clave::text));

  select * into v_previa from app.pedido p where p.clave_idempotencia = v_clave;
  if found then
    if v_previa.hash_solicitud = p_hash and v_previa.cliente_id = v_cliente_id
       and v_previa.creado_por is not distinct from p_usuario_id then
      return query select v_previa.id, true;
      return;
    end if;
    -- Con otro cliente no se revela nada del pedido ajeno.
    perform app.fn_fallar('IDEMPOTENCIA_CONFLICTO',
      case when v_previa.cliente_id = v_cliente_id then jsonb_build_object('pedido_id', v_previa.id) else '{}'::jsonb end);
  end if;

  select * into v_c from app.cliente c where c.id = v_cliente_id;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('cliente_id', v_cliente_id));
  end if;
  if not v_c.activo then
    perform app.fn_fallar('CLIENTE_INACTIVO', jsonb_build_object('cliente_id', v_cliente_id));
  end if;
  if v_fecha is not null and v_fecha < app.fn_fecha_local(now()) then
    perform app.fn_fallar('FECHA_NO_VALIDA', jsonb_build_object('fecha_solicitada', v_fecha));
  end if;
  if v_entrega not in ('reparto','recoge') then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'entrega_tipo'));
  end if;

  v_sucursal := coalesce((select u.sucursal_id from app.usuario u where u.id = p_usuario_id),
                         (select min(s.id) from app.sucursal s where s.activa));
  insert into app.pedido (sucursal_id, folio, cliente_id, origen, lista_precio_id, entrega_tipo, fecha_solicitada,
                          notas, clave_idempotencia, hash_solicitud, creado_por)
  values (v_sucursal, app.fn_siguiente_folio(v_sucursal, 'P'), v_cliente_id,
          case when p_usuario_id is null then 'enlace' else 'captura' end, v_c.lista_precio_id, v_entrega, v_fecha,
          nullif(p_datos ->> 'notas', ''), v_clave, p_hash, p_usuario_id)
  returning id into v_id;

  perform app.fn_pedido_insertar_lineas(v_id, v_c.lista_precio_id, p_datos -> 'lineas');

  select p.total into v_total from app.pedido p where p.id = v_id;
  v_min := round(coalesce(app.fn_config('pedido_minimo')::numeric, 0), 2);
  if v_total < v_min then
    perform app.fn_fallar('PEDIDO_MINIMO', jsonb_build_object('minimo', v_min::text, 'total', v_total::text,
                                                               'faltante', (v_min - v_total)::text));
  end if;
  if v_visto is not null and v_visto is distinct from v_total then
    perform app.fn_fallar('PRECIOS_CAMBIARON', app.fn_vista_borrador(v_cliente_id, p_datos -> 'lineas'));
  end if;

  -- B6: lo que el personal corrigio en el borrador se aprende (por cliente).
  insert into app.cliente_alias (cliente_id, texto, presentacion_id)
  select v_cliente_id, app.fn_normalizar(j ->> 'texto'), (j ->> 'presentacion_id')::bigint
  from jsonb_array_elements(coalesce(p_datos -> 'correcciones', '[]')) j
  where nullif(trim(coalesce(j ->> 'texto', '')), '') is not null
  on conflict (cliente_id, texto) do update
  set presentacion_id = excluded.presentacion_id, veces = cliente_alias.veces + 1, actualizado_en = now();

  perform app.fn_pedido_evento(v_id, 'recibido', p_usuario_id,
    jsonb_build_object('origen', case when p_usuario_id is null then 'enlace' else 'captura' end, 'total', v_total::text));
  if p_usuario_id is null then
    perform app.fn_notificar_pedido('pedido_nuevo', v_id, 'pedido_nuevo:' || v_id);
  else
    perform app.fn_aviso_pedido(v_id, 'wa_pedido_recibido');
  end if;
  return query select v_id, false;
end $$;

create function app.fn_editar_pedido_cliente(p_cliente_id bigint, p_pedido_id bigint, p_datos jsonb) returns void
language plpgsql as $$
declare
  v_p app.pedido;
  v_total numeric(12,2);
  v_min numeric(12,2);
  v_entrega text;
  v_visto numeric;
begin
  v_visto := app.fn_json_dinero(p_datos ->> 'total_visto', 'total_visto');
  select * into v_p from app.pedido p where p.id = p_pedido_id and p.cliente_id = p_cliente_id for update;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('pedido_id', p_pedido_id));
  end if;
  if v_p.estado <> 'recibido' then
    perform app.fn_fallar('PEDIDO_NO_EDITABLE', jsonb_build_object('pedido_id', p_pedido_id, 'estado', v_p.estado));
  end if;
  v_entrega := case when p_datos ? 'entrega_tipo' then p_datos ->> 'entrega_tipo' else v_p.entrega_tipo end;
  if v_entrega is null or v_entrega not in ('reparto','recoge') then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'entrega_tipo'));
  end if;
  if nullif(p_datos ->> 'fecha_solicitada', '') is not null
     and app.fn_json_fecha(p_datos ->> 'fecha_solicitada', 'fecha_solicitada') < app.fn_fecha_local(now()) then
    perform app.fn_fallar('FECHA_NO_VALIDA', jsonb_build_object('fecha_solicitada', p_datos ->> 'fecha_solicitada'));
  end if;

  perform 1 from app.pedido_linea l where l.pedido_id = p_pedido_id order by l.id for update;
  delete from app.pedido_linea l where l.pedido_id = p_pedido_id;
  perform app.fn_pedido_insertar_lineas(p_pedido_id, v_p.lista_precio_id, p_datos -> 'lineas');

  select p.total into v_total from app.pedido p where p.id = p_pedido_id;
  v_min := round(coalesce(app.fn_config('pedido_minimo')::numeric, 0), 2);
  if v_total < v_min then
    perform app.fn_fallar('PEDIDO_MINIMO', jsonb_build_object('minimo', v_min::text, 'total', v_total::text,
                                                               'faltante', (v_min - v_total)::text));
  end if;
  if v_visto is distinct from v_total then
    perform app.fn_fallar('PRECIOS_CAMBIARON', app.fn_vista_borrador(p_cliente_id, p_datos -> 'lineas'));
  end if;

  update app.pedido p
  set version = p.version + 1, actualizado_en = now(), entrega_tipo = v_entrega,
      notas = case when p_datos ? 'notas' then nullif(p_datos ->> 'notas', '') else p.notas end,
      fecha_solicitada = case when p_datos ? 'fecha_solicitada' then
        case when nullif(p_datos ->> 'fecha_solicitada', '') is null then null else app.fn_json_fecha(p_datos ->> 'fecha_solicitada', 'fecha_solicitada') end
        else p.fecha_solicitada end
  where p.id = p_pedido_id;
  perform app.fn_pedido_evento(p_pedido_id, 'editado_cliente', null, jsonb_build_object('total', v_total::text));
  perform app.fn_notificar_pedido('pedido_modificado', p_pedido_id, 'pedido_modificado:' || p_pedido_id || ':' || (v_p.version + 1));
end $$;

-- Solo recibido o propuesto. Notifica pedido_cancelado_cliente solo si era un pedido real (recibido).
create function app.fn_cancelar_pedido_cliente(p_cliente_id bigint, p_pedido_id bigint, p_motivo text) returns void
language plpgsql as $$
declare
  v_p app.pedido;
begin
  select * into v_p from app.pedido p where p.id = p_pedido_id and p.cliente_id = p_cliente_id for update;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('pedido_id', p_pedido_id));
  end if;
  if v_p.estado not in ('recibido','propuesto') then
    perform app.fn_fallar('PEDIDO_NO_EDITABLE', jsonb_build_object('pedido_id', p_pedido_id, 'estado', v_p.estado));
  end if;
  update app.pedido p
  set estado = 'cancelado', cancelado_en = now(), cancelado_por = null, propuesto_vence_en = null,
      motivo = coalesce(nullif(trim(coalesce(p_motivo, '')), ''), 'cancelado por el cliente'), actualizado_en = now()
  where p.id = p_pedido_id;
  perform app.fn_pedido_evento(p_pedido_id, 'cancelado', null, jsonb_build_object('motivo', p_motivo));
  update app.aviso_cliente a set estado = 'descartado' where a.pedido_id = p_pedido_id and a.estado = 'pendiente';
  -- Rechazar un "lo de siempre" propuesto no es cancelar un pedido real: no se avisa al personal.
  if v_p.estado = 'recibido' then
    perform app.fn_notificar_pedido('pedido_cancelado_cliente', p_pedido_id, 'pedido_cancelado_cliente:' || p_pedido_id);
  end if;
end $$;

-- ---------------------------------------------------------------- pedido: despacho

create function app.fn_confirmar_pedido(p_usuario_id bigint, p_pedido_id bigint, p_datos jsonb) returns jsonb
language plpgsql as $$
declare
  v_p app.pedido;
  v_fecha date;
  v_entrega text;
  v_cambios jsonb;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'pedidos.gestionar');
  v_fecha := case when nullif(p_datos ->> 'fecha_entrega', '') is null then null else app.fn_json_fecha(p_datos ->> 'fecha_entrega', 'fecha_entrega') end;
  select * into v_p from app.pedido p where p.id = p_pedido_id for update;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('pedido_id', p_pedido_id));
  end if;
  if v_p.estado <> 'recibido' then
    perform app.fn_fallar('ESTADO_NO_VALIDO', jsonb_build_object('pedido_id', p_pedido_id, 'estado', v_p.estado));
  end if;
  if nullif(p_datos ->> 'version', '') is null then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'version'));
  end if;
  if app.fn_json_entero(p_datos ->> 'version', 'version') <> v_p.version then
    perform app.fn_fallar('PEDIDO_CAMBIO', jsonb_build_object('pedido_id', p_pedido_id, 'version', v_p.version));
  end if;
  if v_fecha is null or v_fecha < app.fn_fecha_local(now()) then
    perform app.fn_fallar('FECHA_NO_VALIDA', jsonb_build_object('fecha_entrega', v_fecha));
  end if;
  v_entrega := coalesce(nullif(p_datos ->> 'entrega_tipo', ''), v_p.entrega_tipo);
  if v_entrega not in ('reparto','recoge') then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'entrega_tipo'));
  end if;

  v_cambios := app.fn_pedido_aplicar_ajustes(p_usuario_id, p_pedido_id, p_datos, false);

  update app.pedido p
  set estado = 'confirmado', fecha_entrega = v_fecha, entrega_tipo = v_entrega, confirmado_en = now(),
      confirmado_por = p_usuario_id, actualizado_en = now(),
      version = p.version + case when jsonb_array_length(v_cambios) > 0 then 1 else 0 end
  where p.id = p_pedido_id;
  perform app.fn_pedido_evento(p_pedido_id, 'confirmado', p_usuario_id,
    jsonb_build_object('fecha_entrega', v_fecha, 'cambios', v_cambios));
  perform app.fn_aviso_pedido(p_pedido_id, 'wa_pedido_confirmado');
  return jsonb_build_object('pedido', app.fn_pedido_resumen(p_pedido_id),
                            'advertencias', app.fn_advertencias_pedido(p_pedido_id));
end $$;

-- confirmado o cargado. En cargado solo se bajan cantidades (lo cargado ya paso el control de existencia).
-- p_datos.version es opcional: si viene y no coincide, PEDIDO_CAMBIO.
create function app.fn_ajustar_pedido(p_usuario_id bigint, p_pedido_id bigint, p_datos jsonb) returns jsonb
language plpgsql as $$
declare
  v_p app.pedido;
  v_cambios jsonb;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'pedidos.gestionar');
  select * into v_p from app.pedido p where p.id = p_pedido_id for update;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('pedido_id', p_pedido_id));
  end if;
  if v_p.estado not in ('confirmado','cargado') then
    perform app.fn_fallar('ESTADO_NO_VALIDO', jsonb_build_object('pedido_id', p_pedido_id, 'estado', v_p.estado));
  end if;
  if nullif(p_datos ->> 'version', '') is not null and app.fn_json_entero(p_datos ->> 'version', 'version') <> v_p.version then
    perform app.fn_fallar('PEDIDO_CAMBIO', jsonb_build_object('pedido_id', p_pedido_id, 'version', v_p.version));
  end if;

  v_cambios := app.fn_pedido_aplicar_ajustes(p_usuario_id, p_pedido_id, p_datos, v_p.estado = 'cargado');
  if jsonb_array_length(v_cambios) = 0 then
    perform app.fn_fallar('AJUSTE_NO_VALIDO', jsonb_build_object('pedido_id', p_pedido_id, 'motivo', 'sin_cambios'));
  end if;

  update app.pedido p set version = p.version + 1, actualizado_en = now() where p.id = p_pedido_id;
  perform app.fn_pedido_evento(p_pedido_id, 'ajustado', p_usuario_id, jsonb_build_object('cambios', v_cambios));
  perform app.fn_aviso_pedido(p_pedido_id, 'wa_pedido_ajustado', jsonb_build_object('cambios', app.fn_cambios_texto(v_cambios)));
  return jsonb_build_object('pedido', app.fn_pedido_resumen(p_pedido_id),
                            'advertencias', app.fn_advertencias_pedido(p_pedido_id));
end $$;

-- Desde recibido, esperando_cliente (cancela sus propuestas), confirmado o no_entregado.
-- 007 agregara el borrado de la parada en una ruta planeada (mismo cuerpo, misma firma).
create function app.fn_cancelar_pedido(p_usuario_id bigint, p_pedido_id bigint, p_motivo text) returns void
language plpgsql as $$
declare
  v_p app.pedido;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'pedidos.gestionar');
  select * into v_p from app.pedido p where p.id = p_pedido_id for update;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('pedido_id', p_pedido_id));
  end if;
  if v_p.estado in ('cargado','en_ruta') then
    perform app.fn_fallar('PEDIDO_EN_RUTA', jsonb_build_object('pedido_id', p_pedido_id));
  end if;
  if v_p.estado not in ('recibido','esperando_cliente','confirmado','no_entregado') then
    perform app.fn_fallar('ESTADO_NO_VALIDO', jsonb_build_object('pedido_id', p_pedido_id, 'estado', v_p.estado));
  end if;
  if nullif(trim(coalesce(p_motivo, '')), '') is null then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'motivo'));
  end if;

  perform 1 from app.propuesta_faltante f join app.pedido_linea l on l.id = f.pedido_linea_id
  where l.pedido_id = p_pedido_id and f.estado = 'pendiente' order by f.id for update of f;
  update app.propuesta_faltante f
  set estado = 'cancelada', respondida_en = now(), respondida_por = p_usuario_id
  from app.pedido_linea l
  where l.id = f.pedido_linea_id and l.pedido_id = p_pedido_id and f.estado = 'pendiente';

  update app.pedido p
  set estado = 'cancelado', cancelado_en = now(), cancelado_por = p_usuario_id, motivo = p_motivo,
      respuesta_limite_en = null, propuesto_vence_en = null, actualizado_en = now()
  where p.id = p_pedido_id;
  perform app.fn_pedido_evento(p_pedido_id, 'cancelado', p_usuario_id, jsonb_build_object('motivo', p_motivo));
  update app.aviso_cliente a set estado = 'descartado' where a.pedido_id = p_pedido_id and a.estado = 'pendiente';
end $$;

create function app.fn_reprogramar_pedido(p_usuario_id bigint, p_pedido_id bigint, p_fecha date) returns void
language plpgsql as $$
declare
  v_p app.pedido;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'pedidos.gestionar');
  select * into v_p from app.pedido p where p.id = p_pedido_id for update;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('pedido_id', p_pedido_id));
  end if;
  if v_p.estado <> 'no_entregado' then
    perform app.fn_fallar('ESTADO_NO_VALIDO', jsonb_build_object('pedido_id', p_pedido_id, 'estado', v_p.estado));
  end if;
  if p_fecha is null or p_fecha < app.fn_fecha_local(now()) then
    perform app.fn_fallar('FECHA_NO_VALIDA', jsonb_build_object('fecha_entrega', p_fecha));
  end if;
  update app.pedido p set estado = 'confirmado', fecha_entrega = p_fecha, ruta_id = null, actualizado_en = now()
  where p.id = p_pedido_id;
  perform app.fn_pedido_evento(p_pedido_id, 'reprogramado', p_usuario_id, jsonb_build_object('fecha_entrega', p_fecha));
end $$;

-- ---------------------------------------------------------------- faltantes y sustituciones

-- Aplica una propuesta a su linea (el pedido ya viene bloqueado). p_opcion_id null = quitar. Devuelve quitar|reducir|sustituto.
create function app.fn_faltante_resolver(p_propuesta_id bigint, p_opcion_id bigint, p_estado text, p_usuario_id bigint)
returns text
language plpgsql as $$
declare
  v_f app.propuesta_faltante;
  v_l app.pedido_linea;
  v_o app.propuesta_opcion;
  v_pz app.presentacion;
  v_tipo text;
begin
  select * into v_f from app.propuesta_faltante f where f.id = p_propuesta_id;
  select * into v_l from app.pedido_linea l where l.id = v_f.pedido_linea_id;
  if p_opcion_id is null then
    update app.pedido_linea l set cantidad = 0, estado = 'quitada', motivo_ajuste = 'Faltante: se quitó del pedido'
    where l.id = v_l.id;
    v_tipo := 'quitar';
  else
    select * into v_o from app.propuesta_opcion o where o.id = p_opcion_id and o.propuesta_id = p_propuesta_id;
    if not found then
      perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'opcion_id'));
    end if;
    v_tipo := v_o.tipo;
    if v_o.tipo = 'reducir' then
      update app.pedido_linea l set cantidad = v_o.cantidad, estado = 'activa', motivo_ajuste = 'Faltante: se redujo la cantidad'
      where l.id = v_l.id;
    else
      select * into v_pz from app.presentacion pz where pz.id = v_o.presentacion_id;
      update app.pedido_linea l set cantidad = 0, estado = 'sustituida', motivo_ajuste = 'Faltante: se sustituyó'
      where l.id = v_l.id;
      insert into app.pedido_linea (pedido_id, numero, presentacion_id, producto_id, factor, cantidad_pedida, cantidad,
                                    precio_lista, precio_unitario, sustituye_linea_id)
      values (v_l.pedido_id, (select max(x.numero) + 1 from app.pedido_linea x where x.pedido_id = v_l.pedido_id),
              v_pz.id, v_pz.producto_id, v_pz.factor, v_o.cantidad, v_o.cantidad,
              v_o.precio_unitario, v_o.precio_unitario, v_l.id);
      v_tipo := 'sustituto';
    end if;
  end if;
  update app.propuesta_faltante f
  set estado = p_estado, opcion_elegida_id = p_opcion_id, respondida_en = now(), respondida_por = p_usuario_id
  where f.id = p_propuesta_id;
  return v_tipo;
end $$;

-- Tras cerrar una propuesta: con pendientes -> el limite mayor ('pendiente'). Sin pendientes: si queda algo que entregar,
-- confirmado (version + 1); si las respuestas dejaron el pedido sin lineas, cancelado 'sin_lineas' (version + 1).
-- Devuelve 'pendiente' | 'confirmado' | 'cancelado'.
create function app.fn_faltante_cerrar_pedido(p_pedido_id bigint) returns text
language plpgsql as $$
declare
  v_limite timestamptz;
begin
  select max(f.limite_en) into v_limite
  from app.propuesta_faltante f join app.pedido_linea l on l.id = f.pedido_linea_id
  where l.pedido_id = p_pedido_id and f.estado = 'pendiente';
  if v_limite is not null then
    update app.pedido p set respuesta_limite_en = v_limite, actualizado_en = now() where p.id = p_pedido_id;
    return 'pendiente';
  end if;
  if not exists (select 1 from app.pedido_linea l where l.pedido_id = p_pedido_id and l.estado = 'activa' and l.cantidad > 0) then
    update app.pedido p
    set estado = 'cancelado', cancelado_en = now(), cancelado_por = null, motivo = 'sin_lineas',
        respuesta_limite_en = null, version = p.version + 1, actualizado_en = now()
    where p.id = p_pedido_id;
    perform app.fn_pedido_evento(p_pedido_id, 'cancelado', null, jsonb_build_object('motivo', 'sin_lineas'));
    return 'cancelado';
  end if;
  update app.pedido p set estado = 'confirmado', respuesta_limite_en = null, version = p.version + 1, actualizado_en = now()
  where p.id = p_pedido_id;
  return 'confirmado';
end $$;

-- p_datos: {version, fecha_entrega?, lineas:[{pedido_linea_id, causa, nota?, opciones:[{tipo, presentacion_id?, cantidad}]}]}
create function app.fn_proponer_faltantes(p_usuario_id bigint, p_pedido_id bigint, p_datos jsonb) returns jsonb
language plpgsql as $$
declare
  v_p app.pedido;
  v_fecha date;
  r record;
  o record;
  l app.pedido_linea;
  v_f bigint;
  v_pz app.presentacion;
  v_precio numeric;
  v_limite timestamptz := now() + make_interval(mins => app.fn_config('faltante_minutos_respuesta')::integer);
  v_ids bigint[] := '{}';
  v_prop jsonb := '[]';
  v_orden integer;
  v_productos text;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'pedidos.gestionar');
  v_fecha := case when nullif(p_datos ->> 'fecha_entrega', '') is null then null else app.fn_json_fecha(p_datos ->> 'fecha_entrega', 'fecha_entrega') end;
  select * into v_p from app.pedido p where p.id = p_pedido_id for update;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('pedido_id', p_pedido_id));
  end if;
  if v_p.estado not in ('recibido','confirmado') then
    perform app.fn_fallar('ESTADO_NO_VALIDO', jsonb_build_object('pedido_id', p_pedido_id, 'estado', v_p.estado));
  end if;
  if nullif(p_datos ->> 'version', '') is null then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'version'));
  end if;
  if app.fn_json_entero(p_datos ->> 'version', 'version') <> v_p.version then
    perform app.fn_fallar('PEDIDO_CAMBIO', jsonb_build_object('pedido_id', p_pedido_id, 'version', v_p.version));
  end if;
  if jsonb_typeof(p_datos -> 'lineas') is distinct from 'array' or jsonb_array_length(p_datos -> 'lineas') = 0 then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'lineas'));
  end if;
  if v_p.estado = 'recibido' and (v_fecha is null or v_fecha < app.fn_fecha_local(now())) then
    perform app.fn_fallar('FECHA_NO_VALIDA', jsonb_build_object('fecha_entrega', v_fecha));
  end if;
  -- Un pedido que ya esta en una ruta no cambia de dia ni de tipo de entrega por aqui (la ruta se armo para ese dia).
  if v_p.ruta_id is not null and ((v_fecha is not null and v_fecha is distinct from v_p.fecha_entrega)
       or (nullif(p_datos ->> 'entrega_tipo', '') is not null and p_datos ->> 'entrega_tipo' is distinct from v_p.entrega_tipo)) then
    perform app.fn_fallar('PEDIDO_EN_RUTA', jsonb_build_object('pedido_id', p_pedido_id));
  end if;

  perform 1 from app.pedido_linea pl where pl.pedido_id = p_pedido_id order by pl.id for update;

  for r in select t.j from jsonb_array_elements(p_datos -> 'lineas') with ordinality as t(j, ord) order by t.ord loop
    select * into l from app.pedido_linea pl
    where pl.id = app.fn_json_entero(r.j ->> 'pedido_linea_id', 'pedido_linea_id') and pl.pedido_id = p_pedido_id;
    if not found or l.estado <> 'activa' then
      perform app.fn_fallar('LINEA_NO_VALIDA', jsonb_build_object('pedido_linea_id', nullif(r.j ->> 'pedido_linea_id', '')::bigint));
    end if;
    if r.j ->> 'causa' is null or r.j ->> 'causa' not in ('sin_existencia','proveedor_sin_producto','danado','otro') then
      perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'causa'));
    end if;
    insert into app.propuesta_faltante (pedido_linea_id, causa, nota, limite_en, creada_por)
    values (l.id, r.j ->> 'causa', nullif(r.j ->> 'nota', ''), v_limite, p_usuario_id)
    returning id into v_f;
    v_ids := v_ids || v_f;
    v_prop := v_prop || jsonb_build_object('propuesta_id', v_f, 'pedido_linea_id', l.id);

    v_orden := 0;
    for o in select t.j from jsonb_array_elements(coalesce(r.j -> 'opciones', '[]')) with ordinality as t(j, ord) order by t.ord loop
      v_orden := v_orden + 1;
      if o.j ->> 'tipo' = 'reducir' then
        if nullif(o.j ->> 'presentacion_id', '') is not null and (o.j ->> 'presentacion_id')::bigint <> l.presentacion_id then
          perform app.fn_fallar('LINEA_NO_VALIDA', jsonb_build_object('pedido_linea_id', l.id, 'motivo', 'reducir_otra_presentacion'));
        end if;
        if coalesce((o.j ->> 'cantidad') !~ '^[0-9]{1,6}$', true) or (o.j ->> 'cantidad')::integer < 1
           or (o.j ->> 'cantidad')::integer >= l.cantidad then
          perform app.fn_fallar('LINEA_NO_VALIDA', jsonb_build_object('pedido_linea_id', l.id, 'motivo', 'reducir_cantidad'));
        end if;
        -- El resto se queda al precio que ya tenia la linea (no se recalcula con la lista de hoy).
        insert into app.propuesta_opcion (propuesta_id, tipo, presentacion_id, cantidad, precio_unitario, orden)
        values (v_f, 'reducir', l.presentacion_id, (o.j ->> 'cantidad')::integer, l.precio_unitario, v_orden);
      elsif o.j ->> 'tipo' = 'sustituto' then
        if coalesce((o.j ->> 'cantidad') !~ '^[1-9][0-9]{0,5}$', true) then
          perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'cantidad'));
        end if;
        select pz.* into v_pz from app.presentacion pz join app.producto p on p.id = pz.producto_id
        where pz.id = nullif(o.j ->> 'presentacion_id', '')::bigint and pz.activa and pz.se_vende and p.activo;
        if not found then
          perform app.fn_fallar('PRESENTACION_NO_VALIDA', jsonb_build_object('presentacion_ids',
            jsonb_build_array(nullif(o.j ->> 'presentacion_id', '')::bigint)));
        end if;
        v_precio := app.fn_precio(v_pz.id, v_p.lista_precio_id);
        if v_precio is null then
          perform app.fn_fallar('PRECIO_NO_DEFINIDO', jsonb_build_object('presentacion_ids', jsonb_build_array(v_pz.id)));
        end if;
        insert into app.propuesta_opcion (propuesta_id, tipo, presentacion_id, cantidad, precio_unitario, orden)
        values (v_f, 'sustituto', v_pz.id, (o.j ->> 'cantidad')::integer, v_precio, v_orden);
      else
        perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'tipo'));
      end if;
    end loop;
    update app.pedido_linea pl set estado = 'faltante' where pl.id = l.id;
  end loop;

  select string_agg(pr.nombre || ' ' || pz.nombre, ', ' order by pl.numero) into v_productos
  from app.pedido_linea pl
  join app.presentacion pz on pz.id = pl.presentacion_id
  join app.producto pr on pr.id = pl.producto_id
  join app.propuesta_faltante f on f.pedido_linea_id = pl.id
  where f.id = any(v_ids);

  update app.pedido p
  set estado = 'esperando_cliente', version = p.version + 1, actualizado_en = now(),
      respuesta_limite_en = (select max(f.limite_en) from app.propuesta_faltante f
                             join app.pedido_linea pl on pl.id = f.pedido_linea_id
                             where pl.pedido_id = p_pedido_id and f.estado = 'pendiente'),
      fecha_entrega = coalesce(v_fecha, p.fecha_entrega),
      entrega_tipo = coalesce(nullif(p_datos ->> 'entrega_tipo', ''), p.entrega_tipo),
      confirmado_en = coalesce(p.confirmado_en, now()),
      confirmado_por = coalesce(p.confirmado_por, p_usuario_id)
  where p.id = p_pedido_id;
  perform app.fn_pedido_evento(p_pedido_id, 'faltante_propuesto', p_usuario_id, jsonb_build_object('propuestas', to_jsonb(v_ids)));
  perform app.fn_aviso_pedido(p_pedido_id, 'wa_pedido_faltante', jsonb_build_object(
    'productos', v_productos,
    'limite', to_char(v_limite at time zone 'America/Mexico_City', 'DD/MM HH24:MI')));

  return jsonb_build_object('pedido', app.fn_pedido_resumen(p_pedido_id), 'propuestas', v_prop,
    'sugerencias', coalesce((
      select jsonb_agg(jsonb_build_object('pedido_linea_id', pl.id, 'opciones',
        coalesce((select jsonb_agg(to_jsonb(s)) from app.fn_sugerencias_linea(pl.id) s), '[]')) order by pl.numero)
      from app.pedido_linea pl join app.propuesta_faltante f on f.pedido_linea_id = pl.id
      where f.id = any(v_ids)), '[]'));
end $$;

-- El cliente (p_usuario_id null) o el personal por el. p_opcion_id null = rechazar (la linea se quita).
create function app.fn_responder_faltante(p_cliente_id bigint, p_usuario_id bigint, p_propuesta_id bigint, p_opcion_id bigint)
returns jsonb
language plpgsql as $$
declare
  v_pid bigint;
  v_p app.pedido;
  v_f app.propuesta_faltante;
  v_tipo text;
  v_estado text;
  v_antes integer;
  v_nombre text;
begin
  if p_usuario_id is not null then
    perform app.fn_exigir_permiso(p_usuario_id, 'pedidos.gestionar');
  end if;
  select l.pedido_id into v_pid
  from app.propuesta_faltante f join app.pedido_linea l on l.id = f.pedido_linea_id where f.id = p_propuesta_id;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('propuesta_id', p_propuesta_id));
  end if;
  select * into v_p from app.pedido p where p.id = v_pid for update;
  if p_usuario_id is null and v_p.cliente_id is distinct from p_cliente_id then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('propuesta_id', p_propuesta_id));
  end if;
  select * into v_f from app.propuesta_faltante f where f.id = p_propuesta_id for update;
  -- Pasado el limite el cliente ya no contesta (se aplica la accion predeterminada); el personal si puede por llamada.
  if v_f.estado <> 'pendiente' or (p_usuario_id is null and v_f.limite_en < now()) then
    perform app.fn_fallar('PROPUESTA_CERRADA', jsonb_build_object('propuesta_id', p_propuesta_id));
  end if;
  perform 1 from app.pedido_linea pl where pl.pedido_id = v_pid order by pl.id for update;
  select l.cantidad, pr.nombre || ' ' || pz.nombre into v_antes, v_nombre
  from app.pedido_linea l join app.presentacion pz on pz.id = l.presentacion_id join app.producto pr on pr.id = l.producto_id
  where l.id = v_f.pedido_linea_id;

  v_tipo := app.fn_faltante_resolver(p_propuesta_id, p_opcion_id,
    case when p_opcion_id is null then 'rechazada' else 'aceptada' end, p_usuario_id);
  v_estado := app.fn_faltante_cerrar_pedido(v_pid);
  perform app.fn_pedido_evento(v_pid, 'faltante_respondido', p_usuario_id,
    jsonb_build_object('propuesta_id', p_propuesta_id, 'respuesta', v_tipo));
  if v_estado = 'cancelado' then
    perform app.fn_aviso_pedido(v_pid, 'wa_pedido_ajustado', jsonb_build_object('cambios',
      app.fn_cambios_texto(jsonb_build_array(jsonb_build_object('presentacion', v_nombre, 'antes', v_antes, 'despues', 0)))));
  end if;
  perform app.fn_notificar_pedido('faltante_respondido', v_pid, 'faltante:' || p_propuesta_id,
    jsonb_build_object('respuesta', v_tipo));
  return jsonb_build_object('pedido', app.fn_pedido_resumen(v_pid), 'respuesta', v_tipo);
end $$;

-- Tarea cada minuto. Nunca acepta un sustituto por el cliente. Devuelve cuantas propuestas vencio.
-- Cada pedido va en su propio sub-bloque: uno que falle no frena a los demas (se deja un WARNING con su id).
create function app.fn_vencer_faltantes() returns integer
language plpgsql as $$
declare
  v_pid bigint;
  v_p app.pedido;
  rf record;
  v_accion text := app.fn_config('faltante_accion_predeterminada');
  v_op bigint;
  v_antes integer;
  v_cambios jsonb;
  v_estado text;
  v_n integer := 0;
  v_n_pedido integer;
begin
  for v_pid in
    select distinct l.pedido_id from app.propuesta_faltante f join app.pedido_linea l on l.id = f.pedido_linea_id
    where f.estado = 'pendiente' and f.limite_en < now() order by 1
  loop
    begin
      v_n_pedido := 0;
      select * into v_p from app.pedido p where p.id = v_pid for update;
      if v_p.estado <> 'esperando_cliente' then continue; end if;
      v_cambios := '[]';
      for rf in
        select f2.id, f2.pedido_linea_id from app.propuesta_faltante f2 join app.pedido_linea l on l.id = f2.pedido_linea_id
        where l.pedido_id = v_pid and f2.estado = 'pendiente' and f2.limite_en < now() order by f2.id for update of f2
      loop
        v_op := null;
        if v_accion = 'reducir' then
          select o.id into v_op from app.propuesta_opcion o where o.propuesta_id = rf.id and o.tipo = 'reducir' order by o.orden, o.id limit 1;
        end if;
        select l.cantidad into v_antes from app.pedido_linea l where l.id = rf.pedido_linea_id;
        perform app.fn_faltante_resolver(rf.id, v_op, 'vencida', null);
        v_cambios := v_cambios || jsonb_build_object(
          'presentacion', (select pr.nombre || ' ' || pz.nombre from app.pedido_linea l
                           join app.presentacion pz on pz.id = l.presentacion_id join app.producto pr on pr.id = l.producto_id
                           where l.id = rf.pedido_linea_id),
          'antes', v_antes, 'despues', (select l.cantidad from app.pedido_linea l where l.id = rf.pedido_linea_id));
        perform app.fn_pedido_evento(v_pid, 'faltante_vencido', null,
          jsonb_build_object('propuesta_id', rf.id, 'accion', case when v_op is null then 'quitar' else 'reducir' end));
        v_n_pedido := v_n_pedido + 1;
      end loop;
      v_estado := app.fn_faltante_cerrar_pedido(v_pid);
      if v_estado <> 'pendiente' then
        perform app.fn_aviso_pedido(v_pid, 'wa_pedido_ajustado', jsonb_build_object('cambios', app.fn_cambios_texto(v_cambios)));
      end if;
      v_n := v_n + v_n_pedido;
    exception when others then
      raise warning 'fn_vencer_faltantes: pedido % fallo (%)', v_pid, sqlstate;
    end;
  end loop;
  return v_n;
end $$;

-- El personal retira la propuesta (llego el producto): la linea vuelve a activa con su cantidad.
create function app.fn_cancelar_faltante(p_usuario_id bigint, p_propuesta_id bigint) returns void
language plpgsql as $$
declare
  v_pid bigint;
  v_f app.propuesta_faltante;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'pedidos.gestionar');
  select l.pedido_id into v_pid
  from app.propuesta_faltante f join app.pedido_linea l on l.id = f.pedido_linea_id where f.id = p_propuesta_id;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('propuesta_id', p_propuesta_id));
  end if;
  perform 1 from app.pedido p where p.id = v_pid for update;
  select * into v_f from app.propuesta_faltante f where f.id = p_propuesta_id for update;
  if v_f.estado <> 'pendiente' then
    perform app.fn_fallar('PROPUESTA_CERRADA', jsonb_build_object('propuesta_id', p_propuesta_id));
  end if;
  perform 1 from app.pedido_linea pl where pl.pedido_id = v_pid order by pl.id for update;
  update app.pedido_linea pl set estado = 'activa' where pl.id = v_f.pedido_linea_id;
  update app.propuesta_faltante f set estado = 'cancelada', respondida_en = now(), respondida_por = p_usuario_id
  where f.id = p_propuesta_id;
  perform app.fn_faltante_cerrar_pedido(v_pid);
  perform app.fn_pedido_evento(v_pid, 'faltante_respondido', p_usuario_id,
    jsonb_build_object('propuesta_id', p_propuesta_id, 'respuesta', 'cancelada'));
end $$;

-- ---------------------------------------------------------------- "lo de siempre" (B5)

-- Tarea cada 15 min; solo actua desde sugerencia_hora local. Una propuesta por ciclo (despues de su ultimo entregado).
create function app.fn_sugerir_pedidos() returns integer
language plpgsql as $$
declare
  r record;
  v_sucursal bigint := (select min(s.id) from app.sucursal s where s.activa);
  v_id bigint;
  v_n integer := 0;
begin
  if (now() at time zone 'America/Mexico_City')::time < app.fn_config('sugerencia_hora')::time then
    return 0;
  end if;
  perform pg_advisory_xact_lock(862003);

  for r in
    select c.id, c.nombre, c.lista_precio_id
    from app.cliente c
    join app.v_cadencia_cliente cad on cad.cliente_id = c.id and cad.atrasado
    where c.activo and c.sugerir_pedido and c.telefono_whatsapp is not null
      and exists (select 1 from app.cliente_enlace e where e.cliente_id = c.id and e.revocado_en is null)
      and not exists (select 1 from app.pedido p where p.cliente_id = c.id and p.estado not in ('entregado','cancelado'))
      and not exists (select 1 from app.pedido s
                      where s.cliente_id = c.id and s.origen = 'sugerido'
                        and s.creado_en > (select max(e.creado_en) from app.pedido e where e.cliente_id = c.id and e.estado = 'entregado'))
      and exists (select 1 from app.fn_canasta_tipica(c.id))
    order by c.id
  loop
    insert into app.pedido (sucursal_id, folio, cliente_id, origen, estado, propuesto_vence_en, lista_precio_id,
                            clave_idempotencia, hash_solicitud)
    values (v_sucursal, null, r.id, 'sugerido', 'propuesto',
            now() + make_interval(hours => app.fn_config('sugerencia_vigencia_horas')::integer), r.lista_precio_id,
            gen_random_uuid(), 'sugerido')
    returning id into v_id;
    -- Solo producto y cantidad: los precios de un propuesto son provisionales (0) y nunca se muestran ni se usan.
    insert into app.pedido_linea (pedido_id, numero, presentacion_id, producto_id, factor, cantidad_pedida, cantidad,
                                  precio_lista, precio_unitario)
    select v_id, (row_number() over (order by k.presentacion_id))::integer, pz.id, pz.producto_id, pz.factor,
           k.cantidad, k.cantidad, 0, 0
    from app.fn_canasta_tipica(r.id) k join app.presentacion pz on pz.id = k.presentacion_id;
    perform app.fn_pedido_evento(v_id, 'recibido', null, jsonb_build_object('origen', 'sugerido'), false);
    perform app.fn_aviso_cliente(r.id, v_id, 'wa_lo_de_siempre', 'wa_lo_de_siempre:p' || v_id || ':v1',
      jsonb_build_object('cliente', r.nombre));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Recalcula con precios de hoy; si el total no es el que el cliente vio: PRECIOS_CAMBIARON (detalle = vista nueva, nada se guarda).
create function app.fn_aceptar_propuesto(p_cliente_id bigint, p_pedido_id bigint, p_total_visto numeric) returns void
language plpgsql as $$
declare
  v_p app.pedido;
  v_vista jsonb;
  v_total numeric(12,2);
  v_min numeric(12,2);
begin
  select * into v_p from app.pedido p where p.id = p_pedido_id and p.cliente_id = p_cliente_id for update;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('pedido_id', p_pedido_id));
  end if;
  if v_p.estado = 'cancelado' and v_p.motivo = 'sin respuesta' and v_p.origen = 'sugerido' then
    perform app.fn_fallar('PEDIDO_VENCIDO', jsonb_build_object('pedido_id', p_pedido_id));
  end if;
  if v_p.estado <> 'propuesto' then
    perform app.fn_fallar('ESTADO_NO_VALIDO', jsonb_build_object('pedido_id', p_pedido_id, 'estado', v_p.estado));
  end if;
  if v_p.propuesto_vence_en < now() then
    perform app.fn_fallar('PEDIDO_VENCIDO', jsonb_build_object('pedido_id', p_pedido_id));
  end if;

  v_vista := app.fn_vista_borrador(p_cliente_id, (
    select jsonb_agg(jsonb_build_object('presentacion_id', l.presentacion_id, 'cantidad', l.cantidad_pedida) order by l.numero)
    from app.pedido_linea l where l.pedido_id = p_pedido_id));
  v_total := (v_vista ->> 'total_actual')::numeric;
  if jsonb_array_length(v_vista -> 'lineas') = 0 then
    perform app.fn_fallar('PEDIDO_VACIO');
  end if;
  if p_total_visto is distinct from v_total then
    perform app.fn_fallar('PRECIOS_CAMBIARON', v_vista);
  end if;
  v_min := round(coalesce(app.fn_config('pedido_minimo')::numeric, 0), 2);
  if v_total < v_min then
    perform app.fn_fallar('PEDIDO_MINIMO', jsonb_build_object('minimo', v_min::text, 'total', v_total::text,
                                                               'faltante', (v_min - v_total)::text));
  end if;

  perform 1 from app.pedido_linea l where l.pedido_id = p_pedido_id order by l.id for update;
  delete from app.pedido_linea l
  where l.pedido_id = p_pedido_id
    and l.presentacion_id not in (select (x ->> 'presentacion_id')::bigint from jsonb_array_elements(v_vista -> 'lineas') x);
  update app.pedido_linea l
  set precio_lista = (x.j ->> 'precio_actual')::numeric, precio_unitario = (x.j ->> 'precio_actual')::numeric
  from jsonb_array_elements(v_vista -> 'lineas') as x(j)
  where l.pedido_id = p_pedido_id and l.presentacion_id = (x.j ->> 'presentacion_id')::bigint;

  -- El folio P nace aqui: un propuesto que nadie acepta nunca gasta uno.
  update app.pedido p set estado = 'recibido', propuesto_vence_en = null, actualizado_en = now(),
      folio = app.fn_siguiente_folio(p.sucursal_id, 'P')
  where p.id = p_pedido_id;
  update app.aviso_cliente a set estado = 'descartado' where a.pedido_id = p_pedido_id and a.estado = 'pendiente';
  perform app.fn_pedido_evento(p_pedido_id, 'recibido', null, jsonb_build_object('origen', 'sugerido', 'total', v_total::text));
  perform app.fn_notificar_pedido('pedido_nuevo', p_pedido_id, 'pedido_nuevo:' || p_pedido_id);
end $$;

-- Vencidos -> cancelado 'sin respuesta' (sin aviso ni notificacion). Devuelve cuantos.
create function app.fn_vencer_propuestos() returns integer
language plpgsql as $$
declare
  v_n integer;
begin
  with t as (
    select p.id from app.pedido p where p.estado = 'propuesto' and p.propuesto_vence_en < now()
    order by p.id for update skip locked
  ), u as (
    update app.pedido p
    set estado = 'cancelado', cancelado_en = now(), cancelado_por = null, propuesto_vence_en = null,
        motivo = 'sin respuesta', actualizado_en = now()
    from t where p.id = t.id
    returning p.id
  ), e as (
    insert into app.pedido_evento (pedido_id, tipo, publico, detalle)
    select u.id, 'cancelado', true, jsonb_build_object('motivo', 'sin respuesta') from u
    returning 1
  ), d as (
    update app.aviso_cliente a set estado = 'descartado'
    where a.estado = 'pendiente' and a.pedido_id in (select u.id from u)
    returning 1
  )
  select count(*)::integer into v_n from u;
  return v_n;
end $$;

-- ---------------------------------------------------------------- disparadores

create trigger trg_pedido_total after insert or update or delete on app.pedido_linea
  for each row execute function app.fn_pedido_total();

create trigger trg_pedido_evento_inmutable before update or delete on app.pedido_evento
  for each row execute function app.fn_pedido_evento_inmutable();
create trigger trg_pedido_evento_truncate before truncate on app.pedido_evento
  for each statement execute function app.fn_truncate_bloqueado();

-- ---------------------------------------------------------------- permisos y semillas

-- Las concesiones de la semilla no ensucian la bitacora (igual que 002 y 003).
alter table app.rol_permiso disable trigger trg_auditar;

insert into app.permiso (codigo, modulo, descripcion) values
  ('clientes.ver', 'clientes', 'Ver clientes y su historial'),
  ('clientes.editar', 'clientes', 'Crear y editar clientes y zonas, y fijar su ubicación'),
  ('clientes.credito', 'clientes', 'Ver y cambiar límite y días de crédito y la lista de precios del cliente'),
  ('clientes.enlace', 'clientes', 'Generar, dar de baja y administrar el enlace personal del cliente'),
  ('pedidos.ver', 'pedidos', 'Ver pedidos y su seguimiento'),
  ('pedidos.capturar', 'pedidos', 'Capturar pedidos por el cliente'),
  ('pedidos.gestionar', 'pedidos', 'Confirmar, ajustar, cancelar y reprogramar pedidos y manejar faltantes'),
  ('pedidos.cambiar_precio', 'pedidos', 'Cambiar el precio de una línea de pedido'),
  ('avisos.enviar', 'avisos', 'Enviar y descartar avisos de WhatsApp');

insert into app.rol_permiso (rol_id, permiso_codigo)
select r.id, x.permiso
from (values
  ('Administrador', 'clientes.ver'), ('Administrador', 'clientes.editar'), ('Administrador', 'clientes.credito'),
  ('Administrador', 'clientes.enlace'), ('Administrador', 'pedidos.ver'), ('Administrador', 'pedidos.capturar'),
  ('Administrador', 'pedidos.gestionar'), ('Administrador', 'avisos.enviar'),
  ('Repartidor', 'clientes.ver'), ('Repartidor', 'avisos.enviar'),
  ('Cajero', 'clientes.ver'), ('Cajero', 'pedidos.ver'), ('Cajero', 'pedidos.capturar'), ('Cajero', 'avisos.enviar'),
  ('Almacenista', 'pedidos.ver')
) as x(rol, permiso)
join app.rol r on r.nombre = x.rol;

alter table app.rol_permiso enable trigger trg_auditar;

-- Etiqueta de la etapa 'propuesto' del seguimiento (001 no la sembro).
alter table app.plantilla disable trigger trg_auditar;
insert into app.plantilla (clave, canal, titulo, texto, variables)
values ('estado_propuesto', 'pantalla', null, 'Esperando tu confirmación', '{}'),
  ('push_pin_ataque', 'push', 'Muchos PIN equivocados', 'Alguien probó {{intentos}} PIN en el enlace de {{cliente}}. Se pausó 15 minutos; el enlace sigue activo.', '{cliente,intentos}');
alter table app.plantilla enable trigger trg_auditar;

-- Auditoria despues de las semillas: la bitacora arranca vacia. Sin token_hash, token_cifrado ni pin_hash (fn_auditar).
create trigger trg_auditar after insert or update or delete on app.zona
  for each row execute function app.fn_auditar();
create trigger trg_auditar after insert or update or delete on app.cliente
  for each row execute function app.fn_auditar();
create trigger trg_auditar after insert or update or delete on app.cliente_enlace
  for each row execute function app.fn_auditar();
create trigger trg_auditar after insert or update or delete on app.cliente_dispositivo
  for each row execute function app.fn_auditar();
create trigger trg_auditar after insert or update or delete on app.producto_equivalente
  for each row execute function app.fn_auditar('producto_id', 'equivalente_id');

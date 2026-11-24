-- 007: rutas, orden de paradas y de carga, reparto (CONTRATOS §2.7).
-- No depende de 005 ni de 006. Rehace con la misma firma (CREATE OR REPLACE) fn_seguimiento_pedido y fn_marcar_aviso de 004.

-- ---------------------------------------------------------------- tablas

create table app.vehiculo (
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) > 0),
  placas text,
  capacidad_cajas integer check (capacidad_cajas > 0),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create unique index uq_vehiculo_nombre on app.vehiculo (lower(nombre));

create table app.ruta (
  id bigint generated always as identity primary key,
  sucursal_id bigint not null references app.sucursal(id),
  folio text not null,
  fecha date not null,
  nombre text,
  vehiculo_id bigint not null references app.vehiculo(id),
  repartidor_id bigint not null references app.usuario(id),
  estado text not null default 'planeada' check (estado in
    ('planeada','cargada','en_curso','terminada','liquidada','cancelada')),
  distancia_km numeric(8,2),
  optimizada_en timestamptz,
  turno_caja_id bigint,
  creado_por bigint not null references app.usuario(id),
  creado_en timestamptz not null default now(),
  cargada_en timestamptz, iniciada_en timestamptz, terminada_en timestamptz,
  constraint uq_ruta_folio unique (sucursal_id, folio)
);
create index idx_ruta_fecha on app.ruta (sucursal_id, fecha desc);
create index idx_ruta_repartidor on app.ruta (repartidor_id, fecha desc);

create table app.ruta_parada (
  id bigint generated always as identity primary key,
  ruta_id bigint not null references app.ruta(id),
  orden smallint not null check (orden > 0),
  tipo text not null check (tipo in ('entrega','cobro')),
  cliente_id bigint not null references app.cliente(id),
  pedido_id bigint references app.pedido(id),
  estado text not null default 'pendiente' check (estado in ('pendiente','visitada','fallida','omitida')),
  km_desde_anterior numeric(8,2),
  visitada_en timestamptz, nota text,
  constraint uq_parada_orden unique (ruta_id, orden) deferrable initially deferred,
  constraint uq_parada_pedido unique (ruta_id, pedido_id),
  constraint ck_parada_pedido check ((tipo = 'entrega') = (pedido_id is not null))
);
create index idx_parada_pedido on app.ruta_parada (pedido_id);

alter table app.pedido add constraint fk_pedido_ruta foreign key (ruta_id) references app.ruta(id);
create index idx_pedido_ruta on app.pedido (ruta_id) where ruta_id is not null;

-- ---------------------------------------------------------------- evento nuevo: ruta_cancelada
-- Avisa al repartidor que una ruta que ya le habian cargado se cancelo. Mismas columnas que 004; solo se agrega el evento.
alter table app.notificacion drop constraint ck_notificacion_evento;
alter table app.notificacion add constraint ck_notificacion_evento check (evento in ('pedido_nuevo','pedido_modificado','pedido_cancelado_cliente',
  'faltante_respondido','surtido_listo','ruta_asignada','entrega_fallida','ubicacion_propuesta',
  'dispositivo_nuevo','visitas_sin_pedido','cliente_inactivo','pin_ataque','ruta_cancelada'));
alter table app.notificacion_preferencia drop constraint ck_notificacion_preferencia_evento;
alter table app.notificacion_preferencia add constraint ck_notificacion_preferencia_evento check (evento in ('pedido_nuevo','pedido_modificado','pedido_cancelado_cliente',
  'faltante_respondido','surtido_listo','ruta_asignada','entrega_fallida','ubicacion_propuesta',
  'dispositivo_nuevo','visitas_sin_pedido','cliente_inactivo','pin_ataque','ruta_cancelada'));

-- Misma firma y cuerpo que 004; solo agrega ruta_cancelada (sin permiso: va a un usuario; abre /reparto).
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
    else null  -- ruta_asignada y ruta_cancelada: solo con p_usuario_id
  end;

  v_ruta := case p_evento
    when 'pedido_nuevo' then '/pedidos/' || coalesce((p_vars ->> 'pedido_id')::bigint::text, '')
    when 'pedido_modificado' then '/pedidos/' || coalesce((p_vars ->> 'pedido_id')::bigint::text, '')
    when 'pedido_cancelado_cliente' then '/pedidos/' || coalesce((p_vars ->> 'pedido_id')::bigint::text, '')
    when 'faltante_respondido' then '/pedidos/' || coalesce((p_vars ->> 'pedido_id')::bigint::text, '')
    when 'entrega_fallida' then '/pedidos/' || coalesce((p_vars ->> 'pedido_id')::bigint::text, '')
    when 'surtido_listo' then '/surtido?fecha=' || coalesce((p_vars ->> 'fecha')::date::text, '')
    when 'ruta_asignada' then '/reparto'
    when 'ruta_cancelada' then '/reparto'
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

-- ---------------------------------------------------------------- ayudas internas

-- Candado de la ruta (siempre primero: ruta -> pedidos por id -> paradas por id).
-- Candado de la ruta (siempre primero: ruta -> pedidos por id -> existencias -> paradas por id). Unico lugar donde se compara la
-- sucursal de la ruta con la del usuario: una ruta de otra sucursal es NO_ENCONTRADO.
create function app.fn_ruta_bloquear(p_usuario_id bigint, p_ruta_id bigint) returns app.ruta
language plpgsql as $$
declare
  v_r app.ruta;
begin
  select * into v_r from app.ruta r where r.id = p_ruta_id for update;
  if not found or v_r.sucursal_id is distinct from (select u.sucursal_id from app.usuario u where u.id = p_usuario_id) then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('ruta_id', p_ruta_id));
  end if;
  return v_r;
end $$;

-- Operar la ruta: rutas.operar y ser su repartidor, o tener rutas.planear.
create function app.fn_ruta_exigir_operar(p_usuario_id bigint, p_ruta app.ruta) returns void
language plpgsql as $$
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'rutas.operar');
  if p_ruta.repartidor_id <> p_usuario_id and not app.fn_tiene_permiso(p_usuario_id, 'rutas.planear') then
    perform app.fn_fallar('RUTA_AJENA', jsonb_build_object('ruta_id', p_ruta.id));
  end if;
end $$;

-- Ordenes 1..n sin huecos (la unicidad de orden se verifica al final de la transaccion).
create function app.fn_ruta_renumerar(p_ruta_id bigint) returns void
language sql as $$
  update app.ruta_parada pa set orden = t.rn
  from (select x.id, (row_number() over (order by x.orden, x.id))::smallint as rn
        from app.ruta_parada x where x.ruta_id = p_ruta_id) t
  where pa.id = t.id and pa.orden <> t.rn
$$;

-- Al cambiar el conjunto de paradas, los km y la distancia guardados ya no valen.
create function app.fn_ruta_invalidar_km(p_ruta_id bigint) returns void
language sql as $$
  update app.ruta_parada set km_desde_anterior = null where ruta_id = p_ruta_id and km_desde_anterior is not null;
  update app.ruta set distancia_km = null, optimizada_en = null where id = p_ruta_id
$$;

-- Unica regla de «no se entrego»: pedido, evento, notificacion al personal y aviso al cliente.
-- Lo usan fn_marcar_no_entregado y fn_terminar_ruta (pedidos no visitados).
-- Texto del motivo desde plantilla (`motivo_<clave>`; nada de texto en el codigo). `otro` usa la nota escrita.
create function app.fn_motivo_texto(p_motivo text, p_nota text default null) returns text
language plpgsql stable as $$
declare
  v_t text;
begin
  if p_motivo = 'otro' then
    if nullif(trim(coalesce(p_nota, '')), '') is null or length(p_nota) > 200 then
      perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'nota'));
    end if;
    return trim(p_nota);
  end if;
  select pl.texto into v_t from app.plantilla pl where pl.clave = 'motivo_' || coalesce(p_motivo, '') and pl.canal = 'pantalla';
  if v_t is null or p_motivo = 'otro' then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'motivo'));
  end if;
  return v_t;
end $$;

-- Unica regla de «no se entrego»: pedido, evento, notificacion al personal (una por pedido y ruta) y aviso al cliente.
-- Lo usan fn_marcar_no_entregado y fn_terminar_ruta (pedidos no visitados).
create function app.fn_pedido_no_entregado(p_pedido_id bigint, p_ruta_id bigint, p_motivo text, p_usuario_id bigint) returns void
language plpgsql as $$
begin
  update app.pedido p
  set estado = 'no_entregado', motivo = p_motivo, version = p.version + 1, actualizado_en = now()
  where p.id = p_pedido_id;
  perform app.fn_pedido_evento(p_pedido_id, 'no_entregado', p_usuario_id, jsonb_build_object('motivo', p_motivo));
  perform app.fn_notificar_pedido('entrega_fallida', p_pedido_id, 'fallida:' || p_pedido_id || ':r' || p_ruta_id, jsonb_build_object('motivo', p_motivo));
  perform app.fn_aviso_pedido(p_pedido_id, 'wa_entrega_fallida', jsonb_build_object('motivo', p_motivo));
end $$;

-- ---------------------------------------------------------------- reglas de lectura

-- Unica regla de «que pedido entra en una ruta»: confirmado o esperando_cliente, a domicilio, sin ruta y con la fecha de la ruta.
-- La usan fn_asignar_pedidos y GET /rutas/:id/candidatos.
-- Unica regla de «que pedido entra en una ruta»: confirmado o esperando_cliente, a domicilio y con la fecha de la ruta; sin ruta
-- (o, con p_incluir_asignados, tambien los ya puestos en ella: fn_cargar_ruta revalida con esto).
-- La usan fn_asignar_pedidos, fn_cargar_ruta y GET /rutas/:id/candidatos.
create function app.fn_pedidos_asignables(p_ruta_id bigint, p_incluir_asignados boolean default false) returns setof bigint
language sql stable as $$
  select p.id
  from app.ruta r
  join app.pedido p on p.sucursal_id = r.sucursal_id
  where r.id = p_ruta_id and p.estado in ('confirmado','esperando_cliente') and p.entrega_tipo = 'reparto'
    and (p.ruta_id is null or (p_incluir_asignados and p.ruta_id = r.id)) and p.fecha_entrega = r.fecha
$$;

-- Unica regla de requiere_surtido: pedido confirmado con alguna linea activa cuyo producto tiene disponible < 0.
-- Delega en la regla unica de 006 (plpgsql: no hace falta que 006 exista para crear esta funcion).
create function app.fn_requiere_surtido(p_pedido_id bigint) returns boolean
language plpgsql stable as $$
begin
  return app.fn_pedido_requiere_surtido(p_pedido_id);
end $$;

-- Lo mismo para varios pedidos de una vez (listas): la lista de surtido se calcula una vez por (sucursal, fecha), no por fila.
-- Misma regla que fn_pedido_requiere_surtido de 006 (una prueba compara ambas).
create function app.fn_pedidos_requieren_surtido(p_ids bigint[]) returns setof bigint
language plpgsql stable as $$
begin
  return query
  with k as (
    select distinct v.sucursal_id, v.fecha_entrega from app.v_linea_comprometida v
    where v.pedido_id = any(p_ids) and v.estado_pedido in ('confirmado','esperando_cliente') and v.fecha_entrega is not null
  )
  select distinct v.pedido_id
  from k
  join lateral app.fn_lista_surtido(k.sucursal_id, k.fecha_entrega) s on s.piezas_a_comprar > 0
  join app.v_linea_comprometida v on v.sucursal_id = k.sucursal_id and v.fecha_entrega = k.fecha_entrega and v.producto_id = s.producto_id
  where v.pedido_id = any(p_ids) and v.estado_pedido in ('confirmado','esperando_cliente');
end $$;

-- Unica regla de la etapa que ve el cliente: el estado, salvo «surtiendo» (confirmado que requiere surtido).
-- La usan fn_seguimiento_pedido y la lista de GET /api/publico/pedidos.
create function app.fn_etapa_pedido(p_pedido_id bigint) returns text
language sql stable as $$
  select case when p.estado = 'confirmado' and app.fn_requiere_surtido(p.id) then 'surtiendo' else p.estado end
  from app.pedido p where p.id = p_pedido_id
$$;

-- Unica regla de «parada N de M» y hora estimada (solo pedidos en_ruta; si no, null).
-- est = ahora + km pendientes hasta su parada / velocidad + paradas pendientes antes * minutos por parada.
create function app.fn_reparto_pedido(p_pedido_id bigint) returns jsonb
language sql stable as $$
  with q as (
    select pa.orden,
           (select count(*)::int from app.ruta_parada x where x.ruta_id = pa.ruta_id) as paradas,
           (select count(*)::int from app.ruta_parada x
             where x.ruta_id = pa.ruta_id and x.estado = 'pendiente' and x.orden < pa.orden) as antes,
           (select coalesce(sum(x.km_desde_anterior), 0) from app.ruta_parada x
             where x.ruta_id = pa.ruta_id and x.estado = 'pendiente' and x.orden <= pa.orden) as km
    from app.pedido p
    join app.ruta_parada pa on pa.ruta_id = p.ruta_id and pa.pedido_id = p.id
    where p.id = p_pedido_id and p.estado = 'en_ruta'
  ), e as (
    select q.*,
           now()
           + (q.km / greatest(coalesce(app.fn_config('reparto_velocidad_kmh')::numeric, 25), 1))::float8 * interval '1 hour'
           + (q.antes * coalesce(app.fn_config('reparto_minutos_por_parada')::numeric, 10))::float8 * interval '1 minute' as est
    from q
  )
  select jsonb_build_object('parada', e.orden, 'paradas', e.paradas, 'antes_que_tu', e.antes,
                            'llegada_estimada_desde', greatest(now(), e.est - interval '30 minutes'),
                            'llegada_estimada_hasta', e.est + interval '30 minutes')
  from e
$$;

-- Unica regla de «avisos visibles»: pedidos.ver ve todos; si no, solo los de pedidos de sus rutas (no canceladas).
-- Unica regla de «avisos visibles»: pedidos.ver ve todos; el Repartidor, solo los de pedidos de sus rutas que no han terminado
-- (ni canceladas) y solo de reparto (en ruta, entrega fallida, nota de entrega).
create function app.fn_puede_ver_aviso(p_usuario_id bigint, p_pedido_id bigint, p_plantilla text default null) returns boolean
language sql stable as $$
  select app.fn_tiene_permiso(p_usuario_id, 'pedidos.ver')
      or (p_pedido_id is not null
          and (p_plantilla is null or p_plantilla in ('wa_pedido_en_ruta','wa_entrega_fallida','wa_nota_entrega'))
          and exists (
            select 1 from app.pedido p join app.ruta r on r.id = p.ruta_id
            where p.id = p_pedido_id and r.estado in ('planeada','cargada','en_curso') and r.repartidor_id = p_usuario_id))
$$;

-- Distancia que se muestra: la guardada, salvo que algun km de las paradas se haya anulado (parada quitada por cancelar un pedido).
create function app.fn_ruta_distancia(p_ruta_id bigint) returns numeric
language sql stable as $$
  select case when exists (select 1 from app.ruta_parada pa where pa.ruta_id = p_ruta_id and pa.km_desde_anterior is null) then null else r.distancia_km end
  from app.ruta r where r.id = p_ruta_id
$$;

-- Orden de carga LIFO: carga_n = 1 es la ultima parada (va al fondo). cajas_totales es una APROXIMACION: por linea
-- ceil(piezas / factor de la presentacion activa mas grande del producto), sumado (el contrato no define «caja»).
create function app.fn_orden_carga(p_ruta_id bigint) returns jsonb
language sql stable as $$
  with total as (select count(*)::int as n from app.ruta_parada where ruta_id = p_ruta_id),
  par as (
    select pa.id, pa.orden, (t.n - pa.orden + 1) as carga_n, pa.pedido_id, c.nombre as cliente, z.nombre as zona, p.folio as pedido_folio
    from app.ruta_parada pa
    cross join total t
    join app.cliente c on c.id = pa.cliente_id
    left join app.zona z on z.id = c.zona_id
    left join app.pedido p on p.id = pa.pedido_id
    where pa.ruta_id = p_ruta_id
  ), lin as (
    select l.pedido_id, l.numero, l.cantidad, l.piezas, pz.nombre as presentacion, pr.nombre as producto,
           ceil(l.piezas::numeric / (select max(x.factor) from app.presentacion x where x.producto_id = l.producto_id and x.activa)) as cajas
    from app.pedido_linea l
    join app.presentacion pz on pz.id = l.presentacion_id
    join app.producto pr on pr.id = l.producto_id
    where l.estado = 'activa' and l.cantidad > 0 and l.pedido_id in (select pedido_id from par)
  ), tot as (
    select l.producto, l.presentacion, sum(l.cantidad)::int as cantidad, sum(l.piezas)::int as piezas
    from lin l group by l.producto, l.presentacion
  )
  select jsonb_build_object(
    'paradas', coalesce((
      select jsonb_agg(jsonb_build_object('carga_n', par.carga_n, 'orden', par.orden, 'cliente', par.cliente,
        'zona', par.zona, 'pedido_folio', par.pedido_folio,
        'lineas', coalesce((select jsonb_agg(jsonb_build_object('cantidad', l.cantidad, 'presentacion', l.presentacion,
                                                                 'producto', l.producto) order by l.numero)
                            from lin l where l.pedido_id = par.pedido_id), '[]'::jsonb))
        order by par.carga_n)
      from par), '[]'::jsonb),
    'totales', coalesce((
      select jsonb_agg(jsonb_build_object('producto', t.producto, 'presentacion', t.presentacion,
                                          'cantidad', t.cantidad, 'piezas', t.piezas) order by t.producto, t.presentacion)
      from tot t), '[]'::jsonb),
    'cajas_totales', coalesce((select sum(l.cajas) from lin l), 0)::int)
$$;

-- ---------------------------------------------------------------- crear, asignar, quitar, ordenar

create function app.fn_crear_ruta(p_usuario_id bigint, p_sucursal_id bigint, p_datos jsonb) returns bigint
language plpgsql as $$
declare
  v_fecha date;
  v_nombre text;
  v_veh bigint;
  v_rep bigint;
  v_id bigint;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'rutas.planear');
  if jsonb_typeof(p_datos) is distinct from 'object' then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'datos'));
  end if;
  v_fecha := app.fn_json_fecha(p_datos ->> 'fecha', 'fecha');
  if v_fecha < app.fn_fecha_local(now()) then
    perform app.fn_fallar('FECHA_NO_VALIDA', jsonb_build_object('fecha', v_fecha));
  end if;
  v_nombre := nullif(trim(coalesce(p_datos ->> 'nombre', '')), '');
  if length(v_nombre) > 80 then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'nombre'));
  end if;
  if coalesce(p_datos ->> 'vehiculo_id', '') !~ '^[0-9]{1,18}$' then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'vehiculo_id'));
  end if;
  if coalesce(p_datos ->> 'repartidor_id', '') !~ '^[0-9]{1,18}$' then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'repartidor_id'));
  end if;
  v_veh := (p_datos ->> 'vehiculo_id')::bigint;
  v_rep := (p_datos ->> 'repartidor_id')::bigint;
  if not exists (select 1 from app.vehiculo v where v.id = v_veh and v.activo) then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'vehiculo_id'));
  end if;
  if not exists (select 1 from app.usuario u where u.id = v_rep and u.activo and u.sucursal_id = p_sucursal_id)
     or not app.fn_tiene_permiso(v_rep, 'rutas.operar') then
    perform app.fn_fallar('REPARTIDOR_NO_VALIDO', jsonb_build_object('repartidor_id', v_rep));
  end if;
  insert into app.ruta (sucursal_id, folio, fecha, nombre, vehiculo_id, repartidor_id, creado_por)
  values (p_sucursal_id, app.fn_siguiente_folio(p_sucursal_id, 'R'), v_fecha, v_nombre, v_veh, v_rep, p_usuario_id)
  returning id into v_id;
  return v_id;
end $$;

create function app.fn_asignar_pedidos(p_usuario_id bigint, p_ruta_id bigint, p_pedido_ids bigint[]) returns void
language plpgsql as $$
declare
  v_r app.ruta;
  v_ids bigint[];
  v_mal bigint[];
  v_max integer;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'rutas.planear');
  v_r := app.fn_ruta_bloquear(p_usuario_id, p_ruta_id);
  if v_r.estado <> 'planeada' then
    perform app.fn_fallar('RUTA_NO_EDITABLE', jsonb_build_object('ruta_id', p_ruta_id, 'estado', v_r.estado));
  end if;
  if p_pedido_ids is null or cardinality(p_pedido_ids) = 0 or cardinality(p_pedido_ids) > 200 or null = any(p_pedido_ids) then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'pedido_ids'));
  end if;
  -- Sin repetidos y en el orden pedido.
  select array_agg(s.id order by s.primero) into v_ids
  from (select t.id, min(t.ord) as primero from unnest(p_pedido_ids) with ordinality as t(id, ord) group by t.id) s;

  perform 1 from app.pedido p where p.id = any(v_ids) order by p.id for update;
  if (select count(*) from app.pedido p where p.id = any(v_ids) and p.sucursal_id = v_r.sucursal_id) <> cardinality(v_ids) then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('pedido_ids', v_ids));
  end if;

  select array_agg(p.id order by p.id) into v_mal from app.pedido p where p.id = any(v_ids) and p.ruta_id is not null;
  if v_mal is not null then
    perform app.fn_fallar('PEDIDO_EN_OTRA_RUTA', jsonb_build_object('pedido_ids', v_mal));
  end if;
  select array_agg(x order by x) into v_mal
  from unnest(v_ids) x
  where x not in (select a from app.fn_pedidos_asignables(p_ruta_id) a);
  if v_mal is not null then
    perform app.fn_fallar('PEDIDO_NO_ASIGNABLE', jsonb_build_object('pedido_ids', v_mal));
  end if;

  perform 1 from app.ruta_parada pa where pa.ruta_id = p_ruta_id order by pa.id for update;
  select coalesce(max(pa.orden), 0) into v_max from app.ruta_parada pa where pa.ruta_id = p_ruta_id;
  if v_max + cardinality(v_ids) > 200 then
    perform app.fn_fallar('RUTA_LLENA', jsonb_build_object('ruta_id', p_ruta_id, 'maximo', 200));
  end if;
  insert into app.ruta_parada (ruta_id, orden, tipo, cliente_id, pedido_id)
  select p_ruta_id, (v_max + t.ord)::smallint, 'entrega', p.cliente_id, p.id
  from unnest(v_ids) with ordinality as t(id, ord)
  join app.pedido p on p.id = t.id;
  update app.pedido p set ruta_id = p_ruta_id, actualizado_en = now() where p.id = any(v_ids);
  perform app.fn_pedido_evento(x, 'asignado_ruta', p_usuario_id, jsonb_build_object('ruta_id', p_ruta_id, 'folio', v_r.folio), false)
  from unnest(v_ids) x;
  perform app.fn_ruta_invalidar_km(p_ruta_id);
end $$;

create function app.fn_quitar_parada(p_usuario_id bigint, p_parada_id bigint) returns void
language plpgsql as $$
declare
  v_ruta_id bigint;
  v_pedido_id bigint;
  v_r app.ruta;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'rutas.planear');
  select pa.ruta_id, pa.pedido_id into v_ruta_id, v_pedido_id from app.ruta_parada pa where pa.id = p_parada_id;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('parada_id', p_parada_id));
  end if;
  v_r := app.fn_ruta_bloquear(p_usuario_id, v_ruta_id);
  if v_r.estado <> 'planeada' then
    perform app.fn_fallar('RUTA_NO_EDITABLE', jsonb_build_object('ruta_id', v_ruta_id, 'estado', v_r.estado));
  end if;
  if v_pedido_id is not null then
    perform 1 from app.pedido p where p.id = v_pedido_id for update;
  end if;
  perform 1 from app.ruta_parada pa where pa.ruta_id = v_ruta_id order by pa.id for update;
  delete from app.ruta_parada pa where pa.id = p_parada_id;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('parada_id', p_parada_id));
  end if;
  if v_pedido_id is not null then
    update app.pedido p set ruta_id = null, actualizado_en = now() where p.id = v_pedido_id;
    perform app.fn_pedido_evento(v_pedido_id, 'quitado_ruta', p_usuario_id, jsonb_build_object('ruta_id', v_ruta_id, 'folio', v_r.folio), false);
  end if;
  perform app.fn_ruta_renumerar(v_ruta_id);
  perform app.fn_ruta_invalidar_km(v_ruta_id);
end $$;

-- p_km: n + 1 tramos (el ultimo es el regreso a la bodega). Sin p_km (orden a mano) se borran km y distancia.
create function app.fn_ordenar_ruta(p_usuario_id bigint, p_ruta_id bigint, p_paradas bigint[],
                                    p_km numeric[] default null, p_optimizada boolean default false) returns void
language plpgsql as $$
declare
  v_r app.ruta;
  v_n integer;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'rutas.planear');
  v_r := app.fn_ruta_bloquear(p_usuario_id, p_ruta_id);
  if v_r.estado <> 'planeada' then
    perform app.fn_fallar('RUTA_NO_EDITABLE', jsonb_build_object('ruta_id', p_ruta_id, 'estado', v_r.estado));
  end if;
  perform 1 from app.ruta_parada pa where pa.ruta_id = p_ruta_id order by pa.id for update;
  select count(*)::int into v_n from app.ruta_parada pa where pa.ruta_id = p_ruta_id;
  if p_paradas is null or null = any(p_paradas)
     or (select coalesce(array_agg(x order by x), '{}') from unnest(p_paradas) x)
        is distinct from (select coalesce(array_agg(pa.id order by pa.id), '{}') from app.ruta_parada pa where pa.ruta_id = p_ruta_id) then
    perform app.fn_fallar('PARADAS_NO_CUADRAN', jsonb_build_object('ruta_id', p_ruta_id));
  end if;
  if p_km is not null and (cardinality(p_km) <> v_n + 1 or exists (select 1 from unnest(p_km) k where k is null or k < 0)) then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'km'));
  end if;
  update app.ruta_parada pa
  set orden = t.ord::smallint, km_desde_anterior = case when p_km is not null then p_km[t.ord] end
  from unnest(p_paradas) with ordinality as t(id, ord)
  where pa.id = t.id;
  update app.ruta r
  set distancia_km = case when p_km is not null then (select sum(k) from unnest(p_km) k) end,
      optimizada_en = case when coalesce(p_optimizada, false) then now() end
  where r.id = p_ruta_id;
end $$;

-- ---------------------------------------------------------------- cargar, iniciar, no entregado, terminar, cancelar

create function app.fn_cargar_ruta(p_usuario_id bigint, p_ruta_id bigint) returns jsonb
language plpgsql as $$
declare
  v_r app.ruta;
  v_espera bigint[];
  v_otros bigint[];
  v_faltan jsonb;
  v_carga jsonb;
  v_adv jsonb := '[]';
  v_cap integer;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'rutas.planear');
  v_r := app.fn_ruta_bloquear(p_usuario_id, p_ruta_id);
  if v_r.estado <> 'planeada' then
    perform app.fn_fallar('RUTA_NO_EDITABLE', jsonb_build_object('ruta_id', p_ruta_id, 'estado', v_r.estado));
  end if;
  perform 1 from app.pedido p where p.ruta_id = p_ruta_id order by p.id for update;
  if not exists (select 1 from app.ruta_parada pa where pa.ruta_id = p_ruta_id and pa.tipo = 'entrega') then
    perform app.fn_fallar('RUTA_VACIA', jsonb_build_object('ruta_id', p_ruta_id));
  end if;
  select array_agg(p.id order by p.id) into v_espera from app.pedido p where p.ruta_id = p_ruta_id and p.estado = 'esperando_cliente';
  if v_espera is not null then
    perform app.fn_fallar('PEDIDO_ESPERANDO_CLIENTE', jsonb_build_object('pedido_ids', v_espera));
  end if;
  -- Revalida lo que pudo cambiar despues de asignar (fecha, tipo de entrega, estado): las mismas reglas que al asignar.
  select array_agg(p.id order by p.id) into v_otros from app.pedido p
  where p.ruta_id = p_ruta_id and p.id not in (select a from app.fn_pedidos_asignables(p_ruta_id, true) a);
  if v_otros is not null then
    perform app.fn_fallar('PEDIDO_NO_ASIGNABLE', jsonb_build_object('pedido_ids', v_otros));
  end if;

  -- Candado comun de existencias (producto_id ascendente) ANTES de calcular: dos rutas con el mismo producto se serializan
  -- y la segunda ve lo que cargo la primera.
  perform app.fn_bloquear_existencias(v_r.sucursal_id, array(
    select distinct l.producto_id from app.pedido p join app.pedido_linea l on l.pedido_id = p.id and l.estado = 'activa'
    where p.ruta_id = p_ruta_id order by 1));

  -- Control de existencia: lo de esta ruta debe caber en existencia menos lo ya cargado en otras rutas.
  select jsonb_agg(jsonb_build_object('producto_id', s.producto_id, 'producto', pr.nombre,
                                      'faltan', s.piezas - (coalesce(d.existencia, 0) - coalesce(d.cargadas, 0))) order by pr.nombre, s.producto_id)
  into v_faltan
  from (select l.producto_id, sum(l.piezas)::int as piezas
        from app.pedido p join app.pedido_linea l on l.pedido_id = p.id and l.estado = 'activa'
        where p.ruta_id = p_ruta_id group by l.producto_id) s
  join app.producto pr on pr.id = s.producto_id
  left join app.v_disponible d on d.sucursal_id = v_r.sucursal_id and d.producto_id = s.producto_id
  where s.piezas > coalesce(d.existencia, 0) - coalesce(d.cargadas, 0);
  if v_faltan is not null then
    perform app.fn_fallar('FALTA_SURTIR', v_faltan);
  end if;

  update app.pedido p set estado = 'cargado', actualizado_en = now() where p.ruta_id = p_ruta_id;
  perform app.fn_pedido_evento(p.id, 'cargado', p_usuario_id, jsonb_build_object('ruta_id', p_ruta_id, 'folio', v_r.folio))
  from app.pedido p where p.ruta_id = p_ruta_id order by p.id;
  update app.ruta r set estado = 'cargada', cargada_en = now() where r.id = p_ruta_id;
  perform app.fn_notificar('ruta_asignada', 'ruta:' || p_ruta_id || ':cargada',
    jsonb_build_object('ruta', v_r.folio, 'fecha', to_char(v_r.fecha, 'DD/MM/YYYY'),
                       'num_paradas', (select count(*) from app.ruta_parada pa where pa.ruta_id = p_ruta_id)),
    v_r.repartidor_id);

  v_carga := app.fn_orden_carga(p_ruta_id);
  select v.capacidad_cajas into v_cap from app.vehiculo v where v.id = v_r.vehiculo_id;
  if v_cap is not null and (v_carga ->> 'cajas_totales')::int > v_cap then
    v_adv := jsonb_build_array(jsonb_build_object('codigo', 'capacidad', 'cajas', (v_carga ->> 'cajas_totales')::int, 'capacidad', v_cap));
  end if;
  return v_carga || jsonb_build_object('advertencias', v_adv);
end $$;

-- En 007 devuelve null e ignora el fondo; 008 la reemplaza con la misma firma para abrir el turno de ruta.
create function app.fn_iniciar_ruta(p_usuario_id bigint, p_ruta_id bigint, p_fondo_inicial numeric default 0) returns bigint
language plpgsql as $$
declare
  v_r app.ruta;
  v_n integer;
begin
  v_r := app.fn_ruta_bloquear(p_usuario_id, p_ruta_id);
  perform app.fn_ruta_exigir_operar(p_usuario_id, v_r);
  if v_r.estado <> 'cargada' then
    perform app.fn_fallar('ESTADO_NO_VALIDO', jsonb_build_object('ruta_id', p_ruta_id, 'estado', v_r.estado));
  end if;
  if exists (select 1 from app.ruta r where r.repartidor_id = v_r.repartidor_id and r.estado = 'en_curso' and r.id <> p_ruta_id) then
    perform app.fn_fallar('ESTADO_NO_VALIDO', jsonb_build_object('ruta_id', p_ruta_id, 'motivo', 'otra_ruta_en_curso'));
  end if;
  perform 1 from app.pedido p where p.ruta_id = p_ruta_id order by p.id for update;
  select count(*)::int into v_n from app.ruta_parada pa where pa.ruta_id = p_ruta_id;
  update app.ruta r set estado = 'en_curso', iniciada_en = now() where r.id = p_ruta_id;
  update app.pedido p set estado = 'en_ruta', actualizado_en = now() where p.ruta_id = p_ruta_id and p.estado = 'cargado';
  perform app.fn_pedido_evento(pa.pedido_id, 'en_ruta', p_usuario_id, jsonb_build_object('ruta_id', p_ruta_id, 'parada', pa.orden))
  from app.ruta_parada pa join app.pedido p on p.id = pa.pedido_id
  where pa.ruta_id = p_ruta_id and p.estado = 'en_ruta' order by pa.orden;
  perform app.fn_aviso_cliente(p.cliente_id, p.id, 'wa_pedido_en_ruta',
    'wa_pedido_en_ruta:p' || p.id || ':v' || p.version || ':r' || p_ruta_id,
    jsonb_build_object('cliente', c.nombre, 'folio', p.folio, 'parada', pa.orden, 'paradas', v_n))
  from app.ruta_parada pa
  join app.pedido p on p.id = pa.pedido_id
  join app.cliente c on c.id = p.cliente_id
  where pa.ruta_id = p_ruta_id and p.estado = 'en_ruta' order by pa.orden;
  return null;
end $$;

-- Idempotente: una parada ya fallida no hace nada. El producto vuelve en la camioneta (nunca salio del kardex).
-- Idempotente: una parada ya fallida no hace nada. El producto vuelve en la camioneta (nunca salio del kardex).
-- p_motivo es una clave (`cerrado`, `no_estaba`, `no_quiso`, `otro`); `otro` pide p_nota. Orden de candados: ruta -> pedido -> parada.
create function app.fn_marcar_no_entregado(p_usuario_id bigint, p_parada_id bigint, p_motivo text, p_nota text default null) returns void
language plpgsql as $$
declare
  v_ruta_id bigint;
  v_pedido_id bigint;
  v_r app.ruta;
  v_pa app.ruta_parada;
  v_texto text;
begin
  select pa.ruta_id, pa.pedido_id into v_ruta_id, v_pedido_id from app.ruta_parada pa where pa.id = p_parada_id;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('parada_id', p_parada_id));
  end if;
  v_r := app.fn_ruta_bloquear(p_usuario_id, v_ruta_id);
  perform app.fn_ruta_exigir_operar(p_usuario_id, v_r);
  if v_pedido_id is not null then
    perform 1 from app.pedido p where p.id = v_pedido_id for update;
  end if;
  select * into v_pa from app.ruta_parada pa where pa.id = p_parada_id for update;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('parada_id', p_parada_id));
  end if;
  if v_pa.estado = 'fallida' then
    return;
  end if;
  if v_r.estado <> 'en_curso' or v_pa.estado <> 'pendiente' then
    perform app.fn_fallar('ESTADO_NO_VALIDO', jsonb_build_object('parada_id', p_parada_id, 'ruta_estado', v_r.estado, 'estado', v_pa.estado));
  end if;
  v_texto := app.fn_motivo_texto(p_motivo, p_nota);
  update app.ruta_parada pa set estado = 'fallida', visitada_en = now(), nota = v_texto where pa.id = p_parada_id;
  if v_pedido_id is not null then
    perform app.fn_pedido_no_entregado(v_pedido_id, v_ruta_id, v_texto, p_usuario_id);
  end if;
end $$;

create function app.fn_terminar_ruta(p_usuario_id bigint, p_ruta_id bigint) returns void
language plpgsql as $$
declare
  v_r app.ruta;
  v_pedido bigint;
begin
  v_r := app.fn_ruta_bloquear(p_usuario_id, p_ruta_id);
  perform app.fn_ruta_exigir_operar(p_usuario_id, v_r);
  if v_r.estado <> 'en_curso' then
    perform app.fn_fallar('ESTADO_NO_VALIDO', jsonb_build_object('ruta_id', p_ruta_id, 'estado', v_r.estado));
  end if;
  perform 1 from app.pedido p where p.ruta_id = p_ruta_id order by p.id for update;
  perform 1 from app.ruta_parada pa where pa.ruta_id = p_ruta_id order by pa.id for update;
  for v_pedido in
    select pa.pedido_id from app.ruta_parada pa join app.pedido p on p.id = pa.pedido_id
    where pa.ruta_id = p_ruta_id and pa.estado = 'pendiente' and p.estado = 'en_ruta' order by pa.pedido_id
  loop
    perform app.fn_pedido_no_entregado(v_pedido, p_ruta_id, app.fn_motivo_texto('no_visitada'), p_usuario_id);
  end loop;
  update app.ruta_parada pa set estado = 'omitida' where pa.ruta_id = p_ruta_id and pa.estado = 'pendiente';
  update app.ruta r set estado = 'terminada', terminada_en = now() where r.id = p_ruta_id;
end $$;

create function app.fn_cancelar_ruta(p_usuario_id bigint, p_ruta_id bigint) returns void
language plpgsql as $$
declare
  v_r app.ruta;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'rutas.planear');
  v_r := app.fn_ruta_bloquear(p_usuario_id, p_ruta_id);
  if v_r.estado not in ('planeada','cargada') then
    perform app.fn_fallar('ESTADO_NO_VALIDO', jsonb_build_object('ruta_id', p_ruta_id, 'estado', v_r.estado));
  end if;
  perform 1 from app.pedido p where p.ruta_id = p_ruta_id order by p.id for update;
  perform 1 from app.ruta_parada pa where pa.ruta_id = p_ruta_id order by pa.id for update;
  perform app.fn_pedido_evento(p.id, 'quitado_ruta', p_usuario_id, jsonb_build_object('ruta_id', p_ruta_id, 'folio', v_r.folio, 'motivo', 'ruta_cancelada'), false)
  from app.pedido p where p.ruta_id = p_ruta_id order by p.id;
  update app.pedido p
  set ruta_id = null, estado = case when p.estado = 'cargado' then 'confirmado' else p.estado end, actualizado_en = now()
  where p.ruta_id = p_ruta_id;
  update app.ruta_parada pa set estado = 'omitida' where pa.ruta_id = p_ruta_id and pa.estado = 'pendiente';
  update app.ruta r set estado = 'cancelada' where r.id = p_ruta_id;
  if v_r.estado = 'cargada' then
    perform app.fn_notificar('ruta_cancelada', 'ruta:' || p_ruta_id || ':cancelada',
      jsonb_build_object('ruta', v_r.folio, 'fecha', to_char(v_r.fecha, 'DD/MM/YYYY')), v_r.repartidor_id);
  end if;
end $$;

-- ---------------------------------------------------------------- pedido cancelado en una ruta planeada

-- Cubre fn_cancelar_pedido, la cancelacion del cliente y la de «sin_lineas». No toca la fila de la ruta ni la bloquea (el orden
-- seria pedido -> ruta, al reves de fn_cargar_ruta: 40P01): solo paradas, que van despues de pedidos en el orden de candados.
-- Los km de la ruta quedan viejos: se anulan en las paradas y fn_ruta_distancia (lo que se lee) da null mientras alguna este anulada.
create function app.fn_pedido_cancelado_ruta() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from app.ruta r where r.id = old.ruta_id and r.estado = 'planeada') then
    perform 1 from app.ruta_parada pa where pa.ruta_id = old.ruta_id order by pa.id for update;
    delete from app.ruta_parada pa where pa.ruta_id = old.ruta_id and pa.pedido_id = new.id;
    perform app.fn_ruta_renumerar(old.ruta_id);
    update app.ruta_parada pa set km_desde_anterior = null where pa.ruta_id = old.ruta_id and pa.km_desde_anterior is not null;
    update app.pedido p set ruta_id = null where p.id = new.id;
    perform app.fn_pedido_evento(new.id, 'quitado_ruta', nullif(current_setting('app.usuario_id', true), '')::bigint,
      jsonb_build_object('ruta_id', old.ruta_id, 'motivo', 'pedido_cancelado'), false);
  end if;
  return null;
end $$;

create trigger trg_pedido_cancelado_ruta after update of estado on app.pedido
  for each row when (new.estado = 'cancelado' and old.estado is distinct from 'cancelado' and old.ruta_id is not null)
  execute function app.fn_pedido_cancelado_ruta();

-- ---------------------------------------------------------------- 004 rehechas (misma firma)

-- Cuerpo de 004 con solo dos cambios: reparto = fn_reparto_pedido y etapa 'surtiendo' si fn_requiere_surtido.
create or replace function app.fn_seguimiento_pedido(p_cliente_id bigint, p_pedido_id bigint) returns jsonb
language plpgsql stable as $$
declare
  v_p app.pedido;
  v_prop boolean;
  v_etapa text;
begin
  select * into v_p from app.pedido p where p.id = p_pedido_id and p.cliente_id = p_cliente_id;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('pedido_id', p_pedido_id));
  end if;
  v_prop := v_p.estado = 'propuesto';
  v_etapa := app.fn_etapa_pedido(v_p.id);
  return jsonb_build_object(
    'folio', v_p.folio,
    'etapa', v_etapa,
    'etiqueta', (select pl.texto from app.plantilla pl where pl.clave = 'estado_' || v_etapa),
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
    'reparto', app.fn_reparto_pedido(v_p.id),
    'editable', v_p.estado = 'recibido',
    'borrador', case when v_prop then app.fn_vista_borrador(p_cliente_id, (
      select jsonb_agg(jsonb_build_object('presentacion_id', l.presentacion_id, 'cantidad', l.cantidad_pedida) order by l.numero)
      from app.pedido_linea l where l.pedido_id = v_p.id)) end);
end $$;

-- Cuerpo de 004 cambiando la comprobacion de pedidos.ver por fn_puede_ver_aviso (aviso no visible = NO_ENCONTRADO, no revela que existe).
create or replace function app.fn_marcar_aviso(p_usuario_id bigint, p_aviso_id bigint, p_estado text) returns void
language plpgsql as $$
declare
  v_a app.aviso_cliente;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'avisos.enviar');
  if p_estado is null or p_estado not in ('enviado','descartado') then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'estado'));
  end if;
  select * into v_a from app.aviso_cliente a where a.id = p_aviso_id for update;
  if not found or not app.fn_puede_ver_aviso(p_usuario_id, v_a.pedido_id, v_a.plantilla) then
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

-- ---------------------------------------------------------------- permisos y semillas

-- Textos de motivos (se guardan en el pedido y salen en el aviso al cliente y en el push) y del push de ruta cancelada.
alter table app.plantilla disable trigger trg_auditar;
insert into app.plantilla (clave, canal, titulo, texto, variables) values
  ('motivo_cerrado', 'pantalla', null, 'estaba cerrado el negocio', '{}'),
  ('motivo_no_estaba', 'pantalla', null, 'no había nadie para recibirlo', '{}'),
  ('motivo_no_quiso', 'pantalla', null, 'no quiso recibir el pedido', '{}'),
  ('motivo_no_visitada', 'pantalla', null, 'no alcanzamos a pasar', '{}'),
  ('push_ruta_cancelada', 'push', 'Ruta cancelada', 'Se canceló la ruta {{ruta}} del {{fecha}}. Ya no la salgas a repartir.', '{ruta,fecha}');
alter table app.plantilla enable trigger trg_auditar;

alter table app.rol_permiso disable trigger trg_auditar;

insert into app.permiso (codigo, modulo, descripcion) values
  ('rutas.ver', 'rutas', 'Ver todas las rutas y sus órdenes de carga'),
  ('rutas.planear', 'rutas', 'Crear rutas, asignar pedidos, optimizar, ordenar, cargar y cancelar'),
  ('rutas.operar', 'rutas', 'Operar su ruta: iniciar, no entregado y terminar'),
  ('rutas.liquidar', 'rutas', 'Liquidar la ruta del repartidor y ver comprobantes');

insert into app.rol_permiso (rol_id, permiso_codigo)
select r.id, x.permiso
from (values
  ('Administrador', 'rutas.ver'), ('Administrador', 'rutas.planear'), ('Administrador', 'rutas.operar'), ('Administrador', 'rutas.liquidar'),
  ('Repartidor', 'rutas.operar'),
  ('Almacenista', 'rutas.ver')
) as x(rol, permiso)
join app.rol r on r.nombre = x.rol;

alter table app.rol_permiso enable trigger trg_auditar;

-- Auditoria despues de las semillas.
create trigger trg_auditar after insert or update or delete on app.vehiculo
  for each row execute function app.fn_auditar();

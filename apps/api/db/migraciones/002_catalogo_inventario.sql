-- 002: proveedores, catalogo, precios, ofertas, inventario (kardex) y costeo promedio.
-- DDL de CONTRATOS §2.2 y §2.12 (A1, A8). Errores de negocio: RAISE EXCEPTION '<CODIGO>' USING ERRCODE = 'P0001', DETAIL = <json>.

-- ---------------------------------------------------------------- extensiones y normalizador

create extension if not exists pg_trgm with schema public;
create extension if not exists unaccent with schema public;

-- Forma de dos argumentos con diccionario calificado: no depende del search_path de quien llama.
-- Se declara immutable (el contrato lo exige para indexar) aunque unaccent(regdictionary, text) sea stable:
-- el diccionario es fijo y no cambia en la vida de la base.
create function app.fn_normalizar(p_texto text) returns text
language sql immutable parallel safe
set search_path = pg_catalog, public as $$
  select lower(public.unaccent('public.unaccent'::regdictionary, p_texto))
$$;

-- array_to_string es stable (no se puede indexar), asi que el texto de busqueda de un producto
-- (nombre + alias) se arma con este envoltorio immutable; lo usan el indice y fn_buscar_productos.
create function app.fn_texto_busqueda(p_nombre text, p_alias text[]) returns text
language sql immutable parallel safe
set search_path = pg_catalog, public as $$
  select app.fn_normalizar(p_nombre || ' ' || array_to_string(p_alias, ' '))
$$;

-- ---------------------------------------------------------------- tablas

create table app.proveedor (
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) > 0),
  telefono text, contacto text, notas text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create unique index uq_proveedor_nombre on app.proveedor (lower(nombre));

create table app.categoria (
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) > 0),
  orden smallint not null default 0,
  margen_objetivo numeric(5,4) check (margen_objetivo between 0 and 0.9),
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);
create unique index uq_categoria_nombre on app.categoria (lower(nombre));

create table app.marca (
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) > 0),
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);
create unique index uq_marca_nombre on app.marca (lower(nombre));

create table app.producto (
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) > 0),
  categoria_id bigint not null references app.categoria(id),
  marca_id bigint references app.marca(id),
  sku text,
  descripcion text,
  alias text[] not null default '{}',
  contenido_ml integer check (contenido_ml > 0),
  tipo_envase text check (tipo_envase in ('lata','botella','retornable')),
  imagen text check (imagen ~ '^[0-9a-f]{64}\.(jpg|png|webp)$'),
  modo_surtido text not null default 'inventario' check (modo_surtido in ('inventario','contra_pedido')),
  margen_objetivo numeric(5,4) check (margen_objetivo between 0 and 0.9),
  proveedor_id bigint references app.proveedor(id),
  existencia_minima integer not null default 0 check (existencia_minima >= 0),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create unique index uq_producto_sku on app.producto (sku) where sku is not null;
create index idx_producto_nombre on app.producto (lower(nombre) text_pattern_ops);
create index idx_producto_categoria on app.producto (categoria_id);
create index idx_producto_busqueda on app.producto using gin
  (app.fn_texto_busqueda(nombre, alias) gin_trgm_ops);

create table app.presentacion (
  id bigint generated always as identity primary key,
  producto_id bigint not null references app.producto(id),
  nombre text not null check (length(trim(nombre)) > 0),
  factor integer not null check (factor > 0),
  codigo_barras text,
  se_vende boolean not null default true,
  se_compra boolean not null default true,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);
create unique index uq_presentacion_codigo on app.presentacion (codigo_barras) where codigo_barras is not null;
create unique index uq_presentacion_nombre on app.presentacion (producto_id, lower(nombre));

create table app.lista_precio (
  id bigint generated always as identity primary key,
  nombre text not null constraint uq_lista_precio_nombre unique,
  es_predeterminada boolean not null default false,
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  constraint ck_lista_predeterminada_activa check (not es_predeterminada or activa)
);
create unique index uq_lista_una_predeterminada on app.lista_precio (es_predeterminada) where es_predeterminada;

create table app.precio (
  presentacion_id bigint not null references app.presentacion(id),
  lista_precio_id bigint not null references app.lista_precio(id),
  precio numeric(12,2) not null check (precio >= 0),
  actualizado_en timestamptz not null default now(),
  actualizado_por bigint references app.usuario(id),
  primary key (presentacion_id, lista_precio_id)
);

create table app.precio_oferta (
  id bigint generated always as identity primary key,
  presentacion_id bigint not null references app.presentacion(id),
  lista_precio_id bigint references app.lista_precio(id),
  precio numeric(12,2) not null check (precio >= 0),
  desde date not null,
  hasta date not null check (hasta >= desde),
  motivo text not null check (motivo in ('por_caducar','promocion')),
  creado_por bigint not null references app.usuario(id),
  creado_en timestamptz not null default now()
);
create index idx_oferta_vigente on app.precio_oferta (presentacion_id, hasta);

create table app.existencia (
  sucursal_id bigint not null references app.sucursal(id),
  producto_id bigint not null references app.producto(id),
  cantidad integer not null default 0 check (cantidad >= 0),
  costo_promedio numeric(14,6) not null default 0 check (costo_promedio >= 0),
  actualizado_en timestamptz not null default now(),
  primary key (sucursal_id, producto_id)
);

create table app.movimiento_inventario (
  id bigint generated always as identity primary key,
  sucursal_id bigint not null references app.sucursal(id),
  producto_id bigint not null references app.producto(id),
  tipo text not null check (tipo in (
    'inventario_inicial','compra','cancelacion_venta','devolucion_venta','ajuste_entrada','traspaso_entrada',
    'venta','cancelacion_compra','ajuste_salida','merma','traspaso_salida','revaluacion')),
  cantidad integer not null,
  costo_unitario numeric(14,6) not null check (costo_unitario >= 0),
  existencia_resultante integer not null,
  costo_promedio_resultante numeric(14,6) not null,
  referencia_tabla text check (referencia_tabla in ('compra_linea','venta_linea','devolucion_linea')),
  referencia_id bigint,
  causa_merma text check (causa_merma in ('caducado','danado','faltante','regalo','otro')),
  motivo text,
  usuario_id bigint not null references app.usuario(id),
  creado_en timestamptz not null default now(),
  clave_idempotencia uuid,   -- solo ajustes y conteos que la traen (reintento seguro)
  hash_solicitud text,
  constraint ck_movimiento_signo check (
    (tipo in ('inventario_inicial','compra','cancelacion_venta','devolucion_venta','ajuste_entrada','traspaso_entrada') and cantidad > 0)
    or (tipo in ('venta','cancelacion_compra','ajuste_salida','merma','traspaso_salida') and cantidad < 0)
    or (tipo = 'revaluacion' and cantidad = 0)),
  constraint ck_movimiento_referencia check ((referencia_tabla is null) = (referencia_id is null)),
  constraint ck_movimiento_causa check ((tipo = 'merma') = (causa_merma is not null))
);
create index idx_movimiento_kardex on app.movimiento_inventario (sucursal_id, producto_id, id desc);
create index idx_movimiento_referencia on app.movimiento_inventario (referencia_tabla, referencia_id);
create index idx_movimiento_fecha on app.movimiento_inventario (creado_en);
create unique index uq_movimiento_clave on app.movimiento_inventario (clave_idempotencia) where clave_idempotencia is not null;

-- ---------------------------------------------------------------- funciones de consulta

-- producto ?? categoria ?? configuracion (A1).
create function app.fn_margen_objetivo(p_producto_id bigint) returns numeric
language sql stable as $$
  select coalesce(
    p.margen_objetivo,
    c.margen_objetivo,
    (select (cf.valor #>> '{}')::numeric from app.configuracion cf where cf.clave = 'margen_objetivo'))
  from app.producto p
  join app.categoria c on c.id = p.categoria_id
  where p.id = p_producto_id
$$;

-- Base = precio de la lista, si no el de la predeterminada; `least` ignora null: oferta sin base = la oferta.
create function app.fn_precio(p_presentacion_id bigint, p_lista_precio_id bigint) returns numeric
language sql stable as $$
  select least(
    coalesce(
      (select pr.precio from app.precio pr
        where pr.presentacion_id = p_presentacion_id and pr.lista_precio_id = p_lista_precio_id),
      (select pr.precio from app.precio pr
        join app.lista_precio l on l.id = pr.lista_precio_id and l.es_predeterminada
        where pr.presentacion_id = p_presentacion_id)),
    (select min(o.precio) from app.precio_oferta o
      where o.presentacion_id = p_presentacion_id
        and (o.lista_precio_id = p_lista_precio_id or o.lista_precio_id is null)
        and app.fn_fecha_local(now()) between o.desde and o.hasta))
$$;

-- Tolerante a acentos, mayusculas y faltas (pg_trgm); busca en nombre, alias y marca.
-- `<%` con umbral 0.3 fijado en la funcion: el candidato por nombre/alias usa el indice GIN.
-- Por defecto solo productos activos.
create function app.fn_buscar_productos(p_texto text, p_limite int default 30, p_incluir_inactivos boolean default false)
returns table(producto_id bigint, puntaje real)
language sql stable
set search_path = pg_catalog, public
set pg_trgm.word_similarity_threshold = 0.3 as $$
  with q as (
    select app.fn_normalizar(trim(coalesce(p_texto, ''))) as t
  ), cand as (
    select p.id from app.producto p cross join q
    where q.t <> '' and q.t <% app.fn_texto_busqueda(p.nombre, p.alias)
    union
    select p.id from app.producto p join app.marca m on m.id = p.marca_id cross join q
    where q.t <> '' and q.t <% app.fn_normalizar(m.nombre)
  )
  select p.id, s.puntaje
  from cand
  join app.producto p on p.id = cand.id
  left join app.marca m on m.id = p.marca_id
  cross join q
  cross join lateral (
    select word_similarity(q.t, app.fn_normalizar(coalesce(m.nombre, '')) || ' ' || app.fn_texto_busqueda(p.nombre, p.alias)) as puntaje
  ) s
  where (p.activo or p_incluir_inactivos) and s.puntaje >= 0.3
  order by s.puntaje desc, p.nombre, p.id
  limit p_limite
$$;

-- ---------------------------------------------------------------- funciones de disparador

create function app.fn_producto_con_pieza() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from app.presentacion where producto_id = new.id and factor = 1) then
    raise exception 'PRODUCTO_SIN_PIEZA' using errcode = 'P0001',
      detail = jsonb_build_object('producto_id', new.id)::text;
  end if;
  return null;
end $$;

create function app.fn_presentacion_factor_inmutable() returns trigger
language plpgsql as $$
begin
  if new.factor is distinct from old.factor or new.producto_id is distinct from old.producto_id then
    raise exception 'FACTOR_INMUTABLE' using errcode = 'P0001',
      detail = jsonb_build_object('presentacion_id', old.id)::text;
  end if;
  return new;
end $$;

-- Crea (si faltan) y bloquea las filas de existencia en orden de producto_id. Todo escritor de kardex
-- (compra, cancelacion, ajuste, conteo) lo llama ANTES de insertar movimientos: orden de candados fijo.
create function app.fn_bloquear_existencias(p_sucursal_id bigint, p_producto_ids bigint[]) returns void
language plpgsql as $$
begin
  perform set_config('app.aplicando_movimiento', '1', true);
  insert into app.existencia (sucursal_id, producto_id)
  select distinct p_sucursal_id, x from unnest(p_producto_ids) as x order by 2
  on conflict do nothing;
  perform 1 from app.existencia e
  where e.sucursal_id = p_sucursal_id and e.producto_id = any(p_producto_ids)
  order by e.producto_id for update;
  perform set_config('app.aplicando_movimiento', '', true);
end $$;

-- Unico escritor de existencia. Candado de la fila de existencia; costo promedio ponderado por sucursal.
create function app.fn_aplicar_movimiento() returns trigger
language plpgsql as $$
declare
  v_q integer;
  v_p numeric;
  v_nueva integer;
  v_prom numeric;
begin
  perform set_config('app.aplicando_movimiento', '1', true);
  insert into app.existencia (sucursal_id, producto_id) values (new.sucursal_id, new.producto_id)
  on conflict do nothing;
  select e.cantidad, e.costo_promedio into v_q, v_p
  from app.existencia e
  where e.sucursal_id = new.sucursal_id and e.producto_id = new.producto_id
  for update;

  v_nueva := v_q + new.cantidad;
  if v_nueva < 0 then
    raise exception 'STOCK_INSUFICIENTE' using errcode = 'P0001',
      detail = jsonb_build_object('producto_id', new.producto_id, 'disponible', v_q, 'solicitado', -new.cantidad)::text;
  end if;

  if new.tipo = 'revaluacion' then
    v_prom := round(new.costo_unitario, 6);
  elsif new.tipo = 'cancelacion_compra' then
    -- Revierte la entrada con el costo de la linea; sin existencia el promedio se queda como estaba.
    v_prom := case when v_nueva = 0 then v_p
                   else round((v_q * v_p + new.cantidad * new.costo_unitario) / v_nueva, 6) end;
  elsif new.cantidad > 0 then
    -- Solo el ajuste de entrada puede venir sin costo: entra al promedio vigente (ya bloqueado).
    if new.costo_unitario is null and new.tipo = 'ajuste_entrada' then
      new.costo_unitario := v_p;
    elsif new.costo_unitario is null then
      raise exception 'AJUSTE_NO_VALIDO' using errcode = 'P0001',
        detail = jsonb_build_object('producto_id', new.producto_id, 'motivo', 'costo_requerido')::text;
    end if;
    v_prom := round((v_q * v_p + new.cantidad * new.costo_unitario) / v_nueva, 6);
  else
    -- Salidas: se llevan el costo promedio vigente y no lo cambian.
    new.costo_unitario := v_p;
    v_prom := v_p;
  end if;
  if v_prom < 0 then
    raise exception 'COSTO_INVALIDO' using errcode = 'P0001',
      detail = jsonb_build_object('producto_id', new.producto_id)::text;
  end if;

  new.existencia_resultante := v_nueva;
  new.costo_promedio_resultante := v_prom;
  update app.existencia
  set cantidad = v_nueva, costo_promedio = v_prom, actualizado_en = now()
  where sucursal_id = new.sucursal_id and producto_id = new.producto_id;
  perform set_config('app.aplicando_movimiento', '', true);
  return new;
end $$;

create function app.fn_movimiento_inmutable() returns trigger
language plpgsql as $$
begin
  raise exception 'MOVIMIENTO_INMUTABLE' using errcode = 'P0001', detail = '{}';
end $$;

-- Solo escribe quien trae la bandera de transaccion que ponen fn_aplicar_movimiento y fn_bloquear_existencias.
create function app.fn_existencia_protegida() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.aplicando_movimiento', true), '') <> '1' then
    raise exception 'EXISTENCIA_SOLO_POR_MOVIMIENTO' using errcode = 'P0001', detail = '{}';
  end if;
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end $$;

-- TRUNCATE no pasa por los disparadores de fila: se bloquea aparte (movimiento, existencia, compra, compra_linea).
create function app.fn_truncate_bloqueado() returns trigger
language plpgsql as $$
declare
  v_codigo text := case TG_TABLE_NAME
    when 'movimiento_inventario' then 'MOVIMIENTO_INMUTABLE'
    when 'existencia' then 'EXISTENCIA_SOLO_POR_MOVIMIENTO'
    else 'COMPRA_INMUTABLE' end;
begin
  raise exception '%', v_codigo using errcode = 'P0001', detail = '{}';
end $$;

-- Las presentaciones no se borran: activa = false.
create function app.fn_presentacion_no_borrable() returns trigger
language plpgsql as $$
begin
  raise exception 'PRESENTACION_NO_BORRABLE' using errcode = 'P0001',
    detail = jsonb_build_object('presentacion_id', old.id)::text;
end $$;

-- ---------------------------------------------------------------- ajustes y conteos

-- Con `p_clave` el ajuste es idempotente: mismo uuid + mismo hash + mismo usuario devuelve el movimiento original
-- (repetida = true); cualquier otro caso con esa clave es IDEMPOTENCIA_CONFLICTO. Sin clave siempre inserta.
create function app.fn_ajustar_inventario(
  p_usuario_id bigint, p_sucursal_id bigint, p_producto_id bigint, p_tipo text, p_piezas integer,
  p_costo_unitario numeric default null, p_motivo text default null, p_causa_merma text default null,
  p_clave uuid default null, p_hash text default null
) returns table(movimiento_id bigint, repetida boolean)
language plpgsql as $$
declare
  v_entrada boolean;
  v_nuevo bigint;
  v_previo app.movimiento_inventario;
begin
  if p_clave is not null then
    perform pg_advisory_xact_lock(hashtext(p_clave::text));
    select m.* into v_previo from app.movimiento_inventario m where m.clave_idempotencia = p_clave;
    if found then
      if v_previo.hash_solicitud is not distinct from p_hash and v_previo.usuario_id = p_usuario_id then
        return query select v_previo.id, true;
        return;
      end if;
      raise exception 'IDEMPOTENCIA_CONFLICTO' using errcode = 'P0001',
        detail = jsonb_build_object('movimiento_id', v_previo.id)::text;
    end if;
  end if;

  if p_tipo is null or p_tipo not in ('inventario_inicial','ajuste_entrada','ajuste_salida','merma')
     or p_piezas is null or p_piezas <= 0
     or (p_costo_unitario is not null and p_costo_unitario < 0)
     or (p_tipo = 'inventario_inicial' and p_costo_unitario is null)
     or (p_tipo = 'merma' and (p_causa_merma is null or p_causa_merma not in ('caducado','danado','faltante','regalo','otro')))
     or (p_tipo <> 'inventario_inicial' and nullif(trim(coalesce(p_motivo, '')), '') is null)
  then
    raise exception 'AJUSTE_NO_VALIDO' using errcode = 'P0001',
      detail = jsonb_build_object('producto_id', p_producto_id, 'tipo', p_tipo, 'piezas', p_piezas)::text;
  end if;

  perform app.fn_bloquear_existencias(p_sucursal_id, array[p_producto_id]);

  -- Solo arranca el kardex: con cualquier movimiento previo el inicial ya no es valido.
  if p_tipo = 'inventario_inicial' and exists (
       select 1 from app.movimiento_inventario m where m.sucursal_id = p_sucursal_id and m.producto_id = p_producto_id) then
    raise exception 'AJUSTE_NO_VALIDO' using errcode = 'P0001',
      detail = jsonb_build_object('producto_id', p_producto_id, 'tipo', p_tipo, 'motivo', 'inventario_inicial_repetido')::text;
  end if;

  v_entrada := p_tipo in ('inventario_inicial','ajuste_entrada');
  -- Entrada sin costo: el disparador usa el promedio vigente ya bloqueado. Salidas: el disparador pone el promedio.
  insert into app.movimiento_inventario
    (sucursal_id, producto_id, tipo, cantidad, costo_unitario, causa_merma, motivo, usuario_id, clave_idempotencia, hash_solicitud)
  values
    (p_sucursal_id, p_producto_id, p_tipo, case when v_entrada then p_piezas else -p_piezas end,
     case when v_entrada then p_costo_unitario end,
     case when p_tipo = 'merma' then p_causa_merma end,
     p_motivo, p_usuario_id, p_clave, p_hash)
  returning id into v_nuevo;
  return query select v_nuevo, false;
end $$;

-- Sin diferencia no hay movimiento (movimiento_id null) y la clave no se consume. Con diferencia es un ajuste con la misma clave.
create function app.fn_contar_inventario(
  p_usuario_id bigint, p_sucursal_id bigint, p_producto_id bigint, p_piezas_contadas integer, p_motivo text,
  p_clave uuid default null, p_hash text default null
) returns table(movimiento_id bigint, repetida boolean)
language plpgsql as $$
declare
  v_actual integer;
  v_dif integer;
  v_previo app.movimiento_inventario;
begin
  if p_clave is not null then
    perform pg_advisory_xact_lock(hashtext(p_clave::text));
    select m.* into v_previo from app.movimiento_inventario m where m.clave_idempotencia = p_clave;
    if found then
      if v_previo.hash_solicitud is not distinct from p_hash and v_previo.usuario_id = p_usuario_id then
        return query select v_previo.id, true;
        return;
      end if;
      raise exception 'IDEMPOTENCIA_CONFLICTO' using errcode = 'P0001',
        detail = jsonb_build_object('movimiento_id', v_previo.id)::text;
    end if;
  end if;
  if p_piezas_contadas is null or p_piezas_contadas < 0 then
    raise exception 'AJUSTE_NO_VALIDO' using errcode = 'P0001',
      detail = jsonb_build_object('producto_id', p_producto_id, 'piezas', p_piezas_contadas)::text;
  end if;
  -- La fila existe y queda bloqueada antes de comparar: dos conteos concurrentes se serializan.
  perform app.fn_bloquear_existencias(p_sucursal_id, array[p_producto_id]);
  select e.cantidad into v_actual
  from app.existencia e where e.sucursal_id = p_sucursal_id and e.producto_id = p_producto_id;
  v_dif := p_piezas_contadas - v_actual;
  if v_dif = 0 then
    return query select null::bigint, false;
    return;
  end if;
  return query select a.movimiento_id, a.repetida from app.fn_ajustar_inventario(
    p_usuario_id, p_sucursal_id, p_producto_id,
    case when v_dif > 0 then 'ajuste_entrada' else 'ajuste_salida' end, abs(v_dif), null, p_motivo, null, p_clave, p_hash) a;
end $$;

-- Correccion de costo promedio (p. ej. tras salidas que impiden cancelar una compra). Solo con precios.editar.
-- Deja un movimiento 'revaluacion' (cantidad 0) con el nuevo promedio.
create function app.fn_revaluar_costo(
  p_usuario_id bigint, p_sucursal_id bigint, p_producto_id bigint, p_costo_unitario numeric, p_motivo text
) returns bigint
language plpgsql as $$
declare
  v_id bigint;
begin
  if not app.fn_tiene_permiso(p_usuario_id, 'precios.editar') then
    raise exception 'SIN_PERMISO' using errcode = 'P0001', detail = jsonb_build_object('permiso', 'precios.editar')::text;
  end if;
  if p_costo_unitario is null or p_costo_unitario < 0 then
    raise exception 'COSTO_INVALIDO' using errcode = 'P0001', detail = jsonb_build_object('producto_id', p_producto_id)::text;
  end if;
  if nullif(trim(coalesce(p_motivo, '')), '') is null then
    raise exception 'AJUSTE_NO_VALIDO' using errcode = 'P0001',
      detail = jsonb_build_object('producto_id', p_producto_id, 'tipo', 'revaluacion')::text;
  end if;
  perform app.fn_bloquear_existencias(p_sucursal_id, array[p_producto_id]);
  insert into app.movimiento_inventario (sucursal_id, producto_id, tipo, cantidad, costo_unitario, motivo, usuario_id)
  values (p_sucursal_id, p_producto_id, 'revaluacion', 0, p_costo_unitario, p_motivo, p_usuario_id)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------- disparadores

create constraint trigger trg_producto_con_pieza after insert on app.producto
  deferrable initially deferred
  for each row execute function app.fn_producto_con_pieza();

create trigger trg_presentacion_factor_inmutable before update of factor, producto_id on app.presentacion
  for each row execute function app.fn_presentacion_factor_inmutable();

create trigger trg_movimiento_aplicar before insert on app.movimiento_inventario
  for each row execute function app.fn_aplicar_movimiento();

create trigger trg_movimiento_inmutable before update or delete on app.movimiento_inventario
  for each row execute function app.fn_movimiento_inmutable();

create trigger trg_existencia_protegida before insert or update or delete on app.existencia
  for each row execute function app.fn_existencia_protegida();

create trigger trg_presentacion_no_borrable before delete on app.presentacion
  for each row execute function app.fn_presentacion_no_borrable();

create trigger trg_movimiento_truncate before truncate on app.movimiento_inventario
  for each statement execute function app.fn_truncate_bloqueado();
create trigger trg_existencia_truncate before truncate on app.existencia
  for each statement execute function app.fn_truncate_bloqueado();

-- ---------------------------------------------------------------- vista

create view app.v_precio_bajo_costo as
select
  pr.presentacion_id,
  pr.lista_precio_id,
  p.nombre as producto,
  pz.nombre as presentacion,
  l.nombre as lista,
  pr.precio,
  round(e.costo_promedio * pz.factor, 2) as costo_presentacion,
  pr.precio - round(e.costo_promedio * pz.factor, 2) as diferencia
from app.precio pr
join app.presentacion pz on pz.id = pr.presentacion_id and pz.activa
join app.producto p on p.id = pz.producto_id and p.activo
join app.lista_precio l on l.id = pr.lista_precio_id and l.activa
join app.existencia e on e.producto_id = p.id and e.sucursal_id = 1
where e.costo_promedio > 0
  and pr.precio < round(e.costo_promedio * pz.factor, 2);

-- ---------------------------------------------------------------- permisos y semillas

-- Las concesiones de la semilla no ensucian la bitacora (igual que las de 001).
alter table app.rol_permiso disable trigger trg_auditar;

insert into app.permiso (codigo, modulo, descripcion) values
  ('catalogo.ver', 'catalogo', 'Ver productos, categorías y marcas'),
  ('catalogo.editar', 'catalogo', 'Crear y editar productos, presentaciones e imágenes'),
  ('precios.editar', 'precios', 'Editar listas de precio, precios y ofertas'),
  ('costos.ver', 'costos', 'Ver costos, utilidad y precios bajo costo'),
  ('inventario.ver', 'inventario', 'Ver existencias, kárdex y productos por caducar'),
  ('inventario.ajustar', 'inventario', 'Hacer ajustes, mermas, conteos e inventario inicial'),
  ('proveedores.gestionar', 'proveedores', 'Crear y editar proveedores');

insert into app.rol_permiso (rol_id, permiso_codigo)
select r.id, x.permiso
from (values
  ('Administrador', 'catalogo.ver'), ('Administrador', 'catalogo.editar'), ('Administrador', 'inventario.ver'),
  ('Administrador', 'inventario.ajustar'), ('Administrador', 'proveedores.gestionar'),
  ('Repartidor', 'catalogo.ver'),
  ('Cajero', 'catalogo.ver'), ('Cajero', 'inventario.ver'),
  ('Almacenista', 'catalogo.ver'), ('Almacenista', 'catalogo.editar'), ('Almacenista', 'inventario.ver'),
  ('Almacenista', 'inventario.ajustar'), ('Almacenista', 'proveedores.gestionar')
) as x(rol, permiso)
join app.rol r on r.nombre = x.rol;

alter table app.rol_permiso enable trigger trg_auditar;

insert into app.lista_precio (nombre, es_predeterminada) values ('Menudeo', true), ('Mayoreo', false);

-- Auditoria despues de las semillas: la bitacora arranca vacia.
create trigger trg_auditar after insert or update or delete on app.proveedor
  for each row execute function app.fn_auditar();
create trigger trg_auditar after insert or update or delete on app.categoria
  for each row execute function app.fn_auditar();
create trigger trg_auditar after insert or update or delete on app.marca
  for each row execute function app.fn_auditar();
create trigger trg_auditar after insert or update or delete on app.producto
  for each row execute function app.fn_auditar();
create trigger trg_auditar after insert or update or delete on app.presentacion
  for each row execute function app.fn_auditar();
create trigger trg_auditar after insert or update or delete on app.lista_precio
  for each row execute function app.fn_auditar();
create trigger trg_auditar after insert or update or delete on app.precio_oferta
  for each row execute function app.fn_auditar();
create trigger trg_auditar after insert or update or delete on app.precio
  for each row execute function app.fn_auditar('presentacion_id', 'lista_precio_id');

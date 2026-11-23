-- 001: auth, roles y permisos, configuracion, auditoria, folios, plantillas, notificaciones.
-- DDL de CONTRATOS §2.1. Errores de negocio: RAISE EXCEPTION '<CODIGO>' USING ERRCODE = 'P0001', DETAIL = <json>.

-- ---------------------------------------------------------------- tablas

create table app.sucursal (
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) > 0),
  direccion text, telefono text,
  lat numeric(9,6), lng numeric(9,6),
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  constraint ck_sucursal_coordenadas check ((lat is null) = (lng is null))
);

create table app.rol (
  id bigint generated always as identity primary key,
  nombre text not null constraint uq_rol_nombre unique,
  descripcion text,
  es_sistema boolean not null default false,
  creado_en timestamptz not null default now()
);
create unique index uq_rol_un_sistema on app.rol (es_sistema) where es_sistema;

create table app.permiso (
  codigo text primary key check (codigo ~ '^[a-z_]+\.[a-z_]+$'),
  modulo text not null,
  descripcion text not null
);

create table app.rol_permiso (
  rol_id bigint not null references app.rol(id) on delete cascade,
  permiso_codigo text not null references app.permiso(codigo) on delete cascade,
  primary key (rol_id, permiso_codigo)
);

create table app.usuario (
  id bigint generated always as identity primary key,
  usuario text not null constraint uq_usuario_usuario unique
    check (usuario ~ '^[a-z0-9._-]{3,30}$'),
  nombre text not null check (length(trim(nombre)) > 0),
  telefono text,
  contrasena_hash text not null,
  rol_id bigint not null references app.rol(id),
  sucursal_id bigint not null references app.sucursal(id),
  activo boolean not null default true,
  debe_cambiar_contrasena boolean not null default true,
  intentos_fallidos integer not null default 0 check (intentos_fallidos >= 0),
  bloqueado_hasta timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index idx_usuario_rol on app.usuario (rol_id);

create table app.sesion (
  jti uuid primary key default gen_random_uuid(),
  usuario_id bigint not null references app.usuario(id),
  origen text not null default 'web' check (origen in ('web','app')),
  creada_en timestamptz not null default now(),
  expira_en timestamptz not null,
  cerrada_en timestamptz,
  ultima_actividad_en timestamptz not null default now(),
  user_agent text,
  ip_hash text
);
create index idx_sesion_viva on app.sesion (usuario_id) where cerrada_en is null;

create table app.configuracion (
  clave text primary key check (clave ~ '^[a-z_]+$'),
  valor jsonb not null,
  actualizado_en timestamptz not null default now(),
  actualizado_por bigint references app.usuario(id)
);

create table app.auditoria (
  id bigint generated always as identity primary key,
  usuario_id bigint references app.usuario(id),
  cliente_id bigint,   -- sin FK: cliente llega en 004
  tabla text not null,
  registro_id text not null,
  accion text not null check (accion in ('insertar','actualizar','borrar')),
  antes jsonb, despues jsonb,
  creado_en timestamptz not null default now()
);
create index idx_auditoria_registro on app.auditoria (tabla, registro_id, creado_en desc);
create index idx_auditoria_fecha on app.auditoria (creado_en desc);

create table app.folio (
  sucursal_id bigint not null references app.sucursal(id),
  serie text not null check (serie in ('P','R','V','C','D','A')),
  siguiente bigint not null check (siguiente > 0),
  primary key (sucursal_id, serie)
);

create table app.plantilla (
  clave text primary key check (clave ~ '^[a-z_]+$'),
  canal text not null check (canal in ('whatsapp','push','pantalla')),
  titulo text,
  texto text not null check (length(texto) between 1 and 1000),
  variables text[] not null default '{}',
  actualizado_en timestamptz not null default now(),
  actualizado_por bigint references app.usuario(id),
  constraint ck_plantilla_titulo check ((canal = 'push') = (titulo is not null))
);

create table app.notificacion (
  id bigint generated always as identity primary key,
  usuario_id bigint not null references app.usuario(id),
  evento text not null constraint ck_notificacion_evento check (evento in ('pedido_nuevo','pedido_modificado','pedido_cancelado_cliente',
    'faltante_respondido','surtido_listo','ruta_asignada','entrega_fallida','ubicacion_propuesta',
    'dispositivo_nuevo','visitas_sin_pedido','cliente_inactivo')),
  titulo text not null, cuerpo text not null,
  datos jsonb not null default '{}',
  clave text not null,
  creado_en timestamptz not null default now(),
  leida_en timestamptz,
  constraint uq_notificacion_clave unique (usuario_id, clave)
);
create index idx_notificacion_usuario on app.notificacion (usuario_id, id desc);

create table app.notificacion_preferencia (
  usuario_id bigint not null references app.usuario(id) on delete cascade,
  evento text not null constraint ck_notificacion_preferencia_evento check (evento in ('pedido_nuevo','pedido_modificado','pedido_cancelado_cliente',
    'faltante_respondido','surtido_listo','ruta_asignada','entrega_fallida','ubicacion_propuesta',
    'dispositivo_nuevo','visitas_sin_pedido','cliente_inactivo')),
  push boolean not null default true,
  primary key (usuario_id, evento)
);

-- ---------------------------------------------------------------- funciones

create function app.fn_fecha_local(p_ts timestamptz) returns date
language sql stable as $$
  select (p_ts at time zone 'America/Mexico_City')::date
$$;

-- El candado de fila del upsert serializa folios concurrentes.
create function app.fn_siguiente_folio(p_sucursal_id bigint, p_serie text) returns text
language plpgsql as $$
declare v_n bigint;
begin
  insert into app.folio (sucursal_id, serie, siguiente) values (p_sucursal_id, p_serie, 2)
  on conflict (sucursal_id, serie) do update set siguiente = folio.siguiente + 1
  returning siguiente - 1 into v_n;
  return p_serie || '-' || lpad(v_n::text, 6, '0');
end $$;

create function app.fn_tiene_permiso(p_usuario_id bigint, p_codigo text) returns boolean
language sql stable as $$
  select exists (
    select 1
    from app.usuario u
    join app.rol_permiso rp on rp.rol_id = u.rol_id
    where u.id = p_usuario_id and u.activo and rp.permiso_codigo = p_codigo
  )
$$;

create function app.fn_render_plantilla(p_clave text, p_vars jsonb) returns table(titulo text, texto text)
language plpgsql stable as $$
#variable_conflict use_column
declare
  v_p app.plantilla;
  v_texto text;
  v_titulo text;
  v_var text;
begin
  select * into v_p from app.plantilla p where p.clave = p_clave;
  if not found then
    raise exception 'PLANTILLA_NO_EXISTE' using errcode = 'P0001',
      detail = jsonb_build_object('clave', p_clave)::text;
  end if;
  v_texto := v_p.texto;
  v_titulo := v_p.titulo;
  foreach v_var in array v_p.variables loop
    v_texto := replace(v_texto, '{{' || v_var || '}}', coalesce(p_vars ->> v_var, ''));
    v_titulo := replace(v_titulo, '{{' || v_var || '}}', coalesce(p_vars ->> v_var, ''));
  end loop;
  -- Cualquier {{x}} fuera de la lista blanca queda vacio.
  v_texto := regexp_replace(v_texto, '\{\{[a-z_]+\}\}', '', 'g');
  v_titulo := regexp_replace(v_titulo, '\{\{[a-z_]+\}\}', '', 'g');
  return query select v_titulo, v_texto;
end $$;

-- p_vars, ademas de las variables de la plantilla, puede traer pedido_id, cliente_id y fecha
-- para armar datos.ruta (pantalla del panel que abre el push).
create function app.fn_notificar(p_evento text, p_clave text, p_vars jsonb, p_usuario_id bigint default null)
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
    when p_evento in ('dispositivo_nuevo','visitas_sin_pedido','cliente_inactivo') then 'clientes.enlace'
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

-- Auditoria. TG_ARGV = columnas llave de registro_id (sin argumentos: id).
create function app.fn_auditar() returns trigger
language plpgsql as $$
declare
  v_antes jsonb;
  v_despues jsonb;
  v_llave jsonb;
  v_cols text[];
  v_reg text;
  v_ruido text[] := array['actualizado_en','ultimo_uso_en','intentos_fallidos','bloqueado_hasta'];
  v_secretos text[] := array['contrasena_hash','token_hash','token_cifrado','pin_hash'];
begin
  if TG_OP in ('UPDATE','DELETE') then v_antes := to_jsonb(OLD); end if;
  if TG_OP in ('INSERT','UPDATE') then v_despues := to_jsonb(NEW); end if;

  -- Se compara con los secretos incluidos: cambiar la contrasena si se audita (sin guardar el hash).
  if TG_OP = 'UPDATE' and (v_antes - v_ruido) = (v_despues - v_ruido) then
    return null;
  end if;

  v_cols := case when TG_NARGS = 0 then array['id'] else TG_ARGV end;
  v_llave := coalesce(v_despues, v_antes);
  select string_agg(v_llave ->> c, ':' order by ord) into v_reg from unnest(v_cols) with ordinality as t(c, ord);

  insert into app.auditoria (usuario_id, cliente_id, tabla, registro_id, accion, antes, despues)
  values (
    nullif(current_setting('app.usuario_id', true), '')::bigint,
    nullif(current_setting('app.cliente_id', true), '')::bigint,
    TG_TABLE_NAME, v_reg,
    case TG_OP when 'INSERT' then 'insertar' when 'UPDATE' then 'actualizar' else 'borrar' end,
    v_antes - v_secretos, v_despues - v_secretos
  );
  return null;
end $$;

create function app.fn_permiso_a_sistema() returns trigger
language plpgsql as $$
begin
  insert into app.rol_permiso (rol_id, permiso_codigo)
  select r.id, new.codigo from app.rol r where r.es_sistema
  on conflict do nothing;
  return null;
end $$;

create function app.fn_rol_sistema_protegido() returns trigger
language plpgsql as $$
begin
  if TG_TABLE_NAME = 'rol' then
    if old.es_sistema then
      raise exception 'ROL_SISTEMA' using errcode = 'P0001', detail = '{}';
    end if;
  else
    -- rol_permiso: borrar a mano esta prohibido; la cascada por permiso borrado si pasa
    -- (en ese punto el permiso ya no existe).
    if exists (select 1 from app.rol r where r.id = old.rol_id and r.es_sistema)
       and exists (select 1 from app.permiso p where p.codigo = old.permiso_codigo) then
      raise exception 'ROL_SISTEMA' using errcode = 'P0001', detail = '{}';
    end if;
  end if;
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end $$;

create function app.fn_ultimo_dueno() returns trigger
language plpgsql as $$
begin
  -- Solo importa si la fila era un dueno activo; si quedan otros, bien.
  -- El candado serializa los commits: dos transacciones que desactivan duenos distintos no pasan a la vez
  -- (la segunda cuenta despues de que la primera confirmo). Clave fija 862002.
  perform pg_advisory_xact_lock(862002);
  if old.activo and exists (select 1 from app.rol r where r.id = old.rol_id and r.es_sistema)
     and not exists (
       select 1 from app.usuario u join app.rol r on r.id = u.rol_id
       where u.activo and r.es_sistema
     ) then
    raise exception 'ULTIMO_DUENO' using errcode = 'P0001', detail = '{}';
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------- disparadores de proteccion

create trigger trg_permiso_a_sistema after insert on app.permiso
  for each row execute function app.fn_permiso_a_sistema();

create trigger trg_rol_sistema_protegido before update or delete on app.rol
  for each row execute function app.fn_rol_sistema_protegido();

create trigger trg_rol_permiso_sistema_protegido before delete on app.rol_permiso
  for each row execute function app.fn_rol_sistema_protegido();

create constraint trigger trg_ultimo_dueno after update or delete on app.usuario
  deferrable initially deferred
  for each row execute function app.fn_ultimo_dueno();

-- ---------------------------------------------------------------- semillas

insert into app.sucursal (nombre) values ('Bodega principal');

-- Dueno primero: trg_permiso_a_sistema le concede cada permiso nuevo.
insert into app.rol (nombre, descripcion, es_sistema) values
  ('Dueño', 'Acceso total. No se puede editar ni borrar.', true),
  ('Administrador', 'Opera todo menos usuarios, costos, precios y cancelaciones.', false),
  ('Repartidor', 'Su ruta: entregar y cobrar.', false),
  ('Cajero', 'Mostrador.', false),
  ('Almacenista', 'Inventario, compras y carga.', false);

insert into app.permiso (codigo, modulo, descripcion) values
  ('usuarios.gestionar', 'usuarios', 'Crear y editar usuarios, roles y permisos'),
  ('auditoria.ver', 'auditoria', 'Ver la bitácora de cambios'),
  ('configuracion.editar', 'configuracion', 'Editar datos del negocio, bodega y plantillas');

insert into app.rol_permiso (rol_id, permiso_codigo)
select r.id, p.codigo from app.rol r, app.permiso p
where r.nombre = 'Administrador' and p.codigo in ('auditoria.ver', 'configuracion.editar');

insert into app.configuracion (clave, valor) values
  ('negocio_nombre', '""'), ('negocio_telefono', '""'), ('negocio_direccion', '""'),
  ('negocio_whatsapp', '""'), ('ticket_pie', '""'),
  ('credito_dias_predeterminado', '0'), ('pedido_minimo', '"0.00"'), ('hora_corte', '"18:00"'),
  ('dias_aviso_caducidad', '30'), ('url_publica', '""'),
  ('faltante_minutos_respuesta', '60'), ('faltante_accion_predeterminada', '"quitar"'),
  ('reparto_minutos_por_parada', '10'), ('reparto_velocidad_kmh', '25'),
  ('transferencia_banco', '""'), ('transferencia_titular', '""'), ('transferencia_clabe', '""'),
  ('margen_objetivo', '"0.15"'), ('precio_redondeo', '"5.00"'),
  ('sugerencia_dias_tolerancia', '1'), ('sugerencia_vigencia_horas', '24'), ('sugerencia_hora', '"08:00"'),
  ('compra_cobertura_dias', '7'), ('compra_promedio_dias', '28'), ('semaforo_dias_rojo', '15'),
  ('visitas_umbral', '5'), ('visitas_dias', '14'), ('inactividad_dias', '30'),
  ('enlace_tras_primera_compra', 'true'), ('respaldo_ultima_prueba', 'null');

-- Plantillas. Los wa_* hacia el cliente terminan en {{enlace}} (la API lo agrega al renderizar).
insert into app.plantilla (clave, canal, titulo, texto, variables) values
  ('wa_enlace_cliente', 'whatsapp', null,
   'Hola {{cliente}}, te mandamos tu enlace personal de {{negocio}} para hacer tus pedidos: {{enlace}}',
   '{cliente,negocio,enlace}'),
  ('wa_pedido_recibido', 'whatsapp', null,
   'Hola {{cliente}}, recibimos tu pedido {{folio}} por ${{total}}. Aquí puedes verlo y seguirlo: {{enlace}}',
   '{cliente,folio,total,enlace}'),
  ('wa_pedido_confirmado', 'whatsapp', null,
   'Hola {{cliente}}, tu pedido {{folio}} está confirmado para el {{fecha_entrega}}. Total: ${{total}}. Detalle: {{enlace}}',
   '{cliente,folio,fecha_entrega,total,enlace}'),
  ('wa_pedido_faltante', 'whatsapp', null,
   'Hola {{cliente}}, de tu pedido {{folio}} nos falta: {{productos}}. Revisa tu pedido y dinos qué prefieres antes de {{limite}}: {{enlace}}',
   '{cliente,folio,productos,limite,enlace}'),
  ('wa_pedido_ajustado', 'whatsapp', null,
   'Hola {{cliente}}, ajustamos tu pedido {{folio}}:
{{cambios}}
Nuevo total: ${{total}}. Detalle: {{enlace}}',
   '{cliente,folio,cambios,total,enlace}'),
  ('wa_pedido_en_ruta', 'whatsapp', null,
   'Hola {{cliente}}, tu pedido {{folio}} ya va en camino. Eres la parada {{parada}} de {{paradas}}. Seguimiento: {{enlace}}',
   '{cliente,folio,parada,paradas,enlace}'),
  ('wa_entrega_fallida', 'whatsapp', null,
   'Hola {{cliente}}, no pudimos entregar tu pedido {{folio}}: {{motivo}}. Cuéntanos cómo seguimos: {{enlace}}',
   '{cliente,folio,motivo,enlace}'),
  ('wa_nota_entrega', 'whatsapp', null,
   'Hola {{cliente}}, gracias por tu compra. Pedido {{folio}}: total ${{total}}, pagado ${{pagado}}, saldo ${{saldo}}. Detalle: {{enlace}}',
   '{cliente,folio,total,pagado,saldo,enlace}'),
  ('wa_recordatorio_saldo', 'whatsapp', null,
   'Hola {{cliente}}, te recordamos que tu saldo es de ${{saldo}} (vencido: ${{vencido}}). Revisa tu cuenta aquí: {{enlace}}',
   '{cliente,saldo,vencido,enlace}'),
  ('wa_lo_de_siempre', 'whatsapp', null,
   'Hola {{cliente}}, ¿te mando lo de siempre? Revisa precios y confirma aquí: {{enlace}}',
   '{cliente,enlace}'),
  ('wa_estado_cuenta', 'whatsapp', null,
   'Hola {{cliente}}, tu estado de cuenta: saldo ${{saldo}}, vencido ${{vencido}}. Míralo completo aquí: {{enlace}}',
   '{cliente,saldo,vencido,enlace}'),
  ('wa_resumen_dia', 'whatsapp', null,
   'Resumen del {{fecha}}: vendido ${{vendido}}, ganancia ${{ganancia}}, cobrado ${{cobrado}}, fiado nuevo ${{fiado_nuevo}}, por cobrar ${{por_cobrar}}, por comprar: {{por_comprar}}.',
   '{fecha,vendido,ganancia,cobrado,fiado_nuevo,por_cobrar,por_comprar}'),
  ('wa_datos_transferencia', 'whatsapp', null,
   'Hola {{cliente}}, para pagar ${{monto}} por transferencia: banco {{banco}}, titular {{titular}}, CLABE {{clabe}}, referencia {{referencia}}. Detalle: {{enlace}}',
   '{cliente,monto,banco,titular,clabe,referencia,enlace}'),
  ('wa_cliente_avisa_pedido', 'whatsapp', null,
   'Hola, soy {{cliente}}. Acabo de hacer mi pedido {{folio}}.',
   '{cliente,folio}'),
  ('wa_surtido_proveedor', 'whatsapp', null,
   'Hola {{proveedor}}, necesitamos para el {{fecha}}:
{{lineas}}',
   '{proveedor,fecha,lineas}'),
  ('wa_cliente_olvide_pin', 'whatsapp', null,
   'Hola, soy {{cliente}}. Olvidé mi PIN.',
   '{cliente}'),

  ('push_pedido_nuevo', 'push', 'Pedido nuevo', '{{cliente}} hizo el pedido {{folio}} por ${{total}}.', '{cliente,folio,total}'),
  ('push_pedido_modificado', 'push', 'Pedido modificado', '{{cliente}} cambió su pedido {{folio}}. Total: ${{total}}.', '{cliente,folio,total}'),
  ('push_pedido_cancelado_cliente', 'push', 'Pedido cancelado', '{{cliente}} canceló su pedido {{folio}} (${{total}}).', '{cliente,folio,total}'),
  ('push_surtido_listo', 'push', 'Lista de surtido lista', 'La lista de surtido del {{fecha}} tiene {{num_productos}} productos.', '{fecha,num_productos}'),
  ('push_ruta_asignada', 'push', 'Ruta asignada', 'Te asignaron la ruta {{ruta}} del {{fecha}} con {{num_paradas}} paradas.', '{ruta,fecha,num_paradas}'),
  ('push_entrega_fallida', 'push', 'Entrega fallida', 'No se entregó el pedido {{folio}} de {{cliente}}: {{motivo}}.', '{cliente,folio,motivo}'),
  ('push_ubicacion_propuesta', 'push', 'Ubicación propuesta', '{{cliente}} propuso una nueva ubicación. Revísala.', '{cliente}'),
  ('push_dispositivo_nuevo', 'push', 'Dispositivo nuevo', 'Abrieron el enlace de {{cliente}} en un dispositivo nuevo ({{dispositivo}}).', '{cliente,dispositivo}'),
  ('push_visitas_sin_pedido', 'push', 'Visitas sin pedido', '{{cliente}} abrió su enlace {{aperturas}} veces en {{dias}} días y no ha pedido.', '{cliente,aperturas,dias}'),
  ('push_cliente_inactivo', 'push', 'Cliente sin pedir', '{{cliente}} lleva {{dias}} días sin pedir.', '{cliente,dias}'),
  ('push_faltante_respondido', 'push', 'Faltante respondido', '{{cliente}} respondió sobre el pedido {{folio}}: {{respuesta}}.', '{cliente,folio,respuesta}'),

  ('pantalla_elegir_pin', 'pantalla', null, 'Elige un PIN de 4 dígitos para entrar a tu enlace desde otros dispositivos.', '{cliente,minutos}'),
  ('pantalla_pedir_pin', 'pantalla', null, 'Escribe tu PIN de 4 dígitos para continuar.', '{cliente,minutos}'),
  ('pantalla_pin_espera', 'pantalla', null, 'Demasiados intentos. Espera {{minutos}} minutos e inténtalo de nuevo.', '{cliente,minutos}'),
  ('pantalla_pedido_enviado', 'pantalla', null, '¡Listo, {{cliente}}! Recibimos tu pedido {{folio}}.', '{cliente,folio,negocio,limite}'),
  ('pantalla_enlace_invalido', 'pantalla', null, 'Este link ya no está activo. Escríbenos para pedir uno nuevo.', '{cliente,folio,negocio,limite}'),
  ('pantalla_aviso_ubicacion', 'pantalla', null, 'Guardamos tu ubicación propuesta. {{negocio}} la revisará antes de usarla.', '{cliente,folio,negocio,limite}'),
  ('pantalla_bienvenida', 'pantalla', null, 'Hola {{cliente}}, bienvenido a {{negocio}}. Aquí haces tus pedidos.', '{cliente,folio,negocio,limite}'),
  ('pantalla_faltante', 'pantalla', null, 'Te falta responder sobre tu pedido {{folio}}. Hazlo antes de {{limite}}.', '{cliente,folio,negocio,limite}'),

  ('estado_recibido', 'pantalla', null, 'Recibido', '{}'),
  ('estado_esperando_cliente', 'pantalla', null, 'Esperando tu respuesta', '{}'),
  ('estado_confirmado', 'pantalla', null, 'Confirmado', '{}'),
  ('estado_surtiendo', 'pantalla', null, 'Preparando tu pedido', '{}'),
  ('estado_cargado', 'pantalla', null, 'Cargado en el camión', '{}'),
  ('estado_en_ruta', 'pantalla', null, 'En camino', '{}'),
  ('estado_entregado', 'pantalla', null, 'Entregado', '{}'),
  ('estado_no_entregado', 'pantalla', null, 'No se pudo entregar', '{}'),
  ('estado_cancelado', 'pantalla', null, 'Cancelado', '{}');

-- Auditoria despues de las semillas: la bitacora arranca vacia.
create trigger trg_auditar after insert or update or delete on app.sucursal
  for each row execute function app.fn_auditar();
create trigger trg_auditar after insert or update or delete on app.usuario
  for each row execute function app.fn_auditar();
create trigger trg_auditar after insert or update or delete on app.rol
  for each row execute function app.fn_auditar();
create trigger trg_auditar after insert or update or delete on app.rol_permiso
  for each row execute function app.fn_auditar('rol_id', 'permiso_codigo');
create trigger trg_auditar after insert or update or delete on app.configuracion
  for each row execute function app.fn_auditar('clave');
create trigger trg_auditar after insert or update or delete on app.plantilla
  for each row execute function app.fn_auditar('clave');

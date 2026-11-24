-- 005: dispositivos del cascaron Android y outbox de envio push (CONTRATOS §2.5).
-- Ni dispositivo ni notificacion_envio se auditan: guardan el token FCM, que nunca debe llegar a la bitacora.

create table app.dispositivo (
  id bigint generated always as identity primary key,
  usuario_id bigint not null references app.usuario(id),
  sesion_jti uuid not null references app.sesion(jti) on delete cascade,
  token_push text not null constraint uq_dispositivo_token unique,
  plataforma text not null check (plataforma = 'android'),
  app_version text,
  creado_en timestamptz not null default now(),
  ultimo_uso_en timestamptz not null default now(),
  revocado_en timestamptz
);
create index idx_dispositivo_usuario on app.dispositivo (usuario_id) where revocado_en is null;

create table app.notificacion_envio (
  id bigint generated always as identity primary key,
  notificacion_id bigint not null references app.notificacion(id),
  dispositivo_id bigint not null references app.dispositivo(id),
  estado text not null default 'pendiente' check (estado in ('pendiente','enviada','fallida','descartada')),
  intentos smallint not null default 0,
  siguiente_intento_en timestamptz not null default now(),
  ultimo_error text,
  enviada_en timestamptz,
  constraint uq_envio unique (notificacion_id, dispositivo_id)
);
create index idx_envio_pendiente on app.notificacion_envio (siguiente_intento_en) where estado = 'pendiente';

-- ---------------------------------------------------------------- funciones

-- Un telefono, un dueno: el token ya registrado se reasigna a esta sesion y usuario.
create function app.fn_registrar_dispositivo(p_usuario_id bigint, p_jti uuid, p_token text, p_plataforma text, p_version text)
returns bigint
language plpgsql as $$
declare
  v_origen text;
  v_id bigint;
  v_usuario_previo bigint;
begin
  if p_plataforma is distinct from 'android' or coalesce(length(p_token), 0) = 0 then
    raise exception 'VALIDACION' using errcode = 'P0001', detail = '{}';
  end if;

  select s.origen into v_origen
  from app.sesion s
  where s.jti = p_jti and s.usuario_id = p_usuario_id and s.cerrada_en is null and s.expira_en > now();
  if v_origen is null then
    raise exception 'SESION_CERRADA' using errcode = 'P0001', detail = '{}';
  end if;
  if v_origen <> 'app' then
    raise exception 'SOLO_APP' using errcode = 'P0001', detail = '{}';
  end if;

  select d.usuario_id into v_usuario_previo from app.dispositivo d where d.token_push = p_token for update;

  insert into app.dispositivo (usuario_id, sesion_jti, token_push, plataforma, app_version)
  values (p_usuario_id, p_jti, p_token, p_plataforma, p_version)
  on conflict (token_push) do update
    set usuario_id = excluded.usuario_id, sesion_jti = excluded.sesion_jti, app_version = excluded.app_version,
        ultimo_uso_en = now(), revocado_en = null
  returning id into v_id;

  -- Lo pendiente era del dueno anterior: no se le manda al nuevo.
  if v_usuario_previo is not null and v_usuario_previo <> p_usuario_id then
    update app.notificacion_envio set estado = 'descartada'
    where dispositivo_id = v_id and estado = 'pendiente';
  end if;
  return v_id;
end $$;

-- Con token: el de ese usuario. Sin token: todos los de la sesion.
create function app.fn_quitar_dispositivos(p_usuario_id bigint, p_jti uuid, p_token text default null)
returns integer
language plpgsql as $$
declare
  v_n integer;
  v_origen text;
begin
  select s.origen into v_origen from app.sesion s
  where s.jti = p_jti and s.usuario_id = p_usuario_id and s.cerrada_en is null and s.expira_en > now();
  if v_origen is null then
    raise exception 'SESION_CERRADA' using errcode = 'P0001', detail = '{}';
  end if;
  if v_origen <> 'app' then
    raise exception 'SOLO_APP' using errcode = 'P0001', detail = '{}';
  end if;

  with q as (
    update app.dispositivo d set revocado_en = now()
    where d.revocado_en is null and d.usuario_id = p_usuario_id
      and ((p_token is not null and d.token_push = p_token) or (p_token is null and d.sesion_jti = p_jti))
    returning d.id
  ), e as (
    update app.notificacion_envio n set estado = 'descartada'
    where n.estado = 'pendiente' and n.dispositivo_id in (select id from q)
    returning 1
  )
  select count(*)::integer into v_n from q;
  return v_n;
end $$;

-- ---------------------------------------------------------------- disparadores

create function app.fn_notificacion_encolar() returns trigger
language plpgsql as $$
begin
  insert into app.notificacion_envio (notificacion_id, dispositivo_id)
  select NEW.id, d.id
  from app.dispositivo d
  join app.sesion s on s.jti = d.sesion_jti
  join app.usuario u on u.id = d.usuario_id and u.activo
  where d.usuario_id = NEW.usuario_id and d.revocado_en is null
    and s.cerrada_en is null and s.expira_en > now()
    and not exists (select 1 from app.notificacion_preferencia p
                    where p.usuario_id = NEW.usuario_id and p.evento = NEW.evento and not p.push)
  on conflict do nothing;
  return null;
end $$;

create trigger trg_notificacion_encolar after insert on app.notificacion
  for each row execute function app.fn_notificacion_encolar();

create function app.fn_sesion_cerrada_revoca() returns trigger
language plpgsql as $$
begin
  with d as (
    update app.dispositivo set revocado_en = now()
    where sesion_jti = NEW.jti and revocado_en is null
    returning id
  )
  update app.notificacion_envio set estado = 'descartada'
  where estado = 'pendiente' and dispositivo_id in (select id from d);
  return null;
end $$;

create trigger trg_sesion_cerrada_revoca after update of cerrada_en on app.sesion
  for each row when (NEW.cerrada_en is not null and OLD.cerrada_en is null)
  execute function app.fn_sesion_cerrada_revoca();

-- Un usuario dado de baja deja de recibir push aunque alguna sesion siguiera abierta.
create function app.fn_usuario_desactivado_revoca() returns trigger
language plpgsql as $$
begin
  with d as (
    update app.dispositivo set revocado_en = now()
    where usuario_id = NEW.id and revocado_en is null
    returning id
  )
  update app.notificacion_envio set estado = 'descartada'
  where estado = 'pendiente' and dispositivo_id in (select id from d);
  return null;
end $$;

create trigger trg_usuario_desactivado_revoca after update of activo on app.usuario
  for each row when (not NEW.activo and OLD.activo)
  execute function app.fn_usuario_desactivado_revoca();

-- ---------------------------------------------------------------- despachador

-- Toma hasta p_limite envios vencidos (los de mas de 24 h se descartan). No los reserva: quien va a mandar uno llama
-- fn_envio_reservar justo antes de enviarlo, asi un lote lento no deja filas "reservadas" que vencen a medio lote.
create function app.fn_envios_tomar(p_limite integer)
returns table (envio_id bigint, token_push text, titulo text, cuerpo text, datos jsonb, evento text, notificacion_id bigint)
language plpgsql as $$
#variable_conflict use_column
begin
  update app.notificacion_envio e set estado = 'descartada'
  where e.estado = 'pendiente' and e.siguiente_intento_en <= now()
    and exists (select 1 from app.notificacion n where n.id = e.notificacion_id and n.creado_en < now() - interval '24 hours');

  return query
  with tomados as (
    select e.id from app.notificacion_envio e
    where e.estado = 'pendiente' and e.siguiente_intento_en <= now()
    order by e.siguiente_intento_en, e.id
    limit greatest(p_limite, 0)
    for update skip locked
  )
  select e.id, d.token_push, n.titulo, n.cuerpo, n.datos, n.evento, n.id
  from tomados t
  join app.notificacion_envio e on e.id = t.id
  join app.notificacion n on n.id = e.notificacion_id
  join app.dispositivo d on d.id = e.dispositivo_id
  order by e.id;
end $$;

-- Reserva un envio 2 minutos antes de mandarlo (true = es tuyo). Si el proceso muere despues de que FCM acepto y antes de
-- fn_envio_resultado, el envio se repite tras esos 2 minutos: aviso doble, nunca perdido (shortcut aceptado).
create function app.fn_envio_reservar(p_envio_id bigint) returns boolean
language plpgsql as $$
declare v_n integer;
begin
  update app.notificacion_envio set siguiente_intento_en = now() + interval '2 minutes'
  where id = p_envio_id and estado = 'pendiente' and siguiente_intento_en <= now();
  get diagnostics v_n = row_count;
  return v_n = 1;
end $$;

-- Mantenimiento diario (lo llama envio.ts): borra envios terminados de mas de 30 dias y descarta pendientes de mas de 24 h.
create function app.fn_envios_purgar() returns integer
language plpgsql as $$
declare v_n integer;
begin
  update app.notificacion_envio e set estado = 'descartada'
  from app.notificacion n
  where n.id = e.notificacion_id and e.estado = 'pendiente' and n.creado_en < now() - interval '24 hours';
  delete from app.notificacion_envio e using app.notificacion n
  where n.id = e.notificacion_id and e.estado <> 'pendiente' and n.creado_en < now() - interval '30 days';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create function app.fn_envio_resultado(p_envio_id bigint, p_resultado text, p_error text)
returns void
language plpgsql as $$
declare
  v_intentos smallint;
  v_dispositivo bigint;
begin
  if p_resultado not in ('enviada','temporal','invalido','permanente') then
    raise exception 'VALIDACION' using errcode = 'P0001', detail = '{}';
  end if;

  select e.intentos, e.dispositivo_id into v_intentos, v_dispositivo
  from app.notificacion_envio e where e.id = p_envio_id and e.estado = 'pendiente' for update;
  if not found then return; end if;

  if p_resultado = 'enviada' then
    update app.notificacion_envio set estado = 'enviada', enviada_en = now(), ultimo_error = null where id = p_envio_id;
  elsif p_resultado = 'permanente' then
    -- Error del mensaje, no del dispositivo: no se reintenta y el dispositivo sigue activo.
    update app.notificacion_envio set estado = 'fallida', ultimo_error = left(p_error, 100) where id = p_envio_id;
  elsif p_resultado = 'temporal' then
    v_intentos := v_intentos + 1;
    if v_intentos >= 5 then
      update app.notificacion_envio set estado = 'fallida', intentos = v_intentos, ultimo_error = left(p_error, 100) where id = p_envio_id;
    else
      update app.notificacion_envio
      set intentos = v_intentos, ultimo_error = left(p_error, 100),
          siguiente_intento_en = now() + ((array[1, 5, 30, 120])[v_intentos] * interval '1 minute')
      where id = p_envio_id;
    end if;
  else
    update app.dispositivo set revocado_en = now() where id = v_dispositivo and revocado_en is null;
    update app.notificacion_envio set estado = 'descartada', ultimo_error = left(p_error, 100)
    where dispositivo_id = v_dispositivo and estado = 'pendiente';
  end if;
end $$;

-- 008: caja, turnos, ventas, entrega de pedidos, devoluciones, cuentas por cobrar, abonos, liquidacion de ruta,
-- estado de cuenta y resumen del dia (CONTRATOS §2.8, §2.12 A3 y B9-B12).
-- Candados de dinero, siempre en este orden: ruta -> turno_caja -> pedido -> lineas del pedido -> venta -> cliente ->
-- existencias (fn_bloquear_existencias, por producto_id) -> cuentas por cobrar (por id) -> abono. Ninguna funcion toma un
-- candado anterior despues de uno posterior. Toda operacion de dinero (entregar, vender, abonar, devolver, gasto) es
-- idempotente por clave; iniciar, terminar, no entregado y liquidar lo son por estado.
-- Los textos de mensajes salen de plantillas; aqui no hay ninguno. Errores: RAISE '<CODIGO>' con DETAIL json (fn_fallar).

-- ---------------------------------------------------------------- tablas

create table app.caja (
  id bigint generated always as identity primary key,
  sucursal_id bigint not null references app.sucursal(id),
  nombre text not null check (length(trim(nombre)) > 0),
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  constraint uq_caja_nombre unique (sucursal_id, nombre)
);
insert into app.caja (sucursal_id, nombre) values (1, 'Mostrador');

create table app.turno_caja (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('mostrador','ruta')),
  caja_id bigint references app.caja(id),
  ruta_id bigint references app.ruta(id),
  usuario_id bigint not null references app.usuario(id),
  estado text not null default 'abierto' check (estado in ('abierto','cerrado')),
  fondo_inicial numeric(12,2) not null check (fondo_inicial >= 0),
  abierto_en timestamptz not null default now(),
  cerrado_en timestamptz, cerrado_por bigint references app.usuario(id),
  efectivo_esperado numeric(12,2), efectivo_contado numeric(12,2) check (efectivo_contado >= 0),
  diferencia numeric(12,2), notas_cierre text,
  constraint ck_turno_tipo check ((tipo = 'mostrador' and caja_id is not null and ruta_id is null)
                               or (tipo = 'ruta' and ruta_id is not null and caja_id is null)),
  constraint ck_turno_cierre check ((estado = 'cerrado') =
    (cerrado_en is not null and efectivo_esperado is not null and efectivo_contado is not null and diferencia is not null))
);
create unique index uq_turno_abierto_caja on app.turno_caja (caja_id) where estado = 'abierto';
create unique index uq_turno_abierto_usuario on app.turno_caja (usuario_id) where estado = 'abierto';
create unique index uq_turno_ruta on app.turno_caja (ruta_id) where ruta_id is not null;
create index idx_turno_fecha on app.turno_caja (abierto_en desc);

alter table app.ruta add constraint fk_ruta_turno foreign key (turno_caja_id) references app.turno_caja(id);

create table app.movimiento_caja (
  id bigint generated always as identity primary key,
  turno_caja_id bigint not null references app.turno_caja(id),
  tipo text not null check (tipo in ('entrada','salida','retiro','reembolso')),
  monto numeric(12,2) not null check (monto > 0),
  motivo text not null,
  referencia_tabla text check (referencia_tabla in ('venta','devolucion','abono')),
  referencia_id bigint,
  usuario_id bigint not null references app.usuario(id),
  clave_idempotencia uuid constraint uq_movimiento_caja_clave unique,
  hash_solicitud text,
  creado_en timestamptz not null default now(),
  constraint ck_movimiento_caja_referencia check ((referencia_tabla is null) = (referencia_id is null))
);
create index idx_movimiento_caja_turno on app.movimiento_caja (turno_caja_id);

create table app.venta (
  id bigint generated always as identity primary key,
  sucursal_id bigint not null references app.sucursal(id),
  folio text not null,
  origen text not null check (origen in ('mostrador','pedido')),
  pedido_id bigint constraint uq_venta_pedido unique references app.pedido(id),
  turno_caja_id bigint not null references app.turno_caja(id),
  cliente_id bigint references app.cliente(id),
  lista_precio_id bigint not null references app.lista_precio(id),
  usuario_id bigint not null references app.usuario(id),
  estado text not null default 'completada' check (estado in ('completada','cancelada')),
  total numeric(12,2) not null default 0 check (total >= 0),
  efectivo_recibido numeric(12,2), cambio numeric(12,2) check (cambio >= 0),
  notas text,
  clave_idempotencia uuid not null constraint uq_venta_clave unique,
  hash_solicitud text not null,
  creado_en timestamptz not null default now(),
  cancelada_en timestamptz, cancelada_por bigint references app.usuario(id), motivo_cancelacion text,
  constraint uq_venta_folio unique (sucursal_id, folio),
  constraint ck_venta_origen check ((origen = 'pedido') = (pedido_id is not null)
                                and (origen = 'mostrador' or cliente_id is not null)),
  constraint ck_venta_cancelada check ((estado = 'cancelada') = (cancelada_en is not null))
);
create index idx_venta_fecha on app.venta (sucursal_id, creado_en desc);
create index idx_venta_turno on app.venta (turno_caja_id);
create index idx_venta_cliente on app.venta (cliente_id, creado_en desc);
create index idx_venta_usuario on app.venta (usuario_id, creado_en desc);

alter table app.pedido add constraint fk_pedido_venta foreign key (venta_id) references app.venta(id);

-- Prueba de entrega (B11): opcional; la foto es privada y nunca sale al cliente.
alter table app.pedido
  add column recibio text check (length(recibio) <= 80),
  add column foto_entrega text check (foto_entrega ~ '^[0-9a-f]{64}\.(jpg|png|webp)$');

create table app.venta_linea (
  id bigint generated always as identity primary key,
  venta_id bigint not null references app.venta(id),
  numero smallint not null,
  presentacion_id bigint not null references app.presentacion(id),
  producto_id bigint not null references app.producto(id),
  factor integer not null check (factor > 0),
  cantidad integer not null check (cantidad > 0),
  piezas integer generated always as (cantidad * factor) stored,
  precio_lista numeric(12,2) not null,
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  importe numeric(12,2) not null,
  costo_unitario numeric(14,6) not null,
  costo_total numeric(12,2) not null,
  piezas_devueltas integer not null default 0,
  constraint uq_venta_linea_numero unique (venta_id, numero),
  constraint ck_venta_linea_devuelto check (piezas_devueltas between 0 and cantidad * factor)
);
create index idx_venta_linea_producto on app.venta_linea (producto_id);

create table app.venta_pago (
  id bigint generated always as identity primary key,
  venta_id bigint not null references app.venta(id),
  metodo text not null check (metodo in ('efectivo','transferencia','tarjeta','credito')),
  monto numeric(12,2) not null check (monto > 0),
  referencia text,
  comprobante text check (comprobante ~ '^[0-9a-f]{64}\.(jpg|png|webp)$'),
  verificado_en timestamptz, verificado_por bigint references app.usuario(id),
  constraint uq_venta_pago_metodo unique (venta_id, metodo),
  constraint ck_pago_comprobante check (comprobante is null or metodo = 'transferencia')
);

create table app.cuenta_por_cobrar (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references app.cliente(id),
  origen text not null default 'venta' check (origen in ('venta','saldo_inicial')),
  venta_id bigint constraint uq_cxc_venta unique references app.venta(id),
  concepto text,
  monto numeric(12,2) not null check (monto > 0),
  saldo numeric(12,2) not null check (saldo >= 0 and saldo <= monto),
  vence_el date not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','saldada','cancelada')),
  creado_por bigint not null references app.usuario(id),
  creado_en timestamptz not null default now(),
  constraint ck_cxc_origen check ((origen = 'venta') = (venta_id is not null)),
  constraint ck_cxc_estado check ((estado = 'pendiente' and saldo > 0) or (estado in ('saldada','cancelada') and saldo = 0))
);
create index idx_cxc_cliente_pendiente on app.cuenta_por_cobrar (cliente_id, vence_el) where estado = 'pendiente';

create table app.devolucion (
  id bigint generated always as identity primary key,
  sucursal_id bigint not null references app.sucursal(id),
  folio text not null,
  venta_id bigint not null references app.venta(id),
  turno_caja_id bigint references app.turno_caja(id),
  usuario_id bigint not null references app.usuario(id),
  motivo text not null,
  total numeric(12,2) not null check (total > 0),
  abono_credito numeric(12,2) not null check (abono_credito >= 0),
  reembolso_efectivo numeric(12,2) not null check (reembolso_efectivo >= 0),
  clave_idempotencia uuid not null constraint uq_devolucion_clave unique,
  hash_solicitud text not null,
  creado_en timestamptz not null default now(),
  constraint uq_devolucion_folio unique (sucursal_id, folio),
  constraint ck_devolucion_reparto check (total = abono_credito + reembolso_efectivo),
  constraint ck_devolucion_turno check (reembolso_efectivo = 0 or turno_caja_id is not null)
);
create index idx_devolucion_venta on app.devolucion (venta_id);

create table app.devolucion_linea (
  id bigint generated always as identity primary key,
  devolucion_id bigint not null references app.devolucion(id),
  venta_linea_id bigint not null references app.venta_linea(id),
  producto_id bigint not null references app.producto(id),
  piezas integer not null check (piezas > 0),
  importe numeric(12,2) not null,
  costo_total numeric(12,2) not null,
  regresa_a_inventario boolean not null
);
create index idx_devolucion_linea_vl on app.devolucion_linea (venta_linea_id);
create index idx_devolucion_linea_dev on app.devolucion_linea (devolucion_id);

-- verificado_* es de 008 (el contrato lo exige para fn_verificar_pago sobre abonos; ver el reporte de B).
create table app.abono (
  id bigint generated always as identity primary key,
  sucursal_id bigint not null references app.sucursal(id),
  folio text not null,
  cliente_id bigint not null references app.cliente(id),
  turno_caja_id bigint references app.turno_caja(id),
  ruta_parada_id bigint references app.ruta_parada(id),
  metodo text not null check (metodo in ('efectivo','transferencia','tarjeta')),
  monto numeric(12,2) not null check (monto > 0),
  referencia text,
  comprobante text check (comprobante ~ '^[0-9a-f]{64}\.(jpg|png|webp)$'),
  estado text not null default 'aplicado' check (estado in ('aplicado','cancelado')),
  usuario_id bigint not null references app.usuario(id),
  clave_idempotencia uuid not null constraint uq_abono_clave unique,
  hash_solicitud text not null,
  creado_en timestamptz not null default now(),
  cancelado_en timestamptz, cancelado_por bigint references app.usuario(id), motivo_cancelacion text,
  verificado_en timestamptz, verificado_por bigint references app.usuario(id),
  constraint uq_abono_folio unique (sucursal_id, folio),
  constraint ck_abono_efectivo_turno check (metodo <> 'efectivo' or turno_caja_id is not null),
  constraint ck_abono_cancelado check ((estado = 'cancelado') = (cancelado_en is not null))
);
create index idx_abono_cliente on app.abono (cliente_id, creado_en desc);
create index idx_abono_turno on app.abono (turno_caja_id);

create table app.abono_aplicacion (
  abono_id bigint not null references app.abono(id),
  cuenta_por_cobrar_id bigint not null references app.cuenta_por_cobrar(id),
  monto numeric(12,2) not null check (monto > 0),
  primary key (abono_id, cuenta_por_cobrar_id)
);
create index idx_abono_aplicacion_cxc on app.abono_aplicacion (cuenta_por_cobrar_id);

-- ---------------------------------------------------------------- protecciones

-- Filas inmutables (ESTADO_NO_VALIDO). Con argumentos, solo se pueden cambiar las columnas nombradas:
--   venta_linea: piezas_devueltas (y `piezas`, generada: en un BEFORE todavia no se calcula en NEW); venta_pago: verificado_en y verificado_por.
create function app.fn_dinero_inmutable() returns trigger
language plpgsql as $$
declare
  v_libres text[] := array(select unnest(tg_argv));
begin
  if tg_op = 'UPDATE' and tg_nargs > 0
     and (to_jsonb(new) - v_libres) is not distinct from (to_jsonb(old) - v_libres) then
    return new;
  end if;
  raise exception 'ESTADO_NO_VALIDO' using errcode = 'P0001',
    detail = jsonb_build_object('tabla', tg_table_name, 'motivo', 'inmutable')::text;
end $$;

create trigger trg_venta_linea_inmutable before update or delete on app.venta_linea
  for each row execute function app.fn_dinero_inmutable('piezas_devueltas', 'piezas');
create trigger trg_venta_pago_inmutable before update or delete on app.venta_pago
  for each row execute function app.fn_dinero_inmutable('verificado_en', 'verificado_por');
create trigger trg_movimiento_caja_inmutable before update or delete on app.movimiento_caja
  for each row execute function app.fn_dinero_inmutable();
create trigger trg_devolucion_inmutable before update or delete on app.devolucion
  for each row execute function app.fn_dinero_inmutable();
create trigger trg_devolucion_linea_inmutable before update or delete on app.devolucion_linea
  for each row execute function app.fn_dinero_inmutable();
create trigger trg_abono_aplicacion_inmutable before update or delete on app.abono_aplicacion
  for each row execute function app.fn_dinero_inmutable();

-- Mismos casos de 002/003/004 + tablas de dinero. Misma firma: CREATE OR REPLACE.
create or replace function app.fn_truncate_bloqueado() returns trigger
language plpgsql as $$
declare
  v_codigo text := case TG_TABLE_NAME
    when 'movimiento_inventario' then 'MOVIMIENTO_INMUTABLE'
    when 'existencia' then 'EXISTENCIA_SOLO_POR_MOVIMIENTO'
    when 'pedido_evento' then 'ESTADO_NO_VALIDO'
    when 'movimiento_caja' then 'ESTADO_NO_VALIDO'
    when 'venta' then 'ESTADO_NO_VALIDO'
    when 'venta_linea' then 'ESTADO_NO_VALIDO'
    when 'venta_pago' then 'ESTADO_NO_VALIDO'
    when 'cuenta_por_cobrar' then 'ESTADO_NO_VALIDO'
    when 'devolucion' then 'ESTADO_NO_VALIDO'
    when 'devolucion_linea' then 'ESTADO_NO_VALIDO'
    when 'abono' then 'ESTADO_NO_VALIDO'
    when 'abono_aplicacion' then 'ESTADO_NO_VALIDO'
    else 'COMPRA_INMUTABLE' end;
begin
  raise exception '%', v_codigo using errcode = 'P0001', detail = '{}';
end $$;

create trigger trg_movimiento_caja_truncate before truncate on app.movimiento_caja for each statement execute function app.fn_truncate_bloqueado();
create trigger trg_venta_truncate before truncate on app.venta for each statement execute function app.fn_truncate_bloqueado();
create trigger trg_venta_linea_truncate before truncate on app.venta_linea for each statement execute function app.fn_truncate_bloqueado();
create trigger trg_venta_pago_truncate before truncate on app.venta_pago for each statement execute function app.fn_truncate_bloqueado();
create trigger trg_cuenta_por_cobrar_truncate before truncate on app.cuenta_por_cobrar for each statement execute function app.fn_truncate_bloqueado();
create trigger trg_devolucion_truncate before truncate on app.devolucion for each statement execute function app.fn_truncate_bloqueado();
create trigger trg_devolucion_linea_truncate before truncate on app.devolucion_linea for each statement execute function app.fn_truncate_bloqueado();
create trigger trg_abono_truncate before truncate on app.abono for each statement execute function app.fn_truncate_bloqueado();
create trigger trg_abono_aplicacion_truncate before truncate on app.abono_aplicacion for each statement execute function app.fn_truncate_bloqueado();

-- Tablas de dinero con guarda: solo escriben las funciones de 008 (cada una llama fn_dinero_escribir, que levanta la bandera
-- app.escribiendo_dinero para el resto de la transaccion; la API solo llama funciones, asi que no queda abierta). Un UPDATE, INSERT o
-- DELETE directo falla con ESTADO_NO_VALIDO. Son tambien tablas auditadas (trg_auditar al final).
create function app.fn_dinero_escribir() returns void
language sql as $$ select set_config('app.escribiendo_dinero', '1', true) $$;

create function app.fn_dinero_guardado() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.escribiendo_dinero', true), '') <> '1' then
    raise exception 'ESTADO_NO_VALIDO' using errcode = 'P0001',
      detail = jsonb_build_object('tabla', tg_table_name, 'motivo', 'solo_funciones')::text;
  end if;
  return coalesce(new, old);
end $$;

create trigger trg_turno_caja_guardado before insert or update or delete on app.turno_caja for each row execute function app.fn_dinero_guardado();
create trigger trg_venta_guardado before insert or update or delete on app.venta for each row execute function app.fn_dinero_guardado();
create trigger trg_cuenta_por_cobrar_guardado before insert or update or delete on app.cuenta_por_cobrar for each row execute function app.fn_dinero_guardado();
create trigger trg_abono_guardado before insert or update or delete on app.abono for each row execute function app.fn_dinero_guardado();

-- Nada nuevo se escribe en un turno cerrado (red de seguridad bajo los candados de cada funcion). FOR SHARE espera a un cierre en curso
-- y lo vuelve a leer ya cerrado.
create function app.fn_turno_abierto_exigido() returns trigger
language plpgsql as $$
begin
  if new.turno_caja_id is not null
     and not exists (select 1 from app.turno_caja t where t.id = new.turno_caja_id and t.estado = 'abierto' for share) then
    raise exception 'TURNO_NO_ABIERTO' using errcode = 'P0001', detail = jsonb_build_object('turno_id', new.turno_caja_id)::text;
  end if;
  return new;
end $$;

create trigger trg_movimiento_caja_turno_abierto before insert on app.movimiento_caja for each row execute function app.fn_turno_abierto_exigido();
create trigger trg_venta_turno_abierto before insert on app.venta for each row execute function app.fn_turno_abierto_exigido();
create trigger trg_abono_turno_abierto before insert on app.abono for each row execute function app.fn_turno_abierto_exigido();

-- ---------------------------------------------------------------- vistas: una regla de «qué debe un cliente»

-- Unica regla de saldo, vencido y disponible. Una fila por cliente (0 si no tiene cuentas pendientes). «Hoy» es la fecha local.
create view app.v_saldo_cliente as
select c.id as cliente_id,
       c.limite_credito,
       coalesce(sum(x.saldo), 0)::numeric(12,2) as saldo,
       coalesce(sum(x.saldo) filter (where x.vence_el < app.fn_fecha_local(now())), 0)::numeric(12,2) as vencido,
       coalesce(app.fn_fecha_local(now()) - min(x.vence_el) filter (where x.vence_el < app.fn_fecha_local(now())), 0)::integer as max_dias_vencido,
       count(x.id)::integer as cuentas_pendientes,
       greatest(0, c.limite_credito - coalesce(sum(x.saldo), 0))::numeric(12,2) as disponible
from app.cliente c
left join app.cuenta_por_cobrar x on x.cliente_id = c.id and x.estado = 'pendiente'
group by c.id;

-- B10: color y limite sugerido sobre v_saldo_cliente. dias_promedio_pago: promedio de (dia del ultimo abono que la salda - dia
-- de creacion) de sus cuentas saldadas creadas en los ultimos 180 dias (sin historial = null = verde).
-- limite_sugerido = round(compra semanal a credito de 8 semanas * (dias_credito / 7 + 1) * (verde 1.5 | amarillo 1.0), -2); rojo = el saldo.
create view app.v_semaforo_cliente as
with base as (
  select s.cliente_id, s.saldo, s.vencido, s.max_dias_vencido, s.limite_credito, c.dias_credito,
         (select round(avg(app.fn_fecha_local(p.pagada_en) - app.fn_fecha_local(x.creado_en)), 1)
          from app.cuenta_por_cobrar x
          join lateral (select max(a.creado_en) as pagada_en
                        from app.abono_aplicacion ap join app.abono a on a.id = ap.abono_id and a.estado = 'aplicado'
                        where ap.cuenta_por_cobrar_id = x.id) p on p.pagada_en is not null
          where x.cliente_id = s.cliente_id and x.estado = 'saldada' and x.creado_en >= now() - interval '180 days') as dias_promedio_pago,
         (select coalesce(sum(x.monto), 0) / 8.0
          from app.cuenta_por_cobrar x
          where x.cliente_id = s.cliente_id and x.origen = 'venta' and x.estado <> 'cancelada'
            and x.creado_en >= now() - interval '56 days') as semanal
  from app.v_saldo_cliente s
  join app.cliente c on c.id = s.cliente_id
), calc as (
  select b.*,
         case when b.max_dias_vencido > coalesce(app.fn_config('semaforo_dias_rojo')::integer, 15) or b.saldo > b.limite_credito then 'rojo'
              when b.vencido > 0 or b.dias_promedio_pago > b.dias_credito then 'amarillo'
              else 'verde' end as color
  from base b
)
select k.cliente_id, k.color, k.saldo, k.vencido, k.max_dias_vencido, k.dias_promedio_pago,
       (case k.color when 'rojo' then k.saldo
                     else round(k.semanal * (k.dias_credito / 7.0 + 1) * (case k.color when 'verde' then 1.5 else 1.0 end), -2) end)::numeric(12,2)
         as limite_sugerido
from calc k;

-- Unica regla de «transferencia por verificar»: pagos de ventas completadas y abonos aplicados por transferencia (con su turno). La usan el resumen
-- del turno, /transferencias y el contador de /despacho.
create view app.v_transferencia as
select v.sucursal_id, 'venta_pago'::text as tabla, p.id, v.folio, v.cliente_id, p.monto, p.referencia, p.comprobante, v.turno_caja_id, p.verificado_en, v.creado_en
from app.venta_pago p join app.venta v on v.id = p.venta_id
where p.metodo = 'transferencia' and v.estado = 'completada'
union all
select a.sucursal_id, 'abono', a.id, a.folio, a.cliente_id, a.monto, a.referencia, a.comprobante, a.turno_caja_id, a.verificado_en, a.creado_en
from app.abono a
where a.metodo = 'transferencia' and a.estado = 'aplicado';

-- Sucursal de una cuenta por cobrar: la de su venta o, en un saldo inicial, la de quien lo capturo (los clientes no tienen sucursal).
create view app.v_cxc_sucursal as
select x.id as cuenta_por_cobrar_id, coalesce(v.sucursal_id, u.sucursal_id) as sucursal_id
from app.cuenta_por_cobrar x
left join app.venta v on v.id = x.venta_id
join app.usuario u on u.id = x.creado_por;

-- ---------------------------------------------------------------- ayudas

-- Turno abierto de un usuario (null si no tiene). Unica regla de «mi turno»: el indice parcial garantiza uno solo.
create function app.fn_turno_abierto(p_usuario_id bigint) returns bigint
language sql stable as $$
  select t.id from app.turno_caja t where t.usuario_id = p_usuario_id and t.estado = 'abierto'
$$;

-- Dinero desde JSON: > 0 y con a lo mas 2 decimales. Devuelve numeric.
create function app.fn_monto_positivo(p_valor numeric, p_campo text) returns numeric
language plpgsql immutable as $$
begin
  if p_valor is null or p_valor <= 0 or p_valor <> round(p_valor, 2) or p_valor >= 10000000000 then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', p_campo));
  end if;
  return p_valor;
end $$;

-- Id (bigint) desde un valor JSON; VALIDACION si no lo es.
create function app.fn_json_id(p_valor text, p_campo text) returns bigint
language plpgsql immutable as $$
begin
  if p_valor is null or p_valor !~ '^[0-9]{1,18}$' then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', p_campo));
  end if;
  return p_valor::bigint;
end $$;

-- Idempotencia comun: devuelve la fila previa de la clave en la tabla dada con el mismo usuario y hash, o falla con
-- IDEMPOTENCIA_CONFLICTO. Las tablas son fijas (lista blanca); la clave ya esta bloqueada con pg_advisory_xact_lock.
create function app.fn_idem_previa(p_tabla text, p_clave uuid, p_usuario_id bigint, p_hash text) returns bigint
language plpgsql as $$
declare
  v_id bigint;
  v_usuario bigint;
  v_hash text;
begin
  if p_tabla not in ('venta','devolucion','abono','movimiento_caja') then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'tabla'));
  end if;
  execute format('select id, usuario_id, hash_solicitud from app.%I where clave_idempotencia = $1', p_tabla)
    into v_id, v_usuario, v_hash using p_clave;
  if v_id is null then
    return null;
  end if;
  if v_usuario is distinct from p_usuario_id or v_hash is distinct from p_hash then
    perform app.fn_fallar('IDEMPOTENCIA_CONFLICTO', jsonb_build_object('id', v_id));
  end if;
  return v_id;
end $$;

-- Dia de negocio -> rango de timestamptz (sin funciones sobre la columna: usa los indices por fecha).
create function app.fn_inicio_dia(p_fecha date) returns timestamptz
language sql immutable as $$ select p_fecha::timestamp at time zone 'America/Mexico_City' $$;

-- Una sola formula de importe de linea: la venta, la entrega y la vista previa.
create function app.fn_importe_linea(p_cantidad integer, p_precio numeric) returns numeric
language sql immutable as $$ select round(p_cantidad * p_precio, 2) $$;

-- Reparto: solo el repartidor de la ruta (rutas.operar) entrega y cobra sus pedidos [revision].
create function app.fn_ruta_exigir_repartidor(p_usuario_id bigint, p_ruta app.ruta) returns void
language plpgsql as $$
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'rutas.operar');
  if p_ruta.repartidor_id <> p_usuario_id then
    perform app.fn_fallar('RUTA_AJENA', jsonb_build_object('ruta_id', p_ruta.id));
  end if;
end $$;

-- Lo entregado por linea de un pedido (lineas omitidas = completa). p_entradas: arreglo [{pedido_linea_id, cantidad_entregada}].
-- La usan la entrega y la vista previa. Todas en 0 -> ENTREGA_VACIA.
create function app.fn_entrega_lineas(p_pedido_id bigint, p_entradas jsonb) returns table(linea_id bigint, cantidad integer, entregada integer)
language plpgsql stable as $$
declare
  v_e record;
  v_vistos bigint[] := '{}';
begin
  for v_e in select x.valor from jsonb_array_elements(p_entradas) as x(valor) loop
    declare
      v_id bigint := app.fn_json_id(v_e.valor ->> 'pedido_linea_id', 'pedido_linea_id');
      v_cant integer := app.fn_json_entero(v_e.valor ->> 'cantidad_entregada', 'cantidad_entregada');
      v_cantidad integer;
    begin
      if v_cant < 0 or v_id = any(v_vistos) then
        perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'lineas'));
      end if;
      v_vistos := v_vistos || v_id;
      select l.cantidad into v_cantidad from app.pedido_linea l
      where l.id = v_id and l.pedido_id = p_pedido_id and l.estado = 'activa' and l.cantidad > 0;
      if not found then
        perform app.fn_fallar('LINEA_NO_VALIDA', jsonb_build_object('pedido_linea_id', v_id));
      end if;
      if v_cant > v_cantidad then
        perform app.fn_fallar('ENTREGA_EXCEDE_PEDIDO', jsonb_build_object('pedido_linea_id', v_id, 'cantidad', v_cantidad, 'entregada', v_cant));
      end if;
    end;
  end loop;
  if not exists (
    select 1 from app.pedido_linea l
    left join (select x.valor from jsonb_array_elements(p_entradas) as x(valor)) e on (e.valor ->> 'pedido_linea_id')::bigint = l.id
    where l.pedido_id = p_pedido_id and l.estado = 'activa' and l.cantidad > 0
      and coalesce((e.valor ->> 'cantidad_entregada')::integer, l.cantidad) > 0) then
    perform app.fn_fallar('ENTREGA_VACIA', jsonb_build_object('pedido_id', p_pedido_id));
  end if;
  return query
  select l.id, l.cantidad, coalesce((e.valor ->> 'cantidad_entregada')::integer, l.cantidad)
  from app.pedido_linea l
  left join (select x.valor from jsonb_array_elements(p_entradas) as x(valor)) e on (e.valor ->> 'pedido_linea_id')::bigint = l.id
  where l.pedido_id = p_pedido_id and l.estado = 'activa' and l.cantidad > 0
  order by l.id;
end $$;

-- Pagos de una venta: valida, resuelve y suma. La usan fn_registrar_venta (p_vista = false: todo monto explicito, y Σ pagos = total,
-- efectivo recibido >= efectivo) y la vista previa de /cobrar (p_vista = true: un pago puede traer monto null = «el resto» y lo que no
-- cuadra se reporta en vez de fallar). Devuelve {pagos:[{metodo, monto, referencia, comprobante}], pagado (sin credito), credito, efectivo,
-- recibido, cambio, falta, cuadra, efectivo_insuficiente}.
create function app.fn_calcular_pagos(p_total numeric, p_pagos jsonb, p_efectivo_recibido text, p_vista boolean default false) returns jsonb
language plpgsql stable as $$
declare
  v_pagos jsonb := case when p_pagos is null or jsonb_typeof(p_pagos) = 'null' then '[]'::jsonb else p_pagos end;
  v_x record;
  v_nulos integer := 0;
  v_explicito numeric := 0;
  v_resto numeric;
  v_monto numeric;
  v_pagado numeric := 0;
  v_efectivo numeric := 0;
  v_credito numeric := 0;
  v_recibido numeric;
  v_cambio numeric;
  v_ref text;
  v_salida jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(v_pagos) <> 'array' or jsonb_array_length(v_pagos) > 4 then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'pagos'));
  end if;
  if (select count(*) <> count(distinct x ->> 'metodo') from jsonb_array_elements(v_pagos) x) then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'pagos', 'motivo', 'metodo_repetido'));
  end if;
  for v_x in select x.valor from jsonb_array_elements(v_pagos) as x(valor) loop
    if v_x.valor ->> 'metodo' is null or v_x.valor ->> 'metodo' not in ('efectivo','transferencia','tarjeta','credito') then
      perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'metodo'));
    end if;
    if p_vista and (jsonb_typeof(v_x.valor -> 'monto') is null or jsonb_typeof(v_x.valor -> 'monto') = 'null') then
      v_nulos := v_nulos + 1;
    else
      v_explicito := v_explicito + app.fn_monto_positivo(app.fn_json_dinero(v_x.valor ->> 'monto', 'monto'), 'monto');
    end if;
    if nullif(v_x.valor ->> 'comprobante', '') is not null
       and (v_x.valor ->> 'metodo' <> 'transferencia' or v_x.valor ->> 'comprobante' !~ '^[0-9a-f]{64}\.(jpg|png|webp)$') then
      perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'comprobante'));
    end if;
    if length(coalesce(v_x.valor ->> 'referencia', '')) > 80 then
      perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'referencia'));
    end if;
  end loop;
  if v_nulos > 1 then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'pagos', 'motivo', 'un_solo_resto'));
  end if;
  v_resto := p_total - v_explicito;
  if v_nulos = 1 and v_resto <= 0 then
    perform app.fn_fallar('PAGOS_NO_CUADRAN', jsonb_build_object('total', p_total::text, 'pagado', v_explicito::text));
  end if;
  for v_x in select x.valor, x.ord from jsonb_array_elements(v_pagos) with ordinality as x(valor, ord) order by x.ord loop
    v_monto := case when jsonb_typeof(v_x.valor -> 'monto') is null or jsonb_typeof(v_x.valor -> 'monto') = 'null' then v_resto
                    else (v_x.valor ->> 'monto')::numeric end;
    v_ref := nullif(trim(coalesce(v_x.valor ->> 'referencia', '')), '');
    v_salida := v_salida || jsonb_build_array(jsonb_build_object('metodo', v_x.valor ->> 'metodo', 'monto', v_monto::numeric(12,2)::text,
                                                                'referencia', v_ref, 'comprobante', nullif(v_x.valor ->> 'comprobante', '')));
    if v_x.valor ->> 'metodo' = 'credito' then
      v_credito := v_monto;
    else
      v_pagado := v_pagado + v_monto;
      if v_x.valor ->> 'metodo' = 'efectivo' then
        v_efectivo := v_monto;
      end if;
    end if;
  end loop;
  if not p_vista and v_pagado + v_credito <> p_total then
    perform app.fn_fallar('PAGOS_NO_CUADRAN', jsonb_build_object('total', p_total::text, 'pagado', (v_pagado + v_credito)::text));
  end if;
  if nullif(p_efectivo_recibido, '') is not null then
    if v_efectivo = 0 then
      if not p_vista then
        perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'efectivo_recibido'));
      end if;
    else
      v_recibido := app.fn_json_dinero(p_efectivo_recibido, 'efectivo_recibido');
      if v_recibido < v_efectivo and not p_vista then
        perform app.fn_fallar('EFECTIVO_INSUFICIENTE', jsonb_build_object('monto', v_efectivo::text, 'recibido', v_recibido::text));
      end if;
    end if;
  elsif v_efectivo > 0 then
    v_recibido := v_efectivo;
  end if;
  v_cambio := case when v_recibido >= v_efectivo then v_recibido - v_efectivo end;
  return jsonb_build_object(
    'pagos', v_salida,
    'pagado', v_pagado::numeric(12,2)::text, 'credito', v_credito::numeric(12,2)::text, 'efectivo', v_efectivo::numeric(12,2)::text,
    'recibido', v_recibido::numeric(12,2)::text, 'cambio', v_cambio::numeric(12,2)::text,
    'falta', (p_total - v_pagado - v_credito)::numeric(12,2)::text, 'cuadra', p_total = v_pagado + v_credito,
    'efectivo_insuficiente', v_recibido is not null and v_recibido < v_efectivo);
end $$;

-- Credito de un cliente frente a un monto a fiar: una sola lectura (v_saldo_cliente) para la venta y la vista previa. [P6b] el vencido no cuenta.
create function app.fn_credito_cliente(p_cliente_id bigint, p_credito numeric)
returns table(limite numeric, saldo numeric, disponible numeric, saldo_despues numeric, disponible_despues numeric, excede boolean)
language sql stable as $$
  select s.limite_credito, s.saldo, greatest(0, s.limite_credito - s.saldo)::numeric(12,2), (s.saldo + p_credito)::numeric(12,2),
         greatest(0, s.limite_credito - s.saldo - p_credito)::numeric(12,2), p_credito > 0 and s.saldo + p_credito > s.limite_credito
  from app.v_saldo_cliente s where s.cliente_id = p_cliente_id
$$;

-- ---------------------------------------------------------------- turnos de caja

create function app.fn_abrir_turno(p_usuario_id bigint, p_caja_id bigint, p_fondo_inicial numeric) returns bigint
language plpgsql as $$
declare
  v_caja app.caja;
  v_id bigint;
  v_ix text;
begin
  perform app.fn_dinero_escribir();
  perform app.fn_exigir_permiso(p_usuario_id, 'caja.operar');
  if p_fondo_inicial is null or p_fondo_inicial < 0 or p_fondo_inicial <> round(p_fondo_inicial, 2) or p_fondo_inicial >= 10000000000 then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'fondo_inicial'));
  end if;
  select * into v_caja from app.caja k where k.id = p_caja_id for update;
  if not found or not v_caja.activa or v_caja.sucursal_id is distinct from (select u.sucursal_id from app.usuario u where u.id = p_usuario_id) then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('caja_id', p_caja_id));
  end if;
  if app.fn_turno_abierto(p_usuario_id) is not null then
    perform app.fn_fallar('TURNO_YA_ABIERTO', jsonb_build_object('turno_id', app.fn_turno_abierto(p_usuario_id)));
  end if;
  if exists (select 1 from app.turno_caja t where t.caja_id = p_caja_id and t.estado = 'abierto') then
    perform app.fn_fallar('CAJA_OCUPADA', jsonb_build_object('caja_id', p_caja_id));
  end if;
  begin
    insert into app.turno_caja (tipo, caja_id, usuario_id, fondo_inicial)
    values ('mostrador', p_caja_id, p_usuario_id, p_fondo_inicial) returning id into v_id;
  exception when unique_violation then
    -- dos aperturas a la vez: el indice unico decide y el perdedor recibe el mismo error de negocio
    get stacked diagnostics v_ix = constraint_name;
    perform app.fn_fallar(case when v_ix = 'uq_turno_abierto_caja' then 'CAJA_OCUPADA' else 'TURNO_YA_ABIERTO' end, jsonb_build_object('caja_id', p_caja_id));
  end;
  return v_id;
end $$;

-- Gasto, entrada o retiro de un turno propio y abierto. Con clave es idempotente (gasto en ruta con mala señal, P5).
create function app.fn_movimiento_caja(p_usuario_id bigint, p_turno_id bigint, p_tipo text, p_monto numeric, p_motivo text,
                                       p_clave uuid default null, p_hash text default null)
returns table(movimiento_id bigint, repetida boolean)
language plpgsql as $$
declare
  v_t app.turno_caja;
  v_previa bigint;
  v_id bigint;
begin
  if p_tipo is null or p_tipo not in ('entrada','salida','retiro') then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'tipo'));
  end if;
  if p_clave is not null then
    perform pg_advisory_xact_lock(hashtext(p_clave::text));
    v_previa := app.fn_idem_previa('movimiento_caja', p_clave, p_usuario_id, p_hash);
    if v_previa is not null then
      return query select v_previa, true;
      return;
    end if;
  end if;
  select * into v_t from app.turno_caja t where t.id = p_turno_id for update;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('turno_id', p_turno_id));
  end if;
  perform app.fn_exigir_permiso(p_usuario_id, case v_t.tipo when 'ruta' then 'rutas.operar' else 'caja.operar' end);
  if v_t.estado <> 'abierto' then
    perform app.fn_fallar('TURNO_NO_ABIERTO', jsonb_build_object('turno_id', p_turno_id));
  end if;
  if v_t.usuario_id <> p_usuario_id then
    perform app.fn_fallar('TURNO_AJENO', jsonb_build_object('turno_id', p_turno_id));
  end if;
  perform app.fn_monto_positivo(p_monto, 'monto');
  if nullif(trim(coalesce(p_motivo, '')), '') is null or length(p_motivo) > 200 then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'motivo'));
  end if;
  insert into app.movimiento_caja (turno_caja_id, tipo, monto, motivo, usuario_id, clave_idempotencia, hash_solicitud)
  values (p_turno_id, p_tipo, p_monto, trim(p_motivo), p_usuario_id, p_clave, p_hash) returning id into v_id;
  return query select v_id, false;
end $$;

-- Unica regla del efectivo esperado y del resumen de un turno (mostrador o ruta):
--   esperado = fondo + efectivo de las ventas del turno (aunque se cancelaran despues) + abonos en efectivo del turno
--              (aunque se cancelaran) + entradas - salidas - retiros - reembolsos.
-- Los importes por metodo de `ventas` y `abonos` cuentan tambien lo cancelado (el reembolso ya esta en `reembolsos`); `num` cuenta
-- las completadas y `canceladas` las demas. Un turno cerrado devuelve lo congelado al cerrar.
create function app.fn_resumen_turno(p_turno_id bigint) returns jsonb
language plpgsql stable as $$
declare
  v_t app.turno_caja;
  v_r jsonb;
  v_esperado numeric;
begin
  select * into v_t from app.turno_caja t where t.id = p_turno_id;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('turno_id', p_turno_id));
  end if;
  with vp as (
    select p.metodo, sum(p.monto) as monto
    from app.venta v join app.venta_pago p on p.venta_id = v.id where v.turno_caja_id = p_turno_id group by p.metodo
  ), ab as (
    select a.metodo, sum(a.monto) as monto from app.abono a where a.turno_caja_id = p_turno_id group by a.metodo
  ), mv as (
    select m.tipo, sum(m.monto) as monto from app.movimiento_caja m where m.turno_caja_id = p_turno_id group by m.tipo
  ), v as (
    select count(*) filter (where estado = 'completada')::integer as num, count(*) filter (where estado = 'cancelada')::integer as canceladas
    from app.venta where turno_caja_id = p_turno_id
  ), x as (
    select coalesce((select monto from vp where metodo = 'efectivo'), 0)::numeric(12,2) as v_efectivo,
           coalesce((select monto from vp where metodo = 'transferencia'), 0)::numeric(12,2) as v_transferencia,
           coalesce((select monto from vp where metodo = 'tarjeta'), 0)::numeric(12,2) as v_tarjeta,
           coalesce((select monto from vp where metodo = 'credito'), 0)::numeric(12,2) as v_credito,
           coalesce((select monto from ab where metodo = 'efectivo'), 0)::numeric(12,2) as a_efectivo,
           coalesce((select monto from ab where metodo = 'transferencia'), 0)::numeric(12,2) as a_transferencia,
           coalesce((select monto from ab where metodo = 'tarjeta'), 0)::numeric(12,2) as a_tarjeta,
           coalesce((select monto from mv where tipo = 'entrada'), 0)::numeric(12,2) as entradas,
           coalesce((select monto from mv where tipo = 'salida'), 0)::numeric(12,2) as salidas,
           coalesce((select monto from mv where tipo = 'retiro'), 0)::numeric(12,2) as retiros,
           coalesce((select monto from mv where tipo = 'reembolso'), 0)::numeric(12,2) as reembolsos
  )
  select jsonb_build_object(
           'tipo', v_t.tipo, 'turno_id', v_t.id, 'estado', v_t.estado, 'fondo_inicial', v_t.fondo_inicial::text,
           'ventas', jsonb_build_object('num', v.num, 'canceladas', v.canceladas, 'efectivo', x.v_efectivo::text,
                                        'transferencia', x.v_transferencia::text, 'tarjeta', x.v_tarjeta::text, 'credito', x.v_credito::text),
           'abonos', jsonb_build_object('efectivo', x.a_efectivo::text, 'transferencia', x.a_transferencia::text, 'tarjeta', x.a_tarjeta::text),
           'entradas', x.entradas::text, 'salidas', x.salidas::text, 'retiros', x.retiros::text, 'reembolsos', x.reembolsos::text),
         v_t.fondo_inicial + x.v_efectivo + x.a_efectivo + x.entradas - x.salidas - x.retiros - x.reembolsos
    into v_r, v_esperado
  from v, x;
  v_r := v_r || jsonb_build_object(
    'efectivo_esperado', (case when v_t.estado = 'cerrado' then v_t.efectivo_esperado else v_esperado end)::text,
    'efectivo_contado', v_t.efectivo_contado::text,
    'diferencia', v_t.diferencia::text);
  if v_t.tipo = 'ruta' then
    v_r := v_r || jsonb_build_object(
      'transferencias', coalesce((
        select jsonb_agg(jsonb_build_object('tabla', t.tabla, 'id', t.id, 'folio', t.folio, 'cliente', cl.nombre, 'monto', t.monto::text,
                 'referencia', t.referencia, 'comprobante', t.comprobante, 'verificado', t.verificado_en is not null) order by t.creado_en, t.id)
        from app.v_transferencia t left join app.cliente cl on cl.id = t.cliente_id
        where t.turno_caja_id = p_turno_id), '[]'::jsonb),
      'devoluciones_producto', coalesce((
        select jsonb_agg(jsonb_build_object('producto', d.producto, 'piezas', d.piezas) order by d.producto)
        from (
          -- lo que debe regresar en la camioneta: cargado - entregado + lo que recibio devuelto en las visitas
          select pr.nombre as producto, (coalesce(c.piezas, 0) - coalesce(e.piezas, 0) + coalesce(dv.piezas, 0))::integer as piezas
          from (select l.producto_id, sum(l.piezas) as piezas
                from app.pedido p join app.pedido_linea l on l.pedido_id = p.id and l.estado = 'activa'
                where p.ruta_id = v_t.ruta_id group by l.producto_id) c
          left join (select vl.producto_id, sum(vl.piezas) as piezas
                     from app.venta v3 join app.venta_linea vl on vl.venta_id = v3.id
                     where v3.turno_caja_id = p_turno_id and v3.estado = 'completada' group by vl.producto_id) e on e.producto_id = c.producto_id
          full join (select dl.producto_id, sum(dl.piezas) as piezas
                     from app.devolucion d2 join app.devolucion_linea dl on dl.devolucion_id = d2.id
                     where d2.turno_caja_id = p_turno_id group by dl.producto_id) dv on dv.producto_id = c.producto_id
          join app.producto pr on pr.id = coalesce(c.producto_id, dv.producto_id)
          where coalesce(c.piezas, 0) - coalesce(e.piezas, 0) + coalesce(dv.piezas, 0) > 0
        ) d), '[]'::jsonb));
  end if;
  return v_r;
end $$;

-- Cierra un turno propio de mostrador (o el de otro con caja.supervisar) y congela esperado, contado y diferencia.
-- La ruta se cierra con fn_liquidar_ruta (misma logica interna: fn_cerrar_turno_interno).
create function app.fn_cerrar_turno_interno(p_turno_id bigint, p_cerrado_por bigint, p_efectivo_contado numeric, p_notas text) returns jsonb
language plpgsql as $$
declare
  v_esperado numeric;
begin
  perform app.fn_dinero_escribir();
  if length(coalesce(p_notas, '')) > 500 then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'notas'));
  end if;
  v_esperado := ((app.fn_resumen_turno(p_turno_id)) ->> 'efectivo_esperado')::numeric;
  update app.turno_caja t
  set estado = 'cerrado', cerrado_en = now(), cerrado_por = p_cerrado_por, efectivo_esperado = v_esperado,
      efectivo_contado = p_efectivo_contado, diferencia = p_efectivo_contado - v_esperado, notas_cierre = nullif(trim(coalesce(p_notas, '')), '')
  where t.id = p_turno_id;
  return app.fn_resumen_turno(p_turno_id);
end $$;

create function app.fn_cerrar_turno(p_usuario_id bigint, p_turno_id bigint, p_efectivo_contado numeric, p_notas text) returns jsonb
language plpgsql as $$
declare
  v_t app.turno_caja;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'caja.operar');
  if p_efectivo_contado is null or p_efectivo_contado < 0 or p_efectivo_contado <> round(p_efectivo_contado, 2) or p_efectivo_contado >= 10000000000 then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'efectivo_contado'));
  end if;
  select * into v_t from app.turno_caja t where t.id = p_turno_id for update;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('turno_id', p_turno_id));
  end if;
  if v_t.tipo <> 'mostrador' then
    perform app.fn_fallar('TURNO_NO_VALIDO', jsonb_build_object('turno_id', p_turno_id, 'tipo', v_t.tipo));
  end if;
  if v_t.estado <> 'abierto' then
    perform app.fn_fallar('TURNO_NO_ABIERTO', jsonb_build_object('turno_id', p_turno_id));
  end if;
  if v_t.usuario_id <> p_usuario_id and not app.fn_tiene_permiso(p_usuario_id, 'caja.supervisar') then
    perform app.fn_fallar('TURNO_AJENO', jsonb_build_object('turno_id', p_turno_id));
  end if;
  return app.fn_cerrar_turno_interno(p_turno_id, p_usuario_id, p_efectivo_contado, p_notas);
end $$;

-- ---------------------------------------------------------------- iniciar y terminar ruta (rehechas, misma firma que 007)

-- 007 + turno de ruta del repartidor con el fondo. Ruta ya en_curso: devuelve su turno sin tocar nada (P5).
create or replace function app.fn_iniciar_ruta(p_usuario_id bigint, p_ruta_id bigint, p_fondo_inicial numeric default 0) returns bigint
language plpgsql as $$
declare
  v_r app.ruta;
  v_n integer;
  v_turno bigint;
begin
  perform app.fn_dinero_escribir();
  v_r := app.fn_ruta_bloquear(p_usuario_id, p_ruta_id);
  perform app.fn_ruta_exigir_operar(p_usuario_id, v_r);
  if v_r.estado = 'en_curso' and v_r.turno_caja_id is not null then
    return v_r.turno_caja_id;
  end if;
  if v_r.estado <> 'cargada' then
    perform app.fn_fallar('ESTADO_NO_VALIDO', jsonb_build_object('ruta_id', p_ruta_id, 'estado', v_r.estado));
  end if;
  if exists (select 1 from app.ruta r where r.repartidor_id = v_r.repartidor_id and r.estado = 'en_curso' and r.id <> p_ruta_id) then
    perform app.fn_fallar('ESTADO_NO_VALIDO', jsonb_build_object('ruta_id', p_ruta_id, 'motivo', 'otra_ruta_en_curso'));
  end if;
  if p_fondo_inicial is null or p_fondo_inicial < 0 or p_fondo_inicial <> round(p_fondo_inicial, 2) or p_fondo_inicial >= 10000000000 then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'fondo_inicial'));
  end if;
  if app.fn_turno_abierto(v_r.repartidor_id) is not null then
    perform app.fn_fallar('TURNO_YA_ABIERTO', jsonb_build_object('turno_id', app.fn_turno_abierto(v_r.repartidor_id)));
  end if;
  -- El fondo se lleva solo en el turno de la ruta: no sale del cajon del mostrador. La liquidacion espera fondo + cobros - gastos de regreso.
  begin
    insert into app.turno_caja (tipo, ruta_id, usuario_id, fondo_inicial)
    values ('ruta', p_ruta_id, v_r.repartidor_id, p_fondo_inicial) returning id into v_turno;
  exception when unique_violation then
    perform app.fn_fallar('TURNO_YA_ABIERTO', jsonb_build_object('ruta_id', p_ruta_id));
  end;
  perform 1 from app.pedido p where p.ruta_id = p_ruta_id order by p.id for update;
  select count(*)::int into v_n from app.ruta_parada pa where pa.ruta_id = p_ruta_id;
  update app.ruta r set estado = 'en_curso', iniciada_en = now(), turno_caja_id = v_turno where r.id = p_ruta_id;
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
  return v_turno;
end $$;

-- 007 + idempotente: ruta ya terminada o liquidada no hace nada (P5). Las paradas de cobro pendientes pasan a omitida.
create or replace function app.fn_terminar_ruta(p_usuario_id bigint, p_ruta_id bigint) returns void
language plpgsql as $$
declare
  v_r app.ruta;
  v_pedido bigint;
begin
  v_r := app.fn_ruta_bloquear(p_usuario_id, p_ruta_id);
  perform app.fn_ruta_exigir_operar(p_usuario_id, v_r);
  if v_r.estado in ('terminada','liquidada') then
    return;
  end if;
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

-- ---------------------------------------------------------------- venta

-- §2.8.1. Sin p_pedido_id: venta de mostrador (turno de mostrador propio). Con p_pedido_id solo la llama fn_entregar_pedido: las lineas
-- son [{pedido_linea_id, cantidad}] con el precio del pedido, el cliente y la lista son los del pedido y el turno es el que dejo
-- fijado la entrega (app.turno_entrega).
create function app.fn_registrar_venta(p_usuario_id bigint, p_datos jsonb, p_hash text, p_pedido_id bigint default null)
returns table(venta_id bigint, repetida boolean)
language plpgsql as $$
declare
  v_clave uuid;
  v_previa bigint;
  v_turno app.turno_caja;
  v_turno_id bigint;
  v_sucursal bigint;
  v_cliente app.cliente;
  v_cliente_id bigint;
  v_lista bigint;
  v_lista_toca bigint;
  v_lineas jsonb;
  v_calc jsonb;
  v_lim record;
  v_venta bigint;
  v_folio text;
  v_total numeric := 0;
  v_credito numeric := 0;
  v_efectivo numeric := 0;
  v_recibido numeric;
  v_ped app.pedido;
  v_con_cargadas boolean := p_pedido_id is null;
  v_l record;
  v_dias integer;
begin
  perform app.fn_dinero_escribir();
  if jsonb_typeof(p_datos) is distinct from 'object' then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'datos'));
  end if;
  v_clave := app.fn_json_uuid(p_datos ->> 'clave_idempotencia', 'clave_idempotencia');
  perform pg_advisory_xact_lock(hashtext(v_clave::text));
  v_previa := app.fn_idem_previa('venta', v_clave, p_usuario_id, p_hash);
  if v_previa is not null then
    return query select v_previa, true;
    return;
  end if;

  -- turno
  if p_pedido_id is null then
    perform app.fn_exigir_permiso(p_usuario_id, 'ventas.crear');
    v_turno_id := app.fn_turno_abierto(p_usuario_id);
    if v_turno_id is null then
      perform app.fn_fallar('TURNO_NO_ABIERTO', '{}');
    end if;
  else
    if coalesce(current_setting('app.entregando_pedido', true), '') <> p_pedido_id::text then
      perform app.fn_fallar('ESTADO_NO_VALIDO', jsonb_build_object('pedido_id', p_pedido_id, 'motivo', 'solo_entregando'));
    end if;
    v_turno_id := nullif(current_setting('app.turno_entrega', true), '')::bigint;
  end if;
  select * into v_turno from app.turno_caja t where t.id = v_turno_id for update;
  if not found or v_turno.estado <> 'abierto' then
    perform app.fn_fallar('TURNO_NO_ABIERTO', '{}');
  end if;
  if p_pedido_id is null and v_turno.tipo <> 'mostrador' then
    perform app.fn_fallar('TURNO_NO_VALIDO', jsonb_build_object('turno_id', v_turno.id, 'tipo', v_turno.tipo));
  end if;
  v_sucursal := coalesce((select k.sucursal_id from app.caja k where k.id = v_turno.caja_id),
                         (select r.sucursal_id from app.ruta r where r.id = v_turno.ruta_id));

  -- cliente y lista
  if p_pedido_id is not null then
    select * into v_ped from app.pedido p where p.id = p_pedido_id;
    v_con_cargadas := v_ped.ruta_id is null; -- recoge en bodega: tampoco sale lo que va en una camioneta
    v_cliente_id := v_ped.cliente_id;
    v_lista := v_ped.lista_precio_id;
  else
    v_cliente_id := case when nullif(p_datos ->> 'cliente_id', '') is null then null else app.fn_json_id(p_datos ->> 'cliente_id', 'cliente_id') end;
    v_lista := case when nullif(p_datos ->> 'lista_precio_id', '') is null then null else app.fn_json_id(p_datos ->> 'lista_precio_id', 'lista_precio_id') end;
  end if;
  if v_cliente_id is not null then
    select * into v_cliente from app.cliente c where c.id = v_cliente_id for update;
    if not found then
      perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('cliente_id', v_cliente_id));
    end if;
    if not v_cliente.activo and p_pedido_id is null then
      perform app.fn_fallar('CLIENTE_INACTIVO', jsonb_build_object('cliente_id', v_cliente_id));
    end if;
  end if;
  v_lista_toca := coalesce(v_cliente.lista_precio_id, (select l.id from app.lista_precio l where l.es_predeterminada));
  if p_pedido_id is null then
    v_lista := coalesce(v_lista, v_lista_toca);
    if v_lista is distinct from v_lista_toca then
      if not exists (select 1 from app.lista_precio l where l.id = v_lista) then
        perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'lista_precio_id'));
      end if;
      if not app.fn_tiene_permiso(p_usuario_id, 'ventas.cambiar_precio') then
        perform app.fn_fallar('SIN_PERMISO_PRECIO', jsonb_build_object('permiso', 'ventas.cambiar_precio'));
      end if;
    end if;
  end if;

  -- lineas: se normalizan en una tabla temporal de la transaccion (orden de captura = numero)
  v_lineas := p_datos -> 'lineas';
  if v_lineas is null or jsonb_typeof(v_lineas) <> 'array' or jsonb_array_length(v_lineas) = 0 then
    perform app.fn_fallar('VENTA_VACIA', '{}');
  end if;
  if jsonb_array_length(v_lineas) > 200 then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'lineas'));
  end if;
  create temporary table if not exists pg_temp.venta_trab (
    numero smallint, presentacion_id bigint, producto_id bigint, factor integer, cantidad integer,
    precio_lista numeric, precio_unitario numeric, importe numeric, costo_unitario numeric, piezas integer
  ) on commit drop;
  delete from pg_temp.venta_trab;

  for v_l in select e.valor, e.ord from jsonb_array_elements(v_lineas) with ordinality as e(valor, ord) loop
    declare
      v_cant integer := app.fn_json_entero(v_l.valor ->> 'cantidad', 'cantidad');
      v_pres app.presentacion;
      v_pl app.pedido_linea;
      v_lista_p numeric;
      v_precio numeric;
    begin
      if v_cant <= 0 or v_cant > 1000000 then
        perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'cantidad'));
      end if;
      if p_pedido_id is not null then
        select * into v_pl from app.pedido_linea pl
        where pl.id = app.fn_json_id(v_l.valor ->> 'pedido_linea_id', 'pedido_linea_id') and pl.pedido_id = p_pedido_id and pl.estado = 'activa';
        if not found or v_cant > v_pl.cantidad then
          perform app.fn_fallar('LINEA_NO_VALIDA', jsonb_build_object('pedido_linea_id', v_l.valor ->> 'pedido_linea_id'));
        end if;
        insert into pg_temp.venta_trab (numero, presentacion_id, producto_id, factor, cantidad, precio_lista, precio_unitario)
        values (v_l.ord, v_pl.presentacion_id, v_pl.producto_id, v_pl.factor, v_cant, v_pl.precio_lista, v_pl.precio_unitario);
      else
        select * into v_pres from app.presentacion pz
        where pz.id = app.fn_json_id(v_l.valor ->> 'presentacion_id', 'presentacion_id');
        if not found or not v_pres.activa or not v_pres.se_vende
           or not exists (select 1 from app.producto pr where pr.id = v_pres.producto_id and pr.activo) then
          perform app.fn_fallar('PRESENTACION_NO_VALIDA', jsonb_build_object('presentacion_id', v_l.valor ->> 'presentacion_id'));
        end if;
        v_lista_p := app.fn_precio(v_pres.id, v_lista);
        if v_lista_p is null then
          perform app.fn_fallar('PRECIO_NO_DEFINIDO', jsonb_build_object('presentacion_id', v_pres.id));
        end if;
        v_precio := case when nullif(v_l.valor ->> 'precio_unitario', '') is null then v_lista_p
                         else app.fn_json_dinero(v_l.valor ->> 'precio_unitario', 'precio_unitario') end;
        if v_precio <> v_lista_p and not app.fn_tiene_permiso(p_usuario_id, 'ventas.cambiar_precio') then
          perform app.fn_fallar('SIN_PERMISO_PRECIO', jsonb_build_object('permiso', 'ventas.cambiar_precio'));
        end if;
        insert into pg_temp.venta_trab (numero, presentacion_id, producto_id, factor, cantidad, precio_lista, precio_unitario)
        values (v_l.ord, v_pres.id, v_pres.producto_id, v_pres.factor, v_cant, v_lista_p, v_precio);
      end if;
    end;
  end loop;
  update pg_temp.venta_trab set importe = app.fn_importe_linea(cantidad, precio_unitario), piezas = cantidad * factor;
  if exists (select 1 from pg_temp.venta_trab t where t.importe >= 10000000000) then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'lineas', 'motivo', 'importe'));
  end if;

  -- existencias: candado comun (producto_id ascendente) antes de leer lo disponible y los costos
  perform app.fn_bloquear_existencias(v_sucursal, array(select distinct t.producto_id from pg_temp.venta_trab t order by 1));
  if v_con_cargadas then
    -- no se vende lo que va en una camioneta: piezas <= existencia - cargadas
    for v_l in
      select t.producto_id, sum(t.piezas)::integer as piezas,
             coalesce(e.cantidad, 0) - coalesce(c.cargadas, 0) as disponible, coalesce(c.cargadas, 0) as comprometido
      from pg_temp.venta_trab t
      left join app.existencia e on e.sucursal_id = v_sucursal and e.producto_id = t.producto_id
      left join app.v_comprometido c on c.sucursal_id = v_sucursal and c.producto_id = t.producto_id
      group by t.producto_id, e.cantidad, c.cargadas order by t.producto_id
    loop
      if v_l.piezas > v_l.disponible then
        perform app.fn_fallar('STOCK_INSUFICIENTE', jsonb_build_object('producto_id', v_l.producto_id, 'disponible', v_l.disponible,
                                                                        'comprometido', v_l.comprometido, 'solicitado', v_l.piezas));
      end if;
    end loop;
  end if;
  update pg_temp.venta_trab t set costo_unitario = e.costo_promedio
  from app.existencia e where e.sucursal_id = v_sucursal and e.producto_id = t.producto_id;
  update pg_temp.venta_trab set costo_unitario = 0 where costo_unitario is null;
  select coalesce(sum(importe), 0) into v_total from pg_temp.venta_trab;
  if v_total >= 10000000000 or length(coalesce(p_datos ->> 'notas', '')) > 500 then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', case when v_total >= 10000000000 then 'lineas' else 'notas' end));
  end if;

  -- pagos y credito (antes de escribir nada): las mismas funciones que usa la vista previa de /cobrar
  v_calc := app.fn_calcular_pagos(v_total, p_datos -> 'pagos', p_datos ->> 'efectivo_recibido', false);
  v_efectivo := (v_calc ->> 'efectivo')::numeric;
  v_credito := (v_calc ->> 'credito')::numeric;
  v_recibido := (v_calc ->> 'recibido')::numeric;
  if v_credito > 0 then
    if v_cliente_id is null then
      perform app.fn_fallar('CREDITO_SIN_CLIENTE', '{}');
    end if;
    if not app.fn_tiene_permiso(p_usuario_id, 'ventas.credito') then
      perform app.fn_fallar('SIN_PERMISO', jsonb_build_object('permiso', 'ventas.credito'));
    end if;
    select * into v_lim from app.fn_credito_cliente(v_cliente_id, v_credito);
    if v_lim.excede then
      perform app.fn_fallar('LIMITE_CREDITO_EXCEDIDO', jsonb_build_object('limite', v_lim.limite::text, 'saldo', v_lim.saldo::text, 'disponible', v_lim.disponible::text));
    end if;
  end if;

  -- escritura
  v_folio := app.fn_siguiente_folio(v_sucursal, 'V');
  insert into app.venta (sucursal_id, folio, origen, pedido_id, turno_caja_id, cliente_id, lista_precio_id, usuario_id, total,
                         efectivo_recibido, cambio, notas, clave_idempotencia, hash_solicitud)
  values (v_sucursal, v_folio, case when p_pedido_id is null then 'mostrador' else 'pedido' end, p_pedido_id, v_turno.id, v_cliente_id,
          v_lista, p_usuario_id, v_total, v_recibido, case when v_efectivo > 0 then v_recibido - v_efectivo end,
          nullif(trim(coalesce(p_datos ->> 'notas', '')), ''), v_clave, p_hash)
  returning id into v_venta;
  insert into app.venta_linea (venta_id, numero, presentacion_id, producto_id, factor, cantidad, precio_lista, precio_unitario, importe,
                               costo_unitario, costo_total)
  select v_venta, t.numero, t.presentacion_id, t.producto_id, t.factor, t.cantidad, t.precio_lista, t.precio_unitario, t.importe,
         round(t.costo_unitario, 6), round(round(t.costo_unitario, 6) * t.piezas, 2)
  from pg_temp.venta_trab t order by t.numero;
  -- un movimiento por linea, en orden de producto
  insert into app.movimiento_inventario (sucursal_id, producto_id, tipo, cantidad, costo_unitario, referencia_tabla, referencia_id, usuario_id)
  select v_sucursal, vl.producto_id, 'venta', -vl.piezas, vl.costo_unitario, 'venta_linea', vl.id, p_usuario_id
  from app.venta_linea vl where vl.venta_id = v_venta order by vl.producto_id, vl.numero;
  insert into app.venta_pago (venta_id, metodo, monto, referencia, comprobante)
  select v_venta, x.valor ->> 'metodo', (x.valor ->> 'monto')::numeric, x.valor ->> 'referencia', x.valor ->> 'comprobante'
  from jsonb_array_elements(v_calc -> 'pagos') with ordinality as x(valor, ord) order by x.ord;
  if v_credito > 0 then
    v_dias := v_cliente.dias_credito;
    insert into app.cuenta_por_cobrar (cliente_id, origen, venta_id, monto, saldo, vence_el, creado_por)
    values (v_cliente_id, 'venta', v_venta, v_credito, v_credito, app.fn_fecha_local(now()) + v_dias, p_usuario_id);
  end if;
  return query select v_venta, false;
end $$;

-- ---------------------------------------------------------------- entregar un pedido (§2.8.2)

-- p_datos: {clave_idempotencia, lineas:[{pedido_linea_id, cantidad_entregada}], pagos, efectivo_recibido?, notas?, recibio?, foto_entrega?}
-- Lineas omitidas = se entrego completo. Orden de candados: ruta -> turno -> pedido -> lineas -> (venta, cliente, existencias).
create function app.fn_entregar_pedido(p_usuario_id bigint, p_pedido_id bigint, p_datos jsonb, p_hash text)
returns table(venta_id bigint, repetida boolean)
language plpgsql as $$
declare
  v_clave uuid;
  v_previa bigint;
  v_pre app.pedido;
  v_ped app.pedido;
  v_ruta app.ruta;
  v_turno app.turno_caja;
  v_entradas jsonb;
  v_lin jsonb;
  v_recibio text;
  v_foto text;
  v_venta bigint;
  v_total numeric;
  v_pagado numeric;
  v_dif jsonb;
  v_version integer;
begin
  if jsonb_typeof(p_datos) is distinct from 'object' then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'datos'));
  end if;
  v_clave := app.fn_json_uuid(p_datos ->> 'clave_idempotencia', 'clave_idempotencia');
  perform pg_advisory_xact_lock(hashtext(v_clave::text));
  v_previa := app.fn_idem_previa('venta', v_clave, p_usuario_id, p_hash);
  if v_previa is not null then
    if (select v.pedido_id from app.venta v where v.id = v_previa) is distinct from p_pedido_id then
      perform app.fn_fallar('IDEMPOTENCIA_CONFLICTO', jsonb_build_object('venta_id', v_previa));
    end if;
    return query select v_previa, true;
    return;
  end if;

  v_recibio := nullif(trim(coalesce(p_datos ->> 'recibio', '')), '');
  if length(v_recibio) > 80 then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'recibio'));
  end if;
  v_foto := nullif(p_datos ->> 'foto_entrega', '');
  if v_foto is not null and v_foto !~ '^[0-9a-f]{64}\.(jpg|png|webp)$' then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'foto_entrega'));
  end if;
  v_entradas := case when jsonb_typeof(p_datos -> 'lineas') = 'array' then p_datos -> 'lineas'
                     when p_datos -> 'lineas' is null or jsonb_typeof(p_datos -> 'lineas') = 'null' then '[]'::jsonb end;
  if v_entradas is null then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'lineas'));
  end if;

  -- 1. ruta y turno (el pedido se lee sin candado solo para saber de que ruta es)
  select * into v_pre from app.pedido p where p.id = p_pedido_id;
  if not found or v_pre.sucursal_id is distinct from (select u.sucursal_id from app.usuario u where u.id = p_usuario_id) then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('pedido_id', p_pedido_id));
  end if;
  if v_pre.ruta_id is not null then
    v_ruta := app.fn_ruta_bloquear(p_usuario_id, v_pre.ruta_id);
    perform app.fn_ruta_exigir_repartidor(p_usuario_id, v_ruta);
    if v_ruta.estado <> 'en_curso' then
      perform app.fn_fallar('ESTADO_NO_VALIDO', jsonb_build_object('pedido_id', p_pedido_id, 'ruta_estado', v_ruta.estado));
    end if;
    select * into v_turno from app.turno_caja t where t.id = v_ruta.turno_caja_id for update;
  else
    if v_pre.entrega_tipo <> 'recoge' then
      perform app.fn_fallar('ESTADO_NO_VALIDO', jsonb_build_object('pedido_id', p_pedido_id, 'estado', v_pre.estado));
    end if;
    perform app.fn_exigir_permiso(p_usuario_id, 'ventas.crear');
    if app.fn_turno_abierto(p_usuario_id) is null then
      perform app.fn_fallar('TURNO_NO_ABIERTO', '{}');
    end if;
    select * into v_turno from app.turno_caja t where t.id = app.fn_turno_abierto(p_usuario_id) for update;
    if found and v_turno.tipo <> 'mostrador' then
      perform app.fn_fallar('TURNO_NO_VALIDO', jsonb_build_object('turno_id', v_turno.id, 'tipo', v_turno.tipo));
    end if;
  end if;
  if not found or v_turno.estado <> 'abierto' then
    perform app.fn_fallar('TURNO_NO_ABIERTO', '{}');
  end if;

  -- 2. pedido y lineas
  select * into v_ped from app.pedido p where p.id = p_pedido_id for update;
  if v_ped.ruta_id is distinct from v_pre.ruta_id
     or v_ped.estado is distinct from (case when v_ped.ruta_id is not null then 'en_ruta' else 'confirmado' end) then
    perform app.fn_fallar('ESTADO_NO_VALIDO', jsonb_build_object('pedido_id', p_pedido_id, 'estado', v_ped.estado));
  end if;
  perform 1 from app.pedido_linea l where l.pedido_id = p_pedido_id order by l.id for update;

  -- 3. lo entregado por linea (omitida = completa; todo en 0 = ENTREGA_VACIA)
  create temporary table if not exists pg_temp.entrega_trab (linea_id bigint, cantidad integer, entregada integer) on commit drop;
  delete from pg_temp.entrega_trab;
  insert into pg_temp.entrega_trab (linea_id, cantidad, entregada) select e.linea_id, e.cantidad, e.entregada from app.fn_entrega_lineas(p_pedido_id, v_entradas) e;

  -- 4. la venta (solo se llama desde aqui: las banderas lo comprueban)
  select jsonb_agg(jsonb_build_object('pedido_linea_id', t.linea_id, 'cantidad', t.entregada) order by t.linea_id)
    into v_lin from pg_temp.entrega_trab t where t.entregada > 0;
  perform set_config('app.entregando_pedido', p_pedido_id::text, true);
  perform set_config('app.turno_entrega', v_turno.id::text, true);
  select r.venta_id into v_venta from app.fn_registrar_venta(
    p_usuario_id,
    jsonb_strip_nulls(jsonb_build_object('clave_idempotencia', v_clave, 'lineas', v_lin, 'pagos', p_datos -> 'pagos',
                                         'efectivo_recibido', p_datos -> 'efectivo_recibido', 'notas', p_datos -> 'notas')),
    p_hash, p_pedido_id) r;
  perform set_config('app.entregando_pedido', '', true);
  perform set_config('app.turno_entrega', '', true);

  -- 5. el pedido
  update app.pedido_linea l set cantidad_entregada = t.entregada
  from pg_temp.entrega_trab t where l.id = t.linea_id;
  select jsonb_agg(jsonb_build_object('pedido_linea_id', t.linea_id, 'cantidad', t.cantidad, 'entregada', t.entregada) order by t.linea_id)
    into v_dif from pg_temp.entrega_trab t where t.entregada < t.cantidad;
  update app.pedido p
  set estado = 'entregado', venta_id = v_venta, entregado_en = now(), version = p.version + 1, actualizado_en = now(),
      recibio = v_recibio, foto_entrega = v_foto
  where p.id = p_pedido_id
  returning p.version into v_version;
  update app.cliente c set ya_compro = true where c.id = v_ped.cliente_id and not c.ya_compro;
  update app.ruta_parada pa set estado = 'visitada', visitada_en = now() where pa.pedido_id = p_pedido_id and pa.ruta_id = v_ped.ruta_id;
  perform app.fn_pedido_evento(p_pedido_id, 'entregado', p_usuario_id,
    jsonb_build_object('venta_id', v_venta, 'parcial', v_dif is not null, 'diferencias', coalesce(v_dif, '[]'::jsonb)));
  select v.total into v_total from app.venta v where v.id = v_venta;
  select coalesce(sum(pg.monto), 0) into v_pagado from app.venta_pago pg where pg.venta_id = v_venta and pg.metodo <> 'credito';
  perform app.fn_aviso_cliente(v_ped.cliente_id, p_pedido_id, 'wa_nota_entrega',
    'wa_nota_entrega:p' || p_pedido_id || ':v' || v_version || coalesce(':r' || v_ped.ruta_id, ''),
    jsonb_build_object('cliente', (select c.nombre from app.cliente c where c.id = v_ped.cliente_id), 'folio', v_ped.folio,
                       'total', v_total::text, 'pagado', v_pagado::text,
                       'saldo', (select s.saldo::text from app.v_saldo_cliente s where s.cliente_id = v_ped.cliente_id)));
  return query select v_venta, false;
end $$;

-- ---------------------------------------------------------------- cancelar venta y devoluciones

-- Solo el Dueño. Devuelve {reembolso_efectivo, reembolso_otros} (otros = transferencia y tarjeta; el credito solo se cancela).
-- Orden: turno de quien cancela -> pedido -> lineas -> venta -> cliente -> existencias -> CxC.
create function app.fn_cancelar_venta(p_usuario_id bigint, p_venta_id bigint, p_motivo text) returns jsonb
language plpgsql as $$
declare
  v_v app.venta;
  v_turno bigint;
  v_t app.turno_caja;
  v_ef numeric;
  v_otros numeric;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  perform app.fn_dinero_escribir();
  perform app.fn_exigir_permiso(p_usuario_id, 'ventas.cancelar');
  if v_motivo is null or length(v_motivo) > 200 then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'motivo'));
  end if;
  select * into v_v from app.venta v where v.id = p_venta_id;
  if not found or v_v.sucursal_id is distinct from (select u.sucursal_id from app.usuario u where u.id = p_usuario_id) then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('venta_id', p_venta_id));
  end if;
  v_turno := app.fn_turno_abierto(p_usuario_id);
  if v_turno is not null then
    -- candado del turno y relectura: un cierre que corria a la vez ya lo dejo cerrado
    select * into v_t from app.turno_caja t where t.id = v_turno for update;
    if not found or v_t.estado <> 'abierto' then
      perform app.fn_fallar('TURNO_NO_ABIERTO', jsonb_build_object('turno_id', v_turno));
    end if;
  end if;
  if v_v.pedido_id is not null then
    perform 1 from app.pedido p where p.id = v_v.pedido_id for update;
    perform 1 from app.pedido_linea l where l.pedido_id = v_v.pedido_id order by l.id for update;
  end if;
  select * into v_v from app.venta v where v.id = p_venta_id for update;
  if v_v.estado = 'cancelada' then
    perform app.fn_fallar('VENTA_YA_CANCELADA', jsonb_build_object('venta_id', p_venta_id));
  end if;
  if exists (select 1 from app.devolucion d where d.venta_id = p_venta_id) then
    perform app.fn_fallar('VENTA_CON_DEVOLUCIONES', jsonb_build_object('venta_id', p_venta_id));
  end if;
  if v_v.cliente_id is not null then
    perform 1 from app.cliente c where c.id = v_v.cliente_id for update;
  end if;
  perform app.fn_bloquear_existencias(v_v.sucursal_id, array(select distinct vl.producto_id from app.venta_linea vl where vl.venta_id = p_venta_id order by 1));
  perform 1 from app.cuenta_por_cobrar x where x.venta_id = p_venta_id order by x.id for update;
  if exists (select 1 from app.cuenta_por_cobrar x where x.venta_id = p_venta_id and x.saldo < x.monto) then
    perform app.fn_fallar('VENTA_CON_ABONOS', jsonb_build_object('venta_id', p_venta_id));
  end if;
  select coalesce(sum(pg.monto) filter (where pg.metodo = 'efectivo'), 0), coalesce(sum(pg.monto) filter (where pg.metodo in ('transferencia','tarjeta')), 0)
    into v_ef, v_otros from app.venta_pago pg where pg.venta_id = p_venta_id;
  if v_ef > 0 and v_turno is null then
    perform app.fn_fallar('TURNO_NO_ABIERTO', '{}');
  end if;

  insert into app.movimiento_inventario (sucursal_id, producto_id, tipo, cantidad, costo_unitario, referencia_tabla, referencia_id, usuario_id, motivo)
  select v_v.sucursal_id, vl.producto_id, 'cancelacion_venta', vl.piezas, vl.costo_unitario, 'venta_linea', vl.id, p_usuario_id, v_motivo
  from app.venta_linea vl where vl.venta_id = p_venta_id order by vl.producto_id, vl.numero;
  update app.cuenta_por_cobrar x set estado = 'cancelada', saldo = 0 where x.venta_id = p_venta_id and x.estado = 'pendiente';
  update app.venta v set estado = 'cancelada', cancelada_en = now(), cancelada_por = p_usuario_id, motivo_cancelacion = v_motivo where v.id = p_venta_id;
  if v_ef > 0 then
    insert into app.movimiento_caja (turno_caja_id, tipo, monto, motivo, referencia_tabla, referencia_id, usuario_id)
    values (v_turno, 'reembolso', v_ef, v_motivo, 'venta', p_venta_id, p_usuario_id);
  end if;
  if v_v.pedido_id is not null then
    update app.pedido p set estado = 'cancelado', cancelado_en = now(), cancelado_por = p_usuario_id, motivo = v_motivo,
                            version = p.version + 1, actualizado_en = now()
    where p.id = v_v.pedido_id;
    perform app.fn_pedido_evento(v_v.pedido_id, 'cancelado', p_usuario_id, jsonb_build_object('motivo', v_motivo, 'venta_id', p_venta_id));
  end if;
  return jsonb_build_object('reembolso_efectivo', v_ef::numeric(12,2)::text, 'reembolso_otros', v_otros::numeric(12,2)::text);
end $$;

-- p_datos: {clave_idempotencia, motivo, lineas:[{venta_linea_id, piezas, regresa_a_inventario}]}.
-- Baja primero el saldo de la CxC de esa venta; el resto se reembolsa en efectivo del turno abierto de quien la recibe.
create function app.fn_registrar_devolucion(p_usuario_id bigint, p_venta_id bigint, p_datos jsonb, p_hash text)
returns table(devolucion_id bigint, repetida boolean)
language plpgsql as $$
declare
  v_clave uuid;
  v_previa bigint;
  v_v app.venta;
  v_turno bigint;
  v_t app.turno_caja;
  v_lineas jsonb;
  v_e record;
  v_vistos bigint[] := '{}';
  v_motivo text;
  v_total numeric;
  v_cxc app.cuenta_por_cobrar;
  v_abono numeric;
  v_reembolso numeric;
  v_dev bigint;
  v_dl record;
begin
  perform app.fn_dinero_escribir();
  perform app.fn_exigir_permiso(p_usuario_id, 'ventas.devolver');
  if jsonb_typeof(p_datos) is distinct from 'object' then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'datos'));
  end if;
  v_clave := app.fn_json_uuid(p_datos ->> 'clave_idempotencia', 'clave_idempotencia');
  perform pg_advisory_xact_lock(hashtext(v_clave::text));
  v_previa := app.fn_idem_previa('devolucion', v_clave, p_usuario_id, p_hash);
  if v_previa is not null then
    if (select d.venta_id from app.devolucion d where d.id = v_previa) is distinct from p_venta_id then
      perform app.fn_fallar('IDEMPOTENCIA_CONFLICTO', jsonb_build_object('devolucion_id', v_previa));
    end if;
    return query select v_previa, true;
    return;
  end if;
  v_motivo := nullif(trim(coalesce(p_datos ->> 'motivo', '')), '');
  if v_motivo is null or length(v_motivo) > 200 then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'motivo'));
  end if;
  v_lineas := p_datos -> 'lineas';
  if jsonb_typeof(v_lineas) is distinct from 'array' or jsonb_array_length(v_lineas) = 0 or jsonb_array_length(v_lineas) > 200 then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'lineas'));
  end if;
  for v_e in select x.valor from jsonb_array_elements(v_lineas) as x(valor) loop
    declare
      v_id bigint := app.fn_json_id(v_e.valor ->> 'venta_linea_id', 'venta_linea_id');
    begin
      if app.fn_json_entero(v_e.valor ->> 'piezas', 'piezas') <= 0 or v_id = any(v_vistos)
         or coalesce(v_e.valor ->> 'regresa_a_inventario', '') not in ('true', 'false') then
        perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'lineas'));
      end if;
      v_vistos := v_vistos || v_id;
    end;
  end loop;

  select * into v_v from app.venta v where v.id = p_venta_id;
  if not found or v_v.sucursal_id is distinct from (select u.sucursal_id from app.usuario u where u.id = p_usuario_id)
     or not app.fn_puede_ver_venta(p_usuario_id, p_venta_id) then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('venta_id', p_venta_id));
  end if;
  v_turno := app.fn_turno_abierto(p_usuario_id);
  if v_turno is not null then
    -- candado del turno y relectura: un cierre que corria a la vez ya lo dejo cerrado
    select * into v_t from app.turno_caja t where t.id = v_turno for update;
    if not found or v_t.estado <> 'abierto' then
      perform app.fn_fallar('TURNO_NO_ABIERTO', jsonb_build_object('turno_id', v_turno));
    end if;
  end if;
  select * into v_v from app.venta v where v.id = p_venta_id for update;
  if v_v.estado <> 'completada' then
    perform app.fn_fallar('VENTA_YA_CANCELADA', jsonb_build_object('venta_id', p_venta_id));
  end if;
  if v_v.cliente_id is not null then
    perform 1 from app.cliente c where c.id = v_v.cliente_id for update;
  end if;
  perform 1 from app.venta_linea vl where vl.venta_id = p_venta_id order by vl.id for update;
  for v_e in
    select e.id, e.piezas, vl.piezas as vendidas, vl.piezas_devueltas
    from (select (x ->> 'venta_linea_id')::bigint as id, (x ->> 'piezas')::integer as piezas from jsonb_array_elements(v_lineas) x) e
    left join app.venta_linea vl on vl.id = e.id and vl.venta_id = p_venta_id
  loop
    if v_e.vendidas is null then
      perform app.fn_fallar('LINEA_NO_VALIDA', jsonb_build_object('venta_linea_id', v_e.id));
    end if;
    if v_e.piezas > v_e.vendidas - v_e.piezas_devueltas then
      perform app.fn_fallar('DEVOLUCION_EXCEDE_VENDIDO', jsonb_build_object('venta_linea_id', v_e.id, 'disponible', v_e.vendidas - v_e.piezas_devueltas));
    end if;
  end loop;
  -- importe acumulado proporcional menos lo ya devuelto: devoluciones sucesivas nunca pasan del importe de la linea
  select coalesce(sum(round(vl.importe * (vl.piezas_devueltas + e.piezas) / vl.piezas, 2) - round(vl.importe * vl.piezas_devueltas / vl.piezas, 2)), 0) into v_total
  from (select (x ->> 'venta_linea_id')::bigint as id, (x ->> 'piezas')::integer as piezas from jsonb_array_elements(v_lineas) x) e
  join app.venta_linea vl on vl.id = e.id;
  if v_total <= 0 then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'lineas', 'motivo', 'sin_importe'));
  end if;
  perform app.fn_bloquear_existencias(v_v.sucursal_id, array(
    select distinct vl.producto_id from app.venta_linea vl where vl.id = any(v_vistos) order by 1));
  select * into v_cxc from app.cuenta_por_cobrar x where x.venta_id = p_venta_id and x.estado = 'pendiente' for update;
  v_abono := least(v_total, coalesce(v_cxc.saldo, 0));
  v_reembolso := v_total - v_abono;
  if v_reembolso > 0 and v_turno is null then
    perform app.fn_fallar('TURNO_NO_ABIERTO', '{}');
  end if;

  insert into app.devolucion (sucursal_id, folio, venta_id, turno_caja_id, usuario_id, motivo, total, abono_credito, reembolso_efectivo,
                              clave_idempotencia, hash_solicitud)
  values (v_v.sucursal_id, app.fn_siguiente_folio(v_v.sucursal_id, 'D'), p_venta_id, v_turno, p_usuario_id, v_motivo, v_total, v_abono,
          v_reembolso, v_clave, p_hash)
  returning id into v_dev;
  insert into app.devolucion_linea (devolucion_id, venta_linea_id, producto_id, piezas, importe, costo_total, regresa_a_inventario)
  select v_dev, vl.id, vl.producto_id, e.piezas,
         round(vl.importe * (vl.piezas_devueltas + e.piezas) / vl.piezas, 2) - round(vl.importe * vl.piezas_devueltas / vl.piezas, 2),
         round(vl.costo_total * (vl.piezas_devueltas + e.piezas) / vl.piezas, 2) - round(vl.costo_total * vl.piezas_devueltas / vl.piezas, 2), e.regresa
  from (select (x ->> 'venta_linea_id')::bigint as id, (x ->> 'piezas')::integer as piezas, (x ->> 'regresa_a_inventario')::boolean as regresa
        from jsonb_array_elements(v_lineas) with ordinality as y(x, ord)) e
  join app.venta_linea vl on vl.id = e.id
  order by e.id;
  for v_dl in
    select dl.id, dl.producto_id, dl.piezas, dl.regresa_a_inventario, vl.costo_unitario
    from app.devolucion_linea dl join app.venta_linea vl on vl.id = dl.venta_linea_id
    where dl.devolucion_id = v_dev order by dl.producto_id, dl.id
  loop
    insert into app.movimiento_inventario (sucursal_id, producto_id, tipo, cantidad, costo_unitario, referencia_tabla, referencia_id, usuario_id, motivo)
    values (v_v.sucursal_id, v_dl.producto_id, 'devolucion_venta', v_dl.piezas, v_dl.costo_unitario, 'devolucion_linea', v_dl.id, p_usuario_id, v_motivo);
    if not v_dl.regresa_a_inventario then
      insert into app.movimiento_inventario (sucursal_id, producto_id, tipo, cantidad, costo_unitario, causa_merma, referencia_tabla, referencia_id, usuario_id, motivo)
      values (v_v.sucursal_id, v_dl.producto_id, 'merma', -v_dl.piezas, v_dl.costo_unitario, 'danado', 'devolucion_linea', v_dl.id, p_usuario_id, v_motivo);
    end if;
  end loop;
  update app.venta_linea vl set piezas_devueltas = vl.piezas_devueltas + dl.piezas
  from app.devolucion_linea dl where dl.devolucion_id = v_dev and dl.venta_linea_id = vl.id;
  if v_abono > 0 then
    update app.cuenta_por_cobrar x set saldo = x.saldo - v_abono, estado = case when x.saldo - v_abono = 0 then 'saldada' else 'pendiente' end
    where x.id = v_cxc.id;
  end if;
  if v_reembolso > 0 then
    insert into app.movimiento_caja (turno_caja_id, tipo, monto, motivo, referencia_tabla, referencia_id, usuario_id)
    values (v_turno, 'reembolso', v_reembolso, v_motivo, 'devolucion', v_dev, p_usuario_id);
  end if;
  return query select v_dev, false;
end $$;

-- ---------------------------------------------------------------- cuentas por cobrar y abonos

-- Fiado de libreta o de Eleventa al arrancar (P26). No lo frena el limite (es deuda que ya existe); vence_el puede estar en el pasado.
create function app.fn_saldo_inicial(p_usuario_id bigint, p_cliente_id bigint, p_monto numeric, p_vence_el date, p_concepto text) returns bigint
language plpgsql as $$
declare
  v_id bigint;
  v_concepto text := nullif(trim(coalesce(p_concepto, '')), '');
begin
  perform app.fn_dinero_escribir();
  perform app.fn_exigir_permiso(p_usuario_id, 'clientes.credito');
  perform app.fn_monto_positivo(p_monto, 'monto');
  if v_concepto is null or length(v_concepto) > 200 then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'concepto'));
  end if;
  if p_vence_el is null then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'vence_el'));
  end if;
  perform 1 from app.cliente c where c.id = p_cliente_id for update;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('cliente_id', p_cliente_id));
  end if;
  insert into app.cuenta_por_cobrar (cliente_id, origen, concepto, monto, saldo, vence_el, creado_por)
  values (p_cliente_id, 'saldo_inicial', v_concepto, p_monto, p_monto, p_vence_el, p_usuario_id) returning id into v_id;
  return v_id;
end $$;

-- p_datos: {clave_idempotencia, cliente_id, metodo, monto, referencia?, comprobante?, ruta_parada_id?, cuentas?:[{cuenta_por_cobrar_id, monto}]}
-- Orden: ruta -> turno -> cliente -> CxC (por id) -> abono.
create function app.fn_registrar_abono(p_usuario_id bigint, p_datos jsonb, p_hash text)
returns table(abono_id bigint, repetida boolean)
language plpgsql as $$
declare
  v_clave uuid;
  v_previa bigint;
  v_cliente bigint;
  v_metodo text;
  v_monto numeric;
  v_ref text;
  v_comp text;
  v_pa app.ruta_parada;
  v_ruta app.ruta;
  v_parada bigint;
  v_turno bigint;
  v_t app.turno_caja;
  v_cuentas jsonb;
  v_ids bigint[];
  v_saldo numeric;
  v_resto numeric;
  v_abono bigint;
  v_x record;
  v_aplica numeric;
  v_sucursal bigint;
begin
  perform app.fn_dinero_escribir();
  perform app.fn_exigir_permiso(p_usuario_id, 'cobranza.abonar');
  if jsonb_typeof(p_datos) is distinct from 'object' then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'datos'));
  end if;
  v_clave := app.fn_json_uuid(p_datos ->> 'clave_idempotencia', 'clave_idempotencia');
  perform pg_advisory_xact_lock(hashtext(v_clave::text));
  v_previa := app.fn_idem_previa('abono', v_clave, p_usuario_id, p_hash);
  if v_previa is not null then
    return query select v_previa, true;
    return;
  end if;
  v_cliente := app.fn_json_id(p_datos ->> 'cliente_id', 'cliente_id');
  v_metodo := p_datos ->> 'metodo';
  if v_metodo is null or v_metodo not in ('efectivo','transferencia','tarjeta') then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'metodo'));
  end if;
  v_monto := app.fn_monto_positivo(app.fn_json_dinero(p_datos ->> 'monto', 'monto'), 'monto');
  v_ref := nullif(trim(coalesce(p_datos ->> 'referencia', '')), '');
  if length(v_ref) > 80 then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'referencia'));
  end if;
  v_comp := nullif(p_datos ->> 'comprobante', '');
  if v_comp is not null and (v_comp !~ '^[0-9a-f]{64}\.(jpg|png|webp)$' or v_metodo <> 'transferencia') then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'comprobante'));
  end if;
  v_sucursal := (select u.sucursal_id from app.usuario u where u.id = p_usuario_id);
  -- Sin parada, solo a quien ve la cuenta de ese cliente (si no, el mismo NO_ENCONTRADO: no se revela su saldo).
  if nullif(p_datos ->> 'ruta_parada_id', '') is null and not app.fn_puede_ver_cuenta(p_usuario_id, v_cliente) then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('cliente_id', v_cliente));
  end if;
  v_parada := case when nullif(p_datos ->> 'ruta_parada_id', '') is null then null else app.fn_json_id(p_datos ->> 'ruta_parada_id', 'ruta_parada_id') end;
  v_cuentas := case when jsonb_typeof(p_datos -> 'cuentas') = 'array' and jsonb_array_length(p_datos -> 'cuentas') > 0 then p_datos -> 'cuentas'
                    when p_datos -> 'cuentas' is null or jsonb_typeof(p_datos -> 'cuentas') = 'null'
                         or (jsonb_typeof(p_datos -> 'cuentas') = 'array' and jsonb_array_length(p_datos -> 'cuentas') = 0) then null
                    else '"invalido"'::jsonb end;
  if v_cuentas = '"invalido"'::jsonb then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'cuentas'));
  end if;

  -- ruta -> turno
  if v_parada is not null then
    select * into v_pa from app.ruta_parada pa where pa.id = v_parada;
    if not found then
      perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('ruta_parada_id', v_parada));
    end if;
    v_ruta := app.fn_ruta_bloquear(p_usuario_id, v_pa.ruta_id);
    select * into v_pa from app.ruta_parada pa where pa.id = v_parada for update;
    if v_ruta.estado <> 'en_curso' or v_ruta.repartidor_id <> p_usuario_id or v_pa.cliente_id <> v_cliente
       or v_pa.estado not in ('pendiente','visitada') then
      perform app.fn_fallar('ESTADO_NO_VALIDO', jsonb_build_object('ruta_parada_id', v_parada));
    end if;
  end if;
  v_turno := app.fn_turno_abierto(p_usuario_id);
  if v_turno is not null then
    select * into v_t from app.turno_caja t where t.id = v_turno for update;
    if not found or v_t.estado <> 'abierto' then
      perform app.fn_fallar('TURNO_NO_ABIERTO', jsonb_build_object('turno_id', v_turno));
    end if;
  end if;
  if v_metodo = 'efectivo' and v_turno is null then
    perform app.fn_fallar('TURNO_NO_ABIERTO', '{}');
  end if;
  if v_parada is not null and v_t.ruta_id is distinct from v_pa.ruta_id then
    perform app.fn_fallar('ESTADO_NO_VALIDO', jsonb_build_object('ruta_parada_id', v_parada, 'motivo', 'turno'));
  end if;
  -- cliente -> CxC
  perform 1 from app.cliente c where c.id = v_cliente for update;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('cliente_id', v_cliente));
  end if;
  perform 1 from app.cuenta_por_cobrar x where x.cliente_id = v_cliente and x.estado = 'pendiente' order by x.id for update;
  select s.saldo into v_saldo from app.v_saldo_cliente s where s.cliente_id = v_cliente;

  if v_cuentas is not null then
    declare
      v_suma numeric := 0;
      v_montos numeric[] := '{}';
      v_saldos numeric[] := '{}';
      v_i integer;
    begin
      v_ids := '{}';
      for v_x in select e.valor from jsonb_array_elements(v_cuentas) as e(valor) loop
        declare
          v_id bigint := app.fn_json_id(v_x.valor ->> 'cuenta_por_cobrar_id', 'cuenta_por_cobrar_id');
          v_m numeric := app.fn_monto_positivo(app.fn_json_dinero(v_x.valor ->> 'monto', 'monto'), 'monto');
          v_s numeric;
        begin
          if v_id = any(v_ids) then
            perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'cuentas'));
          end if;
          v_ids := v_ids || v_id;
          select x.saldo into v_s from app.cuenta_por_cobrar x where x.id = v_id and x.cliente_id = v_cliente and x.estado = 'pendiente';
          if not found then
            perform app.fn_fallar('CUENTA_NO_VALIDA', jsonb_build_object('cuenta_por_cobrar_id', v_id));
          end if;
          v_montos := v_montos || v_m;
          v_saldos := v_saldos || v_s;
          v_suma := v_suma + v_m;
        end;
      end loop;
      if v_suma <> v_monto then
        perform app.fn_fallar('APLICACION_NO_CUADRA', jsonb_build_object('monto', v_monto::text, 'aplicado', v_suma::text));
      end if;
      for v_i in 1 .. cardinality(v_ids) loop
        if v_montos[v_i] > v_saldos[v_i] then
          perform app.fn_fallar('ABONO_EXCEDE_SALDO', jsonb_build_object('cuenta_por_cobrar_id', v_ids[v_i], 'saldo', v_saldos[v_i]::text, 'monto', v_montos[v_i]::text));
        end if;
      end loop;
    end;
  elsif v_monto > v_saldo then
    perform app.fn_fallar('ABONO_EXCEDE_SALDO', jsonb_build_object('saldo', v_saldo::text, 'monto', v_monto::text));
  end if;

  insert into app.abono (sucursal_id, folio, cliente_id, turno_caja_id, ruta_parada_id, metodo, monto, referencia, comprobante, usuario_id,
                         clave_idempotencia, hash_solicitud)
  values (v_sucursal, app.fn_siguiente_folio(v_sucursal, 'A'), v_cliente, v_turno, v_parada, v_metodo, v_monto, v_ref, v_comp, p_usuario_id,
          v_clave, p_hash)
  returning id into v_abono;
  if v_cuentas is not null then
    for v_x in
      select (e.valor ->> 'cuenta_por_cobrar_id')::bigint as id, (e.valor ->> 'monto')::numeric as monto
      from jsonb_array_elements(v_cuentas) as e(valor) order by 1
    loop
      insert into app.abono_aplicacion (abono_id, cuenta_por_cobrar_id, monto) values (v_abono, v_x.id, v_x.monto);
      update app.cuenta_por_cobrar x set saldo = x.saldo - v_x.monto, estado = case when x.saldo - v_x.monto = 0 then 'saldada' else 'pendiente' end
      where x.id = v_x.id;
    end loop;
  else
    v_resto := v_monto;
    for v_x in
      select x.id, x.saldo from app.cuenta_por_cobrar x where x.cliente_id = v_cliente and x.estado = 'pendiente' order by x.vence_el, x.id
    loop
      exit when v_resto = 0;
      v_aplica := least(v_resto, v_x.saldo);
      insert into app.abono_aplicacion (abono_id, cuenta_por_cobrar_id, monto) values (v_abono, v_x.id, v_aplica);
      update app.cuenta_por_cobrar x set saldo = x.saldo - v_aplica, estado = case when x.saldo - v_aplica = 0 then 'saldada' else 'pendiente' end
      where x.id = v_x.id;
      v_resto := v_resto - v_aplica;
    end loop;
  end if;
  if v_parada is not null and v_pa.tipo = 'cobro' then
    update app.ruta_parada pa set estado = 'visitada', visitada_en = coalesce(pa.visitada_en, now()) where pa.id = v_parada;
  end if;
  return query select v_abono, false;
end $$;

create function app.fn_cancelar_abono(p_usuario_id bigint, p_abono_id bigint, p_motivo text) returns void
language plpgsql as $$
declare
  v_a app.abono;
  v_turno bigint;
  v_t app.turno_caja;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  perform app.fn_dinero_escribir();
  perform app.fn_exigir_permiso(p_usuario_id, 'cobranza.cancelar_abono');
  if v_motivo is null or length(v_motivo) > 200 then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'motivo'));
  end if;
  select * into v_a from app.abono a where a.id = p_abono_id;
  if not found or v_a.sucursal_id is distinct from (select u.sucursal_id from app.usuario u where u.id = p_usuario_id) then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('abono_id', p_abono_id));
  end if;
  v_turno := app.fn_turno_abierto(p_usuario_id);
  if v_turno is not null then
    -- candado del turno y relectura: un cierre que corria a la vez ya lo dejo cerrado
    select * into v_t from app.turno_caja t where t.id = v_turno for update;
    if not found or v_t.estado <> 'abierto' then
      perform app.fn_fallar('TURNO_NO_ABIERTO', jsonb_build_object('turno_id', v_turno));
    end if;
  end if;
  perform 1 from app.cliente c where c.id = v_a.cliente_id for update;
  perform 1 from app.cuenta_por_cobrar x
  where x.id in (select ap.cuenta_por_cobrar_id from app.abono_aplicacion ap where ap.abono_id = p_abono_id) order by x.id for update;
  select * into v_a from app.abono a where a.id = p_abono_id for update;
  if v_a.estado = 'cancelado' then
    perform app.fn_fallar('ABONO_YA_CANCELADO', jsonb_build_object('abono_id', p_abono_id));
  end if;
  if v_a.metodo = 'efectivo' and v_turno is null then
    perform app.fn_fallar('TURNO_NO_ABIERTO', '{}');
  end if;
  update app.cuenta_por_cobrar x set saldo = x.saldo + ap.monto, estado = 'pendiente'
  from app.abono_aplicacion ap where ap.abono_id = p_abono_id and ap.cuenta_por_cobrar_id = x.id and x.estado <> 'cancelada';
  update app.abono a set estado = 'cancelado', cancelado_en = now(), cancelado_por = p_usuario_id, motivo_cancelacion = v_motivo where a.id = p_abono_id;
  if v_a.metodo = 'efectivo' then
    insert into app.movimiento_caja (turno_caja_id, tipo, monto, motivo, referencia_tabla, referencia_id, usuario_id)
    values (v_turno, 'reembolso', v_a.monto, v_motivo, 'abono', p_abono_id, p_usuario_id);
  end if;
end $$;

-- Marca una transferencia (de venta o de abono) como vista en el banco. Solo informativo: no cambia saldos. Idempotente.
create function app.fn_verificar_pago(p_usuario_id bigint, p_tabla text, p_id bigint) returns void
language plpgsql as $$
declare
  v_n integer;
begin
  perform app.fn_dinero_escribir();
  perform app.fn_exigir_permiso(p_usuario_id, 'cobranza.verificar');
  if p_tabla is null or p_tabla not in ('venta_pago','abono') then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'tabla'));
  end if;
  if p_tabla = 'venta_pago' then
    if not exists (select 1 from app.venta_pago pg join app.venta v on v.id = pg.venta_id
                   where pg.id = p_id and v.sucursal_id = (select u.sucursal_id from app.usuario u where u.id = p_usuario_id)) then
      perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('id', p_id));
    end if;
    update app.venta_pago pg set verificado_en = coalesce(pg.verificado_en, now()), verificado_por = coalesce(pg.verificado_por, p_usuario_id)
    where pg.id = p_id and pg.metodo = 'transferencia';
  else
    if not exists (select 1 from app.abono a where a.id = p_id and a.sucursal_id = (select u.sucursal_id from app.usuario u where u.id = p_usuario_id)) then
      perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('id', p_id));
    end if;
    update app.abono a set verificado_en = coalesce(a.verificado_en, now()), verificado_por = coalesce(a.verificado_por, p_usuario_id)
    where a.id = p_id and a.metodo = 'transferencia' and a.estado = 'aplicado';
  end if;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    perform app.fn_fallar('ESTADO_NO_VALIDO', jsonb_build_object('tabla', p_tabla, 'id', p_id));
  end if;
end $$;

-- ---------------------------------------------------------------- liquidar la ruta

-- Cierra el turno de ruta con el mismo calculo del esperado que cualquier turno. Quien tenga rutas.liquidar puede liquidar su propia ruta [P45].
create function app.fn_liquidar_ruta(p_usuario_id bigint, p_ruta_id bigint, p_efectivo_contado numeric, p_notas text) returns jsonb
language plpgsql as $$
declare
  v_r app.ruta;
  v_t app.turno_caja;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'rutas.liquidar');
  if p_efectivo_contado is null or p_efectivo_contado < 0 or p_efectivo_contado <> round(p_efectivo_contado, 2) or p_efectivo_contado >= 10000000000 then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'efectivo_contado'));
  end if;
  v_r := app.fn_ruta_bloquear(p_usuario_id, p_ruta_id);
  if v_r.estado = 'liquidada' then
    return app.fn_resumen_turno(v_r.turno_caja_id);
  end if;
  if v_r.estado <> 'terminada' then
    perform app.fn_fallar('RUTA_NO_TERMINADA', jsonb_build_object('ruta_id', p_ruta_id, 'estado', v_r.estado));
  end if;
  select * into v_t from app.turno_caja t where t.id = v_r.turno_caja_id for update;
  if v_t.estado = 'abierto' then
    perform app.fn_cerrar_turno_interno(v_t.id, p_usuario_id, p_efectivo_contado, p_notas);
  end if;
  update app.ruta r set estado = 'liquidada' where r.id = p_ruta_id;
  return app.fn_resumen_turno(v_t.id);
end $$;

-- ---------------------------------------------------------------- paradas de cobro (B9)

create function app.fn_agregar_cobro(p_usuario_id bigint, p_ruta_id bigint, p_cliente_id bigint) returns bigint
language plpgsql as $$
declare
  v_r app.ruta;
  v_c app.cliente;
  v_max integer;
  v_id bigint;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'rutas.planear');
  v_r := app.fn_ruta_bloquear(p_usuario_id, p_ruta_id);
  if v_r.estado not in ('planeada','cargada') then
    perform app.fn_fallar('RUTA_NO_EDITABLE', jsonb_build_object('ruta_id', p_ruta_id, 'estado', v_r.estado));
  end if;
  select * into v_c from app.cliente c where c.id = p_cliente_id;
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('cliente_id', p_cliente_id));
  end if;
  if not v_c.activo then
    perform app.fn_fallar('CLIENTE_INACTIVO', jsonb_build_object('cliente_id', p_cliente_id));
  end if;
  perform 1 from app.ruta_parada pa where pa.ruta_id = p_ruta_id order by pa.id for update;
  if exists (select 1 from app.ruta_parada pa where pa.ruta_id = p_ruta_id and pa.cliente_id = p_cliente_id) then
    perform app.fn_fallar('PARADA_DUPLICADA', jsonb_build_object('ruta_id', p_ruta_id, 'cliente_id', p_cliente_id));
  end if;
  if coalesce((select s.saldo from app.v_saldo_cliente s where s.cliente_id = p_cliente_id), 0) <= 0 then
    perform app.fn_fallar('ESTADO_NO_VALIDO', jsonb_build_object('motivo', 'sin_saldo'));
  end if;
  select coalesce(max(pa.orden), 0) into v_max from app.ruta_parada pa where pa.ruta_id = p_ruta_id;
  if v_max + 1 > 200 then
    perform app.fn_fallar('RUTA_LLENA', jsonb_build_object('ruta_id', p_ruta_id, 'maximo', 200));
  end if;
  insert into app.ruta_parada (ruta_id, orden, tipo, cliente_id) values (p_ruta_id, v_max + 1, 'cobro', p_cliente_id) returning id into v_id;
  perform app.fn_ruta_invalidar_km(p_ruta_id);
  return v_id;
end $$;

-- B9: clientes activos de las zonas de las paradas, con vencido, sin parada en la ruta (max. 10).
create function app.fn_sugerencias_cobro(p_ruta_id bigint)
returns table(cliente_id bigint, nombre text, zona text, vencido numeric, saldo numeric)
language sql stable as $$
  select c.id, c.nombre, z.nombre, s.vencido, s.saldo
  from app.cliente c
  join app.v_saldo_cliente s on s.cliente_id = c.id
  left join app.zona z on z.id = c.zona_id
  where c.activo and s.vencido > 0
    and c.zona_id in (select c2.zona_id from app.ruta_parada pa join app.cliente c2 on c2.id = pa.cliente_id
                      where pa.ruta_id = p_ruta_id and c2.zona_id is not null)
    and not exists (select 1 from app.ruta_parada pa where pa.ruta_id = p_ruta_id and pa.cliente_id = c.id)
  order by s.vencido desc, c.nombre, c.id
  limit 10
$$;

-- ---------------------------------------------------------------- estado de cuenta y resumen del dia

-- A3: cargos = CxC no canceladas; abonos = abonos aplicados y devoluciones que bajaron saldo. saldo_inicial = lo anterior a p_desde.
-- Con p_hasta = hoy, saldo_final = v_saldo_cliente.saldo (invariante probada). p_hasta null = hoy; p_desde null = 90 dias antes.
create function app.fn_estado_cuenta(p_cliente_id bigint, p_desde date, p_hasta date) returns jsonb
language sql stable as $$
  with par as (
    select coalesce(p_hasta, app.fn_fecha_local(now())) as hasta,
           coalesce(p_desde, coalesce(p_hasta, app.fn_fecha_local(now())) - 90) as desde
  ), mov as (
    select app.fn_fecha_local(x.creado_en) as fecha, x.creado_en as orden, 1 as grupo, x.id,
           case x.origen when 'venta' then 'venta' else 'saldo_inicial' end as tipo, v.folio, x.concepto, x.monto as cargo, 0::numeric as abono
    from app.cuenta_por_cobrar x left join app.venta v on v.id = x.venta_id
    where x.cliente_id = p_cliente_id and x.estado <> 'cancelada'
    union all
    select app.fn_fecha_local(a.creado_en), a.creado_en, 2, a.id, 'abono', a.folio, a.metodo, 0, a.monto
    from app.abono a where a.cliente_id = p_cliente_id and a.estado = 'aplicado'
    union all
    select app.fn_fecha_local(d.creado_en), d.creado_en, 3, d.id, 'devolucion', d.folio, d.motivo, 0, d.abono_credito
    from app.devolucion d join app.venta v on v.id = d.venta_id
    where v.cliente_id = p_cliente_id and d.abono_credito > 0
  ), ini as (
    select coalesce(sum(m.cargo - m.abono), 0) as saldo from mov m, par where m.fecha < par.desde
  ), lista as (
    select m.*, ini.saldo + sum(m.cargo - m.abono) over (order by m.orden, m.grupo, m.id rows between unbounded preceding and current row) as corrido
    from mov m, par, ini where m.fecha between par.desde and par.hasta
  )
  select jsonb_build_object(
    'saldo_inicial', ini.saldo::numeric(12,2)::text,
    'movimientos', coalesce((select jsonb_agg(jsonb_build_object('fecha', l.fecha, 'tipo', l.tipo, 'folio', l.folio, 'concepto', l.concepto,
                               'cargo', l.cargo::numeric(12,2)::text, 'abono', l.abono::numeric(12,2)::text, 'saldo', l.corrido::numeric(12,2)::text)
                             order by l.orden, l.grupo, l.id) from lista l), '[]'::jsonb),
    'saldo_final', coalesce((select l.corrido from lista l order by l.orden desc, l.grupo desc, l.id desc limit 1), ini.saldo)::numeric(12,2)::text,
    'vencido', coalesce((select s.vencido from app.v_saldo_cliente s where s.cliente_id = p_cliente_id), 0)::numeric(12,2)::text)
  from ini
$$;

-- B12: el dia de negocio es la fecha local. Ganancia siempre viene; la API la quita sin costos.ver.
create function app.fn_resumen_dia(p_sucursal_id bigint, p_fecha date) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'vendido', (coalesce((select sum(v.total) from app.venta v where v.sucursal_id = p_sucursal_id and v.estado = 'completada'
                            and v.creado_en >= app.fn_inicio_dia(p_fecha) and v.creado_en < app.fn_inicio_dia(p_fecha + 1)), 0)
              - coalesce((select sum(d.total) from app.devolucion d where d.sucursal_id = p_sucursal_id
                            and d.creado_en >= app.fn_inicio_dia(p_fecha) and d.creado_en < app.fn_inicio_dia(p_fecha + 1)), 0))::numeric(12,2)::text,
    'ganancia', (coalesce((select sum(vl.importe - vl.costo_total) from app.venta v join app.venta_linea vl on vl.venta_id = v.id
                           where v.sucursal_id = p_sucursal_id and v.estado = 'completada' and v.creado_en >= app.fn_inicio_dia(p_fecha) and v.creado_en < app.fn_inicio_dia(p_fecha + 1)), 0)
               - coalesce((select sum(dl.importe - dl.costo_total) from app.devolucion d join app.devolucion_linea dl on dl.devolucion_id = d.id
                           where d.sucursal_id = p_sucursal_id and d.creado_en >= app.fn_inicio_dia(p_fecha) and d.creado_en < app.fn_inicio_dia(p_fecha + 1)), 0))::numeric(12,2)::text,
    'cobrado', (select jsonb_object_agg(m.metodo, (coalesce(pg.monto, 0) + coalesce(ab.monto, 0))::numeric(12,2)::text)
                from (values ('efectivo'), ('transferencia'), ('tarjeta')) as m(metodo)
                left join (select p.metodo, sum(p.monto) as monto from app.venta v join app.venta_pago p on p.venta_id = v.id
                           where v.sucursal_id = p_sucursal_id and v.estado = 'completada' and v.creado_en >= app.fn_inicio_dia(p_fecha) and v.creado_en < app.fn_inicio_dia(p_fecha + 1)
                           group by p.metodo) pg on pg.metodo = m.metodo
                left join (select a.metodo, sum(a.monto) as monto from app.abono a
                           where a.sucursal_id = p_sucursal_id and a.estado = 'aplicado' and a.creado_en >= app.fn_inicio_dia(p_fecha) and a.creado_en < app.fn_inicio_dia(p_fecha + 1)
                           group by a.metodo) ab on ab.metodo = m.metodo),
    'fiado_nuevo', coalesce((select sum(x.monto) from app.cuenta_por_cobrar x join app.venta v on v.id = x.venta_id
                             where v.sucursal_id = p_sucursal_id and x.origen = 'venta' and x.estado <> 'cancelada'
                               and x.creado_en >= app.fn_inicio_dia(p_fecha) and x.creado_en < app.fn_inicio_dia(p_fecha + 1)), 0)::numeric(12,2)::text,
    'por_cobrar', coalesce((select sum(x.saldo) from app.cuenta_por_cobrar x join app.v_cxc_sucursal cs on cs.cuenta_por_cobrar_id = x.id
                            where x.estado = 'pendiente' and cs.sucursal_id = p_sucursal_id), 0)::numeric(12,2)::text,
    'por_comprar', (select jsonb_build_object('productos', count(*)::integer, 'costo_estimado', coalesce(sum(l.costo_estimado), 0)::numeric(12,2)::text)
                    from app.fn_lista_surtido(p_sucursal_id, p_fecha + 1) l))
$$;

-- ---------------------------------------------------------------- seguimiento del cliente (rehecha, misma firma)

-- Cuerpo de 007 con un solo cambio: en `entregado` agrega `recibio` (nunca la foto).
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
      from app.pedido_linea l where l.pedido_id = v_p.id)) end)
    || case when v_p.estado = 'entregado' then jsonb_build_object('recibio', v_p.recibio) else '{}'::jsonb end;
end $$;

-- ---------------------------------------------------------------- lecturas y avisos que usa la API (F7)

-- Unica regla de «quien ve la cuenta de un cliente»: cobranza.ver, o rutas.operar con una parada del cliente en su ruta en curso.
create function app.fn_puede_ver_cuenta(p_usuario_id bigint, p_cliente_id bigint) returns boolean
language sql stable as $$
  select app.fn_tiene_permiso(p_usuario_id, 'cobranza.ver')
      or (app.fn_tiene_permiso(p_usuario_id, 'rutas.operar')
          and exists (select 1 from app.ruta_parada pa join app.ruta r on r.id = pa.ruta_id
                      where pa.cliente_id = p_cliente_id and r.repartidor_id = p_usuario_id and r.estado = 'en_curso'))
$$;

-- «Quien ve una venta» para devolverla: ventas.ver_todas, la propia, o la de un cliente cuya cuenta puede ver (fn_puede_ver_cuenta: cobranza.ver o
-- su parada en la ruta en curso). Una venta que no ve es NO_ENCONTRADO: un repartidor no devuelve fiado ajeno.
create function app.fn_puede_ver_venta(p_usuario_id bigint, p_venta_id bigint) returns boolean
language sql stable as $$
  select app.fn_tiene_permiso(p_usuario_id, 'ventas.ver_todas')
      or exists (select 1 from app.venta v where v.id = p_venta_id
                   and (v.usuario_id = p_usuario_id or (v.cliente_id is not null and app.fn_puede_ver_cuenta(p_usuario_id, v.cliente_id))))
$$;

-- Unica regla de «que pedido puede cobrar este usuario» (la misma que aplica fn_entregar_pedido): de su sucursal; en reparto, ruta propia
-- (solo su repartidor, con rutas.operar); recoge en bodega, ventas.crear.
create function app.fn_pedido_cobrable(p_usuario_id bigint, p_pedido_id bigint) returns app.pedido
language plpgsql stable as $$
declare
  v_p app.pedido;
  v_r app.ruta;
begin
  select * into v_p from app.pedido p
  where p.id = p_pedido_id and p.sucursal_id = (select u.sucursal_id from app.usuario u where u.id = p_usuario_id);
  if not found then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('pedido_id', p_pedido_id));
  end if;
  if v_p.ruta_id is not null then
    select * into v_r from app.ruta r where r.id = v_p.ruta_id;
    perform app.fn_ruta_exigir_repartidor(p_usuario_id, v_r);
  else
    perform app.fn_exigir_permiso(p_usuario_id, 'ventas.crear');
  end if;
  return v_p;
end $$;

-- Cola comun de las vistas previas: pagos, cambio y credito del cliente frente a un total ya calculado (mismos helpers que fn_registrar_venta).
-- Devuelve {total, pagos:[{metodo, monto}], pagado, credito, falta, cuadra, cambio, efectivo_insuficiente, saldo, saldo_despues, limite,
-- disponible_despues, excede_limite}; sin cliente (publico en general) los campos de saldo y limite van en null.
create function app.fn_vista_pagos(p_total numeric, p_cliente_id bigint, p_datos jsonb) returns jsonb
language plpgsql stable as $$
declare
  v_c jsonb := app.fn_calcular_pagos(p_total, p_datos -> 'pagos', p_datos ->> 'efectivo_recibido', true);
  v_l record;
begin
  -- sin cliente (publico en general) el registro queda con nulos
  select l.* into v_l from (select 1) x left join lateral app.fn_credito_cliente(p_cliente_id, (v_c ->> 'credito')::numeric) l on true;
  return jsonb_build_object(
    'total', p_total::numeric(12,2)::text,
    'pagos', (select coalesce(jsonb_agg(jsonb_build_object('metodo', x ->> 'metodo', 'monto', x ->> 'monto')), '[]'::jsonb) from jsonb_array_elements(v_c -> 'pagos') x),
    'pagado', v_c ->> 'pagado', 'credito', v_c ->> 'credito', 'falta', v_c ->> 'falta', 'cuadra', (v_c ->> 'cuadra')::boolean,
    'cambio', v_c ->> 'cambio', 'efectivo_insuficiente', (v_c ->> 'efectivo_insuficiente')::boolean,
    'saldo', v_l.saldo::numeric(12,2)::text, 'saldo_despues', v_l.saldo_despues::numeric(12,2)::text, 'limite', v_l.limite::numeric(12,2)::text,
    'disponible_despues', v_l.disponible_despues::numeric(12,2)::text, 'excede_limite', v_l.excede);
end $$;

-- Vista previa del cobro de una entrega: nada se escribe. p_datos: {lineas?:[{pedido_linea_id, cantidad_entregada}], pagos:[{metodo, monto|null}]
-- (un solo monto null = «el resto»), efectivo_recibido?}.
create function app.fn_vista_cobro(p_usuario_id bigint, p_pedido_id bigint, p_datos jsonb) returns jsonb
language plpgsql stable as $$
declare
  v_p app.pedido;
  v_entradas jsonb;
  v_total numeric;
begin
  if jsonb_typeof(p_datos) is distinct from 'object' then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'datos'));
  end if;
  v_p := app.fn_pedido_cobrable(p_usuario_id, p_pedido_id);
  v_entradas := case when jsonb_typeof(p_datos -> 'lineas') = 'array' then p_datos -> 'lineas'
                     when p_datos -> 'lineas' is null or jsonb_typeof(p_datos -> 'lineas') = 'null' then '[]'::jsonb end;
  if v_entradas is null then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'lineas'));
  end if;
  select coalesce(sum(app.fn_importe_linea(e.entregada, l.precio_unitario)), 0) into v_total
  from app.fn_entrega_lineas(p_pedido_id, v_entradas) e join app.pedido_linea l on l.id = e.linea_id;
  return app.fn_vista_pagos(v_total, v_p.cliente_id, p_datos);
end $$;

-- Vista previa de una venta de mostrador (/pos): p_datos como fn_registrar_venta ({cliente_id?, lista_precio_id?, lineas:[{presentacion_id, cantidad,
-- precio_unitario?}]}) y pagos con monto null = «el resto». Mismo precio que la venta (fn_precio de la lista del cliente o la predeterminada).
create function app.fn_vista_venta(p_usuario_id bigint, p_datos jsonb) returns jsonb
language plpgsql stable as $$
declare
  v_cliente bigint;
  v_lista bigint;
  v_lineas jsonb := p_datos -> 'lineas';
  v_total numeric := 0;
  v_l record;
  v_precio numeric;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'ventas.crear');
  if jsonb_typeof(p_datos) is distinct from 'object' or jsonb_typeof(v_lineas) is distinct from 'array'
     or jsonb_array_length(v_lineas) > 200 then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'lineas'));
  end if;
  v_cliente := case when nullif(p_datos ->> 'cliente_id', '') is null then null else app.fn_json_id(p_datos ->> 'cliente_id', 'cliente_id') end;
  if v_cliente is not null and not exists (select 1 from app.cliente c where c.id = v_cliente) then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('cliente_id', v_cliente));
  end if;
  v_lista := coalesce(case when nullif(p_datos ->> 'lista_precio_id', '') is null then null else app.fn_json_id(p_datos ->> 'lista_precio_id', 'lista_precio_id') end,
                      (select c.lista_precio_id from app.cliente c where c.id = v_cliente),
                      (select l.id from app.lista_precio l where l.es_predeterminada));
  for v_l in select x.valor from jsonb_array_elements(v_lineas) as x(valor) loop
    declare
      v_cant integer := app.fn_json_entero(v_l.valor ->> 'cantidad', 'cantidad');
      v_pres app.presentacion;
    begin
      if v_cant <= 0 or v_cant > 1000000 then
        perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'cantidad'));
      end if;
      select * into v_pres from app.presentacion pz where pz.id = app.fn_json_id(v_l.valor ->> 'presentacion_id', 'presentacion_id');
      if not found or not v_pres.activa or not v_pres.se_vende then
        perform app.fn_fallar('PRESENTACION_NO_VALIDA', jsonb_build_object('presentacion_id', v_l.valor ->> 'presentacion_id'));
      end if;
      v_precio := coalesce(case when nullif(v_l.valor ->> 'precio_unitario', '') is null then null
                                else app.fn_json_dinero(v_l.valor ->> 'precio_unitario', 'precio_unitario') end, app.fn_precio(v_pres.id, v_lista));
      if v_precio is null then
        perform app.fn_fallar('PRECIO_NO_DEFINIDO', jsonb_build_object('presentacion_id', v_pres.id));
      end if;
      v_total := v_total + app.fn_importe_linea(v_cant, v_precio);
    end;
  end loop;
  if v_total <= 0 or v_total >= 10000000000 then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'lineas'));
  end if;
  return app.fn_vista_pagos(v_total, v_cliente, p_datos);
end $$;

-- Aviso del resumen del dia para el dueño [P56]: lo crea quien ve reportes y costos y se dirige al usuario activo del rol de sistema de su
-- sucursal (uno por dia y destinatario; repetir devuelve el mismo). Las variables salen de fn_resumen_dia; sin texto en el codigo.
create function app.fn_aviso_resumen_dia(p_usuario_id bigint, p_fecha date) returns table(aviso_id bigint, repetido boolean)
language plpgsql as $$
declare
  v_sucursal bigint;
  v_dueno bigint;
  v_r jsonb;
  v_vars jsonb;
  v_clave text;
  v_id bigint;
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'reportes.ver');
  perform app.fn_exigir_permiso(p_usuario_id, 'costos.ver');
  if p_fecha is null then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'fecha'));
  end if;
  select u.sucursal_id into v_sucursal from app.usuario u where u.id = p_usuario_id;
  select u.id into v_dueno from app.usuario u join app.rol r on r.id = u.rol_id
  where r.es_sistema and u.activo and u.sucursal_id = v_sucursal order by u.id limit 1;
  if v_dueno is null then
    perform app.fn_fallar('NO_ENCONTRADO', jsonb_build_object('destino', 'dueno'));
  end if;
  v_clave := 'wa_resumen_dia:' || p_fecha || ':u' || v_dueno;
  v_r := app.fn_resumen_dia(v_sucursal, p_fecha);
  v_vars := jsonb_build_object(
      'fecha', to_char(p_fecha, 'DD/MM/YYYY'),
      'vendido', v_r ->> 'vendido',
      'ganancia', v_r ->> 'ganancia',
      'cobrado', ((v_r #>> '{cobrado,efectivo}')::numeric + (v_r #>> '{cobrado,transferencia}')::numeric + (v_r #>> '{cobrado,tarjeta}')::numeric)::numeric(12,2)::text,
      'fiado_nuevo', v_r ->> 'fiado_nuevo',
      'por_cobrar', v_r ->> 'por_cobrar',
      'por_comprar', v_r #>> '{por_comprar,costo_estimado}');
  -- Un solo aviso por dia y destinatario; pedirlo otra vez (el mismo dia) lo deja con las cifras de ahora mientras siga pendiente.
  insert into app.aviso_cliente (usuario_id, plantilla, vars, clave) values (v_dueno, 'wa_resumen_dia', v_vars, v_clave)
  on conflict (clave) do nothing returning id into v_id;
  if v_id is not null then
    return query select v_id, false;
    return;
  end if;
  update app.aviso_cliente a set vars = v_vars where a.clave = v_clave and a.estado = 'pendiente';
  return query select a.id, true from app.aviso_cliente a where a.clave = v_clave;
end $$;

-- ---------------------------------------------------------------- plantillas y mensaje de surtido (antes en una edicion de 006)

alter table app.plantilla disable trigger trg_auditar;
-- El resumen del dia pone el signo de pesos en la plantilla (como las demas), no en el codigo.
update app.plantilla set texto = replace(texto, 'por comprar: {{por_comprar}}', 'por comprar: ${{por_comprar}}') where clave = 'wa_resumen_dia';
-- Linea del mensaje al proveedor para un producto sin presentacion de compra (el texto vive en la plantilla, no en el codigo).
insert into app.plantilla (clave, canal, titulo, texto, variables)
values ('surtido_linea_piezas', 'whatsapp', null, '{{cantidad}} piezas {{producto}}', '{cantidad,producto}');
alter table app.plantilla enable trigger trg_auditar;

-- Misma firma que 006: la linea de un producto sin presentacion de compra sale de la plantilla `surtido_linea_piezas`.
create or replace function app.fn_mensaje_surtido(p_sucursal_id bigint, p_fecha date, p_proveedor_id bigint)
returns table(telefono text, texto text, telefono_invalido boolean)
language sql stable as $$
  select app.fn_normalizar_telefono(pv.telefono),
         (select r.texto from app.fn_render_plantilla('wa_surtido_proveedor', jsonb_build_object(
            'proveedor', pv.nombre,
            'fecha', to_char(p_fecha, 'DD/MM/YYYY'),
            'lineas', coalesce((
              select string_agg(
                       case when l.cantidad_sugerida is null
                            then (select r2.texto from app.fn_render_plantilla('surtido_linea_piezas', jsonb_build_object(
                                    'cantidad', l.piezas_a_comprar + l.reponer_minimo, 'producto', l.producto)) r2)
                            else l.cantidad_sugerida || ' ' || l.presentacion || ' ' || l.producto end,
                       E'\n' order by l.producto, l.producto_id)
              from app.fn_lista_surtido(p_sucursal_id, p_fecha) l
              where l.proveedor_id = pv.id and (l.cantidad_sugerida > 0 or (l.cantidad_sugerida is null and l.piezas_a_comprar + l.reponer_minimo > 0))), ''))) r),
         (nullif(trim(coalesce(pv.telefono, '')), '') is not null and app.fn_normalizar_telefono(pv.telefono) is null)
  from app.proveedor pv where pv.id = p_proveedor_id
$$;

-- ---------------------------------------------------------------- permisos y semillas

alter table app.rol_permiso disable trigger trg_auditar;

insert into app.permiso (codigo, modulo, descripcion) values
  ('ventas.crear', 'ventas', 'Vender en el mostrador y entregar pedidos que se recogen'),
  ('ventas.ver', 'ventas', 'Ver las ventas propias'),
  ('ventas.ver_todas', 'ventas', 'Ver las ventas de todos'),
  ('ventas.cambiar_precio', 'ventas', 'Cambiar el precio o la lista de precios en una venta'),
  ('ventas.credito', 'ventas', 'Vender o entregar a crédito dentro del límite'),
  ('ventas.cancelar', 'ventas', 'Cancelar ventas'),
  ('ventas.devolver', 'ventas', 'Recibir devoluciones'),
  ('caja.operar', 'caja', 'Abrir y cerrar su turno de mostrador y registrar movimientos'),
  ('caja.supervisar', 'caja', 'Ver y cerrar turnos ajenos'),
  ('cobranza.ver', 'cobranza', 'Ver cuentas por cobrar y estados de cuenta'),
  ('cobranza.abonar', 'cobranza', 'Registrar abonos en mostrador o en ruta'),
  ('cobranza.cancelar_abono', 'cobranza', 'Cancelar abonos'),
  ('cobranza.verificar', 'cobranza', 'Marcar transferencias vistas en el banco'),
  ('reportes.ver', 'reportes', 'Ver reportes y el resumen del día');

insert into app.rol_permiso (rol_id, permiso_codigo)
select r.id, x.permiso
from (values
  ('Administrador', 'ventas.crear'), ('Administrador', 'ventas.ver'), ('Administrador', 'ventas.ver_todas'),
  ('Administrador', 'ventas.credito'), ('Administrador', 'ventas.devolver'),
  ('Administrador', 'caja.operar'), ('Administrador', 'caja.supervisar'),
  ('Administrador', 'cobranza.ver'), ('Administrador', 'cobranza.abonar'), ('Administrador', 'cobranza.verificar'),
  ('Administrador', 'reportes.ver'),
  ('Repartidor', 'ventas.ver'), ('Repartidor', 'ventas.credito'), ('Repartidor', 'ventas.devolver'), ('Repartidor', 'cobranza.abonar'),
  ('Cajero', 'ventas.crear'), ('Cajero', 'ventas.ver'), ('Cajero', 'ventas.credito'), ('Cajero', 'caja.operar'),
  ('Cajero', 'cobranza.ver'), ('Cajero', 'cobranza.abonar')
) as x(rol, permiso)
join app.rol r on r.nombre = x.rol;

alter table app.rol_permiso enable trigger trg_auditar;

-- Auditoria despues de las semillas: la bitacora arranca vacia.
create trigger trg_auditar after insert or update or delete on app.caja
  for each row execute function app.fn_auditar();
create trigger trg_auditar after insert or update or delete on app.turno_caja
  for each row execute function app.fn_auditar();
create trigger trg_auditar after insert or update or delete on app.venta
  for each row execute function app.fn_auditar();
create trigger trg_auditar after insert or update or delete on app.cuenta_por_cobrar
  for each row execute function app.fn_auditar();
create trigger trg_auditar after insert or update or delete on app.abono
  for each row execute function app.fn_auditar();

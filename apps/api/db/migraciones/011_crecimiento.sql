-- 011: crecimiento (CONTRATOS §2.12 B14 y B15; brief docs/fases/F11.md). Lealtad simple («cada N cajas de presentaciones marcadas, 1 caja de regalo»)
-- y sugerencias «en tu zona tambien piden». Apagada (semilla) no cambia nada: ninguna fila, ninguna linea regalo, lealtad null, regalos [].
-- Independiente de 010 (envases): el migrador ordena nombres y no exige numeros seguidos, asi que ninguna de las dos crea, rehace ni lee objetos de la otra.
-- Reglas: el saldo se lee de una sola vista (v_lealtad_saldo); la tabla es de solo-insertar y solo la escriben las funciones de dinero;
-- el premio se decide con el saldo ANTES de la venta (la que completa N regala en la siguiente) y nunca hace fallar la venta.

-- ---------------------------------------------------------------- columna y tabla

alter table app.presentacion add column cuenta_lealtad boolean not null default false;

create table app.lealtad_movimiento (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references app.cliente(id),
  venta_id bigint not null references app.venta(id),
  venta_linea_id bigint references app.venta_linea(id),
  tipo text not null check (tipo in ('acumula','canje','reverso')),
  cantidad integer not null,
  creado_en timestamptz not null default now(),
  constraint ck_lealtad_signo check ((tipo = 'acumula' and cantidad > 0) or (tipo = 'canje' and cantidad < 0) or (tipo = 'reverso' and cantidad <> 0)),
  constraint ck_lealtad_linea check (tipo = 'reverso' or venta_linea_id is not null)
);
create index idx_lealtad_cliente on app.lealtad_movimiento (cliente_id);
create index idx_lealtad_venta on app.lealtad_movimiento (venta_id);
create index idx_lealtad_linea on app.lealtad_movimiento (venta_linea_id) where venta_linea_id is not null;
-- Un solo canje por venta (red de seguridad bajo el candado del cliente).
create unique index uq_lealtad_canje_venta on app.lealtad_movimiento (venta_id) where tipo = 'canje';

-- Protecciones de 008 (sin funciones nuevas): solo escriben las funciones que levantan fn_dinero_escribir; filas inmutables; TRUNCATE bloqueado.
create trigger trg_lealtad_movimiento_guardado before insert or update or delete on app.lealtad_movimiento
  for each row execute function app.fn_dinero_guardado();
create trigger trg_lealtad_movimiento_inmutable before update or delete on app.lealtad_movimiento
  for each row execute function app.fn_dinero_inmutable();

-- Misma firma que 008: CREATE OR REPLACE. Copia literal del cuerpo de 008 + 'lealtad_movimiento'.
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
    when 'lealtad_movimiento' then 'ESTADO_NO_VALIDO'
    else 'COMPRA_INMUTABLE' end;
begin
  raise exception '%', v_codigo using errcode = 'P0001', detail = '{}';
end $$;

create trigger trg_lealtad_movimiento_truncate before truncate on app.lealtad_movimiento
  for each statement execute function app.fn_truncate_bloqueado();

-- ---------------------------------------------------------------- vista y funciones de lectura

-- Unica regla de «cuanto lleva» un cliente (sin movimientos no hay fila: se lee con coalesce 0). Puede ser negativo tras devoluciones o cancelaciones.
create view app.v_lealtad_saldo as
select m.cliente_id, sum(m.cantidad)::integer as saldo
from app.lealtad_movimiento m
group by m.cliente_id;

-- null con la lealtad apagada. Si no: {llevas = max(0, saldo), meta, premio = saldo >= meta, regalo:{presentacion_id (texto), producto, presentacion}|null, texto}.
-- `texto` sale de las plantillas pantalla_lealtad_premio / pantalla_lealtad_avance (renderizadas aqui, no en el codigo de la API).
create function app.fn_lealtad_cliente(p_cliente_id bigint) returns jsonb
language plpgsql stable as $$
declare
  v_saldo integer;
  v_meta integer;
  v_premio boolean;
  v_regalo jsonb;
  v_texto text;
begin
  if coalesce(app.fn_config('lealtad_activa'), 'false') <> 'true' then
    return null;
  end if;
  v_meta := app.fn_config('lealtad_cada')::integer;
  select s.saldo into v_saldo from app.v_lealtad_saldo s where s.cliente_id = p_cliente_id;
  v_saldo := coalesce(v_saldo, 0);
  v_premio := v_saldo >= v_meta;
  -- regla unica del regalo: activa, se_vende y producto activo; si no, no hay regalo y el premio no se ofrece (ni en la venta ni en la carga)
  select jsonb_build_object('presentacion_id', pz.id::text, 'producto', pr.nombre, 'presentacion', pz.nombre)
    into v_regalo
  from app.presentacion pz join app.producto pr on pr.id = pz.producto_id
  where pz.id = nullif(app.fn_config('lealtad_presentacion_regalo_id'), '')::bigint and pz.activa and pz.se_vende and pr.activo;
  v_premio := v_premio and v_regalo is not null;
  select r.texto into v_texto
  from app.fn_render_plantilla(case when v_premio then 'pantalla_lealtad_premio' else 'pantalla_lealtad_avance' end,
         jsonb_build_object('llevas', greatest(0, v_saldo), 'meta', v_meta,
                            'regalo', case when v_regalo is null then '' else (v_regalo ->> 'producto') || ' ' || (v_regalo ->> 'presentacion') end)) r;
  return jsonb_build_object('llevas', greatest(0, v_saldo), 'meta', v_meta, 'premio', v_premio, 'regalo', v_regalo, 'texto', v_texto);
end $$;

-- {venta_linea_id (texto), producto, presentacion, cantidad} de la linea regalo (la del canje) de una venta, o null. Una regla para la entrega y el ticket.
create function app.fn_regalo_venta(p_venta_id bigint) returns jsonb
language sql stable as $$
  select jsonb_build_object('venta_linea_id', vl.id::text, 'producto', pr.nombre, 'presentacion', pz.nombre, 'cantidad', vl.cantidad)
  from app.lealtad_movimiento m
  join app.venta_linea vl on vl.id = m.venta_linea_id
  join app.presentacion pz on pz.id = vl.presentacion_id
  join app.producto pr on pr.id = vl.producto_id
  where m.venta_id = p_venta_id and m.tipo = 'canje'
$$;

-- ---------------------------------------------------------------- configurar

-- Solo con precios.editar (regalar un producto es fijar un precio). Llaves aceptadas: lealtad_activa (boolean), lealtad_cada (entero 1-1000),
-- lealtad_presentacion_regalo_id (id como texto o null); cualquier otra -> VALIDACION {campo}. Valida el resultado final antes de escribir:
-- con lealtad_activa = true el regalo debe existir, estar activa, se_vende y su producto activo.
create function app.fn_lealtad_configurar(p_usuario_id bigint, p_datos jsonb) returns void
language plpgsql as $$
declare
  v_k text;
  v_v jsonb;
  v_activa boolean := coalesce(app.fn_config('lealtad_activa'), 'false')::boolean;
  v_regalo text := nullif(app.fn_config('lealtad_presentacion_regalo_id'), '');
begin
  perform app.fn_exigir_permiso(p_usuario_id, 'precios.editar');
  if jsonb_typeof(p_datos) is distinct from 'object' then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'datos'));
  end if;
  for v_k, v_v in select e.key, e.value from jsonb_each(p_datos) e loop
    if v_k = 'lealtad_activa' then
      if jsonb_typeof(v_v) <> 'boolean' then
        perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', v_k));
      end if;
      v_activa := (v_v #>> '{}')::boolean;
    elsif v_k = 'lealtad_cada' then
      if not (jsonb_typeof(v_v) = 'number' and (v_v #>> '{}') ~ '^[0-9]{1,4}$') then
        perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', v_k));
      end if;
      if (v_v #>> '{}')::integer not between 1 and 1000 then
        perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', v_k));
      end if;
    elsif v_k = 'lealtad_presentacion_regalo_id' then
      if jsonb_typeof(v_v) = 'null' then
        v_regalo := null;
      elsif jsonb_typeof(v_v) = 'string' and (v_v #>> '{}') ~ '^[0-9]{1,18}$' then
        v_regalo := v_v #>> '{}';
      else
        perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', v_k));
      end if;
    else
      perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', v_k));
    end if;
  end loop;
  if v_activa and not exists (select 1 from app.presentacion pz join app.producto pr on pr.id = pz.producto_id
                              where pz.id = v_regalo::bigint and pz.activa and pz.se_vende and pr.activo) then
    perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'lealtad_presentacion_regalo_id'));
  end if;
  update app.configuracion cf set valor = p_datos -> cf.clave, actualizado_en = now(), actualizado_por = p_usuario_id
  where cf.clave in ('lealtad_activa', 'lealtad_cada', 'lealtad_presentacion_regalo_id') and p_datos ? cf.clave;
end $$;

-- ---------------------------------------------------------------- venta, reversos y carga

-- Misma firma que 008: CREATE OR REPLACE (sin sobrecarga nueva). Copia literal del cuerpo de 008 con solo tres puntos de lealtad:
-- (a) decidir el premio, (b) cabe o no cabe (mismo candado de existencias), (c) movimientos. Ningun candado nuevo.
create or replace function app.fn_registrar_venta(p_usuario_id bigint, p_datos jsonb, p_hash text, p_pedido_id bigint default null)
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
  v_lealtad jsonb;
  v_meta integer;
  v_regalo_num smallint;
  v_regalo_linea bigint;
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
    precio_lista numeric, precio_unitario numeric, importe numeric, costo_unitario numeric, piezas integer,
    regalo boolean not null default false
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

  -- lealtad (011, a): el premio se decide con el saldo ANTES de esta venta. El cliente ya esta bloqueado FOR UPDATE: el saldo leido
  -- no cambia hasta el COMMIT, y dos ventas del mismo cliente se serializan en ese candado (un solo canje).
  if v_cliente_id is not null then
    v_lealtad := app.fn_lealtad_cliente(v_cliente_id);
    -- en reparto (pedido con ruta) el regalo solo va si el repartidor confirma que lo lleva (con_regalo); mostrador y recoge son automaticos
    if p_datos ? 'con_regalo' and jsonb_typeof(p_datos -> 'con_regalo') <> 'boolean' then
      perform app.fn_fallar('VALIDACION', jsonb_build_object('campo', 'con_regalo'));
    end if;
    if v_lealtad is not null and (v_lealtad ->> 'premio')::boolean
       and (v_con_cargadas or coalesce((p_datos ->> 'con_regalo')::boolean, false)) then
      insert into pg_temp.venta_trab (numero, presentacion_id, producto_id, factor, cantidad, precio_lista, precio_unitario, importe, piezas, regalo)
      select (select max(t.numero) from pg_temp.venta_trab t) + 1, pz.id, pz.producto_id, pz.factor, 1,
             coalesce(app.fn_precio(pz.id, v_lista), 0), 0, 0, pz.factor, true
      from app.presentacion pz where pz.id = (v_lealtad #>> '{regalo,presentacion_id}')::bigint;
    end if;
  end if;

  -- existencias: candado comun (producto_id ascendente) antes de leer lo disponible y los costos
  perform app.fn_bloquear_existencias(v_sucursal, array(select distinct t.producto_id from pg_temp.venta_trab t order by 1));
  -- lealtad (011, b): el regalo solo entra si cabe (mismo calculo que la venta: existencia - cargadas - lo demas de esta venta del mismo producto);
  -- si no cabe sale de la venta y el premio sigue pendiente. Asi el regalo nunca hace fallar la venta ni deja la existencia negativa.
  delete from pg_temp.venta_trab t
  where t.regalo
    and t.piezas > coalesce((select e.cantidad from app.existencia e where e.sucursal_id = v_sucursal and e.producto_id = t.producto_id), 0)
                 - coalesce((select c.cargadas from app.v_comprometido c where c.sucursal_id = v_sucursal and c.producto_id = t.producto_id), 0)
                 - case when v_con_cargadas
                        then coalesce((select sum(x.piezas) from pg_temp.venta_trab x where not x.regalo and x.producto_id = t.producto_id), 0)
                        else 0 end;
  select t.numero into v_regalo_num from pg_temp.venta_trab t where t.regalo;
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
  -- lealtad (011, c): una fila acumula por linea marcada (menos el regalo) y el canje del regalo
  if v_lealtad is not null then
    v_meta := (v_lealtad ->> 'meta')::integer;
    insert into app.lealtad_movimiento (cliente_id, venta_id, venta_linea_id, tipo, cantidad)
    select v_cliente_id, v_venta, vl.id, 'acumula', vl.cantidad
    from app.venta_linea vl join app.presentacion pz on pz.id = vl.presentacion_id
    where vl.venta_id = v_venta and pz.cuenta_lealtad and vl.precio_unitario > 0 and vl.numero is distinct from v_regalo_num
    order by vl.numero;
    if v_regalo_num is not null then
      select vl.id into v_regalo_linea from app.venta_linea vl where vl.venta_id = v_venta and vl.numero = v_regalo_num;
      insert into app.lealtad_movimiento (cliente_id, venta_id, venta_linea_id, tipo, cantidad)
      values (v_cliente_id, v_venta, v_regalo_linea, 'canje', -v_meta);
    end if;
  end if;
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

-- Misma firma que 008: CREATE OR REPLACE. Copia literal del cuerpo de 008 con un solo cambio: pasa `con_regalo` a fn_registrar_venta (en reparto el
-- regalo solo se da si el repartidor confirma que lo lleva; en recoge en bodega sigue automatico).
create or replace function app.fn_entregar_pedido(p_usuario_id bigint, p_pedido_id bigint, p_datos jsonb, p_hash text)
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
                                         'efectivo_recibido', p_datos -> 'efectivo_recibido', 'notas', p_datos -> 'notas',
                                         'con_regalo', p_datos -> 'con_regalo')),
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

-- Cancelar una venta: reverso = -(suma de sus movimientos) (el premio canjeado vuelve a pendiente; el regalo regresa al inventario con el resto).
-- Corre dentro de fn_cancelar_venta, que ya levanto fn_dinero_escribir y ya bloqueo al cliente.
create function app.fn_lealtad_reverso_venta() returns trigger
language plpgsql as $$
declare
  v_suma integer;
begin
  select coalesce(sum(m.cantidad), 0) into v_suma from app.lealtad_movimiento m where m.venta_id = new.id;
  if v_suma <> 0 then
    insert into app.lealtad_movimiento (cliente_id, venta_id, venta_linea_id, tipo, cantidad)
    values (new.cliente_id, new.id, null, 'reverso', -v_suma);
  end if;
  return null;
end $$;

create trigger trg_venta_lealtad after update of estado on app.venta
  for each row when (old.estado = 'completada' and new.estado = 'cancelada')
  execute function app.fn_lealtad_reverso_venta();

-- Devolver piezas de una linea que acumulo: reverso de -(floor(devueltas / factor) nuevo - anterior). Devolver el regalo (sin acumula) no repone el premio.
-- Corre dentro de fn_registrar_devolucion (ya levanto fn_dinero_escribir y bloqueo al cliente).
create function app.fn_lealtad_reverso_linea() returns trigger
language plpgsql as $$
declare
  v_cliente bigint;
  v_delta integer := new.piezas_devueltas / new.factor - old.piezas_devueltas / old.factor;
begin
  if v_delta <> 0 then
    select m.cliente_id into v_cliente from app.lealtad_movimiento m where m.venta_linea_id = new.id and m.tipo = 'acumula';
    if found then
      insert into app.lealtad_movimiento (cliente_id, venta_id, venta_linea_id, tipo, cantidad)
      values (v_cliente, new.venta_id, new.id, 'reverso', -v_delta);
    end if;
  end if;
  return null;
end $$;

create trigger trg_venta_linea_lealtad after update of piezas_devueltas on app.venta_linea
  for each row when (old.piezas_devueltas is distinct from new.piezas_devueltas)
  execute function app.fn_lealtad_reverso_linea();

-- Misma firma que 007: CREATE OR REPLACE. Copia literal + la llave `regalos`.
create or replace function app.fn_orden_carga(p_ruta_id bigint) returns jsonb
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
    'cajas_totales', coalesce((select sum(l.cajas) from lin l), 0)::int,
    -- 011: regalos de lealtad por cargar (aviso, no reserva): paradas de entrega cuyo cliente tiene premio pendiente
    'regalos', coalesce((
      select jsonb_agg(jsonb_build_object('carga_n', par.carga_n, 'cliente', par.cliente, 'producto', g.r #>> '{regalo,producto}',
                                          'presentacion', g.r #>> '{regalo,presentacion}', 'cantidad', 1) order by par.carga_n)
      from par
      join app.ruta_parada pa on pa.id = par.id and pa.tipo = 'entrega'
      cross join lateral (select app.fn_lealtad_cliente(pa.cliente_id) as r) g
      where (g.r ->> 'premio')::boolean and jsonb_typeof(g.r -> 'regalo') = 'object'
        -- un cliente con varias paradas de entrega en la ruta lleva el regalo solo en la de mayor carga_n (la primera que se entrega; el premio es uno)
        and not exists (select 1 from par p2 join app.ruta_parada q2 on q2.id = p2.id and q2.tipo = 'entrega'
                        where q2.cliente_id = pa.cliente_id and p2.carga_n > par.carga_n)), '[]'::jsonb))
$$;

-- ---------------------------------------------------------------- sugerencias de la zona (B15)

-- Presentaciones que compraron >= 3 clientes distintos de la zona actual del cliente (sin contarlo a el) en los ultimos 60 dias locales, de productos que
-- el no compro en esa ventana (ni siquiera de regalo); solo vendibles hoy con precio en su lista; una por producto (la de mas clientes; empate: mayor
-- factor, menor id); orden clientes desc, producto, presentacion; maximo 3. Las lineas regalo (con canje) no cuentan para la zona. Sin zona: vacio.
create function app.fn_sugerencias_zona(p_cliente_id bigint) returns table(presentacion_id bigint, clientes integer)
language sql stable as $$
  with yo as (
    select c.id, c.zona_id, c.lista_precio_id from app.cliente c where c.id = p_cliente_id and c.zona_id is not null
  ), ini as (
    select app.fn_inicio_dia(app.fn_fecha_local(now()) - 60) as desde
  ), propios as (
    select distinct vl.producto_id
    from app.venta v join app.venta_linea vl on vl.venta_id = v.id
    where v.cliente_id = p_cliente_id and v.estado = 'completada' and v.creado_en >= (select desde from ini)
  ), zona as (
    select vl.presentacion_id, vl.producto_id, count(distinct v.cliente_id)::integer as clientes
    from yo
    join app.cliente c on c.zona_id = yo.zona_id and c.id <> yo.id
    join app.venta v on v.cliente_id = c.id and v.estado = 'completada' and v.creado_en >= (select desde from ini)
    join app.venta_linea vl on vl.venta_id = v.id
    where not exists (select 1 from app.lealtad_movimiento m where m.venta_linea_id = vl.id and m.tipo = 'canje')
    group by vl.presentacion_id, vl.producto_id
    having count(distinct v.cliente_id) >= 3
  ), elegibles as (
    select z.presentacion_id, z.producto_id, z.clientes, pz.factor, pr.nombre as producto
    from zona z
    join app.presentacion pz on pz.id = z.presentacion_id and pz.activa and pz.se_vende
    join app.producto pr on pr.id = z.producto_id and pr.activo
    join app.categoria ca on ca.id = pr.categoria_id and ca.activa
    where z.producto_id not in (select p.producto_id from propios p)
      and app.fn_precio(z.presentacion_id, (select y.lista_precio_id from yo y)) is not null
  ), una as (
    select distinct on (e.producto_id) e.*
    from elegibles e
    order by e.producto_id, e.clientes desc, e.factor desc, e.presentacion_id
  )
  select u.presentacion_id, u.clientes from una u order by u.clientes desc, u.producto, u.presentacion_id limit 3
$$;

-- ---------------------------------------------------------------- semillas

-- trg_auditar desactivado: la bitacora arranca sin ruido (como en 008). `lealtad_presentacion_regalo_id` null = sin regalo elegido.
alter table app.configuracion disable trigger trg_auditar;
insert into app.configuracion (clave, valor) values
  ('lealtad_activa', 'false'), ('lealtad_cada', '10'), ('lealtad_presentacion_regalo_id', 'null');
alter table app.configuracion enable trigger trg_auditar;

alter table app.plantilla disable trigger trg_auditar;
insert into app.plantilla (clave, canal, titulo, texto, variables) values
  ('pantalla_lealtad_avance', 'pantalla', null, 'Llevas {{llevas}} de {{meta}} cajas para una {{regalo}} gratis', '{llevas,meta,regalo}'),
  ('pantalla_lealtad_premio', 'pantalla', null, '¡Ya ganaste! Tu siguiente pedido lleva {{regalo}} gratis', '{regalo}');
alter table app.plantilla enable trigger trg_auditar;

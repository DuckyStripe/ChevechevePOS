-- 009: reportes y tablero (CONTRATOS §2.9, §2.12 B13, §6). Solo lectura: vistas y una funcion; no hay tablas, permisos ni escrituras.
-- Una regla, un lugar: la API agrupa estas vistas (GROUP BY de una lista blanca) y no calcula nada fuera de SQL.
-- Fechas: dia local de negocio = app.fn_fecha_local(creado_en) (America/Mexico_City). Importes finales, sin impuestos.
-- Ventas canceladas no aparecen; las devoluciones restan en SU fecha (no en la de la venta).

-- ---------------------------------------------------------------- ventas

-- Una fila por linea vendida (signo 1) y una por linea devuelta (signo -1, con piezas, importe, costo y utilidad en negativo).
-- `ruta_id` es el del pedido de la venta; `zona_id`, la del cliente. Una devolucion hereda origen, ruta, cliente, zona y vendedor de su venta
-- (venta_id es el de la venta original; folio, el de la devolucion). num_ventas = count(distinct venta_id) filter (where signo > 0).
create view app.v_ventas_lineas as
select app.fn_fecha_local(v.creado_en) as fecha, v.sucursal_id, v.id as venta_id, v.folio, v.origen, p.ruta_id, v.usuario_id, v.cliente_id,
       c.zona_id, l.producto_id, pr.categoria_id, pr.marca_id, 1::smallint as signo, l.piezas, l.importe, l.costo_total,
       (l.importe - l.costo_total)::numeric(12,2) as utilidad
from app.venta v
join app.venta_linea l on l.venta_id = v.id
join app.producto pr on pr.id = l.producto_id
left join app.pedido p on p.id = v.pedido_id
left join app.cliente c on c.id = v.cliente_id
where v.estado = 'completada'
union all
select app.fn_fecha_local(d.creado_en), v.sucursal_id, v.id, d.folio, v.origen, p.ruta_id, v.usuario_id, v.cliente_id,
       c.zona_id, dl.producto_id, pr.categoria_id, pr.marca_id, (-1)::smallint, -dl.piezas, -dl.importe, -dl.costo_total,
       (-(dl.importe - dl.costo_total))::numeric(12,2)
from app.devolucion d
join app.devolucion_linea dl on dl.devolucion_id = d.id
join app.venta v on v.id = d.venta_id
join app.producto pr on pr.id = dl.producto_id
left join app.pedido p on p.id = v.pedido_id
left join app.cliente c on c.id = v.cliente_id;

-- Pagos de ventas completadas (bruto: las devoluciones no se reparten por metodo; el efectivo devuelto esta en los cortes).
create view app.v_ventas_pagos as
select app.fn_fecha_local(v.creado_en) as fecha, v.sucursal_id, v.id as venta_id, v.origen, g.metodo, g.monto, v.usuario_id, v.cliente_id
from app.venta v
join app.venta_pago g on g.venta_id = v.id
where v.estado = 'completada';

-- ---------------------------------------------------------------- compras y ajustes

create view app.v_compras_lineas as
select c.fecha, c.sucursal_id, c.id as compra_id, c.proveedor_id, l.producto_id, p.categoria_id, l.piezas, l.importe
from app.compra c
join app.compra_linea l on l.compra_id = c.id
join app.producto p on p.id = l.producto_id
where c.estado = 'registrada';

-- piezas y valor con signo (salidas negativas): valor = cantidad * costo_unitario. Las mermas de una devolucion que no regresa entran aqui.
create view app.v_ajustes_valor as
select app.fn_fecha_local(m.creado_en) as fecha, m.sucursal_id, m.producto_id, m.tipo, m.causa_merma, m.cantidad as piezas,
       round(m.cantidad * m.costo_unitario, 2)::numeric(12,2) as valor
from app.movimiento_inventario m
where m.tipo in ('merma','ajuste_salida','ajuste_entrada');

-- ---------------------------------------------------------------- inventario (leen `existencia`; nunca recalculan con el kardex)

-- cajas / sueltas con la presentacion de mayor factor que siga activa (sin presentaciones, factor 1).
create view app.v_inventario_valorizado as
select e.sucursal_id, p.id as producto_id, p.nombre as producto, p.categoria_id, c.nombre as categoria, p.modo_surtido,
       e.cantidad, e.costo_promedio, round(e.cantidad * e.costo_promedio, 2)::numeric(12,2) as valor,
       (e.cantidad / f.factor_mayor)::integer as cajas, (e.cantidad % f.factor_mayor)::integer as sueltas
from app.existencia e
join app.producto p on p.id = e.producto_id
join app.categoria c on c.id = p.categoria_id
cross join lateral (select coalesce(max(z.factor), 1) as factor_mayor from app.presentacion z where z.producto_id = p.id and z.activa) f;

-- Productos activos de inventario en o bajo su minimo (minimo 0 = sin minimo). Sin fila de existencia cuenta como 0.
create view app.v_bajo_minimo as
select s.id as sucursal_id, p.id as producto_id, p.nombre as producto, p.categoria_id, c.nombre as categoria, p.proveedor_id,
       coalesce(e.cantidad, 0) as cantidad, p.existencia_minima,
       (p.existencia_minima - coalesce(e.cantidad, 0)) as faltante, (coalesce(e.cantidad, 0) = 0) as agotado
from app.producto p
join app.categoria c on c.id = p.categoria_id
cross join app.sucursal s
left join app.existencia e on e.sucursal_id = s.id and e.producto_id = p.id
where p.activo and p.modo_surtido = 'inventario' and p.existencia_minima > 0 and coalesce(e.cantidad, 0) <= p.existencia_minima;

-- ---------------------------------------------------------------- entregas

-- Una fila por INTENTO de entrega: cada parada de entrega de una ruta no cancelada (el resultado es el de esa parada: visitada = entregado,
-- fallida u omitida = no_entregado, pendiente = el estado actual del pedido) y, aparte, los entregados sin ruta (recoge en mostrador).
-- Asi un pedido que fallo en R1 y se reprogramo a R2 cuenta como fallido en R1 y con su propio resultado en R2, aunque hoy diga otra cosa.
-- `fecha_entrega` = fecha de la ruta del intento. `ultima`: es el ultimo intento del pedido; lo no surtido (pedidas - confirmadas) es del pedido,
-- no del intento: se suma solo con `ultima` para no contarlo dos veces. `parcial`: entregado con menos piezas de las confirmadas.
-- importe_entregado = total de la venta completada del pedido, solo en el intento entregado (0 si no hubo).
create view app.v_entregas as
select p.id as pedido_id, p.sucursal_id, coalesce(r.fecha, p.fecha_entrega) as fecha_entrega, pa.ruta_id, r.repartidor_id, c.zona_id, p.cliente_id,
       case when pa.id is null then p.estado when pa.estado = 'visitada' then 'entregado' when pa.estado in ('fallida','omitida') then 'no_entregado' else p.estado end as estado,
       l.piezas_pedidas, l.piezas_confirmadas,
       (case when pa.id is null or pa.estado = 'visitada' then l.piezas_entregadas else 0 end)::integer as piezas_entregadas,
       p.total as importe_pedido,
       (case when pa.id is null or pa.estado = 'visitada' then coalesce(v.total, 0) else 0 end)::numeric(12,2) as importe_entregado,
       ((pa.id is null or pa.estado = 'visitada') and l.piezas_entregadas < l.piezas_confirmadas) as parcial,
       (pa.id is null or pa.id = (select max(z.id) from app.ruta_parada z join app.ruta rz on rz.id = z.ruta_id
                                   where z.pedido_id = p.id and z.tipo = 'entrega' and rz.estado <> 'cancelada')) as ultima
from app.pedido p
join app.cliente c on c.id = p.cliente_id
left join (app.ruta_parada pa join app.ruta r on r.id = pa.ruta_id and r.estado <> 'cancelada') on pa.pedido_id = p.id and pa.tipo = 'entrega'
left join app.venta v on v.id = p.venta_id and v.estado = 'completada'
cross join lateral (
  select coalesce(sum(x.cantidad_pedida * x.factor), 0)::integer as piezas_pedidas,
         coalesce(sum(x.piezas), 0)::integer as piezas_confirmadas,
         coalesce(sum(x.cantidad_entregada * x.factor), 0)::integer as piezas_entregadas
  from app.pedido_linea x where x.pedido_id = p.id) l
where pa.id is not null or p.estado = 'entregado';

-- Lo no surtido, por linea y producto (v_entregas es por intento y no dice de que producto): los mismos pedidos, una sola vez (ultimo intento).
create view app.v_faltantes_lineas as
select p.id as pedido_id, p.sucursal_id, coalesce(r.fecha, p.fecha_entrega) as fecha_entrega, pa.ruta_id, p.cliente_id, x.producto_id, pr.proveedor_id,
       (x.cantidad_pedida * x.factor) as piezas_pedidas, x.piezas as piezas_confirmadas, (x.cantidad_pedida * x.factor - x.piezas) as piezas_faltantes
from app.pedido p
join app.pedido_linea x on x.pedido_id = p.id
join app.producto pr on pr.id = x.producto_id
left join (app.ruta_parada pa join app.ruta r on r.id = pa.ruta_id and r.estado <> 'cancelada') on pa.pedido_id = p.id and pa.tipo = 'entrega'
where (pa.id is not null or p.estado = 'entregado')
  and (pa.id is null or pa.id = (select max(z.id) from app.ruta_parada z join app.ruta rz on rz.id = z.ruta_id
                                  where z.pedido_id = p.id and z.tipo = 'entrega' and rz.estado <> 'cancelada'))
  and x.cantidad_pedida * x.factor > x.piezas;

-- ---------------------------------------------------------------- cuentas por cobrar

-- Saldo pendiente por cliente en cubetas segun p_al - vence_el: <= 0 corriente; 1-30; 31-60; 61-90; mas de 90. «Vencimiento al p_al»: el saldo es
-- el de hoy (no se reconstruye lo abonado despues de p_al) de las cuentas que ya existian ese dia (fecha local de creado_en <= p_al).
-- p_sucursal_id (null = todas): la sucursal de la cuenta por la misma regla que /cobranza (v_cxc_sucursal).
create function app.fn_cxc_antiguedad(p_al date, p_sucursal_id bigint default null)
returns table(cliente_id bigint, nombre text, zona text, corriente numeric, d1_30 numeric, d31_60 numeric, d61_90 numeric, d90_mas numeric, total numeric)
language sql stable as $$
  select c.id, c.nombre, z.nombre,
         coalesce(sum(x.saldo) filter (where p_al - x.vence_el <= 0), 0)::numeric(12,2),
         coalesce(sum(x.saldo) filter (where p_al - x.vence_el between 1 and 30), 0)::numeric(12,2),
         coalesce(sum(x.saldo) filter (where p_al - x.vence_el between 31 and 60), 0)::numeric(12,2),
         coalesce(sum(x.saldo) filter (where p_al - x.vence_el between 61 and 90), 0)::numeric(12,2),
         coalesce(sum(x.saldo) filter (where p_al - x.vence_el > 90), 0)::numeric(12,2),
         sum(x.saldo)::numeric(12,2)
  from app.cuenta_por_cobrar x
  join app.v_cxc_sucursal cs on cs.cuenta_por_cobrar_id = x.id
  join app.cliente c on c.id = x.cliente_id
  left join app.zona z on z.id = c.zona_id
  where x.estado = 'pendiente' and app.fn_fecha_local(x.creado_en) <= p_al and (p_sucursal_id is null or cs.sucursal_id = p_sucursal_id)
  group by c.id, c.nombre, z.nombre
  order by sum(x.saldo) desc, c.nombre, c.id
$$;

-- ---------------------------------------------------------------- B13: ganancia por ruta

-- Por ruta con turno: utilidad de sus ventas (devoluciones restan) menos las salidas de caja (gastos) de su turno de ruta.
-- `fecha` = fecha de la ruta. El grupo «sin ruta» (mostrador) sale de agrupar v_ventas_lineas por ruta_id.
create view app.v_ganancia_ruta as
select r.id as ruta_id, r.sucursal_id, r.folio, r.fecha, r.repartidor_id,
       coalesce(u.importe, 0)::numeric(12,2) as importe, coalesce(u.costo_total, 0)::numeric(12,2) as costo_total,
       coalesce(u.utilidad, 0)::numeric(12,2) as utilidad, coalesce(g.gastos, 0)::numeric(12,2) as gastos,
       (coalesce(u.utilidad, 0) - coalesce(g.gastos, 0))::numeric(12,2) as ganancia
from app.ruta r
left join lateral (select sum(v.importe) as importe, sum(v.costo_total) as costo_total, sum(v.utilidad) as utilidad
                   from app.v_ventas_lineas v where v.ruta_id = r.id) u on true
left join lateral (select sum(m.monto) as gastos from app.movimiento_caja m where m.turno_caja_id = r.turno_caja_id and m.tipo = 'salida') g on true
where r.turno_caja_id is not null;

-- ---------------------------------------------------------------- resumen del dia sobre la misma vista

-- Cuerpo de 008 (misma firma) con un solo cambio: `vendido` y `ganancia` salen de v_ventas_lineas (ventas completadas menos devoluciones, por
-- fecha local), la misma regla de los reportes y del tablero. El resto es literal.
create or replace function app.fn_resumen_dia(p_sucursal_id bigint, p_fecha date) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'vendido', coalesce((select sum(l.importe) from app.v_ventas_lineas l where l.sucursal_id = p_sucursal_id and l.fecha = p_fecha), 0)::numeric(12,2)::text,
    'ganancia', coalesce((select sum(l.utilidad) from app.v_ventas_lineas l where l.sucursal_id = p_sucursal_id and l.fecha = p_fecha), 0)::numeric(12,2)::text,
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

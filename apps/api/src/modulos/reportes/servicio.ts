import { AppError } from "../../comun/errores.js";
import type { UsuarioSesion } from "../../comun/permisos.js";
import { consulta } from "../../db/database.js";

// Todo reporte es un GROUP BY sobre las vistas de 009 (CONTRATOS §2.9, §6). Aqui no se suma, no se redondea ni se calcula un margen:
// shortcut: sin indices ni cache; son GROUP BY sobre vistas y `cortes` llama fn_resumen_turno por fila. Con anos de datos, agregar indices por fecha
// o una tabla resumen (hoy una sucursal y decenas de ventas al dia: sobra).
// los textos SQL de abajo son constantes del modulo; del cliente solo llegan valores ($n) y una palabra de lista blanca que elige un mapa fijo.

export interface Rango {
  desde: string;
  hasta: string;
}

/** Fechas locales inclusivas. Por defecto, el mes en curso (de la fecha local de hoy). Desde > hasta o mas de 366 dias: 400 VALIDACION. */
export async function resolverRango(f: { desde?: string; hasta?: string }): Promise<Rango> {
  const r = await consulta<{ desde: string; hasta: string; dias: number }>(
    `select d::text as desde, h::text as hasta, (h - d + 1) as dias
       from (select coalesce($2::date, app.fn_fecha_local(now())) as h) a
      cross join lateral (select coalesce($1::date, date_trunc('month', a.h::timestamp)::date) as d) b`,
    [f.desde ?? null, f.hasta ?? null],
  );
  const x = r.rows[0]!;
  if (x.dias < 1 || x.dias > 366) throw new AppError("VALIDACION", { campo: "desde", maximo_dias: 366 });
  return { desde: x.desde, hasta: x.hasta };
}

type Fila = Record<string, unknown>;

/** Dinero de un agregado: nunca null, siempre con 2 decimales y como texto. */
const din = (expr: string): string => `coalesce(${expr}, 0)::numeric(14,2)::text`;
const entero = (expr: string): string => `coalesce(${expr}, 0)::int`;

/** Separa la fila de totales (la del grupo vacio de GROUPING SETS) de las filas del grupo. `llaves` son las columnas que no van en totales. */
function partir(filas: Fila[], llaves: string[]): { filas: Fila[]; totales: Fila } {
  const grupos: Fila[] = [];
  let totales: Fila = {};
  for (const f of filas) {
    const { es_total, ...resto } = f;
    if (es_total) {
      totales = Object.fromEntries(Object.entries(resto).filter(([k]) => !llaves.includes(k)));
    } else {
      grupos.push(resto);
    }
  }
  return { filas: grupos, totales };
}

// ------------------------------------------------------------------ agrupaciones (lista blanca -> columnas)

interface Grupo {
  clave: string;
  etiqueta: string;
  joins?: string;
  /** Los grupos por fecha se ordenan por clave; los demas, por su metrica principal (mayor primero). */
  fecha?: boolean;
}

const nombreDe = (tabla: string, alias: string, fk: string, col = "nombre"): Pick<Grupo, "joins" | "etiqueta"> => ({
  joins: `left join app.${tabla} ${alias} on ${alias}.id = ${fk}`,
  etiqueta: `${alias}.${col}`,
});
const ORIGENES = "case l.origen when 'mostrador' then 'Mostrador' when 'pedido' then 'Pedido' else l.origen end";

const dia = (col: string): Grupo => ({ clave: `${col}::text`, etiqueta: `${col}::text`, fecha: true });
const mes = (col: string): Grupo => ({ clave: `to_char(${col}, 'YYYY-MM')`, etiqueta: `to_char(${col}, 'YYYY-MM')`, fecha: true });

const GRUPOS_VENTAS: Record<string, Grupo> = {
  dia: dia("l.fecha"),
  mes: mes("l.fecha"),
  usuario: { clave: "l.usuario_id::text", ...nombreDe("usuario", "g", "l.usuario_id") },
  cliente: { clave: "l.cliente_id::text", ...nombreDe("cliente", "g", "l.cliente_id") },
  zona: { clave: "l.zona_id::text", ...nombreDe("zona", "g", "l.zona_id") },
  ruta: { clave: "l.ruta_id::text", ...nombreDe("ruta", "g", "l.ruta_id", "folio") },
  origen: { clave: "l.origen", etiqueta: ORIGENES },
  producto: { clave: "l.producto_id::text", ...nombreDe("producto", "g", "l.producto_id") },
  categoria: { clave: "l.categoria_id::text", ...nombreDe("categoria", "g", "l.categoria_id") },
};
const GRUPOS_COMPRAS: Record<string, Grupo> = {
  dia: dia("l.fecha"),
  mes: mes("l.fecha"),
  proveedor: { clave: "l.proveedor_id::text", ...nombreDe("proveedor", "g", "l.proveedor_id") },
  producto: GRUPOS_VENTAS.producto!,
  categoria: GRUPOS_VENTAS.categoria!,
};
const GRUPOS_ENTREGAS: Record<string, Grupo> = {
  dia: dia("l.fecha_entrega"),
  ruta: GRUPOS_VENTAS.ruta!,
  repartidor: { clave: "l.repartidor_id::text", ...nombreDe("usuario", "g", "l.repartidor_id") },
  zona: GRUPOS_VENTAS.zona!,
  cliente: GRUPOS_VENTAS.cliente!,
};
const GRUPOS_FALTANTES: Record<string, Grupo> = {
  producto: GRUPOS_VENTAS.producto!,
  proveedor: GRUPOS_COMPRAS.proveedor!,
};
const METODOS = "case l.metodo when 'efectivo' then 'Efectivo' when 'transferencia' then 'Transferencia' when 'tarjeta' then 'Tarjeta' when 'credito' then 'Crédito' else l.metodo end";

/**
 * Una consulta agrupada: CTE `x` (la vista `l` + los joins del grupo + `clave` y `etiqueta`), y un GROUP BY con GROUPING SETS que
 * da, en la misma consulta, las filas del grupo y la fila de totales (totales reales: un conteo distinto no es la suma de los grupos).
 */
async function agrupado(o: {
  vista: string;
  grupo: Grupo;
  donde: string;
  params: unknown[];
  metricas: string;
  /** Expresion agregada por la que se ordenan los grupos que no son fechas. */
  orden: string;
}): Promise<{ filas: Fila[]; totales: Fila }> {
  const { grupo: g } = o;
  const r = await consulta(
    `with x as (select ${g.clave} as clave, ${g.etiqueta} as etiqueta, l.* from app.${o.vista} l ${g.joins ?? ""} where ${o.donde})
     select grouping(clave, etiqueta) = 3 as es_total, clave, etiqueta, ${o.metricas}
       from x group by grouping sets ((clave, etiqueta), ())
      order by grouping(clave, etiqueta), ${g.fecha ? "clave" : `${o.orden} desc, etiqueta, clave`}`,
    o.params,
  );
  return partir(r.rows, ["clave", "etiqueta"]);
}

const enRango = (col: string): string => `l.sucursal_id = $1 and ${col} between $2::date and $3::date`;

// ------------------------------------------------------------------ reportes

export async function ventas(sucursal: string, r: Rango, agrupar: string) {
  const params = [sucursal, r.desde, r.hasta];
  if (agrupar === "metodo") {
    // Pagos de ventas completadas (bruto): no hay piezas por forma de pago ni devoluciones repartidas.
    return agrupado({
      vista: "v_ventas_pagos", grupo: { clave: "l.metodo", etiqueta: METODOS }, donde: enRango("l.fecha"), params, orden: "sum(monto)",
      metricas: `count(distinct venta_id)::int as num_ventas, null::int as piezas, ${din("sum(monto)")} as importe`,
    });
  }
  return agrupado({
    vista: "v_ventas_lineas", grupo: GRUPOS_VENTAS[agrupar]!, donde: enRango("l.fecha"), params, orden: "sum(importe)",
    metricas: `(count(distinct venta_id) filter (where signo > 0))::int as num_ventas, ${entero("sum(piezas)")} as piezas, ${din("sum(importe)")} as importe`,
  });
}

export async function compras(sucursal: string, r: Rango, agrupar: string) {
  return agrupado({
    vista: "v_compras_lineas", grupo: GRUPOS_COMPRAS[agrupar]!, donde: enRango("l.fecha"), params: [sucursal, r.desde, r.hasta], orden: "sum(importe)",
    metricas: `count(distinct compra_id)::int as num_compras, ${entero("sum(piezas)")} as piezas, ${din("sum(importe)")} as importe`,
  });
}

/** margen = round(utilidad / importe, 4); null si el importe no es positivo (un dia con mas devoluciones que ventas). */
const MARGEN = "case when sum(importe) > 0 then round(sum(utilidad) / sum(importe), 4)::text end";

export async function utilidad(sucursal: string, r: Rango, agrupar: string) {
  const params = [sucursal, r.desde, r.hasta];
  const cuerpo = await agrupado({
    vista: "v_ventas_lineas", grupo: GRUPOS_VENTAS[agrupar]!, donde: enRango("l.fecha"), params, orden: "sum(utilidad)",
    metricas: `${din("sum(importe)")} as importe, ${din("sum(costo_total)")} as costo, ${din("sum(utilidad)")} as utilidad, ${MARGEN} as margen`,
  });
  // Mermas (por causa) y ajustes de inventario del periodo; utilidad_neta = utilidad bruta + sum(valor con signo).
  const a = await consulta<{ mermas_por_causa: Record<string, string>; ajustes_netos: string; utilidad_neta: string }>(
    `select coalesce((select jsonb_object_agg(causa, valor) from (
                        select coalesce(causa_merma, 'sin_causa') as causa, sum(valor)::numeric(14,2)::text as valor
                          from app.v_ajustes_valor where tipo = 'merma' and sucursal_id = $1 and fecha between $2::date and $3::date group by 1) m), '{}'::jsonb) as mermas_por_causa,
            ${din("(select sum(valor) from app.v_ajustes_valor where tipo <> 'merma' and sucursal_id = $1 and fecha between $2::date and $3::date)")} as ajustes_netos,
            (coalesce((select sum(utilidad) from app.v_ventas_lineas where sucursal_id = $1 and fecha between $2::date and $3::date), 0)
             + coalesce((select sum(valor) from app.v_ajustes_valor where sucursal_id = $1 and fecha between $2::date and $3::date), 0))::numeric(14,2)::text as utilidad_neta`,
    params,
  );
  const { mermas_por_causa, ajustes_netos, utilidad_neta } = a.rows[0]!;
  return { ...cuerpo, ajustes: { mermas_por_causa, ajustes_netos }, utilidad_neta };
}

/** B13. Cliente y zona: utilidad de las ventas (devoluciones restan). Ruta: `v_ganancia_ruta` (rutas del periodo, menos sus gastos) mas «sin ruta» (mostrador). */
export async function ganancia(sucursal: string, r: Rango, agrupar: string) {
  const params = [sucursal, r.desde, r.hasta];
  if (agrupar !== "ruta") {
    return agrupado({
      vista: "v_ventas_lineas", grupo: GRUPOS_VENTAS[agrupar]!, donde: enRango("l.fecha"), params, orden: "sum(utilidad)",
      metricas: `${din("sum(importe)")} as importe, ${din("sum(costo_total)")} as costo, ${din("sum(utilidad)")} as utilidad, ${din("sum(utilidad)")} as ganancia`,
    });
  }
  const res = await consulta(
    `with x as (
       select g.ruta_id::text as clave, g.folio as etiqueta, g.importe, g.costo_total, g.utilidad, g.gastos, g.ganancia
         from app.v_ganancia_ruta g where g.sucursal_id = $1 and g.fecha between $2::date and $3::date
       union all
       select null, null, sum(l.importe), sum(l.costo_total), sum(l.utilidad), 0::numeric, sum(l.utilidad)
         from app.v_ventas_lineas l where ${enRango("l.fecha")} and l.ruta_id is null having count(*) > 0)
     select grouping(clave, etiqueta) = 3 as es_total, clave, etiqueta, ${din("sum(importe)")} as importe, ${din("sum(costo_total)")} as costo,
            ${din("sum(utilidad)")} as utilidad, ${din("sum(gastos)")} as gastos_ruta, ${din("sum(ganancia)")} as ganancia
       from x group by grouping sets ((clave, etiqueta), ())
      order by grouping(clave, etiqueta), sum(ganancia) desc, etiqueta, clave`,
    params,
  );
  return partir(res.rows, ["clave", "etiqueta"]);
}

export async function entregas(sucursal: string, r: Rango, agrupar: string) {
  return agrupado({
    vista: "v_entregas", grupo: GRUPOS_ENTREGAS[agrupar]!, donde: enRango("l.fecha_entrega"), params: [sucursal, r.desde, r.hasta], orden: "count(*)",
    metricas: `count(*)::int as pedidos, (count(*) filter (where estado = 'entregado'))::int as entregados,
               (count(*) filter (where estado = 'no_entregado'))::int as fallidos, (count(*) filter (where parcial))::int as parciales,
               ${entero("sum(piezas_pedidas - piezas_confirmadas) filter (where ultima)")} as piezas_faltantes,
               ${din("sum(importe_pedido)")} as importe_pedido, ${din("sum(importe_entregado)")} as importe_entregado`,
  });
}

/** Demanda perdida: lo pedido que no se pudo surtir, por producto o proveedor (`v_faltantes_lineas`). */
export async function faltantes(sucursal: string, r: Rango, agrupar: string) {
  return agrupado({
    vista: "v_faltantes_lineas", grupo: GRUPOS_FALTANTES[agrupar]!, donde: enRango("l.fecha_entrega"), params: [sucursal, r.desde, r.hasta], orden: "sum(piezas_faltantes)",
    metricas: `${entero("sum(piezas_faltantes)")} as piezas_faltantes`,
  });
}

export async function inventarioValorizado(sucursal: string, categoriaId: string | undefined) {
  const r = await consulta<{ filas: Fila[]; valor_total: string }>(
    `with f as (
       select v.producto_id, v.producto, v.categoria, v.cantidad, v.cajas, v.sueltas, v.costo_promedio, v.valor
         from app.v_inventario_valorizado v where v.sucursal_id = $1 and ($2::bigint is null or v.categoria_id = $2::bigint))
     select coalesce(jsonb_agg(jsonb_build_object('producto_id', producto_id::text, 'producto', producto, 'categoria', categoria, 'cantidad', cantidad,
                                                  'cajas', cajas, 'sueltas', sueltas, 'costo_promedio', costo_promedio::text, 'valor', valor::text)
                               order by valor desc, producto, producto_id), '[]'::jsonb) as filas,
            ${din("sum(valor)")} as valor_total
       from f`,
    [sucursal, categoriaId ?? null],
  );
  return r.rows[0]!;
}

export async function bajoMinimo(sucursal: string) {
  const r = await consulta(
    `select producto_id::text as producto_id, producto, categoria, cantidad, existencia_minima, faltante, agotado
       from app.v_bajo_minimo where sucursal_id = $1 order by agotado desc, faltante desc, producto, producto_id`,
    [sucursal],
  );
  return { filas: r.rows };
}

/** `fn_cxc_antiguedad` (cubetas por dias vencidos «al» `al`; saldo de hoy de las cuentas que ya existian ese dia), de la sucursal por `v_cxc_sucursal`. */
export async function cuentasPorCobrar(sucursal: string, al: string | undefined, zonaId: string | undefined) {
  const r = await consulta(
    `with f as (
       select x.*, c.zona_id from app.fn_cxc_antiguedad(coalesce($1::date, app.fn_fecha_local(now())), $3::bigint) x join app.cliente c on c.id = x.cliente_id
        where $2::bigint is null or c.zona_id = $2::bigint)
     select grouping(cliente_id, nombre, zona) = 7 as es_total, cliente_id::text as cliente_id, nombre, zona,
            ${din("sum(corriente)")} as corriente, ${din("sum(d1_30)")} as d1_30, ${din("sum(d31_60)")} as d31_60,
            ${din("sum(d61_90)")} as d61_90, ${din("sum(d90_mas)")} as d90_mas, ${din("sum(total)")} as total
       from f group by grouping sets ((cliente_id, nombre, zona), ())
      order by grouping(cliente_id, nombre, zona), sum(total) desc, nombre, cliente_id`,
    [al ?? null, zonaId ?? null, sucursal],
  );
  return partir(r.rows, ["cliente_id", "nombre", "zona"]);
}

/**
 * Turnos del rango (por dia local de apertura) con su resumen de `fn_resumen_turno` (unica regla del efectivo esperado: en uno abierto es el
 * esperado a hoy). Mismo alcance que `GET /turnos`: caja.supervisar ve todos; solo rutas.liquidar, los de ruta.
 */
export async function cortes(u: UsuarioSesion, r: Rango, f: { tipo?: string; usuario_id?: string; caja_id?: string }) {
  const todos = u.permisos.includes("caja.supervisar");
  const res = await consulta(
    `select t.id::text as id, t.tipo, t.caja_id::text as caja_id, t.ruta_id::text as ruta_id,
            json_build_object('id', us.id::text, 'nombre', us.nombre) as usuario,
            case when k.id is null then null else json_build_object('id', k.id::text, 'nombre', k.nombre) end as caja,
            t.estado, t.fondo_inicial::text as fondo_inicial, t.abierto_en, t.cerrado_en,
            m.s ->> 'efectivo_esperado' as efectivo_esperado, m.s ->> 'efectivo_contado' as efectivo_contado, m.s ->> 'diferencia' as diferencia,
            m.s -> 'ventas' as ventas, m.s -> 'abonos' as abonos, m.s ->> 'entradas' as entradas, m.s ->> 'salidas' as salidas,
            m.s ->> 'retiros' as retiros, m.s ->> 'reembolsos' as reembolsos
       from app.turno_caja t
       join app.usuario us on us.id = t.usuario_id
       left join app.caja k on k.id = t.caja_id
       left join app.ruta ru on ru.id = t.ruta_id
      cross join lateral (select app.fn_resumen_turno(t.id) as s) m
      where coalesce(k.sucursal_id, ru.sucursal_id) = $1
        and t.abierto_en >= app.fn_inicio_dia($2::date) and t.abierto_en < app.fn_inicio_dia($3::date + 1)
        and ($4::boolean or t.tipo = 'ruta')
        and ($5::text is null or t.tipo = $5::text)
        and ($6::bigint is null or t.usuario_id = $6::bigint)
        and ($7::bigint is null or t.caja_id = $7::bigint)
      order by t.abierto_en desc, t.id desc`,
    [u.sucursal_id, r.desde, r.hasta, todos, f.tipo ?? null, f.usuario_id ?? null, f.caja_id ?? null],
  );
  return { filas: res.rows };
}

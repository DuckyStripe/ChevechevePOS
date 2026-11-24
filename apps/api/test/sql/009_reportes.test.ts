import { spawnSync } from "node:child_process";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "./ayuda.js";
import { D0, D1, D2, juegoReportes, type JuegoReportes } from "./ayuda-reportes.js";

// Juego fijo de F9.md (paquete B). Todo se arma una vez en una transaccion que se deshace al final; las pruebas solo leen.
// Cada consulta filtra por las fechas y los productos del juego: la base de pruebas puede traer datos de otras suites.
let c: pg.PoolClient;
let j: JuegoReportes;

beforeAll(async () => {
  c = await pool.connect();
  await c.query("begin");
  j = await juegoReportes(c);
}, 60_000);

afterAll(async () => {
  await c.query("rollback").catch(() => undefined);
  c.release();
  await pool.end();
});

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => (await c.query(sql, params)).rows as T[];
const ventas = (donde = "true") => `from app.v_ventas_lineas where fecha between '${D1}' and '${D2}' and producto_id = any($1) and ${donde}`;

describe("migracion 009", () => {
  it("000-009 aplicadas y re-correr no aplica nada", async () => {
    const r = await pool.query("select archivo from app.migraciones order by archivo");
    expect(r.rows.map((x) => x.archivo)).toEqual(expect.arrayContaining(["008_ventas_cobro.sql", "009_reportes.sql"]));
    const p = spawnSync(process.execPath, ["scripts/migrar.mjs"], { encoding: "utf8", env: process.env });
    expect(p.stdout).toContain("nada pendiente");
  });
});

describe("ventas (v_ventas_lineas, v_ventas_pagos)", () => {
  it("por dia: V1 cuenta en D1 por hora de Mexico, DV1 resta en D2 y V4 cancelada no aparece", async () => {
    const f = await q(`select fecha::text as clave, (count(distinct venta_id) filter (where signo > 0))::int as num_ventas, sum(piezas)::int as piezas,
      sum(importe)::text as importe ${ventas()} group by fecha order by fecha`, [j.productos]);
    expect(f).toEqual([
      { clave: D1, num_ventas: 2, piezas: 84, importe: "1410.00" },
      { clave: D2, num_ventas: 1, piezas: 0, importe: "-10.00" },
    ]);
    const [t] = await q(`select (count(distinct venta_id) filter (where signo > 0))::int as num_ventas, sum(piezas)::int as piezas, sum(importe)::text as importe ${ventas()}`, [j.productos]);
    expect(t).toEqual({ num_ventas: 3, piezas: 84, importe: "1400.00" });
    expect((await q(`select 1 from app.v_ventas_lineas where venta_id = $1`, [j.V4])).length).toBe(0);
  });

  it("por origen: mostrador 600.00 (36 pz) y pedido 800.00 (48 pz)", async () => {
    const f = await q(`select origen, sum(piezas)::int as piezas, sum(importe)::text as importe ${ventas()} group by origen order by origen`, [j.productos]);
    expect(f).toEqual([{ origen: "mostrador", piezas: 36, importe: "600.00" }, { origen: "pedido", piezas: 48, importe: "800.00" }]);
  });

  it("por metodo (pagos de completadas, bruto): efectivo 1410.00 en 2 ventas y credito 390.00 en 1", async () => {
    const f = await q(`select metodo, count(distinct venta_id)::int as num_ventas, sum(monto)::text as importe from app.v_ventas_pagos
      where venta_id = any($1) group by metodo order by metodo`, [[j.V1, j.V2, j.V3, j.V4]]);
    expect(f).toEqual([{ metodo: "credito", num_ventas: 1, importe: "390.00" }, { metodo: "efectivo", num_ventas: 2, importe: "1410.00" }]);
    const [x] = await q("select fecha::text, origen, usuario_id, cliente_id from app.v_ventas_pagos where venta_id = $1", [j.V3]);
    expect(x).toEqual({ fecha: D2, origen: "mostrador", usuario_id: j.dueno, cliente_id: j.C });
  });

  it("columnas de contexto: ruta del pedido, zona del cliente, categoria y marca del producto", async () => {
    const [l] = await q(`select ruta_id, zona_id, categoria_id, marca_id, usuario_id, signo from app.v_ventas_lineas where venta_id = $1 and signo > 0`, [j.V2]);
    const [esperado] = await q(`select $2::bigint as ruta_id, (select zona_id from app.cliente where id = $3) as zona_id, p.categoria_id, p.marca_id, $4::bigint as usuario_id
      from app.producto p where p.id = $1`, [j.corona.id, j.R1, j.A, j.rep]);
    expect(l).toMatchObject({ ...esperado, signo: 1 });
    expect((l as { zona_id: string }).zona_id).not.toBeNull();
    const [d] = await q(`select ruta_id, signo, piezas, importe::text from app.v_ventas_lineas where signo < 0 and venta_id = $1`, [j.V2]);
    expect(d).toEqual({ ruta_id: j.R1, signo: -1, piezas: -24, importe: "-400.00" });
  });
});

describe("compras (v_compras_lineas)", () => {
  it("por proveedor: Modelo 2 compras 264 pz 3290.00, Heineken 1 compra 24 pz 240.00, total 3530.00; C4 cancelada no aparece", async () => {
    const f = await q(`select proveedor_id, count(distinct compra_id)::int as num_compras, sum(piezas)::int as piezas, sum(importe)::text as importe
      from app.v_compras_lineas where fecha = $1 and producto_id = any($2) group by proveedor_id`, [D0, j.productos]);
    expect(Object.fromEntries(f.map((x) => [(x as { proveedor_id: string }).proveedor_id, x]))).toEqual({
      [j.modelo]: { proveedor_id: j.modelo, num_compras: 2, piezas: 264, importe: "3290.00" },
      [j.heineken]: { proveedor_id: j.heineken, num_compras: 1, piezas: 24, importe: "240.00" },
    });
    const [t] = await q("select sum(importe)::text as importe from app.v_compras_lineas where fecha = $1 and producto_id = any($2)", [D0, j.productos]);
    expect(t).toEqual({ importe: "3530.00" });
    expect((await q("select 1 from app.v_compras_lineas where compra_id = $1", [j.C4])).length).toBe(0);
  });
});

describe("utilidad y ajustes (v_ventas_lineas, v_ajustes_valor)", () => {
  it("por dia: importe, costo, utilidad y margen (null con importe <= 0); totales y utilidad neta 325.00", async () => {
    const margen = "case when sum(importe) > 0 then round(sum(utilidad) / sum(importe), 4) end::text";
    const f = await q(`select fecha::text as clave, sum(importe)::text as importe, sum(costo_total)::text as costo, sum(utilidad)::text as utilidad, ${margen} as margen
      ${ventas()} group by fecha order by fecha`, [j.productos]);
    expect(f).toEqual([
      { clave: D1, importe: "1410.00", costo: "1050.00", utilidad: "360.00", margen: "0.2553" },
      { clave: D2, importe: "-10.00", costo: "-10.00", utilidad: "0.00", margen: null },
    ]);
    const [t] = await q(`select sum(importe)::text as importe, sum(costo_total)::text as costo, sum(utilidad)::text as utilidad, ${margen} as margen ${ventas()}`, [j.productos]);
    expect(t).toEqual({ importe: "1400.00", costo: "1040.00", utilidad: "360.00", margen: "0.2571" });

    const mermas = await q(`select causa_merma, sum(valor)::text as valor from app.v_ajustes_valor
      where fecha between $1 and $2 and producto_id = any($3) and tipo = 'merma' group by causa_merma`, [D1, D2, j.productos]);
    expect(mermas).toEqual([{ causa_merma: "caducado", valor: "-60.00" }]);
    const aj = `from app.v_ajustes_valor where fecha between '${D1}' and '${D2}' and producto_id = any($1)`;
    const [a] = await q(`select (sum(valor) filter (where tipo in ('ajuste_entrada','ajuste_salida')))::text as netos, sum(valor)::text as todo,
      ((select sum(utilidad) ${ventas()}) + sum(valor))::text as neta ${aj}`, [j.productos]);
    expect(a).toEqual({ netos: "25.00", todo: "-35.00", neta: "325.00" });
  });

  it("las columnas de v_ajustes_valor traen piezas con signo y valor = cantidad * costo", async () => {
    const f = await q("select tipo, piezas, valor::text from app.v_ajustes_valor where fecha = $1 and producto_id = any($2) order by tipo", [D2, j.productos]);
    expect(f).toEqual([
      { tipo: "ajuste_entrada", piezas: 2, valor: "25.00" },
      { tipo: "merma", piezas: -6, valor: "-60.00" },
    ]);
  });
});

describe("ganancia por cliente y por ruta (B13)", () => {
  it("por cliente: A 200.00 (300 - 100 de DV1), C 100.00, publico (clave null) 60.00", async () => {
    const f = await q(`select cliente_id, sum(utilidad)::text as utilidad ${ventas()} group by cliente_id`, [j.productos]);
    expect(Object.fromEntries(f.map((x) => [String((x as { cliente_id: string | null }).cliente_id), (x as { utilidad: string }).utilidad])))
      .toEqual({ [j.A]: "200.00", [j.C]: "100.00", null: "60.00" });
  });

  it("por ruta: R1 utilidad 200.00, gastos 150.00, ganancia 50.00; sin ruta 160.00", async () => {
    const [r] = await q("select utilidad::text, gastos::text, ganancia::text, fecha::text, importe::text, costo_total::text from app.v_ganancia_ruta where ruta_id = $1", [j.R1]);
    expect(r).toEqual({ utilidad: "200.00", gastos: "150.00", ganancia: "50.00", fecha: D1, importe: "800.00", costo_total: "600.00" });
    const [s] = await q(`select sum(utilidad)::text as utilidad ${ventas("ruta_id is null")}`, [j.productos]);
    expect(s).toEqual({ utilidad: "160.00" });
  });
});

describe("inventario (v_inventario_valorizado, v_bajo_minimo)", () => {
  it("valorizado: Corona 182 pz 2275.00 (7 cajas, 14 sueltas), Victoria 0, Tecate 18 pz 180.00, total 2455.00; cantidad = existencia", async () => {
    const f = await q<Record<string, string | number>>(`select producto_id, cantidad, valor::text, cajas, sueltas, costo_promedio::text, modo_surtido
      from app.v_inventario_valorizado where producto_id = any($1)`, [j.productos]);
    const por = Object.fromEntries(f.map((x) => [x.producto_id, x]));
    expect(por[j.corona.id]).toMatchObject({ cantidad: 182, valor: "2275.00", cajas: 7, sueltas: 14, costo_promedio: "12.500000", modo_surtido: "inventario" });
    expect(por[j.victoria.id]).toMatchObject({ cantidad: 0, valor: "0.00", cajas: 0, sueltas: 0 });
    expect(por[j.tecate.id]).toMatchObject({ cantidad: 18, valor: "180.00", cajas: 0, sueltas: 18 });
    const [t] = await q("select sum(valor)::text as valor_total from app.v_inventario_valorizado where producto_id = any($1)", [j.productos]);
    expect(t).toEqual({ valor_total: "2455.00" });
    const [x] = await q(`select count(*)::int as n from app.v_inventario_valorizado v join app.existencia e on e.producto_id = v.producto_id and e.sucursal_id = v.sucursal_id
      where v.cantidad <> e.cantidad`);
    expect(x).toEqual({ n: 0 });
  });

  it("bajo minimo: Victoria faltante 12 agotado, Tecate faltante 6 no agotado, Corona (minimo 0) no sale", async () => {
    const f = await q(`select producto_id, cantidad, existencia_minima, faltante, agotado from app.v_bajo_minimo where producto_id = any($1) order by existencia_minima`, [j.productos]);
    expect(f).toEqual([
      { producto_id: j.victoria.id, cantidad: 0, existencia_minima: 12, faltante: 12, agotado: true },
      { producto_id: j.tecate.id, cantidad: 18, existencia_minima: 24, faltante: 6, agotado: false },
    ]);
  });
});

describe("entregas y faltantes (v_entregas)", () => {
  it("R1: 2 pedidos, 1 entregado, 1 fallido, 0 parciales, 24 pz faltantes, pedido 1600.00, entregado 1200.00", async () => {
    const [r] = await q(`select count(*)::int as pedidos, (count(*) filter (where estado = 'entregado'))::int as entregados,
      (count(*) filter (where estado = 'no_entregado'))::int as fallidos, (count(*) filter (where parcial))::int as parciales,
      sum(piezas_pedidas - piezas_confirmadas)::int as piezas_faltantes, sum(importe_pedido)::text as importe_pedido, sum(importe_entregado)::text as importe_entregado
      from app.v_entregas where ruta_id = $1`, [j.R1]);
    expect(r).toEqual({ pedidos: 2, entregados: 1, fallidos: 1, parciales: 0, piezas_faltantes: 24, importe_pedido: "1600.00", importe_entregado: "1200.00" });
    const [x] = await q("select fecha_entrega::text, repartidor_id, piezas_pedidas, piezas_confirmadas, piezas_entregadas, cliente_id from app.v_entregas where pedido_id = $1", [j.pedidoA]);
    expect(x).toEqual({ fecha_entrega: D1, repartidor_id: j.rep, piezas_pedidas: 72, piezas_confirmadas: 72, piezas_entregadas: 72, cliente_id: j.A });
    const [y] = await q("select piezas_pedidas, piezas_confirmadas, piezas_entregadas from app.v_entregas where pedido_id = $1", [j.pedidoB]);
    expect(y).toEqual({ piezas_pedidas: 48, piezas_confirmadas: 24, piezas_entregadas: 0 });
  });

  it("faltantes por producto (v_faltantes_lineas): Corona 24 pz", async () => {
    const f = await q("select producto_id, sum(piezas_faltantes)::int as piezas from app.v_faltantes_lineas where producto_id = any($1) group by producto_id", [j.productos]);
    expect(f).toEqual([{ producto_id: j.corona.id, piezas: 24 }]);
  });
});

describe("cuentas por cobrar (fn_cxc_antiguedad)", () => {
  it("al 2026-12-13: C 390.00 en d31_60 (vencio 2026-11-10), A 500.00 corriente, totales 890.00", async () => {
    const f = await q<Record<string, string>>(`select cliente_id, nombre, zona, corriente::text, d1_30::text, d31_60::text, d61_90::text, d90_mas::text, total::text
      from app.fn_cxc_antiguedad('2026-12-13') where cliente_id = any($1) order by cliente_id`, [[j.A, j.B, j.C]]);
    const por = Object.fromEntries(f.map((x) => [x.cliente_id, x]));
    expect(por[j.C]).toMatchObject({ corriente: "0.00", d1_30: "0.00", d31_60: "390.00", d61_90: "0.00", d90_mas: "0.00", total: "390.00" });
    expect(por[j.A]).toMatchObject({ corriente: "500.00", d1_30: "0.00", d31_60: "0.00", total: "500.00" });
    expect(por[j.B]).toBeUndefined();
    const [t] = await q(`select sum(corriente)::text as corriente, sum(d31_60)::text as d31_60, sum(total)::text as total
      from app.fn_cxc_antiguedad('2026-12-13') where cliente_id = any($1)`, [[j.A, j.B, j.C]]);
    expect(t).toEqual({ corriente: "500.00", d31_60: "390.00", total: "890.00" });
  });

  it("las cubetas se cortan en 0, 30, 60 y 90 dias", async () => {
    // C vence el 2026-11-10: 0 dias = corriente, 1 = d1_30, 30 = d1_30, 31 = d31_60, 60 = d31_60, 61 = d61_90, 90 = d61_90, 91 = d90_mas
    const caso = async (al: string) => (await q<Record<string, string>>(
      "select corriente::text, d1_30::text, d31_60::text, d61_90::text, d90_mas::text from app.fn_cxc_antiguedad($1::date) where cliente_id = $2", [al, j.C]))[0];
    const donde = (x: Record<string, string> | undefined) => Object.keys(x ?? {}).find((k) => x?.[k] === "390.00");
    expect(donde(await caso("2026-11-10"))).toBe("corriente");
    expect(donde(await caso("2026-11-11"))).toBe("d1_30");
    expect(donde(await caso("2026-12-10"))).toBe("d1_30");
    expect(donde(await caso("2026-12-11"))).toBe("d31_60");
    expect(donde(await caso("2027-01-09"))).toBe("d31_60");
    expect(donde(await caso("2027-01-10"))).toBe("d61_90");
    expect(donde(await caso("2027-02-08"))).toBe("d61_90");
    expect(donde(await caso("2027-02-09"))).toBe("d90_mas");
  });
});

describe("cortes (fn_resumen_turno)", () => {
  it("T1 710.00 esperado y -10.00 de diferencia; R1 1350.00 y 0.00; T2 100.00 y 0.00", async () => {
    const r = async (t: string) => (await q<{ r: Record<string, string> }>("select app.fn_resumen_turno($1) as r", [t]))[0]!.r;
    expect(await r(j.T1)).toMatchObject({ efectivo_esperado: "710.00", efectivo_contado: "700.00", diferencia: "-10.00" });
    const turnoR = (await q<{ turno_caja_id: string }>("select turno_caja_id from app.ruta where id = $1", [j.R1]))[0]!.turno_caja_id;
    expect(await r(turnoR)).toMatchObject({ efectivo_esperado: "1350.00", efectivo_contado: "1350.00", diferencia: "0.00" });
    expect(await r(j.T2)).toMatchObject({ efectivo_esperado: "100.00", efectivo_contado: "100.00", diferencia: "0.00" });
  });
});

describe("una regla", () => {
  it("la suma de importe de v_ventas_lineas = sum(venta.total completadas) - sum(devolucion.total) del periodo", async () => {
    const [x] = await q<{ lineas: string; reglas: string }>(`select (select sum(importe) ${ventas()})::text as lineas,
      ((select sum(total) from app.venta where id = any($2) and estado = 'completada')
       - (select sum(total) from app.devolucion where venta_id = any($2)))::text as reglas`, [j.productos, [...j.ventas, j.V4]]);
    expect(x).toEqual({ lineas: "1400.00", reglas: "1400.00" });
  });
});

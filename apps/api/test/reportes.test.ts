import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar, errorDe, pool } from "./ayuda.js";
import { crearUsuarioF3, limpiarF3, pedirPersonal, snapshotF3, type Snapshot } from "./ayuda-f3.js";
import { llaves } from "./ayuda-f8.js";
import { montarJuego, type JuegoF9 } from "./ayuda-f9.js";
import { D0, D1, D2 } from "./sql/ayuda-reportes.js";

// F9 paquete C: cada reporte da por HTTP los mismos numeros que el juego fijo de las pruebas SQL de 009 (docs/fases/F9.md).
// Los reportes del juego se acotan a sus fechas pasadas (D0..D2), a su zona y a su categoria: la base trae datos de otras suites.
let app: FastifyInstance;
let antes: Snapshot;
let pedir: ReturnType<typeof pedirPersonal>;
let j: JuegoF9;
let desmontar: () => Promise<void>;
let dueno: string;
let admin: string;
let cajero: string;
let repartidor: string;
let soloLiquida: string;
let soloReportes: string;

type Fila = Record<string, unknown>;
const ver = async (token: string, url: string): Promise<{ statusCode: number; json: <T = Record<string, unknown>>() => T; body: string }> =>
  pedir("GET", `/api/reportes/${url}`, token) as never;
const filas = async (url: string, token = dueno): Promise<Fila[]> => {
  const r = await ver(token, url);
  expect(r.statusCode, r.body).toBe(200);
  return r.json<{ filas: Fila[] }>().filas;
};
const porClave = (f: Fila[]) => Object.fromEntries(f.map((x) => [String(x.clave), x]));

beforeAll(async () => {
  antes = await snapshotF3();
  app = await crearApp();
  pedir = pedirPersonal(app);
  const token = async (rol: "Dueño" | "Administrador" | "Cajero" | "Repartidor" | { permisos: string[] }) => entrar(app, await crearUsuarioF3(rol));
  dueno = await token("Dueño");
  admin = await token("Administrador");
  cajero = await token("Cajero");
  repartidor = await token("Repartidor");
  soloLiquida = await token({ permisos: ["rutas.liquidar"] });
  soloReportes = await token({ permisos: ["reportes.ver"] });
  ({ j, desmontar } = await montarJuego());
}, 120_000);

afterAll(async () => {
  await desmontar?.();
  await limpiarF3(app, antes);
  await cerrarPoolPruebas();
});

describe("ventas", () => {
  it("por dia: V1 cuenta en D1 por hora de Mexico, DV1 resta en D2, V4 cancelada no aparece; totales con num_ventas distinto", async () => {
    const r = await ver(dueno, `ventas?desde=${D1}&hasta=${D2}&agrupar=dia`);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({
      filas: [
        { clave: D1, etiqueta: D1, num_ventas: 2, piezas: 84, importe: "1410.00" },
        { clave: D2, etiqueta: D2, num_ventas: 1, piezas: 0, importe: "-10.00" },
      ],
      totales: { num_ventas: 3, piezas: 84, importe: "1400.00" },
    });
  });

  it("por origen: mostrador 600.00 (36 pz) y pedido 800.00 (48 pz)", async () => {
    const f = porClave(await filas(`ventas?desde=${D1}&hasta=${D2}&agrupar=origen`));
    expect(f.mostrador).toMatchObject({ num_ventas: 2, piezas: 36, importe: "600.00" });
    expect(f.pedido).toMatchObject({ num_ventas: 1, piezas: 48, importe: "800.00" });
  });

  it("por forma de pago (pagos de completadas, bruto): efectivo 1410.00 en 2 ventas, credito 390.00 en 1; sin piezas", async () => {
    const r = await ver(dueno, `ventas?desde=${D1}&hasta=${D2}&agrupar=metodo`);
    const c = r.json<{ filas: Fila[]; totales: Fila }>();
    expect(porClave(c.filas).efectivo).toMatchObject({ etiqueta: "Efectivo", num_ventas: 2, piezas: null, importe: "1410.00" });
    expect(porClave(c.filas).credito).toMatchObject({ num_ventas: 1, piezas: null, importe: "390.00" });
    expect(c.totales).toEqual({ num_ventas: 3, piezas: null, importe: "1800.00" });
  });

  it("por cliente: el publico en general es una fila con clave null; por ruta, la ruta con su folio y sin ruta con clave null", async () => {
    const cli = await filas(`ventas?desde=${D1}&hasta=${D2}&agrupar=cliente`);
    expect(cli.find((x) => x.clave === null)).toMatchObject({ etiqueta: null, importe: "210.00", num_ventas: 1 });
    expect(porClave(cli)[j.A]).toMatchObject({ importe: "800.00", piezas: 48 });
    const ruta = await filas(`ventas?desde=${D1}&hasta=${D2}&agrupar=ruta`);
    expect(porClave(ruta)[j.R1]).toMatchObject({ importe: "800.00", num_ventas: 1 });
    expect(ruta.find((x) => x.clave === null)).toMatchObject({ importe: "600.00", num_ventas: 2 });
  });

  it("por vendedor, zona, producto y categoria suman lo mismo (1400.00)", async () => {
    for (const a of ["usuario", "zona", "producto", "categoria", "mes"]) {
      const r = await ver(dueno, `ventas?desde=${D1}&hasta=${D2}&agrupar=${a}`);
      expect(r.statusCode, `${a}: ${r.body}`).toBe(200);
      expect(r.json<{ totales: Fila }>().totales).toMatchObject({ importe: "1400.00" });
    }
    const cat = await filas(`ventas?desde=${D1}&hasta=${D2}&agrupar=categoria`);
    expect(cat).toHaveLength(1);
    expect(cat[0]).toMatchObject({ clave: j.categoria, importe: "1400.00" });
    const mes = await filas(`ventas?desde=${D1}&hasta=${D2}&agrupar=mes`);
    expect(mes).toEqual([{ clave: "2026-11", etiqueta: "2026-11", num_ventas: 3, piezas: 84, importe: "1400.00" }]);
  });
});

describe("resumen del dia (/cierre/resumen) = misma regla que los reportes", () => {
  it("vendido y ganancia salen de v_ventas_lineas: D1 1410.00 y 360.00, D2 -10.00 y 0.00 (devolucion resta en su dia)", async () => {
    const r = async (fecha: string) => (await pedir("GET", `/api/cierre/resumen?fecha=${fecha}`, dueno)).json<Record<string, unknown>>();
    expect(await r(D1)).toMatchObject({ vendido: "1410.00", ganancia: "360.00" });
    expect(await r(D2)).toMatchObject({ vendido: "-10.00", ganancia: "0.00" });
    const hoy = await r(j.hoy);
    const v = (await ver(dueno, `ventas?desde=${j.hoy}&hasta=${j.hoy}&agrupar=dia`)).json<{ totales: Fila }>().totales;
    const u = (await ver(dueno, `utilidad?desde=${j.hoy}&hasta=${j.hoy}&agrupar=dia`)).json<{ totales: Fila }>().totales;
    expect(hoy.vendido).toBe(v.importe);
    expect(hoy.ganancia).toBe(u.utilidad);
  });
});

describe("compras", () => {
  it("por proveedor: Modelo 2 compras 264 pz 3290.00, Heineken 1 compra 24 pz 240.00, total 3530.00; C4 cancelada no aparece", async () => {
    const r = await ver(dueno, `compras?desde=${D0}&hasta=${D0}&agrupar=proveedor`);
    expect(r.statusCode, r.body).toBe(200);
    const c = r.json<{ filas: Fila[]; totales: Fila }>();
    expect(porClave(c.filas)[j.modelo]).toMatchObject({ num_compras: 2, piezas: 264, importe: "3290.00" });
    expect(porClave(c.filas)[j.heineken]).toMatchObject({ num_compras: 1, piezas: 24, importe: "240.00" });
    expect(c.totales).toEqual({ num_compras: 3, piezas: 288, importe: "3530.00" });
  });

  it("exige compras.ver ademas de reportes.ver (el importe de compras es costo)", async () => {
    const r = await ver(soloReportes, `compras?desde=${D0}&hasta=${D0}`);
    expect(r.statusCode).toBe(403);
    expect(errorDe(r)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "compras.ver" } });
    expect((await ver(soloReportes, `ventas?desde=${D1}&hasta=${D2}`)).statusCode).toBe(200);
  });

  it("por dia, producto y categoria", async () => {
    expect(await filas(`compras?desde=${D0}&hasta=${D0}&agrupar=dia`)).toEqual([{ clave: D0, etiqueta: D0, num_compras: 3, piezas: 288, importe: "3530.00" }]);
    expect(porClave(await filas(`compras?desde=${D0}&hasta=${D0}&agrupar=producto`))[j.corona.id]).toMatchObject({ num_compras: 1, piezas: 240, importe: "3000.00" });
    expect(await filas(`compras?desde=${D0}&hasta=${D0}&agrupar=categoria`)).toHaveLength(1);
  });
});

describe("utilidad (reportes.ver + costos.ver)", () => {
  it("por dia: margen redondeado a 4 decimales y null con importe <= 0; ajustes y utilidad neta 325.00", async () => {
    const r = await ver(dueno, `utilidad?desde=${D1}&hasta=${D2}&agrupar=dia`);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({
      filas: [
        { clave: D1, etiqueta: D1, importe: "1410.00", costo: "1050.00", utilidad: "360.00", margen: "0.2553" },
        { clave: D2, etiqueta: D2, importe: "-10.00", costo: "-10.00", utilidad: "0.00", margen: null },
      ],
      totales: { importe: "1400.00", costo: "1040.00", utilidad: "360.00", margen: "0.2571" },
      ajustes: { mermas_por_causa: { caducado: "-60.00" }, ajustes_netos: "25.00" },
      utilidad_neta: "325.00",
    });
  });

  it("por origen, producto y categoria", async () => {
    const o = porClave(await filas(`utilidad?desde=${D1}&hasta=${D2}&agrupar=origen`));
    expect(o.mostrador).toMatchObject({ importe: "600.00", costo: "440.00", utilidad: "160.00" });
    expect(o.pedido).toMatchObject({ importe: "800.00", costo: "600.00", utilidad: "200.00" });
    expect(porClave(await filas(`utilidad?desde=${D1}&hasta=${D2}&agrupar=producto`))[j.corona.id]).toMatchObject({ importe: "1010.00", utilidad: "260.00" });
    expect(await filas(`utilidad?desde=${D1}&hasta=${D2}&agrupar=categoria`)).toHaveLength(1);
  });

  it("un periodo sin ajustes da mermas vacias, ajustes 0.00 y la utilidad neta = la bruta", async () => {
    const r = await ver(dueno, `utilidad?desde=${D1}&hasta=${D1}&agrupar=dia`);
    expect(r.json()).toMatchObject({ ajustes: { mermas_por_causa: {}, ajustes_netos: "0.00" }, utilidad_neta: "360.00" });
  });
});

describe("ganancia (reportes.ver + costos.ver, B13)", () => {
  it("por cliente: A 200.00 (300 - 100 de DV1), C 100.00, publico (clave null) 60.00; sin gastos_ruta", async () => {
    const r = await ver(dueno, `ganancia?desde=${D1}&hasta=${D2}&agrupar=cliente`);
    expect(r.statusCode, r.body).toBe(200);
    const c = r.json<{ filas: Fila[]; totales: Fila }>();
    const f = porClave(c.filas);
    expect(f[j.A]).toEqual({ clave: j.A, etiqueta: expect.any(String), importe: "800.00", costo: "600.00", utilidad: "200.00", ganancia: "200.00" });
    expect(f[j.C]).toMatchObject({ utilidad: "100.00", ganancia: "100.00" });
    expect(f.null).toMatchObject({ etiqueta: null, utilidad: "60.00", ganancia: "60.00" });
    expect(c.totales).toEqual({ importe: "1400.00", costo: "1040.00", utilidad: "360.00", ganancia: "360.00" });
  });

  it("por ruta: R1 utilidad 200.00 menos gastos 150.00 = ganancia 50.00; sin ruta (clave null) 160.00 y gastos 0.00", async () => {
    const r = await ver(dueno, `ganancia?desde=${D1}&hasta=${D2}&agrupar=ruta`);
    expect(r.statusCode, r.body).toBe(200);
    const c = r.json<{ filas: Fila[]; totales: Fila }>();
    const f = porClave(c.filas);
    expect(f[j.R1]).toMatchObject({ importe: "800.00", costo: "600.00", utilidad: "200.00", gastos_ruta: "150.00", ganancia: "50.00" });
    expect(f.null).toMatchObject({ etiqueta: null, utilidad: "160.00", gastos_ruta: "0.00", ganancia: "160.00" });
    expect(c.totales).toEqual({ importe: "1400.00", costo: "1040.00", utilidad: "360.00", gastos_ruta: "150.00", ganancia: "210.00" });
  });

  it("por zona", async () => {
    const f = porClave(await filas(`ganancia?desde=${D1}&hasta=${D2}&agrupar=zona`));
    expect(f[j.zona]).toMatchObject({ utilidad: "300.00", ganancia: "300.00" });
    expect(f.null).toMatchObject({ utilidad: "60.00" });
  });
});

describe("entregas y faltantes", () => {
  it("por ruta: R1 con 2 pedidos, 1 entregado, 1 fallido, 0 parciales, 24 pz faltantes, pedido 1600.00 y entregado 1200.00", async () => {
    const r = await ver(dueno, `entregas?desde=${D1}&hasta=${D1}&agrupar=ruta`);
    expect(r.statusCode, r.body).toBe(200);
    const c = r.json<{ filas: Fila[]; totales: Fila }>();
    const esperado = { pedidos: 2, entregados: 1, fallidos: 1, parciales: 0, piezas_faltantes: 24, importe_pedido: "1600.00", importe_entregado: "1200.00" };
    expect(porClave(c.filas)[j.R1]).toMatchObject(esperado);
    expect(c.totales).toEqual(esperado);
  });

  it("por dia, repartidor, zona y cliente", async () => {
    expect(await filas(`entregas?desde=${D1}&hasta=${D1}&agrupar=dia`)).toEqual([{ clave: D1, etiqueta: D1, pedidos: 2, entregados: 1, fallidos: 1, parciales: 0, piezas_faltantes: 24, importe_pedido: "1600.00", importe_entregado: "1200.00" }]);
    expect(porClave(await filas(`entregas?desde=${D1}&hasta=${D1}&agrupar=repartidor`))[j.rep]).toMatchObject({ pedidos: 2 });
    expect(porClave(await filas(`entregas?desde=${D1}&hasta=${D1}&agrupar=zona`))[j.zona]).toMatchObject({ pedidos: 2 });
    expect(porClave(await filas(`entregas?desde=${D1}&hasta=${D1}&agrupar=cliente`))[j.B]).toMatchObject({ pedidos: 1, entregados: 0, fallidos: 1, piezas_faltantes: 24, importe_entregado: "0.00" });
  });

  it("un pedido que fallo en R1 y se reprogramo a R2 cuenta como fallido en R1 y entregado en R2 (por intento, no por estado actual)", async () => {
    const { ruta1, ruta2 } = j.reprog;
    expect(porClave(await filas(`entregas?desde=${D0}&hasta=${D0}&agrupar=ruta`))[ruta1]).toMatchObject(
      { pedidos: 1, entregados: 0, fallidos: 1, parciales: 0, piezas_faltantes: 0, importe_pedido: "400.00", importe_entregado: "0.00" });
    expect(porClave(await filas(`entregas?desde=${j.hoy}&hasta=${j.hoy}&agrupar=ruta`))[ruta2]).toMatchObject(
      { pedidos: 1, entregados: 1, fallidos: 0, importe_pedido: "400.00", importe_entregado: "400.00" });
  });

  it("faltantes por producto (Corona 24 pz) y por proveedor (Modelo 24 pz)", async () => {
    const r = await ver(dueno, `faltantes?desde=${D1}&hasta=${D1}&agrupar=producto`);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json<{ filas: Fila[] }>().filas).toEqual([{ clave: j.corona.id, etiqueta: expect.any(String), piezas_faltantes: 24 }]);
    expect(await filas(`faltantes?desde=${D1}&hasta=${D1}&agrupar=proveedor`)).toEqual([{ clave: j.modelo, etiqueta: expect.any(String), piezas_faltantes: 24 }]);
    expect(await filas(`faltantes?desde=${D2}&hasta=${D2}&agrupar=producto`)).toEqual([]);
  });
});

describe("inventario valorizado (costos.ver) y bajo minimo (inventario.ver)", () => {
  it("Corona 182 pz 2275.00 (7 cajas, 14 sueltas), Victoria 0, Tecate 18 pz 180.00, valor_total 2455.00", async () => {
    const r = await ver(dueno, `inventario-valorizado?categoria_id=${j.categoria}`);
    expect(r.statusCode, r.body).toBe(200);
    const c = r.json<{ filas: Fila[]; valor_total: string }>();
    const f = Object.fromEntries(c.filas.map((x) => [String(x.producto_id), x]));
    expect(f[j.corona.id]).toMatchObject({ producto: expect.any(String), categoria: expect.any(String), cantidad: 182, cajas: 7, sueltas: 14, costo_promedio: "12.500000", valor: "2275.00" });
    expect(f[j.victoria.id]).toMatchObject({ cantidad: 0, valor: "0.00" });
    expect(f[j.tecate.id]).toMatchObject({ cantidad: 18, sueltas: 18, valor: "180.00" });
    expect(c.valor_total).toBe("2455.00");
  });

  it("una categoria sin productos da filas vacias y valor_total 0.00", async () => {
    const r = await ver(dueno, "inventario-valorizado?categoria_id=999999999");
    expect(r.json()).toEqual({ filas: [], valor_total: "0.00" });
  });

  it("bajo minimo: Victoria falta 12 y esta agotada, Tecate falta 6, Corona (minimo 0) no sale", async () => {
    const f = Object.fromEntries((await filas("bajo-minimo", admin)).map((x) => [String(x.producto_id), x]));
    expect(f[j.victoria.id]).toMatchObject({ producto: expect.any(String), categoria: expect.any(String), cantidad: 0, existencia_minima: 12, faltante: 12, agotado: true });
    expect(f[j.tecate.id]).toMatchObject({ cantidad: 18, existencia_minima: 24, faltante: 6, agotado: false });
    expect(f[j.corona.id]).toBeUndefined();
  });
});

describe("cuentas por cobrar (cobranza.ver)", () => {
  it("al 2026-12-13 en la zona del juego: A 500.00 corriente, C 390.00 en 31 a 60 dias, totales 890.00", async () => {
    const r = await ver(dueno, `cuentas-por-cobrar?al=2026-12-13&zona_id=${j.zona}`);
    expect(r.statusCode, r.body).toBe(200);
    const c = r.json<{ filas: Fila[]; totales: Fila }>();
    expect(c.filas.map((x) => x.cliente_id)).toEqual([j.A, j.C]);
    expect(c.filas[0]).toMatchObject({ nombre: expect.any(String), zona: `TF9 zona ${process.pid}`, corriente: "500.00", d1_30: "0.00", d31_60: "0.00", d61_90: "0.00", d90_mas: "0.00", total: "500.00" });
    expect(c.filas[1]).toMatchObject({ corriente: "0.00", d31_60: "390.00", total: "390.00" });
    expect(c.totales).toEqual({ corriente: "500.00", d1_30: "0.00", d31_60: "390.00", d61_90: "0.00", d90_mas: "0.00", total: "890.00" });
  });

  it("vencimiento al: solo las cuentas que ya existian ese dia (C nace el 2026-11-03, A hoy) y filtradas por sucursal", async () => {
    expect(await filas(`cuentas-por-cobrar?al=2026-11-02&zona_id=${j.zona}`)).toEqual([]);
    const c = await filas(`cuentas-por-cobrar?al=2026-11-03&zona_id=${j.zona}`);
    expect(c.map((x) => x.cliente_id)).toEqual([j.C]);
    expect(c[0]).toMatchObject({ corriente: "390.00", total: "390.00" });
    const n = async (sucursal: string) => (await pool.query("select count(*)::int as n from app.fn_cxc_antiguedad('2026-12-13', $1::bigint) where cliente_id = any($2)", [sucursal, [j.A, j.C]])).rows[0].n;
    expect(await n("1")).toBe(2);
    expect(await n("999999")).toBe(0);
  });

  it("una zona sin deudas da totales en cero, y el Cajero (cobranza.ver) tambien puede verlo", async () => {
    const r = await ver(cajero, "cuentas-por-cobrar?zona_id=999999999");
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({ filas: [], totales: { corriente: "0.00", d1_30: "0.00", d31_60: "0.00", d61_90: "0.00", d90_mas: "0.00", total: "0.00" } });
  });
});

describe("cortes (caja.supervisar o rutas.liquidar)", () => {
  const hoy = () => `desde=${j.hoy}&hasta=${j.hoy}`;

  it("T1 710.00 esperado y -10.00 de diferencia; R1 1350.00; T2 100.00", async () => {
    const t1 = (await filas(`cortes?${hoy()}&usuario_id=${j.cajero}`, admin))[0]!;
    expect(t1).toMatchObject({
      tipo: "mostrador", usuario: { id: j.cajero, nombre: expect.any(String) }, fondo_inicial: "500.00",
      efectivo_esperado: "710.00", efectivo_contado: "700.00", diferencia: "-10.00", abierto_en: expect.any(String), cerrado_en: expect.any(String),
      ventas: { efectivo: "210.00" },
    });
    const r1 = (await filas(`cortes?${hoy()}&usuario_id=${j.rep}`, dueno))[0]!;
    expect(r1).toMatchObject({ id: j.turnoR, tipo: "ruta", efectivo_esperado: "1350.00", efectivo_contado: "1350.00", diferencia: "0.00" });
    const t2 = (await filas(`cortes?${hoy()}&usuario_id=${j.dueno}`, dueno))[0]!;
    expect(t2).toMatchObject({ id: j.T2, efectivo_esperado: "100.00", efectivo_contado: "100.00", diferencia: "0.00" });
  });

  it("filtros tipo y caja_id; el rango por defecto es el mes en curso y un dia sin turnos da lista vacia", async () => {
    expect((await filas(`cortes?${hoy()}&usuario_id=${j.rep}&tipo=mostrador`, dueno))).toEqual([]);
    expect((await filas(`cortes?${hoy()}&usuario_id=${j.rep}&tipo=ruta`, dueno))).toHaveLength(1);
    expect((await filas(`cortes?desde=${D0}&hasta=${D0}`, dueno))).toEqual([]);
    const caja = (await filas(`cortes?${hoy()}&usuario_id=${j.cajero}`, dueno))[0]!.caja_id;
    expect((await filas(`cortes?${hoy()}&caja_id=${String(caja)}`, dueno)).map((x) => x.id)).toEqual([j.T1]);
  });

  it("solo rutas.liquidar ve los turnos de ruta y no los de mostrador", async () => {
    expect(await filas(`cortes?${hoy()}&usuario_id=${j.cajero}`, soloLiquida)).toEqual([]);
    expect((await filas(`cortes?${hoy()}&usuario_id=${j.rep}`, soloLiquida)).map((x) => x.id)).toEqual([j.turnoR]);
  });
});

describe("permisos por reporte y por campo", () => {
  it("Administrador: utilidad, ganancia e inventario-valorizado 403 SIN_PERMISO costos.ver (despues de validar)", async () => {
    for (const u of ["utilidad", "ganancia", "inventario-valorizado"]) {
      const r = await ver(admin, `${u}?desde=${D1}&hasta=${D2}`);
      expect(r.statusCode, u).toBe(403);
      expect(errorDe(r)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "costos.ver" } });
    }
    const mala = await ver(admin, "utilidad?agrupar=nombre;drop");
    expect(mala.statusCode).toBe(400);
  });

  it("Cajero: ventas, compras, utilidad, entregas y faltantes 403 reportes.ver; cortes 403; bajo-minimo si (inventario.ver)", async () => {
    for (const u of ["ventas", "compras", "entregas", "faltantes", "utilidad", "ganancia"]) {
      const r = await ver(cajero, u);
      expect(r.statusCode, u).toBe(403);
      expect(errorDe(r)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: expect.anything() } });
    }
    const v = await ver(cajero, "ventas");
    expect(errorDe(v)).toMatchObject({ detalles: { permiso: "reportes.ver" } });
    expect((await ver(cajero, "cortes")).statusCode).toBe(403);
    expect((await ver(cajero, "bajo-minimo")).statusCode).toBe(200);
  });

  it("Repartidor: nada de reportes; sin sesion 401", async () => {
    for (const u of ["ventas", "bajo-minimo", "cuentas-por-cobrar", "cortes", "inventario-valorizado"]) expect((await ver(repartidor, u)).statusCode, u).toBe(403);
    const r = await app.inject({ method: "GET", url: "/api/reportes/ventas" });
    expect(r.statusCode).toBe(401);
    expect(errorDe(r).codigo).toBe("NO_AUTENTICADO");
  });

  it("sin costos.ver no existe ninguna llave de costo, utilidad ni valor en lo que si puede ver", async () => {
    const costo = /costo|utilidad|margen|ganancia|valor/i;
    for (const u of [`ventas?desde=${D1}&hasta=${D2}`, `compras?desde=${D0}&hasta=${D0}`, `entregas?desde=${D1}&hasta=${D1}`, `faltantes?desde=${D1}&hasta=${D1}`, "bajo-minimo", "cuentas-por-cobrar", `cortes?desde=${j.hoy}&hasta=${j.hoy}`]) {
      const r = await ver(admin, u);
      expect(r.statusCode, u).toBe(200);
      expect(llaves(r.json()).filter((k) => costo.test(k)), u).toEqual([]);
    }
  });
});

describe("validacion de filtros", () => {
  it("agrupar fuera de la lista blanca 400 VALIDACION (nunca llega al SQL)", async () => {
    for (const u of ["ventas?agrupar=nombre;drop", "ventas?agrupar=cliente_id", "compras?agrupar=ruta", "utilidad?agrupar=cliente", "entregas?agrupar=producto", "faltantes?agrupar=dia", "ganancia?agrupar=dia", "ventas?agrupar=dia,mes"]) {
      const r = await ver(dueno, u);
      expect(r.statusCode, u).toBe(400);
      expect(errorDe(r).codigo).toBe("VALIDACION");
    }
  });

  it("desde > hasta, 367 dias y fechas mal escritas 400; 366 dias si pasa", async () => {
    for (const u of [`ventas?desde=${D2}&hasta=${D1}`, "ventas?desde=2026-01-01&hasta=2027-01-02", "ventas?desde=2026-13-45", "ventas?desde=hoy", "ventas?hasta=2026-02-30", "cuentas-por-cobrar?al=ayer", `cortes?desde=${D2}&hasta=${D1}`, "cortes?desde=2026-01-01&hasta=2027-01-02", "compras?desde=2026-01-01&hasta=2027-01-02", "entregas?desde=2026-01-01&hasta=2027-01-02", "faltantes?desde=2026-01-01&hasta=2027-01-02", "utilidad?desde=2026-01-01&hasta=2027-01-02", "ganancia?desde=2026-01-01&hasta=2027-01-02"]) {
      const r = await ver(dueno, u);
      expect(r.statusCode, u).toBe(400);
      expect(errorDe(r).codigo).toBe("VALIDACION");
    }
    expect((await ver(dueno, "ventas?desde=2026-01-01&hasta=2027-01-01")).statusCode).toBe(200);
    expect((await ver(dueno, "ventas")).statusCode).toBe(200);
  });

  it("ids de filtro que no son ids 400", async () => {
    for (const u of ["inventario-valorizado?categoria_id=1;drop", "cuentas-por-cobrar?zona_id=abc", "cortes?usuario_id=0", "cortes?tipo=otro"]) {
      const r = await ver(dueno, u);
      expect(r.statusCode, u).toBe(400);
    }
  });
});

describe("sin impuestos", () => {
  it("ninguna respuesta tiene llaves iva, ieps ni impuesto (recorrido recursivo)", async () => {
    const urls = [`ventas?desde=${D1}&hasta=${D2}`, `compras?desde=${D0}&hasta=${D0}`, `utilidad?desde=${D1}&hasta=${D2}`, `entregas?desde=${D1}&hasta=${D1}`, `faltantes?desde=${D1}&hasta=${D1}`,
      "inventario-valorizado", "bajo-minimo", `ganancia?desde=${D1}&hasta=${D2}&agrupar=ruta`, "cuentas-por-cobrar", `cortes?desde=${j.hoy}&hasta=${j.hoy}`];
    for (const u of urls) {
      const r = await ver(dueno, u);
      expect(r.statusCode, u).toBe(200);
      const ks = llaves(r.json());
      expect(ks.length, u).toBeGreaterThan(0);
      expect(ks.filter((k) => /iva|ieps|impuesto/i.test(k)), u).toEqual([]);
    }
  });
});

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { cerrarPoolPruebas, crearApp, errorDe, pool } from "./ayuda.js";
import { ayudaF2, limpiarF2, hoyMas, tokenF2, type ProductoPrueba } from "./ayuda-f2.js";

let app: FastifyInstance;
let h: ReturnType<typeof ayudaF2>;
let dueno: string;
let admin: string;
let cajero: string;
let repartidor: string;
let proveedor: string;

const pedir = (...a: Parameters<ReturnType<typeof ayudaF2>["pedir"]>) => h.pedir(...a);

beforeAll(async () => {
  app = await crearApp();
  h = ayudaF2(app);
  dueno = await tokenF2(app, "Dueño");
  admin = await tokenF2(app, "Administrador");
  cajero = await tokenF2(app, "Cajero");
  repartidor = await tokenF2(app, "Repartidor");
  proveedor = (await h.crearProveedor(dueno)).id;
});
afterAll(async () => {
  await app.close();
  await limpiarF2();
  await cerrarPoolPruebas();
});

/** Producto con Caja de 24 y `cajas` compradas a `costo` (240 piezas a 12.50 por defecto). */
async function conStock(cajas = 10, costo = "300.00", extra: object = {}): Promise<ProductoPrueba> {
  const p = await h.crearProducto(dueno, { factores: [24], extra });
  const c = await h.registrarCompra(dueno, [{ presentacion_id: p.por(24).id, cantidad: cajas, costo_presentacion: costo }], { proveedor_id: proveedor });
  expect(c.statusCode).toBe(201);
  return p;
}
const existencia = async (p: ProductoPrueba) => (await pedir("GET", `/api/productos/${p.id}`, dueno)).json().existencia as number;

describe("GET /api/inventario/existencias", () => {
  it("cajas + sueltas y valor calculados en SQL; costos solo con costos.ver", async () => {
    const p = await conStock();
    await pedir("POST", "/api/inventario/ajustes", dueno, { producto_id: p.id, tipo: "ajuste_salida", piezas: 5, motivo: "se cayeron" });
    const r = await pedir("GET", `/api/inventario/existencias?buscar=${encodeURIComponent(p.nombre)}`, dueno);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ pagina: 1 });
    const f = (r.json().items as Record<string, unknown>[]).find((x) => x.producto_id === p.id)!;
    expect(f).toMatchObject({
      producto: p.nombre, modo_surtido: "inventario", cantidad: 235, confirmadas: 0, cargadas: 0, cajas: 9, sueltas: 19,
      existencia_minima: 0, costo_promedio: "12.500000", valor: "2937.50",
    });
    expect(f.categoria).toMatchObject({ nombre: expect.any(String) });

    for (const token of [admin, await tokenF2(app, { permisos: ["inventario.ver"] })]) {
      const sin = await pedir("GET", `/api/inventario/existencias?buscar=${encodeURIComponent(p.nombre)}`, token);
      const g = (sin.json().items as Record<string, unknown>[]).find((x) => x.producto_id === p.id)!;
      expect(g).toMatchObject({ cantidad: 235, cajas: 9, sueltas: 19 });
      expect(g).not.toHaveProperty("costo_promedio");
      expect(g).not.toHaveProperty("valor");
      expect(sin.body).not.toContain("costo");
    }
  });

  it("producto solo con Pieza: cajas = piezas, sueltas 0; sin existencia sale en 0", async () => {
    const p = await h.crearProducto(dueno);
    const r = await pedir("GET", `/api/inventario/existencias?buscar=${encodeURIComponent(p.nombre)}`, dueno);
    expect((r.json().items as Record<string, unknown>[]).find((x) => x.producto_id === p.id)).toMatchObject({ cantidad: 0, cajas: 0, sueltas: 0 });
  });

  it("filtros categoria_id, modo_surtido y bajo_minimo", async () => {
    const cat = (await h.crearCategoria(dueno)).id;
    const bajo = await h.crearProducto(dueno, { categoria_id: cat, extra: { existencia_minima: 300 } });
    const justo = await h.crearProducto(dueno, { categoria_id: cat, extra: { existencia_minima: 0 } });
    const cp = await h.crearProducto(dueno, { categoria_id: cat, extra: { existencia_minima: 300, modo_surtido: "contra_pedido" } });
    const ids = async (q: string) => ((await pedir("GET", `/api/inventario/existencias?categoria_id=${cat}&${q}`, dueno)).json().items as { producto_id: string }[]).map((x) => x.producto_id).sort();
    expect(await ids("")).toEqual([bajo.id, justo.id, cp.id].sort());
    expect(await ids("bajo_minimo=true")).toEqual([bajo.id]);
    expect(await ids("modo_surtido=contra_pedido")).toEqual([cp.id]);
  });

  it("401, 403 sin inventario.ver y 400", async () => {
    expect((await pedir("GET", "/api/inventario/existencias")).statusCode).toBe(401);
    const r = await pedir("GET", "/api/inventario/existencias", repartidor);
    expect(r.statusCode).toBe(403);
    expect(errorDe(r)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "inventario.ver" } });
    expect((await pedir("GET", "/api/inventario/existencias?modo_surtido=x", dueno)).statusCode).toBe(400);
  });
});

describe("POST /api/inventario/ajustes", () => {
  it("201 con el movimiento: entrada, salida, merma con causa e inventario inicial", async () => {
    const p = await conStock();
    const e = await pedir("POST", "/api/inventario/ajustes", dueno, { producto_id: p.id, tipo: "ajuste_entrada", piezas: 10, motivo: "se encontraron" });
    expect(e.statusCode).toBe(201);
    expect(e.json()).toMatchObject({
      producto_id: p.id, tipo: "ajuste_entrada", cantidad: 10, existencia_resultante: 250, motivo: "se encontraron",
      causa_merma: null, usuario_nombre: expect.any(String), costo_unitario: "12.500000", costo_promedio_resultante: "12.500000",
    });
    const s = await pedir("POST", "/api/inventario/ajustes", dueno, { producto_id: p.id, tipo: "ajuste_salida", piezas: 50, motivo: "robo" });
    expect(s.json()).toMatchObject({ tipo: "ajuste_salida", cantidad: -50, existencia_resultante: 200 });
    const m = await pedir("POST", "/api/inventario/ajustes", dueno, { producto_id: p.id, tipo: "merma", piezas: 2, causa_merma: "danado", motivo: "se rompieron" });
    expect(m.statusCode).toBe(201);
    expect(m.json()).toMatchObject({ tipo: "merma", cantidad: -2, causa_merma: "danado", existencia_resultante: 198 });
    expect(await existencia(p)).toBe(198);

    const nuevo = await h.crearProducto(dueno);
    const ini = await pedir("POST", "/api/inventario/ajustes", dueno, { producto_id: nuevo.id, tipo: "inventario_inicial", piezas: 100, costo_unitario: "11.5" });
    expect(ini.statusCode).toBe(201);
    expect(ini.json()).toMatchObject({ tipo: "inventario_inicial", cantidad: 100, costo_unitario: "11.500000", costo_promedio_resultante: "11.500000" });
  });

  it("el movimiento no trae costos si el usuario no tiene costos.ver", async () => {
    const p = await conStock();
    const r = await pedir("POST", "/api/inventario/ajustes", admin, { producto_id: p.id, tipo: "ajuste_salida", piezas: 1, motivo: "prueba" });
    expect(r.statusCode).toBe(201);
    expect(r.json()).not.toHaveProperty("costo_unitario");
    expect(r.json()).not.toHaveProperty("costo_promedio_resultante");
  });

  it("merma sin causa -> 400 VALIDACION; tipo fuera de la lista, piezas 0 o decimales -> 400", async () => {
    const p = await conStock();
    const sinCausa = await pedir("POST", "/api/inventario/ajustes", dueno, { producto_id: p.id, tipo: "merma", piezas: 1, motivo: "x" });
    expect(sinCausa.statusCode).toBe(400);
    expect(errorDe(sinCausa).codigo).toBe("VALIDACION");
    for (const malo of [{ tipo: "compra" }, { tipo: "venta" }, { piezas: 0 }, { piezas: 1.5 }, { causa_merma: "robo" }, { costo_unitario: "-1" }, { clave_idempotencia: "no-uuid" }]) {
      const r = await pedir("POST", "/api/inventario/ajustes", dueno, { producto_id: p.id, tipo: "merma", piezas: 1, causa_merma: "otro", motivo: "x", ...malo });
      expect(r.statusCode, JSON.stringify(malo)).toBe(400);
      expect(errorDe(r).codigo).toBe("VALIDACION");
    }
    expect(await existencia(p)).toBe(240);
  });

  it("salida mayor a la existencia -> 409 STOCK_INSUFICIENTE con detalle; contra_pedido tampoco baja de cero", async () => {
    const p = await conStock();
    const r = await pedir("POST", "/api/inventario/ajustes", dueno, { producto_id: p.id, tipo: "ajuste_salida", piezas: 241, motivo: "x" });
    expect(r.statusCode).toBe(409);
    expect(errorDe(r)).toMatchObject({ codigo: "STOCK_INSUFICIENTE", detalles: { producto_id: Number(p.id), disponible: 240, solicitado: 241 } });
    expect(await existencia(p)).toBe(240);
    const cp = await h.crearProducto(dueno, { extra: { modo_surtido: "contra_pedido" } });
    const c = await pedir("POST", "/api/inventario/ajustes", dueno, { producto_id: cp.id, tipo: "merma", piezas: 1, causa_merma: "otro", motivo: "x" });
    expect(c.statusCode).toBe(409);
    expect(errorDe(c).codigo).toBe("STOCK_INSUFICIENTE");
  });

  it("reglas de SQL: ajuste sin motivo o inventario_inicial sin costo -> 409 AJUSTE_NO_VALIDO", async () => {
    const p = await conStock();
    for (const cuerpo of [{ tipo: "ajuste_entrada", piezas: 1 }, { tipo: "inventario_inicial", piezas: 1 }]) {
      const r = await pedir("POST", "/api/inventario/ajustes", dueno, { producto_id: p.id, ...cuerpo });
      expect(r.statusCode).toBe(409);
      expect(errorDe(r).codigo).toBe("AJUSTE_NO_VALIDO");
    }
  });

  it("404 producto, 401, 403 (Cajero) con detalle del permiso", async () => {
    const cuerpo = { tipo: "ajuste_entrada", piezas: 1, motivo: "x" };
    const nf = await pedir("POST", "/api/inventario/ajustes", dueno, { producto_id: "99999999", ...cuerpo });
    expect(nf.statusCode).toBe(404);
    expect(errorDe(nf).codigo).toBe("NO_ENCONTRADO");
    expect((await pedir("POST", "/api/inventario/ajustes", undefined, { producto_id: "1", ...cuerpo })).statusCode).toBe(401);
    const c = await pedir("POST", "/api/inventario/ajustes", cajero, { producto_id: "1", ...cuerpo });
    expect(c.statusCode).toBe(403);
    expect(errorDe(c)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "inventario.ajustar" } });
  });
});

describe("POST /api/inventario/conteos", () => {
  it("sin diferencia -> 200 {sin_diferencia:true} y no hay movimiento", async () => {
    const p = await conStock();
    const antes = (await pedir("GET", `/api/inventario/movimientos?producto_id=${p.id}`, dueno)).json().total;
    const r = await pedir("POST", "/api/inventario/conteos", dueno, { producto_id: p.id, piezas_contadas: 240, motivo: "conteo del lunes" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ sin_diferencia: true });
    expect((await pedir("GET", `/api/inventario/movimientos?producto_id=${p.id}`, dueno)).json().total).toBe(antes);
  });

  it("menos -> 201 ajuste_salida por la diferencia; mas -> ajuste_entrada", async () => {
    const p = await conStock();
    const menos = await pedir("POST", "/api/inventario/conteos", dueno, { producto_id: p.id, piezas_contadas: 230, motivo: "conteo" });
    expect(menos.statusCode).toBe(201);
    expect(menos.json()).toMatchObject({ tipo: "ajuste_salida", cantidad: -10, existencia_resultante: 230, motivo: "conteo", costo_unitario: "12.500000" });
    const mas = await pedir("POST", "/api/inventario/conteos", dueno, { producto_id: p.id, piezas_contadas: 235, motivo: "conteo" });
    expect(mas.json()).toMatchObject({ tipo: "ajuste_entrada", cantidad: 5, existencia_resultante: 235 });
    const cero = await pedir("POST", "/api/inventario/conteos", dueno, { producto_id: p.id, piezas_contadas: 0, motivo: "vacio" });
    expect(cero.json()).toMatchObject({ cantidad: -235, existencia_resultante: 0 });
  });

  it("400 (sin motivo, negativo, decimal), 404, 401, 403", async () => {
    const p = await conStock();
    for (const malo of [{ motivo: "" }, { piezas_contadas: -1 }, { piezas_contadas: 2.5 }, { producto_id: "abc" }]) {
      const r = await pedir("POST", "/api/inventario/conteos", dueno, { producto_id: p.id, piezas_contadas: 1, motivo: "x", ...malo });
      expect(r.statusCode, JSON.stringify(malo)).toBe(400);
    }
    expect((await pedir("POST", "/api/inventario/conteos", dueno, { producto_id: "99999999", piezas_contadas: 1, motivo: "x" })).statusCode).toBe(404);
    expect((await pedir("POST", "/api/inventario/conteos", undefined, { producto_id: p.id, piezas_contadas: 1, motivo: "x" })).statusCode).toBe(401);
    expect((await pedir("POST", "/api/inventario/conteos", cajero, { producto_id: p.id, piezas_contadas: 1, motivo: "x" })).statusCode).toBe(403);
  });
});

describe("GET /api/inventario/movimientos (kardex)", () => {
  it("mas nuevo primero, con usuario, referencia (folio de compra) y costos solo con costos.ver", async () => {
    const p = await conStock();
    await pedir("POST", "/api/inventario/ajustes", dueno, { producto_id: p.id, tipo: "merma", piezas: 3, causa_merma: "caducado", motivo: "vencidas" });
    const r = await pedir("GET", `/api/inventario/movimientos?producto_id=${p.id}`, dueno);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ total: 2, pagina: 1 });
    const [merma, compra] = r.json().items;
    expect(merma).toMatchObject({ tipo: "merma", cantidad: -3, existencia_resultante: 237, causa_merma: "caducado", motivo: "vencidas", referencia: null, costo_unitario: "12.500000", costo_promedio_resultante: "12.500000" });
    expect(compra).toMatchObject({ tipo: "compra", cantidad: 240, existencia_resultante: 240, referencia: expect.stringMatching(/^C-\d{6}$/), usuario: { nombre: expect.any(String) }, producto: p.nombre });
    expect(compra.usuario_nombre).toBe(compra.usuario.nombre);

    const a = await pedir("GET", `/api/inventario/movimientos?producto_id=${p.id}`, admin);
    expect(a.statusCode).toBe(200);
    expect(a.body).not.toContain("costo_");
    expect(a.json().items[0]).toMatchObject({ tipo: "merma", cantidad: -3 });
  });

  it("filtra por tipo, causa_merma y fechas; pagina; 400 con tipo invalido", async () => {
    const p = await conStock();
    await pedir("POST", "/api/inventario/ajustes", dueno, { producto_id: p.id, tipo: "merma", piezas: 1, causa_merma: "regalo", motivo: "r" });
    await pedir("POST", "/api/inventario/ajustes", dueno, { producto_id: p.id, tipo: "merma", piezas: 1, causa_merma: "otro", motivo: "o" });
    const q = (s: string) => pedir("GET", `/api/inventario/movimientos?producto_id=${p.id}&${s}`, dueno);
    expect((await q("tipo=merma")).json().total).toBe(2);
    expect((await q("tipo=compra")).json().total).toBe(1);
    expect((await q("causa_merma=regalo")).json().total).toBe(1);
    expect((await q(`desde=${await hoyMas(1)}`)).json().total).toBe(0);
    expect((await q(`hasta=${await hoyMas(-1)}`)).json().total).toBe(0);
    expect((await q(`desde=${await hoyMas(0)}&hasta=${await hoyMas(0)}`)).json().total).toBe(3);
    const pag = await q("por_pagina=2&pagina=2");
    expect(pag.json()).toMatchObject({ total: 3, pagina: 2, por_pagina: 2 });
    expect(pag.json().items).toHaveLength(1);
    expect((await q("tipo=raro")).statusCode).toBe(400);
    expect((await q("desde=ayer")).statusCode).toBe(400);
  });

  it("401 y 403", async () => {
    expect((await pedir("GET", "/api/inventario/movimientos")).statusCode).toBe(401);
    expect((await pedir("GET", "/api/inventario/movimientos", repartidor)).statusCode).toBe(403);
  });
});

describe("GET /api/inventario/por-caducar", () => {
  it("da las piezas estimadas del caso SQL (PEPS) y filtra por ?dias", async () => {
    const p = await h.crearProducto(dueno, { factores: [24], extra: {} });
    const caja = p.por(24).id;
    // A (mas vieja): 48 pz caduca en 10 dias. B: 24 pz caduca en 25 dias.
    await h.registrarCompra(dueno, [{ presentacion_id: caja, cantidad: 2, costo_presentacion: "300.00", caduca_el: await hoyMas(10) }], { proveedor_id: proveedor, fecha: await hoyMas(-1) });
    await h.registrarCompra(dueno, [{ presentacion_id: caja, cantidad: 1, costo_presentacion: "300.00", caduca_el: await hoyMas(25) }], { proveedor_id: proveedor, fecha: await hoyMas(0) });
    await pedir("POST", "/api/inventario/ajustes", dueno, { producto_id: p.id, tipo: "merma", piezas: 42, causa_merma: "caducado", motivo: "hasta 30" });

    const r = await pedir("GET", "/api/inventario/por-caducar", cajero);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ pagina: 1 });
    const filas = (r.json().items as Record<string, unknown>[]).filter((f) => f.producto_id === p.id);
    expect(filas).toEqual([
      { producto_id: p.id, producto: p.nombre, presentacion_id: caja, compra_folio: expect.stringMatching(/^C-\d{6}$/), caduca_el: await hoyMas(10), piezas_estimadas: 6, dias_restantes: 10 },
      { producto_id: p.id, producto: p.nombre, presentacion_id: caja, compra_folio: expect.stringMatching(/^C-\d{6}$/), caduca_el: await hoyMas(25), piezas_estimadas: 24, dias_restantes: 25 },
    ]);
    const quince = await pedir("GET", "/api/inventario/por-caducar?dias=15", dueno);
    expect((quince.json().items as { producto_id: string; piezas_estimadas: number }[]).filter((f) => f.producto_id === p.id)).toMatchObject([{ piezas_estimadas: 6 }]);
    const cinco = await pedir("GET", "/api/inventario/por-caducar?dias=5", dueno);
    expect((cinco.json().items as { producto_id: string }[]).some((f) => f.producto_id === p.id)).toBe(false);
  });

  it("400 con dias invalido, 401, 403", async () => {
    expect((await pedir("GET", "/api/inventario/por-caducar?dias=abc", dueno)).statusCode).toBe(400);
    expect((await pedir("GET", "/api/inventario/por-caducar")).statusCode).toBe(401);
    expect((await pedir("GET", "/api/inventario/por-caducar", repartidor)).statusCode).toBe(403);
  });
});

describe("POST /api/inventario/revaluaciones", () => {
  it("Dueño corrige el costo sin mover piezas (201, movimiento revaluacion); Administrador y Cajero 403", async () => {
    const p = await conStock();
    const r = await pedir("POST", "/api/inventario/revaluaciones", dueno, { producto_id: p.id, costo_unitario: "13.000000", motivo: "ajuste de proveedor" });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ producto_id: p.id, tipo: "revaluacion", cantidad: 0, existencia_resultante: 240, motivo: "ajuste de proveedor", costo_promedio_resultante: "13.000000" });
    expect((await pedir("GET", `/api/productos/${p.id}`, dueno)).json()).toMatchObject({ existencia: 240, costo_promedio: "13.000000" });
    // precios.editar sin costos.ver: 403 por costos.ver, pero un cuerpo malo sigue siendo 400 (zod antes que el permiso extra).
    const soloPrecios = await tokenF2(app, { permisos: ["precios.editar", "catalogo.ver"] });
    const sc = await pedir("POST", "/api/inventario/revaluaciones", soloPrecios, { producto_id: p.id, costo_unitario: "13", motivo: "x" });
    expect(sc.statusCode).toBe(403);
    expect(errorDe(sc)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "costos.ver" } });
    expect((await pedir("POST", "/api/inventario/revaluaciones", soloPrecios, { producto_id: p.id, costo_unitario: "x", motivo: "x" })).statusCode).toBe(400);
    for (const token of [admin, cajero]) {
      const f = await pedir("POST", "/api/inventario/revaluaciones", token, { producto_id: p.id, costo_unitario: "13", motivo: "x" });
      expect(f.statusCode).toBe(403);
      expect(errorDe(f)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "precios.editar" } });
    }
  });

  it("tras una revaluacion ya no se puede cancelar una compra anterior (COMPRA_CON_SALIDAS)", async () => {
    const p = await h.crearProducto(dueno, { factores: [24] });
    const c = (await h.registrarCompra(dueno, [{ presentacion_id: p.por(24).id, cantidad: 1, costo_presentacion: "300.00" }], { proveedor_id: proveedor })).json();
    await pedir("POST", "/api/inventario/revaluaciones", dueno, { producto_id: p.id, costo_unitario: "14", motivo: "x" });
    const r = await pedir("POST", `/api/compras/${c.id}/cancelar`, dueno, { motivo: "x" });
    expect(r.statusCode).toBe(409);
    expect(errorDe(r)).toMatchObject({ codigo: "COMPRA_CON_SALIDAS", detalles: { producto_id: Number(p.id) } });
  });

  it("400 (motivo, costo negativo, mas de 6 decimales, costo numerico), 404 producto, 401", async () => {
    const p = await conStock();
    for (const malo of [{ motivo: "" }, { costo_unitario: "-1" }, { costo_unitario: "12.1234567" }, { costo_unitario: 13 }]) {
      const v = await pedir("POST", "/api/inventario/revaluaciones", dueno, { producto_id: p.id, costo_unitario: "13", motivo: "x", ...malo });
      expect(v.statusCode, JSON.stringify(malo)).toBe(400);
      expect(errorDe(v).codigo).toBe("VALIDACION");
    }
    expect((await pedir("POST", "/api/inventario/revaluaciones", dueno, { producto_id: "99999999", costo_unitario: "13", motivo: "x" })).statusCode).toBe(404);
    expect((await pedir("POST", "/api/inventario/revaluaciones", undefined, { producto_id: p.id, costo_unitario: "13", motivo: "x" })).statusCode).toBe(401);
  });
});

describe("idempotencia de ajustes y conteos", () => {
  const movs = async (p: ProductoPrueba) => Number((await pool.query("select count(*) as n from app.movimiento_inventario where producto_id = $1", [p.id])).rows[0].n);

  it("ajuste: misma clave y cuerpo -> 200 con el mismo movimiento y sin duplicar; otro cuerpo u otro usuario -> 409 IDEMPOTENCIA_CONFLICTO", async () => {
    const p = await conStock();
    const clave = randomUUID();
    const cuerpo = { producto_id: p.id, tipo: "ajuste_salida", piezas: 5, motivo: "prueba", clave_idempotencia: clave };
    const a = await pedir("POST", "/api/inventario/ajustes", dueno, cuerpo);
    expect(a.statusCode).toBe(201);
    const antes = await movs(p);
    const b = await pedir("POST", "/api/inventario/ajustes", dueno, { motivo: "prueba", piezas: 5, tipo: "ajuste_salida", producto_id: p.id, clave_idempotencia: clave });
    expect(b.statusCode).toBe(200);
    expect(b.json().id).toBe(a.json().id);
    expect(await movs(p)).toBe(antes);
    expect(await existencia(p)).toBe(235);
    const otro = await pedir("POST", "/api/inventario/ajustes", dueno, { ...cuerpo, piezas: 6 });
    expect(otro.statusCode).toBe(409);
    expect(errorDe(otro).codigo).toBe("IDEMPOTENCIA_CONFLICTO");
    const ajeno = await pedir("POST", "/api/inventario/ajustes", await tokenF2(app, "Almacenista"), cuerpo);
    expect(ajeno.statusCode).toBe(409);
    expect(errorDe(ajeno).codigo).toBe("IDEMPOTENCIA_CONFLICTO");
    expect(await existencia(p)).toBe(235);
  });

  it("dos ajustes simultaneos con la misma clave: uno 201, otro 200, un solo movimiento", async () => {
    const p = await conStock();
    const cuerpo = { producto_id: p.id, tipo: "merma", piezas: 7, causa_merma: "otro", motivo: "x", clave_idempotencia: randomUUID() };
    const rs = await Promise.all([1, 2, 3].map(() => pedir("POST", "/api/inventario/ajustes", dueno, cuerpo)));
    expect(rs.map((r) => r.statusCode).sort()).toEqual([200, 200, 201]);
    expect(new Set(rs.map((r) => r.json().id)).size).toBe(1);
    expect(await existencia(p)).toBe(233);
  });

  it("conteo: con diferencia es idempotente (201 y luego 200 con el mismo movimiento)", async () => {
    const p = await conStock();
    const cuerpo = { producto_id: p.id, piezas_contadas: 200, motivo: "conteo", clave_idempotencia: randomUUID() };
    const a = await pedir("POST", "/api/inventario/conteos", dueno, cuerpo);
    expect(a.statusCode).toBe(201);
    const b = await pedir("POST", "/api/inventario/conteos", dueno, cuerpo);
    expect(b.statusCode).toBe(200);
    expect(b.json().id).toBe(a.json().id);
    expect(await existencia(p)).toBe(200);
    const c = await pedir("POST", "/api/inventario/conteos", dueno, { ...cuerpo, piezas_contadas: 100 });
    expect(c.statusCode).toBe(409);
    expect(errorDe(c).codigo).toBe("IDEMPOTENCIA_CONFLICTO");
  });

  it("dos conteos simultaneos con la misma clave: un solo movimiento", async () => {
    const p = await conStock();
    const cuerpo = { producto_id: p.id, piezas_contadas: 100, motivo: "conteo", clave_idempotencia: randomUUID() };
    const rs = await Promise.all([1, 2].map(() => pedir("POST", "/api/inventario/conteos", dueno, cuerpo)));
    expect(rs.map((r) => r.statusCode).sort()).toEqual([200, 201]);
    expect(await existencia(p)).toBe(100);
  });
});

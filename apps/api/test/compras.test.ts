import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, errorDe, marcaAuditoria, pool } from "./ayuda.js";
import { ayudaF2, limpiarF2, hoyMas, tokenF2, type ProductoPrueba } from "./ayuda-f2.js";

let app: FastifyInstance;
let h: ReturnType<typeof ayudaF2>;
let dueno: string;
let admin: string;
let almacenista: string;
let cajero: string;
let proveedor: { id: string; nombre: string };
let menudeo: string;
let mayoreo: string;

const pedir = (...a: Parameters<ReturnType<typeof ayudaF2>["pedir"]>) => h.pedir(...a);

beforeAll(async () => {
  app = await crearApp();
  h = ayudaF2(app);
  dueno = await tokenF2(app, "Dueño");
  admin = await tokenF2(app, "Administrador");
  almacenista = await tokenF2(app, "Almacenista");
  cajero = await tokenF2(app, "Cajero");
  proveedor = await h.crearProveedor(dueno);
  const listas = (await pedir("GET", "/api/listas-precio", dueno)).json().items as { id: string; nombre: string }[];
  menudeo = listas.find((l) => l.nombre === "Menudeo")!.id;
  mayoreo = listas.find((l) => l.nombre === "Mayoreo")!.id;
});
afterAll(async () => {
  await app.close();
  await limpiarF2();
  await cerrarPoolPruebas();
});

const comprar = (token: string, p: ProductoPrueba, cantidad: number, costo: string, o: { clave?: string; caduca_el?: string } = {}) =>
  h.registrarCompra(token, [{ presentacion_id: p.por(24).id, cantidad, costo_presentacion: costo, ...(o.caduca_el ? { caduca_el: o.caduca_el } : {}) }], { proveedor_id: proveedor.id, clave: o.clave });
const ficha = async (p: ProductoPrueba) => (await pedir("GET", `/api/productos/${p.id}`, dueno)).json() as { existencia: number; costo_promedio: string };

describe("POST /api/compras", () => {
  it("10 cajas a 300.00 sobre 0: 201 {id, folio, total}, existencia 240 y promedio 12.500000; la segunda a 312.00 -> 12.750000", async () => {
    const p = await h.crearProducto(dueno, { factores: [24] });
    const r = await comprar(dueno, p, 10, "300.00");
    expect(r.statusCode).toBe(201);
    expect(r.json()).toEqual({ id: expect.any(String), folio: expect.stringMatching(/^C-\d{6}$/), total: "3000.00" });
    expect(await ficha(p)).toMatchObject({ existencia: 240, costo_promedio: "12.500000" });
    const s = await comprar(almacenista, p, 10, "312.00");
    expect(s.statusCode).toBe(201);
    expect(s.json().total).toBe("3120.00");
    expect(await ficha(p)).toMatchObject({ existencia: 480, costo_promedio: "12.750000" });
    expect(s.json().id).not.toBe(r.json().id);
  });

  it("linea de regalo a costo 0 baja el promedio [P11]", async () => {
    const p = await h.crearProducto(dueno, { factores: [24] });
    await comprar(dueno, p, 10, "300.00");
    await comprar(dueno, p, 10, "312.00");
    expect((await comprar(dueno, p, 1, "0.00")).statusCode).toBe(201);
    expect(await ficha(p)).toMatchObject({ existencia: 504, costo_promedio: "12.142857" });
  });

  it("idempotencia: misma clave y mismo cuerpo -> 200 con el mismo id sin duplicar; otra llave del cuerpo en otro orden igual; otro cuerpo -> 409 IDEMPOTENCIA_CONFLICTO", async () => {
    const p = await h.crearProducto(dueno, { factores: [24] });
    const clave = randomUUID();
    const hoy = await hoyMas(0);
    const cuerpo = { clave_idempotencia: clave, proveedor_id: proveedor.id, fecha: hoy, condicion_pago: "contado", lineas: [{ presentacion_id: p.por(24).id, cantidad: 2, costo_presentacion: "300.00" }] };
    const a = await pedir("POST", "/api/compras", dueno, cuerpo);
    expect(a.statusCode).toBe(201);
    const b = await pedir("POST", "/api/compras", dueno, cuerpo);
    expect(b.statusCode).toBe(200);
    expect(b.json()).toEqual(a.json());
    // mismo contenido, llaves en otro orden y el costo escrito distinto ("300") -> mismo hash canonico solo si el valor es igual: aqui igual.
    const reordenado = { lineas: [{ costo_presentacion: "300.00", cantidad: 2, presentacion_id: p.por(24).id }], condicion_pago: "contado", fecha: hoy, proveedor_id: proveedor.id, clave_idempotencia: clave };
    const c = await pedir("POST", "/api/compras", dueno, reordenado);
    expect(c.statusCode).toBe(200);
    expect(c.json().id).toBe(a.json().id);
    expect(await ficha(p)).toMatchObject({ existencia: 48 });
    expect((await pool.query("select count(*) as n from app.compra where clave_idempotencia = $1", [clave])).rows[0].n).toBe("1");

    const otro = await pedir("POST", "/api/compras", dueno, { ...cuerpo, lineas: [{ presentacion_id: p.por(24).id, cantidad: 3, costo_presentacion: "300.00" }] });
    expect(otro.statusCode).toBe(409);
    expect(errorDe(otro).codigo).toBe("IDEMPOTENCIA_CONFLICTO");
    expect(await ficha(p)).toMatchObject({ existencia: 48 });
  });

  it("validaciones de borde -> 400 VALIDACION", async () => {
    const p = await h.crearProducto(dueno, { factores: [24] });
    const base = { clave_idempotencia: randomUUID(), proveedor_id: proveedor.id, fecha: await hoyMas(0), condicion_pago: "contado", lineas: [{ presentacion_id: p.por(24).id, cantidad: 1, costo_presentacion: "300.00" }] };
    const linea = base.lineas[0]!;
    const casos: Record<string, object> = {
      "sin lineas": { lineas: [] },
      "mas de 200 lineas": { lineas: Array.from({ length: 201 }, () => linea) },
      "clave no uuid": { clave_idempotencia: "123" },
      "sin clave": { clave_idempotencia: undefined },
      "costo con 3 decimales": { lineas: [{ ...linea, costo_presentacion: "12.345" }] },
      "costo numerico": { lineas: [{ ...linea, costo_presentacion: 300 }] },
      "cantidad 0": { lineas: [{ ...linea, cantidad: 0 }] },
      "cantidad decimal": { lineas: [{ ...linea, cantidad: 1.5 }] },
      "fecha mala": { fecha: "2026-13-40" },
      "condicion rara": { condicion_pago: "tarjeta" },
      "caduca mal": { lineas: [{ ...linea, caduca_el: "pronto" }] },
      "sin proveedor": { proveedor_id: undefined },
    };
    for (const [nombre, malo] of Object.entries(casos)) {
      const r = await pedir("POST", "/api/compras", dueno, { ...base, ...malo });
      expect(r.statusCode, nombre).toBe(400);
      expect(errorDe(r).codigo, nombre).toBe("VALIDACION");
    }
    expect(await ficha(p)).toMatchObject({ existencia: 0 });
  });

  it("errores de negocio: proveedor inactivo o inexistente -> 409 ESTADO_NO_VALIDO; presentacion inactiva, no comprable o inexistente -> 409 PRESENTACION_NO_VALIDA", async () => {
    const p = await h.crearProducto(dueno, { factores: [24] });
    const inactivo = await h.crearProveedor(dueno);
    await pedir("PATCH", `/api/proveedores/${inactivo.id}`, dueno, { activo: false });
    const linea = { presentacion_id: p.por(24).id, cantidad: 1, costo_presentacion: "10.00" };
    const hoy = await hoyMas(0);
    const post = (o: object) => pedir("POST", "/api/compras", dueno, { clave_idempotencia: randomUUID(), proveedor_id: proveedor.id, fecha: hoy, condicion_pago: "credito", lineas: [linea], ...o });
    for (const prov of [inactivo.id, "99999999"]) {
      const r = await post({ proveedor_id: prov });
      expect(r.statusCode).toBe(409);
      expect(errorDe(r).codigo).toBe("ESTADO_NO_VALIDO");
    }
    await pedir("PATCH", `/api/presentaciones/${p.por(24).id}`, dueno, { se_compra: false });
    const noComprable = await post({});
    expect(noComprable.statusCode).toBe(409);
    expect(errorDe(noComprable)).toMatchObject({ codigo: "PRESENTACION_NO_VALIDA", detalles: { presentacion_ids: [Number(p.por(24).id)] } });
    await pedir("PATCH", `/api/presentaciones/${p.por(24).id}`, dueno, { se_compra: true, activa: false });
    expect(errorDe(await post({})).codigo).toBe("PRESENTACION_NO_VALIDA");
    expect(errorDe(await post({ lineas: [{ ...linea, presentacion_id: "99999999" }] })).codigo).toBe("PRESENTACION_NO_VALIDA");
  });

  it("una compra con dos lineas del mismo producto y con caducidad", async () => {
    const p = await h.crearProducto(dueno, { factores: [6, 24] });
    const r = await h.registrarCompra(dueno, [
      { presentacion_id: p.por(24).id, cantidad: 1, costo_presentacion: "300.00", caduca_el: await hoyMas(40) },
      { presentacion_id: p.por(6).id, cantidad: 4, costo_presentacion: "75.00" },
    ], { proveedor_id: proveedor.id });
    expect(r.statusCode).toBe(201);
    expect(r.json().total).toBe("600.00");
    expect(await ficha(p)).toMatchObject({ existencia: 48, costo_promedio: "12.500000" });
  });

  it("401, 403 sin compras.registrar (Cajero y Administrador con solo ver)", async () => {
    const p = await h.crearProducto(dueno, { factores: [24] });
    const cuerpo = { clave_idempotencia: randomUUID(), proveedor_id: proveedor.id, fecha: await hoyMas(0), condicion_pago: "contado", lineas: [{ presentacion_id: p.por(24).id, cantidad: 1, costo_presentacion: "1.00" }] };
    expect((await pedir("POST", "/api/compras", undefined, cuerpo)).statusCode).toBe(401);
    const soloVer = await tokenF2(app, { permisos: ["compras.ver"] });
    for (const token of [cajero, soloVer]) {
      const r = await pedir("POST", "/api/compras", token, cuerpo);
      expect(r.statusCode).toBe(403);
      expect(errorDe(r)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "compras.registrar" } });
    }
  });
});

describe("GET /api/compras y /api/compras/:id", () => {
  it("detalle con lineas y caducidad; lista con filtros y forma paginada", async () => {
    const p = await h.crearProducto(dueno, { factores: [24] });
    const otro = await h.crearProveedor(dueno);
    const caduca = await hoyMas(30);
    const a = (await comprar(dueno, p, 3, "301.50", { caduca_el: caduca })).json();
    const b = (await h.registrarCompra(dueno, [{ presentacion_id: p.por(24).id, cantidad: 1, costo_presentacion: "10.00" }], { proveedor_id: otro.id, fecha: await hoyMas(-3) })).json();

    const dd = await pedir("GET", `/api/compras/${a.id}`, dueno);
    expect(dd.json().lineas[0]).toMatchObject({ costo_unitario: "12.562500", costo_presentacion: "301.50", importe: "904.50" });
    // Sin costos.ver (P37) no hay costo por pieza; lo pagado (costo_presentacion, importe) si se ve.
    const d = await pedir("GET", `/api/compras/${a.id}`, admin);
    expect(d.statusCode).toBe(200);
    expect(d.body).not.toContain("costo_unitario");
    expect(d.json()).toMatchObject({
      id: a.id, folio: a.folio, proveedor: { id: proveedor.id, nombre: proveedor.nombre }, fecha: await hoyMas(0), condicion_pago: "contado",
      estado: "registrada", total: "904.50", folio_proveedor: null, fecha_surtido: null, notas: null, motivo_cancelacion: null,
    });
    expect(d.json().lineas).toEqual([
      { id: expect.any(String), presentacion_id: p.por(24).id, producto_id: p.id, producto: p.nombre, presentacion: "Caja de 24", factor: 24, cantidad: 3, piezas: 72, costo_presentacion: "301.50", importe: "904.50", caduca_el: caduca },
    ]);

    const l = await pedir("GET", `/api/compras?proveedor_id=${otro.id}`, almacenista);
    expect(l.json()).toMatchObject({ total: 1, pagina: 1, por_pagina: 50 });
    expect(l.json().items[0]).toMatchObject({ id: b.id, folio: b.folio, estado: "registrada", total: "10.00", proveedor: { id: otro.id } });
    expect(l.json().items[0]).not.toHaveProperty("lineas");
    const rango = await pedir("GET", `/api/compras?proveedor_id=${proveedor.id}&desde=${await hoyMas(0)}&hasta=${await hoyMas(0)}`, dueno);
    expect((rango.json().items as { id: string }[]).some((x) => x.id === a.id)).toBe(true);
    expect((await pedir("GET", `/api/compras?proveedor_id=${otro.id}&desde=${await hoyMas(-1)}`, dueno)).json().total).toBe(0);
    expect((await pedir("GET", `/api/compras?proveedor_id=${proveedor.id}&estado=cancelada`, dueno)).json().total).toBe(0);
    expect((await pedir("GET", "/api/compras?por_pagina=1", dueno)).json().items).toHaveLength(1);
  });

  it("404, 400, 401 y 403", async () => {
    const n = await pedir("GET", "/api/compras/99999999", dueno);
    expect(n.statusCode).toBe(404);
    expect(errorDe(n).codigo).toBe("NO_ENCONTRADO");
    expect((await pedir("GET", "/api/compras/abc", dueno)).statusCode).toBe(400);
    expect((await pedir("GET", "/api/compras?estado=x", dueno)).statusCode).toBe(400);
    expect((await pedir("GET", "/api/compras")).statusCode).toBe(401);
    const c = await pedir("GET", "/api/compras", cajero);
    expect(c.statusCode).toBe(403);
    expect(errorDe(c)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "compras.ver" } });
    expect((await pedir("GET", "/api/compras/1", cajero)).statusCode).toBe(403);
  });
});

describe("POST /api/compras/:id/cancelar", () => {
  it("cancela la segunda y el promedio vuelve a 12.500000; cancelar otra vez -> 409 COMPRA_YA_CANCELADA", async () => {
    const p = await h.crearProducto(dueno, { factores: [24] });
    await comprar(dueno, p, 10, "300.00");
    const segunda = (await comprar(dueno, p, 10, "312.00")).json();
    expect(await ficha(p)).toMatchObject({ existencia: 480, costo_promedio: "12.750000" });
    const r = await pedir("POST", `/api/compras/${segunda.id}/cancelar`, dueno, { motivo: "se devolvio" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ id: segunda.id, estado: "cancelada", motivo_cancelacion: "se devolvio", cancelada_en: expect.any(String) });
    expect(await ficha(p)).toMatchObject({ existencia: 240, costo_promedio: "12.500000" });
    const otra = await pedir("POST", `/api/compras/${segunda.id}/cancelar`, dueno, { motivo: "otra vez" });
    expect(otra.statusCode).toBe(409);
    expect(errorDe(otra).codigo).toBe("COMPRA_YA_CANCELADA");
    expect((await pedir("GET", `/api/compras?estado=cancelada&proveedor_id=${proveedor.id}`, dueno)).json().items.some((x: { id: string }) => x.id === segunda.id)).toBe(true);
  });

  it("con salidas posteriores del producto -> 409 COMPRA_CON_SALIDAS {producto_id} y no cambia nada (la compra sigue registrada)", async () => {
    const p = await h.crearProducto(dueno, { factores: [24] });
    const c = (await comprar(dueno, p, 10, "300.00")).json();
    await pedir("POST", "/api/inventario/ajustes", dueno, { producto_id: p.id, tipo: "merma", piezas: 10, causa_merma: "danado", motivo: "x" });
    const r = await pedir("POST", `/api/compras/${c.id}/cancelar`, dueno, { motivo: "error" });
    expect(r.statusCode).toBe(409);
    expect(errorDe(r)).toMatchObject({ codigo: "COMPRA_CON_SALIDAS", detalles: { producto_id: Number(p.id) } });
    expect((await pedir("GET", `/api/compras/${c.id}`, dueno)).json()).toMatchObject({ estado: "registrada", motivo_cancelacion: null });
    expect(await ficha(p)).toMatchObject({ existencia: 230 });
    expect((await pedir("GET", `/api/inventario/movimientos?producto_id=${p.id}`, dueno)).json().total).toBe(2);
  });

  it("Administrador -> 403 SIN_PERMISO compras.cancelar; 400 sin motivo; 404; 401", async () => {
    const p = await h.crearProducto(dueno, { factores: [24] });
    const c = (await comprar(dueno, p, 1, "300.00")).json();
    const a = await pedir("POST", `/api/compras/${c.id}/cancelar`, admin, { motivo: "x" });
    expect(a.statusCode).toBe(403);
    expect(errorDe(a)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "compras.cancelar" } });
    expect((await pedir("POST", `/api/compras/${c.id}/cancelar`, almacenista, { motivo: "x" })).statusCode).toBe(403);
    for (const malo of [{}, { motivo: "" }, { motivo: "   " }]) {
      const v = await pedir("POST", `/api/compras/${c.id}/cancelar`, dueno, malo);
      expect(v.statusCode).toBe(400);
      expect(errorDe(v).codigo).toBe("VALIDACION");
    }
    const n = await pedir("POST", "/api/compras/99999999/cancelar", dueno, { motivo: "x" });
    expect(n.statusCode).toBe(404);
    expect(errorDe(n).codigo).toBe("NO_ENCONTRADO");
    expect((await pedir("POST", `/api/compras/${c.id}/cancelar`, undefined, { motivo: "x" })).statusCode).toBe(401);
    expect(await ficha(p)).toMatchObject({ existencia: 24 });
  });
});

describe("GET /api/compras/:id/margenes", () => {
  it("Dueño ve costo anterior/nuevo, margen, alerta y precio sugerido por presentacion y lista", async () => {
    const p = await h.crearProducto(dueno, { factores: [24] });
    await comprar(dueno, p, 10, "300.00");
    const compra = (await comprar(dueno, p, 10, "312.00")).json();
    await pedir("PUT", "/api/precios", dueno, {
      precios: [
        { presentacion_id: p.por(24).id, lista_precio_id: menudeo, precio: "330.00" },
        { presentacion_id: p.por(24).id, lista_precio_id: mayoreo, precio: "300.00" },
      ],
    });
    const r = await pedir("GET", `/api/compras/${compra.id}/margenes`, dueno);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ pagina: 1 });
    const filas = (r.json().items as Record<string, string | null>[]).filter((f) => f.presentacion_id === p.por(24).id);
    const men = filas.find((f) => f.lista_precio_id === menudeo)!;
    expect(men).toMatchObject({
      producto_id: p.id, producto: p.nombre, costo_anterior: "12.500000", costo_nuevo: "12.750000", presentacion: "Caja de 24",
      lista: "Menudeo", precio: "330.00", costo_presentacion: "306.00", objetivo: "0.15", alerta: "margen_bajo", precio_sugerido: "360.00",
    });
    expect(Number(men.margen)).toBeCloseTo(0.0727, 3);
    expect(filas.find((f) => f.lista_precio_id === mayoreo)).toMatchObject({ precio: "300.00", alerta: "bajo_costo", precio_sugerido: "360.00" });
    // Pieza sin precio: salen con precio, margen y alerta null.
    const pieza = (r.json().items as Record<string, string | null>[]).find((f) => f.presentacion_id === p.por(1).id && f.lista_precio_id === menudeo)!;
    expect(pieza).toMatchObject({ precio: null, margen: null, alerta: null });
    // La primera compra del producto no tiene costo anterior.
    const primera = (await pool.query<{ id: string }>("select min(c.id) as id from app.compra c join app.compra_linea l on l.compra_id = c.id where l.producto_id = $1", [p.id])).rows[0]!.id;
    const m1 = (await pedir("GET", `/api/compras/${primera}/margenes`, dueno)).json().items[0];
    expect(m1).toMatchObject({ costo_anterior: null, costo_nuevo: "12.500000" });
  });

  it("Administrador (tiene compras.ver) -> 403 SIN_PERMISO {permiso:'costos.ver'}, tambien con id inexistente; Dueño 404; 401; Cajero 403 compras.ver", async () => {
    const p = await h.crearProducto(dueno, { factores: [24] });
    const c = (await comprar(dueno, p, 1, "300.00")).json();
    for (const id of [c.id, "99999999"]) {
      const r = await pedir("GET", `/api/compras/${id}/margenes`, admin);
      expect(r.statusCode).toBe(403);
      expect(errorDe(r)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "costos.ver" } });
      expect(r.body).not.toContain("precio_sugerido");
    }
    const n = await pedir("GET", "/api/compras/99999999/margenes", dueno);
    expect(n.statusCode).toBe(404);
    expect((await pedir("GET", `/api/compras/${c.id}/margenes`)).statusCode).toBe(401);
    const k = await pedir("GET", `/api/compras/${c.id}/margenes`, cajero);
    expect(errorDe(k).detalles).toEqual({ permiso: "compras.ver" });
  });
});

describe("concurrencia", () => {
  it("dos POST /compras con la misma clave a la vez: una 201, otra 200 y una sola compra", async () => {
    const p = await h.crearProducto(dueno, { factores: [24] });
    const clave = randomUUID();
    const rs = await Promise.all([comprar(dueno, p, 4, "300.00", { clave }), comprar(dueno, p, 4, "300.00", { clave })]);
    expect(rs.map((r) => r.statusCode).sort()).toEqual([200, 201]);
    expect(rs[0]!.json().id).toBe(rs[1]!.json().id);
    expect((await pool.query("select count(*) as n from app.compra where clave_idempotencia = $1", [clave])).rows[0].n).toBe("1");
    expect(await ficha(p)).toMatchObject({ existencia: 96, costo_promedio: "12.500000" });
  });

  it("cancelar una compra mientras se registra otra del mismo producto: ambas terminan y el kardex cuadra", async () => {
    const p = await h.crearProducto(dueno, { factores: [24] });
    const a = (await comprar(dueno, p, 10, "300.00")).json();
    const [c, r] = await Promise.all([pedir("POST", `/api/compras/${a.id}/cancelar`, dueno, { motivo: "carrera" }), comprar(dueno, p, 10, "312.00")]);
    expect(c.statusCode).toBe(200);
    expect(r.statusCode).toBe(201);
    expect(await ficha(p)).toMatchObject({ existencia: 240, costo_promedio: "13.000000" });
    const k = (await pool.query("select sum(cantidad)::int as s from app.movimiento_inventario where producto_id = $1", [p.id])).rows[0];
    expect(k.s).toBe(240);
  });

  it("dos cancelaciones simultaneas de la misma compra: una 200 y otra 409 COMPRA_YA_CANCELADA", async () => {
    const p = await h.crearProducto(dueno, { factores: [24] });
    const a = (await comprar(dueno, p, 2, "300.00")).json();
    const rs = await Promise.all([1, 2].map(() => pedir("POST", `/api/compras/${a.id}/cancelar`, dueno, { motivo: "doble" })));
    expect(rs.map((x) => x.statusCode).sort()).toEqual([200, 409]);
    expect(errorDe(rs.find((x) => x.statusCode === 409)!).codigo).toBe("COMPRA_YA_CANCELADA");
    expect(await ficha(p)).toMatchObject({ existencia: 0 });
  });
});

describe("detalles de errores de negocio", () => {
  it("proveedor inactivo: ESTADO_NO_VALIDO {proveedor_id, motivo}; presentacion: {presentacion_ids}", async () => {
    const p = await h.crearProducto(dueno, { factores: [24] });
    const inactivo = await h.crearProveedor(dueno);
    await pedir("PATCH", `/api/proveedores/${inactivo.id}`, dueno, { activo: false });
    const r = await h.registrarCompra(dueno, [{ presentacion_id: p.por(24).id, cantidad: 1, costo_presentacion: "1.00" }], { proveedor_id: inactivo.id });
    expect(r.statusCode).toBe(409);
    expect(errorDe(r)).toMatchObject({ codigo: "ESTADO_NO_VALIDO", detalles: { proveedor_id: Number(inactivo.id), motivo: "proveedor_inactivo" } });
  });
});

describe("precio sugerido con configuracion rara (una sola regla en SQL)", () => {
  it("paso 0, llave ausente u objetivo >= 1 -> precio_sugerido null en /margenes y en /precios/sugeridos", async () => {
    const p = await h.crearProducto(dueno, { factores: [24] });
    const compra = (await comprar(dueno, p, 1, "306.00")).json();
    const sug = async () => (await pedir("GET", `/api/precios/sugeridos?producto_ids=${p.id}`, dueno)).json() as { presentacion_id: string; precio_sugerido: string | null }[];
    const mar = async () => (await pedir("GET", `/api/compras/${compra.id}/margenes`, dueno)).json().items as { presentacion_id: string; precio_sugerido: string | null }[];
    const caja = (f: { presentacion_id: string; precio_sugerido: string | null }[]) => f.filter((x) => x.presentacion_id === p.por(24).id);
    const originales = (await pool.query("select clave, valor from app.configuracion where clave in ('precio_redondeo', 'margen_objetivo')")).rows as { clave: string; valor: unknown }[];
    const marca = await marcaAuditoria();
    const poner = (clave: string, valor: string) => pool.query("update app.configuracion set valor = $2::jsonb where clave = $1", [clave, JSON.stringify(valor)]);
    try {
      expect(caja(await sug()).every((x) => x.precio_sugerido === "360.00")).toBe(true);
      expect(caja(await mar()).every((x) => x.precio_sugerido === "360.00")).toBe(true);

      await poner("precio_redondeo", "0");
      expect(caja(await sug()).every((x) => x.precio_sugerido === null)).toBe(true);
      expect(caja(await mar()).length).toBeGreaterThan(0);
      expect(caja(await mar()).every((x) => x.precio_sugerido === null)).toBe(true);

      await pool.query("delete from app.configuracion where clave = 'precio_redondeo'");
      expect(caja(await sug()).every((x) => x.precio_sugerido === null)).toBe(true);
      expect(caja(await mar()).length).toBeGreaterThan(0);
      expect(caja(await mar()).every((x) => x.precio_sugerido === null)).toBe(true);

      await pool.query("insert into app.configuracion (clave, valor) values ('precio_redondeo', '\"5.00\"')");
      await poner("margen_objetivo", "1");
      expect(caja(await sug()).every((x) => x.precio_sugerido === null)).toBe(true);
      expect(caja(await mar()).every((x) => x.precio_sugerido === null)).toBe(true);
    } finally {
      await pool.query("delete from app.configuracion where clave in ('precio_redondeo', 'margen_objetivo')");
      for (const o of originales) await pool.query("insert into app.configuracion (clave, valor) values ($1, $2::jsonb)", [o.clave, JSON.stringify(o.valor)]);
      await pool.query("delete from app.auditoria where tabla = 'configuracion' and id > $1", [marca]);
    }
    expect(caja(await sug()).every((x) => x.precio_sugerido === "360.00")).toBe(true);
  });
});

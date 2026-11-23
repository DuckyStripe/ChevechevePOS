import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, errorDe } from "./ayuda.js";
import { ayudaF2, limpiarF2, hoyMas, sufijo, tokenF2, type ProductoPrueba } from "./ayuda-f2.js";

let app: FastifyInstance;
let h: ReturnType<typeof ayudaF2>;
let dueno: string;
let admin: string;
let cajero: string;
let soloPrecios: string; // precios.editar sin costos.ver
let menudeo: string;
let mayoreo: string;
let proveedor: string;

const pedir = (...a: Parameters<ReturnType<typeof ayudaF2>["pedir"]>) => h.pedir(...a);
const poner = (token: string, filas: { presentacion_id: string; lista_precio_id: string; precio: string }[]) => pedir("PUT", "/api/precios", token, { precios: filas });

beforeAll(async () => {
  app = await crearApp();
  h = ayudaF2(app);
  dueno = await tokenF2(app, "Dueño");
  admin = await tokenF2(app, "Administrador");
  cajero = await tokenF2(app, "Cajero");
  soloPrecios = await tokenF2(app, { permisos: ["precios.editar", "catalogo.ver"] });
  const listas = (await pedir("GET", "/api/listas-precio", dueno)).json().items as { id: string; nombre: string }[];
  menudeo = listas.find((l) => l.nombre === "Menudeo")!.id;
  mayoreo = listas.find((l) => l.nombre === "Mayoreo")!.id;
  proveedor = (await h.crearProveedor(dueno)).id;
});
afterAll(async () => {
  await app.close();
  await limpiarF2();
  await cerrarPoolPruebas();
});

/** Producto con Pieza y Caja de 24 y 10 cajas compradas a 300.00 (promedio 12.500000, caja = 300.00). */
async function conCosto(): Promise<ProductoPrueba> {
  const p = await h.crearProducto(dueno, { factores: [24] });
  const c = await h.registrarCompra(dueno, [{ presentacion_id: p.por(24).id, cantidad: 10, costo_presentacion: "300.00" }], { proveedor_id: proveedor });
  expect(c.statusCode).toBe(201);
  return p;
}

describe("listas de precio", () => {
  it("GET lo ve cualquier sesion; semilla Menudeo (predeterminada) y Mayoreo", async () => {
    const r = await pedir("GET", "/api/listas-precio", cajero);
    expect(r.statusCode).toBe(200);
    const items = r.json().items as { nombre: string; es_predeterminada: boolean; activa: boolean }[];
    expect(items.find((l) => l.nombre === "Menudeo")).toMatchObject({ es_predeterminada: true, activa: true });
    expect(items.find((l) => l.nombre === "Mayoreo")).toMatchObject({ es_predeterminada: false });
    expect((await pedir("GET", "/api/listas-precio")).statusCode).toBe(401);
  });

  it("alta 201, renombrar, DUPLICADO, 400, 403, 404", async () => {
    const nombre = `Lista ${sufijo()}`;
    const c = await pedir("POST", "/api/listas-precio", dueno, { nombre });
    expect(c.statusCode).toBe(201);
    expect(c.json()).toMatchObject({ nombre, es_predeterminada: false, activa: true });
    const id = c.json().id;
    const p = await pedir("PATCH", `/api/listas-precio/${id}`, dueno, { nombre: `${nombre} 2`, activa: false });
    expect(p.json()).toMatchObject({ nombre: `${nombre} 2`, activa: false });
    const d = await pedir("POST", "/api/listas-precio", dueno, { nombre: `${nombre} 2` });
    expect(d.statusCode).toBe(409);
    expect(errorDe(d).codigo).toBe("DUPLICADO");
    expect(errorDe(await pedir("POST", "/api/listas-precio", dueno, { nombre: "" })).codigo).toBe("VALIDACION");
    const f = await pedir("POST", "/api/listas-precio", admin, { nombre: `x${sufijo()}` });
    expect(f.statusCode).toBe(403);
    expect(errorDe(f)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "precios.editar" } });
    expect((await pedir("PATCH", `/api/listas-precio/${id}`, admin, { activa: true })).statusCode).toBe(403);
    expect((await pedir("PATCH", "/api/listas-precio/99999999", dueno, { activa: true })).statusCode).toBe(404);
    expect((await pedir("POST", "/api/listas-precio", undefined, { nombre: "a" })).statusCode).toBe(401);
  });

  it("cambiar la predeterminada deja una sola; desmarcarla o desactivarla -> 409 ESTADO_NO_VALIDO", async () => {
    const id = (await pedir("POST", "/api/listas-precio", dueno, { nombre: `Pred ${sufijo()}` })).json().id;
    expect((await pedir("PATCH", `/api/listas-precio/${menudeo}`, dueno, { es_predeterminada: false })).statusCode).toBe(409);
    const d = await pedir("PATCH", `/api/listas-precio/${menudeo}`, dueno, { activa: false });
    expect(d.statusCode).toBe(409);
    expect(errorDe(d).codigo).toBe("ESTADO_NO_VALIDO");
    try {
      const r = await pedir("PATCH", `/api/listas-precio/${id}`, dueno, { es_predeterminada: true });
      expect(r.json().es_predeterminada).toBe(true);
      const items = (await pedir("GET", "/api/listas-precio", dueno)).json().items as { es_predeterminada: boolean }[];
      expect(items.filter((l) => l.es_predeterminada)).toHaveLength(1);
    } finally {
      expect((await pedir("PATCH", `/api/listas-precio/${menudeo}`, dueno, { es_predeterminada: true })).statusCode).toBe(200);
    }
  });
});

describe("PUT /api/precios", () => {
  it("guarda, cuenta solo los cambios y repetir no cambia nada", async () => {
    const p = await h.crearProducto(dueno, { factores: [24] });
    const filas = [
      { presentacion_id: p.por(1).id, lista_precio_id: menudeo, precio: "16.50" },
      { presentacion_id: p.por(24).id, lista_precio_id: menudeo, precio: "330" },
    ];
    const r = await poner(dueno, filas);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ actualizados: 2, advertencias: [] }); // sin costo no hay advertencias
    expect((await poner(dueno, filas)).json().actualizados).toBe(0);
    const otra = await poner(dueno, [{ presentacion_id: p.por(24).id, lista_precio_id: menudeo, precio: "335.50" }]);
    expect(otra.json().actualizados).toBe(1);
    const g = (await pedir("GET", `/api/productos/${p.id}`, dueno)).json();
    expect(g.presentaciones.find((x: { factor: number }) => x.factor === 24).precios).toEqual([{ lista_precio_id: menudeo, precio: "335.50" }]);
  });

  it("bajo costo: Dueño recibe advertencias; rol con precios.editar sin costos.ver no (y no ve costos); Administrador 403", async () => {
    const p = await conCosto();
    const fila = { presentacion_id: p.por(24).id, lista_precio_id: menudeo, precio: "290.00" };
    const d = await poner(dueno, [fila, { presentacion_id: p.por(24).id, lista_precio_id: mayoreo, precio: "310.00" }]);
    expect(d.statusCode).toBe(200);
    expect(d.json()).toEqual({
      actualizados: 2,
      advertencias: [{ presentacion_id: p.por(24).id, lista_precio_id: menudeo, precio: "290.00", costo_presentacion: "300.00" }],
    });

    const s = await poner(soloPrecios, [{ ...fila, precio: "280.00" }]);
    expect(s.statusCode).toBe(200);
    expect(s.json()).toEqual({ actualizados: 1 });
    expect(s.body).not.toContain("advertencias");
    expect(s.body).not.toContain("costo");
    const prod = await pedir("GET", `/api/productos/${p.id}`, soloPrecios);
    expect(prod.json()).not.toHaveProperty("costo_promedio");
    expect(prod.json()).not.toHaveProperty("ultimo_costo");

    const a = await poner(admin, [fila]);
    expect(a.statusCode).toBe(403);
    expect(errorDe(a)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "precios.editar" } });
  });

  it("400: vacio, mas de 500, repetidos, precio mal formado o negativo, presentacion o lista inexistente; 401", async () => {
    const p = await h.crearProducto(dueno);
    const ok = { presentacion_id: p.por(1).id, lista_precio_id: menudeo, precio: "10.00" };
    const casos: object[] = [
      { precios: [] },
      { precios: Array.from({ length: 501 }, (_, i) => ({ presentacion_id: String(i + 1), lista_precio_id: menudeo, precio: "1" })) },
      { precios: [ok, ok] },
      { precios: [{ ...ok, precio: "10.999" }] },
      { precios: [{ ...ok, precio: "-5" }] },
      { precios: [{ ...ok, precio: 10 }] },
      { precios: [{ ...ok, presentacion_id: "99999999" }] },
      { precios: [{ ...ok, lista_precio_id: "99999999" }] },
      {},
    ];
    for (const c of casos) {
      const r = await pedir("PUT", "/api/precios", dueno, c);
      expect(r.statusCode, JSON.stringify(c).slice(0, 80)).toBe(400);
      expect(errorDe(r).codigo).toBe("VALIDACION");
    }
    expect((await pedir("PUT", "/api/precios", undefined, { precios: [ok] })).statusCode).toBe(401);
  });

  it("no acepta una lista inactiva", async () => {
    const p = await h.crearProducto(dueno);
    const l = (await pedir("POST", "/api/listas-precio", dueno, { nombre: `Inac ${sufijo()}` })).json().id;
    await pedir("PATCH", `/api/listas-precio/${l}`, dueno, { activa: false });
    const r = await poner(dueno, [{ presentacion_id: p.por(1).id, lista_precio_id: l, precio: "1.00" }]);
    expect(r.statusCode).toBe(400);
  });
});

describe("GET /api/precios/bajo-costo", () => {
  it("Dueño ve las filas bajo costo (con diferencia); filtra por lista; Administrador 403 costos.ver; 401", async () => {
    const p = await conCosto();
    await poner(dueno, [
      { presentacion_id: p.por(24).id, lista_precio_id: menudeo, precio: "290.00" },
      { presentacion_id: p.por(24).id, lista_precio_id: mayoreo, precio: "350.00" },
    ]);
    const r = await pedir("GET", "/api/precios/bajo-costo", dueno);
    expect(r.statusCode).toBe(200);
    const fila = (r.json().filas as Record<string, string>[]).find((f) => f.presentacion_id === p.por(24).id)!;
    expect(fila).toMatchObject({ lista_precio_id: menudeo, precio: "290.00", costo_presentacion: "300.00", diferencia: "-10.00" });
    expect((r.json().filas as { presentacion_id: string; lista_precio_id: string }[]).filter((f) => f.presentacion_id === p.por(24).id)).toHaveLength(1);
    const may = await pedir("GET", `/api/precios/bajo-costo?lista_precio_id=${mayoreo}`, dueno);
    expect((may.json().filas as { presentacion_id: string }[]).some((f) => f.presentacion_id === p.por(24).id)).toBe(false);
    const a = await pedir("GET", "/api/precios/bajo-costo", admin);
    expect(a.statusCode).toBe(403);
    expect(errorDe(a)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "costos.ver" } });
    expect((await pedir("GET", "/api/precios/bajo-costo")).statusCode).toBe(401);
  });
});

describe("GET /api/precios/sugeridos", () => {
  it("formula A1 con el promedio vigente: ceil(costo/(1-objetivo)/paso)*paso", async () => {
    const p = await conCosto(); // caja 300.00, pieza 12.50; objetivo 0.15 y paso 5.00 de la configuracion
    await poner(dueno, [{ presentacion_id: p.por(24).id, lista_precio_id: menudeo, precio: "330.00" }]);
    const r = await pedir("GET", `/api/precios/sugeridos?producto_ids=${p.id}`, dueno);
    expect(r.statusCode).toBe(200);
    const filas = (r.json() as Record<string, string | null>[]).filter((f) => f.lista_precio_id === menudeo || f.lista_precio_id === mayoreo);
    expect(filas).toHaveLength(4); // 2 presentaciones x (Menudeo, Mayoreo); otras listas activas tambien salen
    const caja = filas.find((f) => f.presentacion_id === p.por(24).id && f.lista_precio_id === menudeo)!;
    expect(caja).toMatchObject({ precio: "330.00", precio_sugerido: "355.00", objetivo: "0.15" });
    expect(Number(caja.margen)).toBeCloseTo(0.0909, 3); // (330 - 300) / 330
    const cajaMay = filas.find((f) => f.presentacion_id === p.por(24).id && f.lista_precio_id === mayoreo)!;
    expect(cajaMay).toMatchObject({ precio: "330.00", precio_sugerido: "355.00" }); // cae a la predeterminada
    expect(filas.find((f) => f.presentacion_id === p.por(1).id && f.lista_precio_id === menudeo)).toMatchObject({ precio: null, precio_sugerido: "15.00", margen: null });
  });

  it("producto sin costo no tiene sugerido; el margen del producto manda", async () => {
    const sin = await h.crearProducto(dueno);
    const r = await pedir("GET", `/api/precios/sugeridos?producto_ids=${sin.id}`, dueno);
    expect((r.json() as { precio_sugerido: string | null }[]).every((f) => f.precio_sugerido === null)).toBe(true);
    const p = await h.crearProducto(dueno, { factores: [24], extra: { margen_objetivo: "0.1000" } });
    await h.registrarCompra(dueno, [{ presentacion_id: p.por(24).id, cantidad: 1, costo_presentacion: "306.00" }], { proveedor_id: proveedor });
    const m = (await pedir("GET", `/api/precios/sugeridos?producto_ids=${p.id}`, dueno)).json() as Record<string, string>[];
    expect(m.find((f) => f.presentacion_id === p.por(24).id)).toMatchObject({ precio_sugerido: "340.00", objetivo: "0.1000" }); // 306/0.9 = 340
  });

  it("403 con detalle correcto: precios.editar sin costos.ver, y sin precios.editar; 400; 401", async () => {
    const q = "?producto_ids=1";
    const a = await pedir("GET", `/api/precios/sugeridos${q}`, soloPrecios);
    expect(a.statusCode).toBe(403);
    expect(errorDe(a)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "costos.ver" } });
    const b = await pedir("GET", `/api/precios/sugeridos${q}`, admin);
    expect(b.statusCode).toBe(403);
    expect(errorDe(b).detalles).toEqual({ permiso: "precios.editar" });
    expect((await pedir("GET", "/api/precios/sugeridos", dueno)).statusCode).toBe(400);
    const muchos = Array.from({ length: 201 }, (_, i) => i + 1).join(",");
    expect((await pedir("GET", `/api/precios/sugeridos?producto_ids=${muchos}`, dueno)).statusCode).toBe(400);
    expect((await pedir("GET", `/api/precios/sugeridos${q}`)).statusCode).toBe(401);
  });
});

describe("ofertas", () => {
  it("alta 201 con la forma del contrato; GET filtra por presentacion y vigentes", async () => {
    const p = await h.crearProducto(dueno, { factores: [24] });
    await poner(dueno, [{ presentacion_id: p.por(24).id, lista_precio_id: menudeo, precio: "330.00" }]);
    const hoy = await hoyMas(0);
    const hasta = await hoyMas(5);
    const r = await pedir("POST", "/api/ofertas", dueno, { presentacion_id: p.por(24).id, lista_precio_id: menudeo, precio: "300", desde: hoy, hasta, motivo: "por_caducar" });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({
      presentacion_id: p.por(24).id, producto: p.nombre, presentacion: "Caja de 24", lista_precio_id: menudeo, lista: "Menudeo",
      precio: "300.00", precio_normal: "330.00", desde: hoy, hasta, motivo: "por_caducar", vigente: true,
    });

    const pasada = await pedir("POST", "/api/ofertas", dueno, { presentacion_id: p.por(24).id, precio: "310", desde: await hoyMas(-9), hasta: await hoyMas(-2), motivo: "promocion" });
    expect(pasada.statusCode).toBe(201);
    expect(pasada.json()).toMatchObject({ lista_precio_id: null, lista: null, vigente: false, precio_normal: "330.00" });

    const todas = await pedir("GET", `/api/ofertas?presentacion_id=${p.por(24).id}`, cajero);
    expect(todas.statusCode).toBe(200);
    expect(todas.json().total).toBe(2);
    const vigentes = await pedir("GET", `/api/ofertas?presentacion_id=${p.por(24).id}&vigentes=true`, cajero);
    expect(vigentes.json().total).toBe(1);
    expect(vigentes.json().items[0].id).toBe(r.json().id);
  });

  it("hasta < desde -> 400 (alta y PATCH); lista o presentacion inexistente -> 400; motivo raro -> 400", async () => {
    const p = await h.crearProducto(dueno);
    const base = { presentacion_id: p.por(1).id, precio: "5", desde: await hoyMas(2), hasta: await hoyMas(3), motivo: "promocion" };
    const malos = [{ hasta: await hoyMas(1) }, { lista_precio_id: "99999999" }, { presentacion_id: "99999999" }, { motivo: "otro" }, { desde: "2026-02-30" }, { precio: "-1" }];
    for (const m of malos) {
      const r = await pedir("POST", "/api/ofertas", dueno, { ...base, ...m });
      expect(r.statusCode, JSON.stringify(m)).toBe(400);
      expect(errorDe(r).codigo).toBe("VALIDACION");
    }
    const id = (await pedir("POST", "/api/ofertas", dueno, base)).json().id;
    expect((await pedir("PATCH", `/api/ofertas/${id}`, dueno, { desde: await hoyMas(4) })).statusCode).toBe(400); // contra el hasta guardado
    expect((await pedir("PATCH", `/api/ofertas/${id}`, dueno, { hasta: await hoyMas(1) })).statusCode).toBe(400); // contra el desde guardado
    expect((await pedir("PATCH", `/api/ofertas/${id}`, dueno, { desde: await hoyMas(3), hasta: await hoyMas(2) })).statusCode).toBe(400);
  });

  it("una oferta vigente cambia el precio de /presentaciones/codigo y deja de hacerlo al moverla a mañana (PATCH)", async () => {
    const p = await h.crearProducto(dueno, { factores: [24] });
    const codigo = `of${sufijo()}`;
    await pedir("PATCH", `/api/presentaciones/${p.por(24).id}`, dueno, { codigo_barras: codigo });
    await poner(dueno, [{ presentacion_id: p.por(24).id, lista_precio_id: menudeo, precio: "330.00" }]);
    const precio = async (lista?: string) => (await pedir("GET", `/api/presentaciones/codigo/${codigo}${lista ? `?lista_precio_id=${lista}` : ""}`, dueno)).json().precio;
    expect(await precio()).toBe("330.00");
    const o = await pedir("POST", "/api/ofertas", dueno, { presentacion_id: p.por(24).id, precio: "300.00", desde: await hoyMas(0), hasta: await hoyMas(3), motivo: "por_caducar" });
    expect(await precio()).toBe("300.00");
    expect(await precio(mayoreo)).toBe("300.00"); // lista null = todas
    const mover = await pedir("PATCH", `/api/ofertas/${o.json().id}`, dueno, { desde: await hoyMas(1), hasta: await hoyMas(3) });
    expect(mover.statusCode).toBe(200);
    expect(mover.json()).toMatchObject({ vigente: false, precio: "300.00" });
    expect(await precio()).toBe("330.00");
    const lista = await pedir("PATCH", `/api/ofertas/${o.json().id}`, dueno, { lista_precio_id: menudeo, desde: await hoyMas(0) });
    expect(lista.json()).toMatchObject({ lista_precio_id: menudeo, lista: "Menudeo", vigente: true });
    expect(await precio(mayoreo)).toBe("330.00"); // ya no aplica a Mayoreo (cae al precio predeterminado)
    expect(await precio()).toBe("300.00");
  });

  it("DELETE 204, luego 404; permisos: Administrador y Cajero 403 al escribir, 401 sin token", async () => {
    const p = await h.crearProducto(dueno);
    const cuerpo = { presentacion_id: p.por(1).id, precio: "5", desde: await hoyMas(0), hasta: await hoyMas(1), motivo: "promocion" };
    const id = (await pedir("POST", "/api/ofertas", dueno, cuerpo)).json().id;
    for (const token of [admin, cajero]) {
      expect((await pedir("POST", "/api/ofertas", token, cuerpo)).statusCode).toBe(403);
      expect((await pedir("PATCH", `/api/ofertas/${id}`, token, { precio: "1" })).statusCode).toBe(403);
      const d = await pedir("DELETE", `/api/ofertas/${id}`, token);
      expect(d.statusCode).toBe(403);
      expect(errorDe(d)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "precios.editar" } });
    }
    expect((await pedir("POST", "/api/ofertas", undefined, cuerpo)).statusCode).toBe(401);
    expect((await pedir("GET", "/api/ofertas")).statusCode).toBe(401);
    expect((await pedir("GET", "/api/ofertas", admin)).statusCode).toBe(200); // ver = catalogo.ver
    expect((await pedir("DELETE", `/api/ofertas/${id}`, dueno)).statusCode).toBe(204);
    const otra = await pedir("DELETE", `/api/ofertas/${id}`, dueno);
    expect(otra.statusCode).toBe(404);
    expect(errorDe(otra).codigo).toBe("NO_ENCONTRADO");
    expect((await pedir("PATCH", "/api/ofertas/99999999", dueno, { precio: "1" })).statusCode).toBe(404);
  });
});

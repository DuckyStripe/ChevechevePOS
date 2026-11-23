import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, errorDe } from "./ayuda.js";
import { ayudaF2, limpiarF2, sufijo, tokenF2, type ProductoPrueba } from "./ayuda-f2.js";

let app: FastifyInstance;
let h: ReturnType<typeof ayudaF2>;
let dueno: string;
let admin: string;
let cajero: string;
let menudeo: string;
let mayoreo: string;
let categoria: string;

const pedir = (...a: Parameters<ReturnType<typeof ayudaF2>["pedir"]>) => h.pedir(...a);

beforeAll(async () => {
  app = await crearApp();
  h = ayudaF2(app);
  dueno = await tokenF2(app, "Dueño");
  admin = await tokenF2(app, "Administrador");
  cajero = await tokenF2(app, "Cajero");
  const listas = (await pedir("GET", "/api/listas-precio", dueno)).json().items as { id: string; nombre: string }[];
  menudeo = listas.find((l) => l.nombre === "Menudeo")!.id;
  mayoreo = listas.find((l) => l.nombre === "Mayoreo")!.id;
  categoria = (await h.crearCategoria(dueno)).id;
});
afterAll(async () => {
  await app.close();
  await limpiarF2();
  await cerrarPoolPruebas();
});

const poner = (token: string, filas: { presentacion_id: string; lista_precio_id: string; precio: string }[]) => pedir("PUT", "/api/precios", token, { precios: filas });

describe("Corona lata: alta y ficha", () => {
  let corona: ProductoPrueba;
  it("POST /productos 201 y GET devuelve 3 presentaciones con sus precios", async () => {
    const marca = (await pedir("POST", "/api/marcas", dueno, { nombre: `Corona ${sufijo()}` })).json();
    const nombre = `Corona lata ${sufijo()}`;
    const r = await pedir("POST", "/api/productos", dueno, {
      nombre,
      categoria_id: categoria,
      marca_id: marca.id,
      sku: `SKU-${sufijo()}`,
      alias: ["coronita"],
      contenido_ml: 355,
      tipo_envase: "lata",
      existencia_minima: 48,
      margen_objetivo: "0.1000",
      presentaciones: [
        { nombre: "Pieza", factor: 1 },
        { nombre: "Six", factor: 6 },
        { nombre: "Caja de 24", factor: 24, codigo_barras: `75${Date.now()}`.slice(0, 13) },
      ],
    });
    expect(r.statusCode).toBe(201);
    const c = r.json();
    corona = { id: c.id, nombre, presentaciones: c.presentaciones, por: (f) => c.presentaciones.find((p: { factor: number }) => p.factor === f) };
    expect(c).toMatchObject({
      nombre, alias: ["coronita"], contenido_ml: 355, tipo_envase: "lata", modo_surtido: "inventario", margen_objetivo: "0.1000",
      existencia_minima: 48, activo: true, existencia: 0, comprometido: 0, imagen: null, proveedor: null,
      categoria: { id: categoria }, marca: { id: marca.id, nombre: marca.nombre },
    });
    expect(c.presentaciones.map((p: { factor: number }) => p.factor)).toEqual([1, 6, 24]);

    const caja = corona.por(24).id;
    const pieza = corona.por(1).id;
    const ps = await poner(dueno, [
      { presentacion_id: pieza, lista_precio_id: menudeo, precio: "16.50" },
      { presentacion_id: caja, lista_precio_id: menudeo, precio: "330.00" },
      { presentacion_id: caja, lista_precio_id: mayoreo, precio: "320.00" },
    ]);
    expect(ps.statusCode).toBe(200);

    const g = await pedir("GET", `/api/productos/${corona.id}`, cajero);
    expect(g.statusCode).toBe(200);
    const b = g.json();
    expect(b.presentaciones).toHaveLength(3);
    const cajaB = b.presentaciones.find((p: { factor: number }) => p.factor === 24);
    expect(cajaB.precios).toEqual(
      expect.arrayContaining([
        { lista_precio_id: menudeo, precio: "330.00" },
        { lista_precio_id: mayoreo, precio: "320.00" },
      ]),
    );
    expect(b.presentaciones.find((p: { factor: number }) => p.factor === 6).precios).toEqual([]);
    expect(b.presentaciones[0]).toMatchObject({ nombre: "Pieza", se_vende: true, se_compra: true, activa: true, codigo_barras: null });
  });

  it("PATCH /productos/:id edita y devuelve el producto; null limpia", async () => {
    const r = await pedir("PATCH", `/api/productos/${corona.id}`, admin, { descripcion: "Lata 355 ml", existencia_minima: 10, margen_objetivo: null, activo: false });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ id: corona.id, descripcion: "Lata 355 ml", existencia_minima: 10, margen_objetivo: null, activo: false });
    const otra = await pedir("PATCH", `/api/productos/${corona.id}`, admin, { activo: true, alias: ["coronita", "corona"] });
    expect(otra.json()).toMatchObject({ activo: true, alias: ["coronita", "corona"] });
  });

  it("PATCH con categoria que no existe -> 400; producto que no existe -> 404", async () => {
    const r = await pedir("PATCH", `/api/productos/${corona.id}`, admin, { categoria_id: "99999999" });
    expect(r.statusCode).toBe(400);
    expect(errorDe(r).codigo).toBe("VALIDACION");
    expect((await pedir("PATCH", "/api/productos/99999999", admin, { activo: true })).statusCode).toBe(404);
  });

  it("presentaciones: Caja de 24 y Charola de 24 conviven; nombre repetido -> 409 DUPLICADO", async () => {
    const a = await pedir("POST", `/api/productos/${corona.id}/presentaciones`, admin, { nombre: "Charola de 24", factor: 24 });
    expect(a.statusCode).toBe(201);
    expect(a.json()).toMatchObject({ producto_id: corona.id, nombre: "Charola de 24", factor: 24, se_vende: true, se_compra: true, activa: true, precios: [] });
    const d = await pedir("POST", `/api/productos/${corona.id}/presentaciones`, admin, { nombre: "CHAROLA DE 24", factor: 24 });
    expect(d.statusCode).toBe(409);
    expect(errorDe(d).codigo).toBe("DUPLICADO");
    expect((await pedir("POST", "/api/productos/99999999/presentaciones", admin, { nombre: "X", factor: 2 })).statusCode).toBe(404);
    expect((await pedir("POST", `/api/productos/${corona.id}/presentaciones`, admin, { nombre: "X", factor: 0 })).statusCode).toBe(400);
  });

  it("PATCH /presentaciones/:id: factor -> 400 VALIDACION; nombre, codigo y activa pasan", async () => {
    const f = await pedir("PATCH", `/api/presentaciones/${corona.por(6).id}`, admin, { factor: 12 });
    expect(f.statusCode).toBe(400);
    expect(errorDe(f).codigo).toBe("VALIDACION");
    const ok = await pedir("PATCH", `/api/presentaciones/${corona.por(6).id}`, admin, { nombre: "Sixpack", codigo_barras: `cb${sufijo()}`, activa: false });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ nombre: "Sixpack", factor: 6, activa: false });
    expect((await pedir("PATCH", "/api/presentaciones/99999999", admin, { activa: false })).statusCode).toBe(404);
  });

  it("codigo de barras repetido -> 409 DUPLICADO", async () => {
    const codigo = `dup${sufijo()}`;
    await pedir("PATCH", `/api/presentaciones/${corona.por(1).id}`, admin, { codigo_barras: codigo });
    const d = await pedir("PATCH", `/api/presentaciones/${corona.por(24).id}`, admin, { codigo_barras: codigo });
    expect(d.statusCode).toBe(409);
    expect(errorDe(d).codigo).toBe("DUPLICADO");
  });
});

describe("POST /productos: errores", () => {
  it("sin presentacion factor 1 -> 409 PRODUCTO_SIN_PIEZA y no queda nada", async () => {
    const nombre = `Sin pieza ${sufijo()}`;
    const r = await pedir("POST", "/api/productos", dueno, { nombre, categoria_id: categoria, existencia_minima: 0, presentaciones: [{ nombre: "Caja de 24", factor: 24 }] });
    expect(r.statusCode).toBe(409);
    expect(errorDe(r).codigo).toBe("PRODUCTO_SIN_PIEZA");
    const l = await pedir("GET", `/api/productos?buscar=${encodeURIComponent(nombre)}`, dueno);
    expect(l.json().items).toEqual([]);
  });

  it("400 (faltan campos, factor decimal, margen 0.95, categoria inexistente), 409 DUPLICADO (sku)", async () => {
    const base = { nombre: `P ${sufijo()}`, categoria_id: categoria, existencia_minima: 0, presentaciones: [{ nombre: "Pieza", factor: 1 }] };
    for (const malo of [{ nombre: "" }, { existencia_minima: -1 }, { presentaciones: [{ nombre: "Pieza", factor: 1.5 }] }, { margen_objetivo: "0.95" }, { categoria_id: "99999999" }, { tipo_envase: "bolsa" }]) {
      const r = await pedir("POST", "/api/productos", dueno, { ...base, ...malo });
      expect(r.statusCode, JSON.stringify(malo)).toBe(400);
      expect(errorDe(r).codigo).toBe("VALIDACION");
    }
    const sku = `SKU-${sufijo()}`;
    expect((await pedir("POST", "/api/productos", dueno, { ...base, sku })).statusCode).toBe(201);
    const d = await pedir("POST", "/api/productos", dueno, { ...base, nombre: `Q ${sufijo()}`, sku });
    expect(d.statusCode).toBe(409);
    expect(errorDe(d).codigo).toBe("DUPLICADO");
  });

  it("401 sin token; 403 sin catalogo.editar con detalle del permiso", async () => {
    const cuerpo = { nombre: "x", categoria_id: categoria, existencia_minima: 0, presentaciones: [{ nombre: "Pieza", factor: 1 }] };
    expect((await pedir("POST", "/api/productos", undefined, cuerpo)).statusCode).toBe(401);
    const r = await pedir("POST", "/api/productos", cajero, cuerpo);
    expect(r.statusCode).toBe(403);
    expect(errorDe(r)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "catalogo.editar" } });
    expect((await pedir("PATCH", "/api/productos/1", cajero, {})).statusCode).toBe(403);
    expect((await pedir("POST", "/api/productos/1/presentaciones", cajero, { nombre: "a", factor: 2 })).statusCode).toBe(403);
    expect((await pedir("PATCH", "/api/presentaciones/1", cajero, {})).statusCode).toBe(403);
  });
});

describe("GET /productos: filtros", () => {
  it("lista paginada, 401, 403, 404 y id invalido", async () => {
    expect((await pedir("GET", "/api/productos")).statusCode).toBe(401);
    const sinPermiso = await tokenF2(app, { permisos: ["inventario.ver"] });
    expect((await pedir("GET", "/api/productos", sinPermiso)).statusCode).toBe(403);
    expect((await pedir("GET", "/api/productos/99999999", dueno)).statusCode).toBe(404);
    expect((await pedir("GET", "/api/productos/abc", dueno)).statusCode).toBe(400);
    const l = await pedir("GET", "/api/productos?por_pagina=2", dueno);
    expect(l.json()).toMatchObject({ pagina: 1, por_pagina: 2 });
    expect(l.json().items.length).toBeLessThanOrEqual(2);
  });

  it("categoria_id, modo_surtido, activo, producto_ids y bajo_minimo", async () => {
    const cat = (await h.crearCategoria(dueno)).id;
    const a = await h.crearProducto(dueno, { categoria_id: cat, extra: { existencia_minima: 5 } });
    const b = await h.crearProducto(dueno, { categoria_id: cat, extra: { existencia_minima: 5, modo_surtido: "contra_pedido" } });
    const c = await h.crearProducto(dueno, { categoria_id: cat });
    await pedir("PATCH", `/api/productos/${c.id}`, dueno, { activo: false });

    const ids = async (q: string) => ((await pedir("GET", `/api/productos?categoria_id=${cat}&${q}`, dueno)).json().items as { id: string }[]).map((x) => x.id).sort();
    expect(await ids("")).toEqual([a.id, b.id, c.id].sort());
    expect(await ids("activo=true")).toEqual([a.id, b.id].sort());
    expect(await ids("activo=false")).toEqual([c.id]);
    expect(await ids("modo_surtido=contra_pedido")).toEqual([b.id]);
    // bajo_minimo: solo `inventario` con existencia < minimo (b es contra_pedido; c tiene minimo 0).
    expect(await ids("bajo_minimo=true")).toEqual([a.id]);
    expect(await ids("bajo_minimo=false")).toEqual([b.id, c.id].sort());
    const porIds = await pedir("GET", `/api/productos?producto_ids=${a.id},${c.id}`, dueno);
    expect((porIds.json().items as { id: string }[]).map((x) => x.id).sort()).toEqual([a.id, c.id].sort());
    expect(porIds.json().total).toBe(2);

    const muchos = Array.from({ length: 51 }, (_, i) => i + 1).join(",");
    const r = await pedir("GET", `/api/productos?producto_ids=${muchos}`, dueno);
    expect(r.statusCode).toBe(400);
    expect(errorDe(r).codigo).toBe("VALIDACION");
    expect((await pedir("GET", "/api/productos?producto_ids=a,b", dueno)).statusCode).toBe(400);
  });
});

describe("busqueda tolerante GET /productos?buscar=", () => {
  const marca = sufijo();
  const prod: Record<string, ProductoPrueba> = {};
  beforeAll(async () => {
    const mk = (nombre: string, alias: string[]) => h.crearProducto(dueno, { nombre: `${nombre}`, alias });
    prod.lata = await mk("Corona Extra 355 ml lata", []);
    prod.familiar = await mk("Corona Familiar 940 ml", ["caguama"]);
    prod.tecate = await mk("Tecate Light", ["lite"]);
    prod.equis = await mk("Dos Equis Lager", ["xx"]);
    void marca;
  });
  const buscar = async (t: string) => ((await pedir("GET", `/api/productos?buscar=${encodeURIComponent(t)}`, dueno)).json().items as { id: string }[]).map((x) => x.id);

  it("caguama -> Familiar primero", async () => expect((await buscar("caguama"))[0]).toBe(prod.familiar!.id));
  it("tecate lite y tecate light -> Tecate Light", async () => {
    expect((await buscar("tecate lite"))[0]).toBe(prod.tecate!.id);
    expect((await buscar("tecate light"))[0]).toBe(prod.tecate!.id);
  });
  it("kerona -> una Corona", async () => expect([prod.lata!.id, prod.familiar!.id]).toContain((await buscar("kerona"))[0]));
  it("xx -> Dos Equis", async () => expect((await buscar("xx"))[0]).toBe(prod.equis!.id));
  it("CORONA en mayusculas encuentra las dos Corona", async () => {
    const r = await buscar("CORONA");
    expect(r).toEqual(expect.arrayContaining([prod.lata!.id, prod.familiar!.id]));
  });
  it("sin coincidencias -> lista vacia", async () => expect(await buscar("zzzqqqxxyy")).toEqual([]));
});

describe("costos.ver oculta costos en el producto", () => {
  it("Dueño ve costo_promedio y ultimo_costo; Administrador y rol sin costos.ver no traen las llaves", async () => {
    const prov = await h.crearProveedor(dueno);
    const p = await h.crearProducto(dueno, { factores: [24] });
    const compra = await h.registrarCompra(dueno, [{ presentacion_id: p.por(24).id, cantidad: 10, costo_presentacion: "300.00" }], { proveedor_id: prov.id });
    expect(compra.statusCode).toBe(201);

    const d = (await pedir("GET", `/api/productos/${p.id}`, dueno)).json();
    expect(d).toMatchObject({ existencia: 240, costo_promedio: "12.500000", ultimo_costo: "12.500000" });

    const sinCostos = await tokenF2(app, { permisos: ["catalogo.ver", "precios.editar"] });
    for (const token of [admin, sinCostos]) {
      const uno = (await pedir("GET", `/api/productos/${p.id}`, token)).json();
      expect(uno.existencia).toBe(240);
      expect(uno).not.toHaveProperty("costo_promedio");
      expect(uno).not.toHaveProperty("ultimo_costo");
      const lista = await pedir("GET", `/api/productos?producto_ids=${p.id}`, token);
      expect(lista.body).not.toContain("costo_promedio");
      expect(lista.body).not.toContain("ultimo_costo");
    }
    const lista = await pedir("GET", `/api/productos?producto_ids=${p.id}`, dueno);
    expect(lista.json().items[0]).toHaveProperty("costo_promedio", "12.500000");
  });
});

describe("GET /presentaciones/codigo/:codigo", () => {
  it("devuelve el ArticuloPos con precio (lista predeterminada o la pedida)", async () => {
    const p = await h.crearProducto(dueno, { factores: [24] });
    const codigo = `7501${sufijo()}`;
    await pedir("PATCH", `/api/presentaciones/${p.por(24).id}`, dueno, { codigo_barras: codigo });
    await poner(dueno, [
      { presentacion_id: p.por(24).id, lista_precio_id: menudeo, precio: "330.00" },
      { presentacion_id: p.por(24).id, lista_precio_id: mayoreo, precio: "320.00" },
    ]);
    const r = await pedir("GET", `/api/presentaciones/codigo/${codigo}`, dueno);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      presentacion_id: p.por(24).id, producto_id: p.id, producto: p.nombre, presentacion: "Caja de 24", factor: 24,
      codigo_barras: codigo, precio: "330.00", existencia_piezas: 0, disponible_piezas: 0, imagen: null,
    });
    const may = await pedir("GET", `/api/presentaciones/codigo/${codigo}?lista_precio_id=${mayoreo}`, dueno);
    expect(may.json().precio).toBe("320.00");
    // Administrador puede por compras.registrar.
    expect((await pedir("GET", `/api/presentaciones/codigo/${codigo}`, admin)).statusCode).toBe(200);
  });

  it("404 desconocido o inactiva; 403 Cajero; 401", async () => {
    const nada = await pedir("GET", "/api/presentaciones/codigo/0000000000000", dueno);
    expect(nada.statusCode).toBe(404);
    expect(errorDe(nada).codigo).toBe("NO_ENCONTRADO");
    const p = await h.crearProducto(dueno);
    const codigo = `inact${sufijo()}`;
    await pedir("PATCH", `/api/presentaciones/${p.por(1).id}`, dueno, { codigo_barras: codigo, activa: false });
    expect((await pedir("GET", `/api/presentaciones/codigo/${codigo}`, dueno)).statusCode).toBe(404);
    const c = await pedir("GET", `/api/presentaciones/codigo/${codigo}`, cajero);
    expect(c.statusCode).toBe(403);
    expect(errorDe(c).codigo).toBe("SIN_PERMISO");
    expect((await pedir("GET", `/api/presentaciones/codigo/${codigo}`)).statusCode).toBe(401);
  });
});

describe("sin costos.ver no hay llaves de costo en ninguna respuesta de catalogo", () => {
  it("GET /productos/:id y /presentaciones/codigo", async () => {
    const p = await h.crearProducto(dueno, { factores: [24] });
    const prov = await h.crearProveedor(dueno);
    await h.registrarCompra(dueno, [{ presentacion_id: p.por(24).id, cantidad: 1, costo_presentacion: "300.00" }], { proveedor_id: prov.id });
    const codigo = `sc${sufijo()}`;
    await pedir("PATCH", `/api/presentaciones/${p.por(24).id}`, dueno, { codigo_barras: codigo });
    const rol = await tokenF2(app, { permisos: ["catalogo.ver", "compras.registrar"] });
    for (const url of [`/api/productos/${p.id}`, `/api/productos?producto_ids=${p.id}`, `/api/presentaciones/codigo/${codigo}`]) {
      const r = await pedir("GET", url, rol);
      expect(r.statusCode, url).toBe(200);
      expect(r.body, url).not.toMatch(/costo/);
      expect(r.body, url).not.toContain("12.5");
    }
    const art = (await pedir("GET", `/api/presentaciones/codigo/${codigo}`, rol)).json();
    expect(art).toMatchObject({ se_vende: true, se_compra: true });
  });

  it("producto_ids devuelve tambien productos inactivos", async () => {
    const p = await h.crearProducto(dueno);
    await pedir("PATCH", `/api/productos/${p.id}`, dueno, { activo: false });
    const r = await pedir("GET", `/api/productos?producto_ids=${p.id}&activo=true`, dueno);
    expect(r.json().items.map((x: { id: string }) => x.id)).toEqual([p.id]);
  });
});

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, errorDe } from "./ayuda.js";
import { ayudaF2, limpiarF2, sufijo, tokenF2 } from "./ayuda-f2.js";

let app: FastifyInstance;
let pedir: ReturnType<typeof ayudaF2>["pedir"];
let dueno: string;
let admin: string;
let cajero: string;
let repartidor: string;

beforeAll(async () => {
  app = await crearApp();
  pedir = ayudaF2(app).pedir;
  dueno = await tokenF2(app, "Dueño");
  admin = await tokenF2(app, "Administrador");
  cajero = await tokenF2(app, "Cajero");
  repartidor = await tokenF2(app, "Repartidor");
});
afterAll(async () => {
  await app.close();
  await limpiarF2();
  await cerrarPoolPruebas();
});

describe.each([
  ["categorias", (n: string) => ({ nombre: n, orden: 3, margen_objetivo: "0.2000" })],
  ["marcas", (n: string) => ({ nombre: n })],
])("/api/%s", (ruta, cuerpo) => {
  it("alta 201, lista paginada con filtro activa, PATCH", async () => {
    const nombre = `X ${sufijo()}`;
    const c = await pedir("POST", `/api/${ruta}`, admin, cuerpo(nombre));
    expect(c.statusCode).toBe(201);
    const creado = c.json();
    expect(creado).toMatchObject({ nombre, activa: true });
    expect(typeof creado.id).toBe("string");
    if (ruta === "categorias") expect(creado).toMatchObject({ orden: 3, margen_objetivo: "0.2000" });

    const l = await pedir("GET", `/api/${ruta}?activa=true&por_pagina=200`, repartidor);
    expect(l.statusCode).toBe(200);
    expect(l.json()).toMatchObject({ pagina: 1, por_pagina: 200 });
    expect(l.json().items.some((x: { id: string }) => x.id === creado.id)).toBe(true);

    const p = await pedir("PATCH", `/api/${ruta}/${creado.id}`, admin, { activa: false });
    expect(p.statusCode).toBe(200);
    expect(p.json()).toMatchObject({ id: creado.id, nombre, activa: false });
    const inactivas = await pedir("GET", `/api/${ruta}?activa=false&por_pagina=200`, admin);
    expect(inactivas.json().items.some((x: { id: string }) => x.id === creado.id)).toBe(true);
    const activas = await pedir("GET", `/api/${ruta}?activa=true&por_pagina=200`, admin);
    expect(activas.json().items.some((x: { id: string }) => x.id === creado.id)).toBe(false);
  });

  it("409 DUPLICADO (otra mayuscula), 400, 401, 403, 404", async () => {
    const nombre = `Dup ${sufijo()}`;
    expect((await pedir("POST", `/api/${ruta}`, admin, cuerpo(nombre))).statusCode).toBe(201);
    const d = await pedir("POST", `/api/${ruta}`, admin, cuerpo(nombre.toUpperCase()));
    expect(d.statusCode).toBe(409);
    expect(errorDe(d).codigo).toBe("DUPLICADO");
    const v = await pedir("POST", `/api/${ruta}`, admin, { nombre: "   " });
    expect(v.statusCode).toBe(400);
    expect(errorDe(v).codigo).toBe("VALIDACION");
    expect((await pedir("GET", `/api/${ruta}`)).statusCode).toBe(401);
    expect((await pedir("POST", `/api/${ruta}`, undefined, cuerpo("a"))).statusCode).toBe(401);
    const sinPermiso = await pedir("POST", `/api/${ruta}`, cajero, cuerpo(`Z ${sufijo()}`));
    expect(sinPermiso.statusCode).toBe(403);
    expect(errorDe(sinPermiso)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "catalogo.editar" } });
    expect((await pedir("PATCH", `/api/${ruta}/${(await pedir("GET", `/api/${ruta}`, admin)).json().items[0].id}`, cajero, { activa: false })).statusCode).toBe(403);
    expect((await pedir("PATCH", `/api/${ruta}/99999999`, admin, { activa: false })).statusCode).toBe(404);
    expect((await pedir("PATCH", `/api/${ruta}/abc`, admin, {})).statusCode).toBe(400);
  });
});

describe("categorias: margen_objetivo", () => {
  it("acepta null y rechaza fuera de 0-0.9 con 400", async () => {
    const ok = await pedir("POST", "/api/categorias", admin, { nombre: `M ${sufijo()}`, margen_objetivo: null });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().margen_objetivo).toBeNull();
    for (const malo of ["0.95", "1", "abc", "-0.1"]) {
      const r = await pedir("POST", "/api/categorias", admin, { nombre: `M ${sufijo()}`, margen_objetivo: malo });
      expect(r.statusCode, malo).toBe(400);
    }
  });
});

describe("/api/proveedores", () => {
  it("alta 201, PATCH, busqueda y filtro activo", async () => {
    const nombre = `Distribuidora ${sufijo()}`;
    const c = await pedir("POST", "/api/proveedores", admin, { nombre, telefono: "5512345678", contacto: "Luis" });
    expect(c.statusCode).toBe(201);
    expect(c.json()).toMatchObject({ nombre, telefono: "5512345678", contacto: "Luis", notas: null, activo: true });
    const id = c.json().id;
    const p = await pedir("PATCH", `/api/proveedores/${id}`, admin, { activo: false, notas: "no surte" });
    expect(p.json()).toMatchObject({ activo: false, notas: "no surte" });
    const l = await pedir("GET", `/api/proveedores?buscar=${nombre.split(" ")[1]}&activo=false`, admin);
    expect(l.json()).toMatchObject({ total: 1, pagina: 1 });
    expect(l.json().items[0].id).toBe(id);
  });

  it("GET lo ven proveedores.gestionar y compras.ver; escribir solo proveedores.gestionar", async () => {
    const soloCompras = await tokenF2(app, { permisos: ["compras.ver"] });
    expect((await pedir("GET", "/api/proveedores", soloCompras)).statusCode).toBe(200);
    const w = await pedir("POST", "/api/proveedores", soloCompras, { nombre: `P ${sufijo()}` });
    expect(w.statusCode).toBe(403);
    expect(errorDe(w)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "proveedores.gestionar" } });
    expect((await pedir("GET", "/api/proveedores", cajero)).statusCode).toBe(403);
    expect((await pedir("GET", "/api/proveedores")).statusCode).toBe(401);
  });

  it("409 DUPLICADO, 400, 404", async () => {
    const nombre = `Prov ${sufijo()}`;
    await pedir("POST", "/api/proveedores", admin, { nombre });
    const d = await pedir("POST", "/api/proveedores", admin, { nombre: nombre.toLowerCase() });
    expect(d.statusCode).toBe(409);
    expect(errorDe(d).codigo).toBe("DUPLICADO");
    expect(errorDe(await pedir("POST", "/api/proveedores", admin, {})).codigo).toBe("VALIDACION");
    expect((await pedir("PATCH", "/api/proveedores/99999999", admin, { activo: false })).statusCode).toBe(404);
    expect((await pedir("POST", "/api/proveedores", dueno, { nombre: `Dueno ${sufijo()}` })).statusCode).toBe(201);
  });
});

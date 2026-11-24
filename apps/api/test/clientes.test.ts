import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar, errorDe, pool } from "./ayuda.js";
import { sufijo } from "./ayuda-f2.js";
import { clienteConEnlace, crearUsuarioF3, limpiarF3, pedirPersonal, snapshotF3, tokenF3, type Snapshot } from "./ayuda-f3.js";

let app: FastifyInstance;
let antes: Snapshot;
let pedir: ReturnType<typeof pedirPersonal>;
let dueno: string;
let duenoSesion: { token: string; id: string };
let admin: string;
let cajero: string;
let almacenista: string;
let sinCredito: string; // clientes.editar sin clientes.credito
let menudeo: string;
let mayoreo: string;

beforeAll(async () => {
  antes = await snapshotF3();
  app = await crearApp();
  pedir = pedirPersonal(app);
  const u = await crearUsuarioF3("Dueño");
  dueno = await entrar(app, u);
  duenoSesion = { token: dueno, id: u.id };
  admin = await tokenF3(app, "Administrador");
  cajero = await tokenF3(app, "Cajero");
  almacenista = await tokenF3(app, "Almacenista");
  sinCredito = await tokenF3(app, { permisos: ["clientes.ver", "clientes.editar"] });
  const listas = (await pedir("GET", "/api/listas-precio", dueno)).json().items as { id: string; nombre: string }[];
  menudeo = listas.find((l) => l.nombre === "Menudeo")!.id;
  mayoreo = listas.find((l) => l.nombre === "Mayoreo")!.id;
});
afterAll(async () => {
  await limpiarF3(app, antes);
  await cerrarPoolPruebas();
});

const nombre = () => `TF3 Cliente ${sufijo()}`;

describe("zonas", () => {
  it("GET: 401 sin sesion, 403 sin clientes.ver, 200 paginada con clientes.ver", async () => {
    expect((await pedir("GET", "/api/zonas")).statusCode).toBe(401);
    const sin = await pedir("GET", "/api/zonas", almacenista);
    expect(sin.statusCode).toBe(403);
    expect(errorDe(sin)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "clientes.ver" } });
    const r = await pedir("GET", "/api/zonas?por_pagina=200", cajero);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ items: expect.any(Array), total: expect.any(Number), pagina: 1, por_pagina: 200 });
    expect((await pedir("GET", "/api/zonas?por_pagina=500", cajero)).statusCode).toBe(400);
  });

  it("POST: 201; 403 sin clientes.editar; 400 nombre vacio; 409 DUPLICADO sin importar mayusculas", async () => {
    const n = `TF3 Zona ${sufijo()}`;
    const r = await pedir("POST", "/api/zonas", admin, { nombre: n });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toEqual({ id: expect.any(String), nombre: n, activa: true });
    expect((await pedir("POST", "/api/zonas", admin, { nombre: n.toUpperCase() })).statusCode).toBe(409);
    expect(errorDe(await pedir("POST", "/api/zonas", admin, { nombre: n.toLowerCase() })).codigo).toBe("DUPLICADO");
    expect((await pedir("POST", "/api/zonas", cajero, { nombre: "TF3 x" })).statusCode).toBe(403);
    expect((await pedir("POST", "/api/zonas", admin, { nombre: "  " })).statusCode).toBe(400);
    expect((await pedir("POST", "/api/zonas", undefined, { nombre: "TF3 x" })).statusCode).toBe(401);
  });

  it("PATCH: renombrar y desactivar; 404; 400 sin cambios; 403", async () => {
    const z = (await pedir("POST", "/api/zonas", admin, { nombre: `TF3 Zona ${sufijo()}` })).json<{ id: string }>();
    const r = await pedir("PATCH", `/api/zonas/${z.id}`, admin, { activa: false });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ id: z.id, activa: false });
    expect((await pedir("GET", "/api/zonas?activa=true&por_pagina=200", cajero)).json().items.some((x: { id: string }) => x.id === z.id)).toBe(false);
    expect((await pedir("PATCH", "/api/zonas/999999999", admin, { activa: true })).statusCode).toBe(404);
    expect((await pedir("PATCH", `/api/zonas/${z.id}`, admin, {})).statusCode).toBe(400);
    expect((await pedir("PATCH", `/api/zonas/${z.id}`, cajero, { activa: true })).statusCode).toBe(403);
    expect((await pedir("PATCH", "/api/zonas/abc", admin, { activa: true })).statusCode).toBe(400);
  });
});

describe("POST /api/clientes", () => {
  it("201 con la lista predeterminada y los datos; la forma trae refs {id, nombre}", async () => {
    const z = (await pedir("POST", "/api/zonas", admin, { nombre: `TF3 Zona ${sufijo()}` })).json<{ id: string; nombre: string }>();
    const n = nombre();
    const r = await pedir("POST", "/api/clientes", admin, { nombre: n, telefono_whatsapp: "5215598765432", zona_id: z.id, dias_visita: [2, 5], tipo_negocio: "miscelanea" });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({
      id: expect.any(String), nombre: n, tipo_negocio: "miscelanea", zona: { id: z.id, nombre: z.nombre }, telefono_whatsapp: "5215598765432",
      dias_visita: [2, 5], tiene_ubicacion: false, tiene_propuesta: false, tiene_enlace: false, lista_precio: { id: menudeo, nombre: "Menudeo" },
      limite_credito: "0.00", dias_credito: 0, sugerir_pedido: true, activo: true, lat: null, lng: null, enlace: null, frecuentes: [], ultimo_pedido: null,
    });
  });

  it("lista, limite y dias de credito exigen clientes.credito (403 SIN_PERMISO) y el parse va antes del permiso (400)", async () => {
    const r = await pedir("POST", "/api/clientes", sinCredito, { nombre: nombre(), limite_credito: "5000.00" });
    expect(r.statusCode).toBe(403);
    expect(errorDe(r)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "clientes.credito" } });
    expect((await pedir("POST", "/api/clientes", sinCredito, { nombre: nombre(), lista_precio_id: mayoreo })).statusCode).toBe(403);
    // limite mal escrito: 400 aunque no tenga el permiso
    expect((await pedir("POST", "/api/clientes", sinCredito, { nombre: nombre(), limite_credito: "mucho" })).statusCode).toBe(400);
    expect((await pedir("POST", "/api/clientes", sinCredito, { nombre: nombre() })).statusCode).toBe(201);
    const ok = await pedir("POST", "/api/clientes", admin, { nombre: nombre(), lista_precio_id: mayoreo, limite_credito: "5000", dias_credito: 15 });
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ lista_precio: { id: mayoreo, nombre: "Mayoreo" }, limite_credito: "5000.00", dias_credito: 15 });
  });

  it("400: nombre, telefono, dias, zona y lista que no existen; 401 y 403", async () => {
    const malo = (extra: object) => pedir("POST", "/api/clientes", admin, { nombre: nombre(), ...extra });
    expect((await pedir("POST", "/api/clientes", admin, {})).statusCode).toBe(400);
    expect((await malo({ telefono_whatsapp: "123" })).statusCode).toBe(400);
    expect((await malo({ dias_visita: [8] })).statusCode).toBe(400);
    expect((await malo({ dias_visita: [1, 1] })).statusCode).toBe(400);
    expect((await malo({ tipo_negocio: "banco" })).statusCode).toBe(400);
    expect((await malo({ zona_id: "999999999" })).statusCode).toBe(400);
    expect((await malo({ lista_precio_id: "999999999" })).statusCode).toBe(400);
    expect((await pedir("POST", "/api/clientes", undefined, { nombre: "x" })).statusCode).toBe(401);
    expect((await pedir("POST", "/api/clientes", cajero, { nombre: nombre() })).statusCode).toBe(403);
  });
});

describe("GET /api/clientes y /api/clientes/:id", () => {
  it("lista con filtros: buscar (nombre y telefono), zona, dia, ubicacion, enlace, activo", async () => {
    const z = (await pedir("POST", "/api/zonas", admin, { nombre: `TF3 Zona ${sufijo()}` })).json<{ id: string }>();
    const a = await clienteConEnlace(app, duenoSesion, { zona_id: z.id, dias_visita: [3], telefono: "5215511112222" });
    const b = (await pedir("POST", "/api/clientes", admin, { nombre: nombre(), dias_visita: [4] })).json<{ id: string; nombre: string }>();
    const ids = async (q: string, token = cajero) => (await pedir("GET", `/api/clientes?${q}&por_pagina=200`, token)).json().items.map((x: { id: string }) => x.id) as string[];

    expect(await ids(`zona_id=${z.id}`)).toEqual([a.id]);
    expect(await ids(`buscar=${encodeURIComponent(b.nombre)}`)).toEqual([b.id]);
    expect(await ids("buscar=5215511112222")).toContain(a.id);
    expect(await ids("dia_visita=4")).toContain(b.id);
    expect(await ids("dia_visita=4")).not.toContain(a.id);
    expect(await ids("sin_ubicacion=true")).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(await ids("sin_ubicacion=false")).not.toContain(a.id);
    expect(await ids("enlace=sin_activar")).toContain(a.id);
    expect(await ids("enlace=sin_link")).toContain(b.id);
    expect(await ids("enlace=sin_link")).not.toContain(a.id);
    expect(await ids("enlace=activo")).not.toContain(a.id);
    expect(await ids("activo=false")).not.toContain(b.id);
    expect((await pedir("GET", "/api/clientes?enlace=raro", cajero)).statusCode).toBe(400);
    expect((await pedir("GET", "/api/clientes?alerta=raro", cajero)).statusCode).toBe(400);
    expect((await pedir("GET", "/api/clientes")).statusCode).toBe(401);
    expect((await pedir("GET", "/api/clientes", almacenista)).statusCode).toBe(403);

    const fila = (await pedir("GET", `/api/clientes?zona_id=${z.id}`, admin)).json().items[0];
    expect(fila).toMatchObject({
      id: a.id, zona: { id: z.id }, dias_visita: [3], tiene_ubicacion: false, tiene_propuesta: false, tiene_enlace: true, lista_precio: { nombre: "Menudeo" },
      limite_credito: "0.00", activo: true, alertas: [], enlace: { estado: "sin_activar", baja: null },
    });
    // Sin clientes.credito no viaja el limite.
    const sin = (await pedir("GET", `/api/clientes?zona_id=${z.id}`, cajero)).json().items[0];
    expect(sin).not.toHaveProperty("limite_credito");
    expect(sin.lista_precio).toEqual({ id: expect.any(String), nombre: "Menudeo" });
  });

  it("detalle: ubicacion, proxima visita y enlace; 404; 400; sin credito no trae dias_credito", async () => {
    const c = (await pedir("POST", "/api/clientes", admin, { nombre: nombre(), dias_visita: [1, 2, 3, 4, 5, 6, 7] })).json<{ id: string }>();
    const r = await pedir("GET", `/api/clientes/${c.id}`, cajero);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ lat: null, lng: null, lat_propuesta: null, proxima_visita: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), enlace: null, sugerir_pedido: true });
    expect(r.json()).not.toHaveProperty("dias_credito");
    expect((await pedir("GET", `/api/clientes/${c.id}`, admin)).json()).toHaveProperty("dias_credito", 0);
    expect((await pedir("GET", "/api/clientes/999999999", cajero)).statusCode).toBe(404);
    expect((await pedir("GET", "/api/clientes/abc", cajero)).statusCode).toBe(400);
    expect((await pedir("GET", `/api/clientes/${c.id}`)).statusCode).toBe(401);
    expect((await pedir("GET", `/api/clientes/${c.id}`, almacenista)).statusCode).toBe(403);
    const sin = (await pedir("POST", "/api/clientes", admin, { nombre: nombre() })).json<{ id: string }>();
    expect((await pedir("GET", `/api/clientes/${sin.id}`, cajero)).json().proxima_visita).toBeNull();
  });
});

describe("PATCH /api/clientes/:id", () => {
  it("edita datos; credito exige clientes.credito; 404, 400 y 403; desactivarlo es decision del personal", async () => {
    const c = (await pedir("POST", "/api/clientes", admin, { nombre: nombre() })).json<{ id: string }>();
    const r = await pedir("PATCH", `/api/clientes/${c.id}`, sinCredito, { contacto: "Don Luis", sugerir_pedido: false, dias_visita: [2] });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ contacto: "Don Luis", sugerir_pedido: false, dias_visita: [2] });
    const sin = await pedir("PATCH", `/api/clientes/${c.id}`, sinCredito, { dias_credito: 10 });
    expect(sin.statusCode).toBe(403);
    expect(errorDe(sin).detalles).toEqual({ permiso: "clientes.credito" });
    expect((await pedir("PATCH", `/api/clientes/${c.id}`, admin, { dias_credito: 10, limite_credito: "100" })).json()).toMatchObject({ dias_credito: 10, limite_credito: "100.00" });
    expect((await pedir("PATCH", "/api/clientes/999999999", admin, { contacto: "x" })).statusCode).toBe(404);
    expect((await pedir("PATCH", `/api/clientes/${c.id}`, admin, {})).statusCode).toBe(400);
    expect((await pedir("PATCH", `/api/clientes/${c.id}`, admin, { telefono_whatsapp: "1" })).statusCode).toBe(400);
    expect((await pedir("PATCH", `/api/clientes/${c.id}`, cajero, { contacto: "x" })).statusCode).toBe(403);
    expect((await pedir("PATCH", `/api/clientes/${c.id}`, undefined, { contacto: "x" })).statusCode).toBe(401);
    // Auditoria de la edicion.
    const aud = await pool.query("select count(*)::int as n from app.auditoria where tabla = 'cliente' and registro_id = $1 and accion = 'actualizar'", [c.id]);
    expect(aud.rows[0].n).toBeGreaterThanOrEqual(2);
  });
});

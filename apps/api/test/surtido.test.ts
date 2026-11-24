import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar, errorDe, pool } from "./ayuda.js";
import { hoyMas } from "./ayuda-f2.js";
import { crearUsuarioF3, limpiarF3, pedirPersonal, snapshotF3, tokenF3, type Snapshot } from "./ayuda-f3.js";
import { escenarioF5, limpiarF5, llaves, type EscenarioF5 } from "./ayuda-f5.js";

let app: FastifyInstance;
let antes: Snapshot;
let pedir: ReturnType<typeof pedirPersonal>;
let dueno: { token: string; id: string };
let admin: string;
let almacenista: string;
let cajero: string;
let soloVer: string;
let repartidor: string;
let e: EscenarioF5;

beforeAll(async () => {
  antes = await snapshotF3();
  app = await crearApp();
  pedir = pedirPersonal(app);
  const u = await crearUsuarioF3("Dueño");
  dueno = { token: await entrar(app, u), id: u.id };
  admin = await tokenF3(app, "Administrador");
  almacenista = await tokenF3(app, "Almacenista");
  cajero = await tokenF3(app, "Cajero");
  soloVer = await tokenF3(app, { permisos: ["surtido.ver"] });
  repartidor = await tokenF3(app, "Repartidor");
  e = await escenarioF5(app, dueno, cajero);
});
afterAll(async () => {
  await limpiarF5();
  await limpiarF3(app, antes);
  await cerrarPoolPruebas();
});

type Linea = Record<string, unknown> & { producto_id: string };
type Grupo = { proveedor_id: string | null; proveedor: string | null; telefono: string | null; lineas: Linea[]; costo_estimado?: string | null };
const lista = async (token: string, qs = "") => (await pedir("GET", `/api/surtido${qs}`, token)).json<{ fecha: string; proveedores: Grupo[]; totales: Record<string, unknown> }>();

describe("GET /api/surtido", () => {
  it("401 sin sesion; 403 con detalle para Cajero y Repartidor; 400 con fecha o ruta mala", async () => {
    expect((await pedir("GET", "/api/surtido")).statusCode).toBe(401);
    for (const t of [cajero, repartidor]) {
      const r = await pedir("GET", "/api/surtido", t);
      expect(r.statusCode).toBe(403);
      expect(errorDe(r)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "surtido.ver" } });
    }
    expect((await pedir("GET", "/api/surtido?fecha=manana", dueno.token)).statusCode).toBe(400);
    expect((await pedir("GET", "/api/surtido?ruta_id=abc", dueno.token)).statusCode).toBe(400);
  });

  it("duenio: los numeros de la tabla de F5, agrupados por proveedor (con telefono), fecha por omision = manana", async () => {
    const r = await lista(dueno.token);
    expect(r.fecha).toBe(e.manana);
    const g = r.proveedores.find((x) => x.proveedor_id === e.modelo.id)!;
    expect(g).toMatchObject({ proveedor: e.modelo.nombre, telefono: "5215500000000", costo_estimado: "890.00" });
    const corona = g.lineas.find((x) => x.producto_id === e.k.corona.id)!;
    expect(corona).toMatchObject({
      modo_surtido: "inventario", piezas_pedidas: 72, existencia: 60, comprometido_previo: 6, disponible: 54, piezas_a_comprar: 18,
      reponer_minimo: 30, presentacion_id: e.k.corona.caja, factor: 24, cantidad_sugerida: 2, ultimo_costo: "300.00", costo_estimado: "600.00",
      sugerido_demanda: 0, promocion_id: null,
    });
    expect(g.lineas.find((x) => x.producto_id === e.k.victoria.id)).toMatchObject({
      modo_surtido: "contra_pedido", piezas_pedidas: 24, piezas_a_comprar: 24, reponer_minimo: 0, cantidad_sugerida: 1, ultimo_costo: "290.00", costo_estimado: "290.00",
    });
    expect(g.lineas).toHaveLength(2);
    expect(g.lineas[0]).not.toHaveProperty("proveedor"); // el proveedor va en el grupo
    expect(Number(r.totales.productos)).toBeGreaterThanOrEqual(2);
    expect(r.totales).toHaveProperty("costo_estimado");
    // sin proveedor, al final
    const sin = r.proveedores.findIndex((x) => x.proveedor_id === null);
    if (sin >= 0) expect(sin).toBe(r.proveedores.length - 1);
  });

  it("quien compra (compras.registrar) ve costos igual que el duenio; quien solo ve la lista: ninguna llave de costo ni ahorro; mismos numeros", async () => {
    for (const t of [admin, almacenista]) {
      expect(llaves(await lista(t)).filter((k) => /costo|ahorro/.test(k))).toContain("costo_estimado");
    }
    // Otras suites pueden dejar productos sin compra previa: solo se exige que el dato exista.
    expect((await lista(dueno.token)).totales).toHaveProperty("sin_costo_previo");
    for (const t of [soloVer]) {
      const r = await lista(t);
      const malas = llaves(r).filter((k) => /costo|ahorro/.test(k));
      expect(malas).toEqual([]);
      const corona = r.proveedores.find((x) => x.proveedor_id === e.modelo.id)!.lineas.find((x) => x.producto_id === e.k.corona.id)!;
      expect(corona).toMatchObject({ piezas_pedidas: 72, piezas_a_comprar: 18, reponer_minimo: 30, cantidad_sugerida: 2, sugerido_demanda: 0 });
    }
  });

  it("?fecha distinta y ?ruta_id: pasado manana lo de manana ya cuenta como previo; una ruta sin pedidos no cuenta pedidos", async () => {
    const f = await hoyMas(2);
    const r = await lista(dueno.token, `?fecha=${f}`);
    expect(r.fecha).toBe(f);
    const corona = r.proveedores.flatMap((g) => g.lineas).find((x) => x.producto_id === e.k.corona.id)!;
    // previo = Six de hoy (6) + 72 de manana = 78; 60 - 78 = -18; reponer el minimo completo (30) -> ceil(30 / 24) = 2
    expect(corona).toMatchObject({ piezas_pedidas: 0, comprometido_previo: 78, disponible: -18, piezas_a_comprar: 0, reponer_minimo: 30, cantidad_sugerida: 2 });
    // En la ruta 999999 no hay pedidos: ni Corona (54 > minimo 30) ni Victoria (contra pedido) tienen nada que comprar.
    const ruta = (await lista(dueno.token, "?ruta_id=999999")).proveedores.flatMap((g) => g.lineas).map((x) => x.producto_id);
    expect(ruta).not.toContain(e.k.corona.id);
    expect(ruta).not.toContain(e.k.victoria.id);
  });
});

describe("GET /api/surtido/mensaje", () => {
  it("texto con cantidades y producto, sin precios ni signo de pesos; telefono del proveedor; 404 y 400", async () => {
    const r = await pedir("GET", `/api/surtido/mensaje?proveedor_id=${e.modelo.id}`, almacenista);
    expect(r.statusCode).toBe(200);
    const m = r.json<{ telefono: string; texto: string }>();
    expect(m.telefono).toBe("5215500000000");
    expect(m.texto).toContain(e.modelo.nombre);
    expect(m.texto).toMatch(/2 Caja de 24 TF3 Corona Extra/);
    expect(m.texto).toMatch(/1 Caja de 24 TF3 Victoria/);
    expect(m.texto).not.toMatch(/[$]|300\.00|290\.00/);
    expect((await pedir("GET", "/api/surtido/mensaje?proveedor_id=999999999", almacenista)).statusCode).toBe(404);
    expect((await pedir("GET", "/api/surtido/mensaje", almacenista)).statusCode).toBe(400);
    expect((await pedir("GET", `/api/surtido/mensaje?proveedor_id=${e.modelo.id}`, cajero)).statusCode).toBe(403);
  });
});

describe("POST /api/surtido/publicar", () => {
  it("publica una vez: notificados > 0 y luego 0; cada usuario con compras.registrar recibe 1 aviso; Cajero 403; sin fecha 400", async () => {
    const r1 = await pedir("POST", "/api/surtido/publicar", almacenista, { fecha: e.manana });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().notificados).toBeGreaterThanOrEqual(3); // Duenio, Administrador y Almacenista de esta suite
    const r2 = await pedir("POST", "/api/surtido/publicar", dueno.token, { fecha: e.manana });
    expect(r2.json()).toEqual({ notificados: 0 });
    const avisos = await pool.query(
      `select n.usuario_id, count(*)::int as n, min(n.datos ->> 'ruta') as ruta from app.notificacion n
        where n.evento = 'surtido_listo' and n.usuario_id in (select id from app.usuario where usuario like 'tf3\\_%') group by n.usuario_id`);
    expect(avisos.rowCount).toBeGreaterThanOrEqual(3);
    for (const f of avisos.rows) {
      expect(f.n).toBe(1);
      expect(f.ruta).toBe(`/surtido?fecha=${e.manana}`);
    }
    expect((await pedir("POST", "/api/surtido/publicar", cajero, { fecha: e.manana })).statusCode).toBe(403);
    expect(errorDe(await pedir("POST", "/api/surtido/publicar", repartidor, { fecha: e.manana }))).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "surtido.ver" } });
    expect((await pedir("POST", "/api/surtido/publicar", dueno.token, {})).statusCode).toBe(400);
    expect((await pedir("POST", "/api/surtido/publicar", dueno.token, { fecha: "2026-13-40" })).statusCode).toBe(400);
  });
});

describe("revision F5: producto con pedidos y telefono de proveedor", () => {
  it("desactivar un producto con pedidos pendientes -> 409 PRODUCTO_CON_PEDIDOS", async () => {
    const r = await pedir("PATCH", `/api/productos/${e.k.corona.id}`, dueno.token, { activo: false });
    expect(r.statusCode).toBe(409);
    expect(errorDe(r).codigo).toBe("PRODUCTO_CON_PEDIDOS");
  });

  it("proveedor: telefono que no sirve para WhatsApp -> 400; de 10 digitos o con lada -> se acepta", async () => {
    expect((await pedir("POST", "/api/proveedores", dueno.token, { nombre: `TF3 Tel ${Date.now()}`, telefono: "12345" })).statusCode).toBe(400);
    expect((await pedir("POST", "/api/proveedores", dueno.token, { nombre: `TF3 Tel ${Date.now()}b`, telefono: "55 1234 5678" })).statusCode).toBe(201);
    expect((await pedir("PATCH", `/api/proveedores/${e.modelo.id}`, dueno.token, { telefono: "abc" })).statusCode).toBe(400);
  });

  it("mensaje: telefono normalizado listo para wa.me, sin marca de invalido", async () => {
    const m = (await pedir("GET", `/api/surtido/mensaje?proveedor_id=${e.modelo.id}`, almacenista)).json();
    expect(m).toMatchObject({ telefono: "5215500000000", telefono_invalido: false });
  });
});

import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar, errorDe } from "./ayuda.js";
import { hoyMas } from "./ayuda-f2.js";
import { activarCliente, clienteConEnlace, crearUsuarioF3, pedirCliente, pedirPersonal, snapshotF3, type ClienteF3, type Snapshot } from "./ayuda-f3.js";
import { bodegaAntes, escenarioF6, limpiarF6, repartidorF6, rutaConPedidos, type BodegaAntes, type Dueno, type EscenarioF6 } from "./ayuda-f6.js";
import { dineroMalo } from "./ayuda-f7.js";
import { llaves, pedidoF8, turnoMostrador, vender } from "./ayuda-f8.js";
import { catalogoL, limpiarLealtad, type CatalogoL } from "./ayuda-f11.js";

// F11 paquete C: lealtad por HTTP (juego L de docs/fases/F11.md). La logica vive en SQL (011); aqui se prueba lo que la API expone.
let app: FastifyInstance;
let antes: Snapshot;
let bodega: BodegaAntes;
let pedir: ReturnType<typeof pedirPersonal>;
let publico: ReturnType<typeof pedirCliente>;
let dueno: Dueno;
let admin: Dueno;
let cajero: Dueno;
let e: EscenarioF6;
let k: CatalogoL;

const sesion = async (rol: "Dueño" | "Administrador" | "Cajero"): Promise<Dueno> => {
  const u = await crearUsuarioF3(rol);
  return { id: u.id, token: await entrar(app, u) };
};
const config = async (token = dueno.token) => (await pedir("GET", "/api/configuracion", token)).json<Record<string, unknown>>();
const lineasDe = (r: { json: () => unknown }) => (r.json() as { lineas: { cantidad: number; precio_unitario: string; importe: string; regalo: boolean; producto: string; presentacion: string }[] }).lineas;
const pagoEfectivo = (monto: string) => [{ metodo: "efectivo" as const, monto }];
const vende = (cliente: ClienteF3, lineas: { presentacion_id: string; cantidad: number }[], total: string) =>
  vender(app, cajero.token, { cliente_id: cliente.id, lineas, pagos: pagoEfectivo(total) });
const prender = (regalo: string | null = k.corona.caja, extra: object = {}) =>
  pedir("PATCH", "/api/configuracion", dueno.token, { lealtad_activa: true, lealtad_presentacion_regalo_id: regalo, lealtad_cada: 10, ...extra });
const apagar = () => pedir("PATCH", "/api/configuracion", dueno.token, { lealtad_activa: false });
const regalosDe = async (ruta: string) => (await pedir("GET", `/api/rutas/${ruta}/carga`, dueno.token)).json<{ regalos: unknown[] }>().regalos;

async function reponer(): Promise<void> {
  for (const [producto, piezas, costo] of [[k.corona.id, 240, "12.50"], [k.victoria.id, 240, "12.083333"]] as const) {
    const r = await pedir("POST", "/api/inventario/ajustes", dueno.token, { producto_id: producto, tipo: "ajuste_entrada", piezas, costo_unitario: costo, motivo: "prueba", clave_idempotencia: randomUUID() });
    expect(r.statusCode, r.body).toBe(201);
  }
}

beforeAll(async () => {
  antes = await snapshotF3();
  bodega = await bodegaAntes();
  app = await crearApp();
  pedir = pedirPersonal(app);
  publico = pedirCliente(app);
  dueno = await sesion("Dueño");
  admin = await sesion("Administrador");
  cajero = await sesion("Cajero");
  e = await escenarioF6(app, dueno, { n: 0 });
  k = await catalogoL(app, dueno.token);
  await turnoMostrador(app, dueno.token, cajero.token);
}, 120_000);

afterAll(async () => {
  await limpiarLealtad();
  await limpiarF6(app, antes, bodega);
  await cerrarPoolPruebas();
});

describe("apagada: nada cambia", () => {
  it("la semilla viene apagada y sin regalo; V1 a V4 no dejan regalo ni lealtad; el cliente ve lealtad null y la carga trae regalos []", async () => {
    expect(await config(cajero.token)).toMatchObject({ lealtad_activa: false, lealtad_cada: 10, lealtad_presentacion_regalo_id: null, lealtad_regalo: null });
    const L = await clienteConEnlace(app, dueno);
    const cred = await activarCliente(app, L);
    await vende(L, [{ presentacion_id: k.corona.caja, cantidad: 4 }, { presentacion_id: k.corona.six, cantidad: 2 }], "1810.00");
    await vende(L, [{ presentacion_id: k.victoria.caja, cantidad: 2 }], "780.00");
    await vende(L, [{ presentacion_id: k.corona.caja, cantidad: 4 }], "1600.00");
    const v4 = await vende(L, [{ presentacion_id: k.corona.six, cantidad: 1 }], "105.00");
    expect(v4.statusCode, v4.body).toBe(201);
    expect(v4.json()).toMatchObject({ total: "105.00" });
    expect(lineasDe(v4)).toEqual([expect.objectContaining({ cantidad: 1, regalo: false, importe: "105.00" })]);

    const perfil = await publico("GET", "/api/publico/cliente", cred);
    expect(perfil.statusCode, perfil.body).toBe(200);
    expect(perfil.json()).toHaveProperty("lealtad", null);

    const P = await pedidoF8(app, dueno.token, L.id, e.manana, [{ presentacion_id: k.victoria.caja, cantidad: 1 }]);
    const rep = await repartidorF6(app);
    const ruta = await rutaConPedidos(app, dueno, e, rep.id, [P]);
    expect(await regalosDe(ruta.id)).toEqual([]);
    expect((await pedir("POST", `/api/rutas/${ruta.id}/cargar`, dueno.token)).json()).toMatchObject({ carga: { regalos: [] } });
    expect((await pedir("POST", `/api/rutas/${ruta.id}/iniciar`, rep.token, {})).statusCode).toBe(200);
    const ent = await pedir("POST", `/api/pedidos/${P}/entregar`, rep.token, { clave_idempotencia: randomUUID(), pagos: pagoEfectivo("390.00") });
    expect(ent.statusCode, ent.body).toBe(201);
    expect(ent.json()).toHaveProperty("regalo", null);
  });
});

describe("permisos y validacion de la configuracion", () => {
  it("Administrador: prender lealtad -> 403 SIN_PERMISO precios.editar y no cambia nada; cambiar la marca de una presentacion igual; renombrarla si puede; Cajero -> configuracion.editar", async () => {
    const antesCfg = await config();
    const a = await pedir("PATCH", "/api/configuracion", admin.token, { lealtad_activa: true });
    expect(a.statusCode).toBe(403);
    expect(errorDe(a)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "precios.editar" } });
    const tambien = await pedir("PATCH", "/api/configuracion", admin.token, { negocio_nombre: "No debe quedar", lealtad_cada: 5 });
    expect(tambien.statusCode).toBe(403);
    expect(await config()).toEqual(antesCfg);

    const marca = await pedir("PATCH", `/api/presentaciones/${k.corona.six}`, admin.token, { cuenta_lealtad: true });
    expect(marca.statusCode).toBe(403);
    expect(errorDe(marca)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "precios.editar" } });
    const nombre = await pedir("PATCH", `/api/presentaciones/${k.corona.six}`, admin.token, { nombre: "Six de prueba" });
    expect(nombre.statusCode, nombre.body).toBe(200);
    expect(nombre.json()).toMatchObject({ nombre: "Six de prueba", cuenta_lealtad: false });
    expect((await pedir("PATCH", `/api/presentaciones/${k.corona.six}`, dueno.token, { nombre: "Six" })).statusCode).toBe(200);

    const c = await pedir("PATCH", "/api/configuracion", cajero.token, { lealtad_cada: 5 });
    expect(c.statusCode).toBe(403);
    expect(errorDe(c)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "configuracion.editar" } });
  });

  it("Dueno: sin regalo, cero, texto, llave de mas -> 400 VALIDACION; nada queda escrito", async () => {
    const antesCfg = await config();
    const sinRegalo = await pedir("PATCH", "/api/configuracion", dueno.token, { lealtad_activa: true });
    expect(sinRegalo.statusCode).toBe(400);
    expect(errorDe(sinRegalo)).toMatchObject({ codigo: "VALIDACION", detalles: { campo: "lealtad_presentacion_regalo_id" } });
    for (const mal of [{ lealtad_cada: 0 }, { lealtad_cada: "10" }, { lealtad_cada: 1001 }, { lealtad_activa: "si" }, { lealtad_presentacion_regalo_id: "abc" }, { lealtad_bono: 1 }]) {
      const r = await pedir("PATCH", "/api/configuracion", dueno.token, mal);
      expect(r.statusCode, JSON.stringify(mal)).toBe(400);
      expect(errorDe(r).codigo).toBe("VALIDACION");
    }
    const inexistente = await pedir("PATCH", "/api/configuracion", dueno.token, { lealtad_activa: true, lealtad_presentacion_regalo_id: "999999999" });
    expect(inexistente.statusCode).toBe(400);
    expect(errorDe(inexistente)).toMatchObject({ codigo: "VALIDACION", detalles: { campo: "lealtad_presentacion_regalo_id" } });
    expect(await config()).toEqual(antesCfg);
  });

  it("GET /productos y la presentacion traen cuenta_lealtad; el PATCH de la marca con precios.editar responde 200", async () => {
    const p = await pedir("GET", `/api/productos/${k.corona.id}`, dueno.token);
    expect(p.statusCode, p.body).toBe(200);
    const marcas = Object.fromEntries((p.json().presentaciones as { id: string; cuenta_lealtad: boolean }[]).map((x) => [x.id, x.cuenta_lealtad]));
    expect(marcas).toEqual({ [k.corona.pieza]: false, [k.corona.six]: false, [k.corona.caja]: true });
    const quitar = await pedir("PATCH", `/api/presentaciones/${k.victoria.caja}`, dueno.token, { cuenta_lealtad: false });
    expect(quitar.json()).toMatchObject({ cuenta_lealtad: false });
    expect((await pedir("PATCH", `/api/presentaciones/${k.victoria.caja}`, dueno.token, { cuenta_lealtad: true })).json()).toMatchObject({ cuenta_lealtad: true });
  });
});

describe("juego L: lealtad prendida", () => {
  it("prender de una vez (3 llaves) devuelve el regalo con su nombre; apagar no lo exige", async () => {
    const r = await prender();
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      lealtad_activa: true, lealtad_cada: 10, lealtad_presentacion_regalo_id: k.corona.caja, lealtad_regalo: { producto: k.corona.nombre, presentacion: "Caja de 24" },
    });
    const off = await apagar();
    expect(off.json()).toMatchObject({ lealtad_activa: false, lealtad_presentacion_regalo_id: k.corona.caja });
    expect((await prender()).statusCode).toBe(200);
  });

  it("V1 a V4: el regalo va como linea a 0.00 en V4 (ticket reimpreso igual); el cliente ve el premio tras V3 y 0 tras V4; reportes con el costo del regalo", async () => {
    await reponer();
    const L = await clienteConEnlace(app, dueno);
    const cred = await activarCliente(app, L);
    const verPerfil = async () => (await publico("GET", "/api/publico/cliente", cred)).json<{ lealtad: unknown }>();
    expect((await vende(L, [{ presentacion_id: k.corona.caja, cantidad: 4 }, { presentacion_id: k.corona.six, cantidad: 2 }], "1810.00")).statusCode).toBe(201);
    expect(await verPerfil()).toMatchObject({ lealtad: { llevas: 4, meta: 10, premio: false, texto: `Llevas 4 de 10 cajas para una ${k.corona.nombre} Caja de 24 gratis` } });
    await vende(L, [{ presentacion_id: k.victoria.caja, cantidad: 2 }], "780.00");
    const v3 = await vende(L, [{ presentacion_id: k.corona.caja, cantidad: 4 }], "1600.00");
    expect(lineasDe(v3)).toHaveLength(1);
    const premio = (await verPerfil()).lealtad;
    expect(premio).toEqual({ llevas: 10, meta: 10, premio: true, texto: `¡Ya ganaste! Tu siguiente pedido lleva ${k.corona.nombre} Caja de 24 gratis` });
    expect(llaves(premio)).not.toContain("regalo");
    expect(llaves(premio)).not.toContain("presentacion_id");

    const v4 = await vende(L, [{ presentacion_id: k.corona.six, cantidad: 1 }], "105.00");
    expect(v4.statusCode, v4.body).toBe(201);
    expect(v4.json()).toMatchObject({ total: "105.00" });
    const l4 = lineasDe(v4);
    expect(l4).toHaveLength(2);
    expect(l4[0]).toMatchObject({ regalo: false, precio_unitario: "105.00", importe: "105.00" });
    expect(l4[1]).toMatchObject({ regalo: true, cantidad: 1, precio_unitario: "0.00", importe: "0.00", producto: k.corona.nombre, presentacion: "Caja de 24" });
    expect(dineroMalo(v4.json())).toEqual([]);
    const id4 = v4.json<{ venta_id: string }>().venta_id;
    expect((await pedir("GET", `/api/ventas/${id4}/ticket`, cajero.token)).json()).toEqual(v4.json());
    expect(await verPerfil()).toMatchObject({ lealtad: { llevas: 0, meta: 10, premio: false } });

    const hoy = await hoyMas(0);
    const ganancia = (await pedir("GET", `/api/reportes/ganancia?desde=${hoy}&hasta=${hoy}&agrupar=cliente`, dueno.token)).json<{ filas: { clave: string; utilidad: string }[] }>();
    expect(ganancia.filas.find((f) => f.clave === L.id)).toMatchObject({ utilidad: "790.00" });
    const util = (await pedir("GET", `/api/reportes/utilidad?desde=${hoy}&hasta=${hoy}&agrupar=producto`, dueno.token)).json<{ filas: { clave: string; importe: string; costo: string; utilidad: string }[] }>();
    // Corona del dia = las cuatro ventas apagadas (3515.00 de importe, 2625.00 de costo) + las cuatro de L (3515.00, 2925.00: el regalo suma 300.00 de costo)
    expect(util.filas.find((f) => f.clave === k.corona.id)).toMatchObject({ importe: "7030.00", costo: "5550.00", utilidad: "1480.00" });
  });

  it("reparto: la carga avisa el regalo y la entrega lo devuelve sin venta_linea_id; repetir con la misma clave -> 200 con el mismo regalo", async () => {
    await reponer();
    const R = await clienteConEnlace(app, dueno);
    expect((await vende(R, [{ presentacion_id: k.victoria.caja, cantidad: 10 }], "3900.00")).statusCode).toBe(201);
    const P = await pedidoF8(app, dueno.token, R.id, e.manana, [{ presentacion_id: k.victoria.caja, cantidad: 2 }]);
    const rep = await repartidorF6(app);
    const ruta = await rutaConPedidos(app, dueno, e, rep.id, [P]);
    const esperado = [{ carga_n: 1, cliente: R.nombre, producto: k.corona.nombre, presentacion: "Caja de 24", cantidad: 1 }];
    expect(await regalosDe(ruta.id)).toEqual(esperado);
    expect((await pedir("POST", `/api/rutas/${ruta.id}/cargar`, dueno.token)).json()).toMatchObject({ carga: { regalos: esperado } });
    expect((await pedir("POST", `/api/rutas/${ruta.id}/iniciar`, rep.token, {})).statusCode).toBe(200);

    const ctx = await pedir("GET", `/api/cobrar/contexto?pedido=${P}`, rep.token);
    expect(ctx.statusCode, ctx.body).toBe(200);
    expect(ctx.json().regalo_pendiente).toEqual({ producto: k.corona.nombre, presentacion: "Caja de 24", cantidad: 1 });
    const cuerpo = { clave_idempotencia: randomUUID(), pagos: pagoEfectivo("780.00"), con_regalo: true };
    const ent = await pedir("POST", `/api/pedidos/${P}/entregar`, rep.token, cuerpo);
    expect(ent.statusCode, ent.body).toBe(201);
    expect(ent.json().regalo).toEqual({ producto: k.corona.nombre, presentacion: "Caja de 24", cantidad: 1 });
    expect(ent.json()).toMatchObject({ venta: { total: "780.00" } });
    expect(dineroMalo(ent.json())).toEqual([]);
    const otra = await pedir("POST", `/api/pedidos/${P}/entregar`, rep.token, cuerpo);
    expect(otra.statusCode, otra.body).toBe(200);
    expect(otra.json().regalo).toEqual({ producto: k.corona.nombre, presentacion: "Caja de 24", cantidad: 1 });
    expect(await regalosDe(ruta.id)).toEqual([]);
  });

  it("reparto: el regalo solo se da si el repartidor confirma (con_regalo); sin el no hay regalo, el saldo no baja y el premio sigue pendiente", async () => {
    await reponer();
    const R = await clienteConEnlace(app, dueno);
    const cred = await activarCliente(app, R);
    await vende(R, [{ presentacion_id: k.victoria.caja, cantidad: 10 }], "3900.00");
    const P = await pedidoF8(app, dueno.token, R.id, e.manana, [{ presentacion_id: k.victoria.caja, cantidad: 1 }]);
    const rep = await repartidorF6(app);
    const ruta = await rutaConPedidos(app, dueno, e, rep.id, [P]);
    await pedir("POST", `/api/rutas/${ruta.id}/cargar`, dueno.token);
    expect((await pedir("POST", `/api/rutas/${ruta.id}/iniciar`, rep.token, {})).statusCode).toBe(200);
    expect((await pedir("GET", `/api/cobrar/contexto?pedido=${P}`, rep.token)).json().regalo_pendiente).toMatchObject({ producto: k.corona.nombre });
    const vistaOk = await pedir("POST", "/api/cobrar/vista", rep.token, { pedido_id: P, con_regalo: true, pagos: [{ metodo: "efectivo", monto: null }] });
    expect(vistaOk.statusCode, vistaOk.body).toBe(200);
    const mal = await pedir("POST", `/api/pedidos/${P}/entregar`, rep.token, { clave_idempotencia: randomUUID(), pagos: pagoEfectivo("390.00"), con_regalo: "si" });
    expect(mal.statusCode).toBe(400);
    expect(errorDe(mal).codigo).toBe("VALIDACION");
    const ent = await pedir("POST", `/api/pedidos/${P}/entregar`, rep.token, { clave_idempotencia: randomUUID(), pagos: pagoEfectivo("390.00") });
    expect(ent.statusCode, ent.body).toBe(201);
    expect(ent.json()).toHaveProperty("regalo", null);
    expect((await publico("GET", "/api/publico/cliente", cred)).json()).toMatchObject({ lealtad: { llevas: 11, premio: true } });
  });

  it("regalo no vendible: la presentacion regalo sin se_vende apaga el premio para el cliente y para la carga hasta que se corrige", async () => {
    await reponer();
    const R = await clienteConEnlace(app, dueno);
    const cred = await activarCliente(app, R);
    expect((await vende(R, [{ presentacion_id: k.victoria.caja, cantidad: 10 }], "3900.00")).statusCode).toBe(201);
    expect((await publico("GET", "/api/publico/cliente", cred)).json()).toMatchObject({ lealtad: { premio: true } });
    expect((await pedir("PATCH", `/api/presentaciones/${k.corona.caja}`, dueno.token, { se_vende: false })).statusCode).toBe(200);
    expect((await publico("GET", "/api/publico/cliente", cred)).json()).toMatchObject({ lealtad: { llevas: 10, premio: false } });
    expect((await pedir("PATCH", `/api/presentaciones/${k.corona.caja}`, dueno.token, { se_vende: true })).statusCode).toBe(200);
    expect((await publico("GET", "/api/publico/cliente", cred)).json()).toMatchObject({ lealtad: { premio: true } });
  });

  it("apagar despues de ganar: el cliente vuelve a ver lealtad null y la carga ya no avisa regalos", async () => {
    await reponer();
    const R = await clienteConEnlace(app, dueno);
    const cred = await activarCliente(app, R);
    await vende(R, [{ presentacion_id: k.victoria.caja, cantidad: 10 }], "3900.00");
    const P = await pedidoF8(app, dueno.token, R.id, e.manana, [{ presentacion_id: k.victoria.caja, cantidad: 1 }]);
    const ruta = await rutaConPedidos(app, dueno, e, (await repartidorF6(app)).id, [P]);
    expect(await regalosDe(ruta.id)).toHaveLength(1);
    expect((await publico("GET", "/api/publico/cliente", cred)).json()).toMatchObject({ lealtad: { premio: true } });
    expect((await apagar()).statusCode).toBe(200);
    expect(await regalosDe(ruta.id)).toEqual([]);
    expect((await publico("GET", "/api/publico/cliente", cred)).json()).toHaveProperty("lealtad", null);
  });
});

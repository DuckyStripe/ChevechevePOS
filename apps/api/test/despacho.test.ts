import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar, errorDe, pool } from "./ayuda.js";
import { hoyMas } from "./ayuda-f2.js";
import { catalogoF3, clienteConEnlace, crearUsuarioF3, limpiarF3, pedirPersonal, snapshotF3, tokenF3, type CatalogoF3, type Snapshot } from "./ayuda-f3.js";

let app: FastifyInstance;
let antes: Snapshot;
let pedir: ReturnType<typeof pedirPersonal>;
let dueno: { token: string; id: string };
let admin: string;
let cajero: string;
let almacenista: string;
let repartidor: string;
let k: CatalogoF3;

beforeAll(async () => {
  antes = await snapshotF3();
  app = await crearApp();
  pedir = pedirPersonal(app);
  const u = await crearUsuarioF3("Dueño");
  dueno = { token: await entrar(app, u), id: u.id };
  admin = await tokenF3(app, "Administrador");
  cajero = await tokenF3(app, "Cajero");
  almacenista = await tokenF3(app, "Almacenista");
  repartidor = await tokenF3(app, "Repartidor");
  k = await catalogoF3(app, dueno.token);
});
afterAll(async () => {
  await limpiarF3(app, antes);
  await cerrarPoolPruebas();
});

describe("GET /api/despacho", () => {
  it("401 sin sesion; 400 con fecha mala; cada bloque solo con su permiso", async () => {
    expect((await pedir("GET", "/api/despacho")).statusCode).toBe(401);
    expect((await pedir("GET", "/api/despacho?fecha=ayer", dueno.token)).statusCode).toBe(400);
    const hoy = await hoyMas(0);
    const d = (await pedir("GET", "/api/despacho", almacenista)).json();
    expect(d).toEqual({ fecha: hoy, pedidos: expect.any(Object) }); // Almacenista: solo pedidos.ver
    const r = (await pedir("GET", "/api/despacho", repartidor)).json();
    expect(r).toEqual({ fecha: hoy, avisos_pendientes: expect.any(Number) }); // Repartidor: avisos.enviar sin pedidos.ver
    expect(r.avisos_pendientes).toBe(0); // en F3 no ve ninguno (sus rutas llegan en F6)
    const a = (await pedir("GET", "/api/despacho", admin)).json();
    expect(Object.keys(a).sort()).toEqual(["avisos_pendientes", "fecha", "pedidos", "respaldo"]);
    expect(Object.keys((await pedir("GET", "/api/despacho", cajero)).json()).sort()).toEqual(["avisos_pendientes", "fecha", "pedidos"]);
    expect((await pedir("GET", "/api/despacho?fecha=2030-01-02", almacenista)).json().fecha).toBe("2030-01-02");
  });

  it("contadores del paso 1: por confirmar, esperando cliente, faltantes que vencen en 1 h, confirmados sin ruta y por zona; avisos pendientes", async () => {
    const base = (await pedir("GET", "/api/despacho", dueno.token)).json();
    const z = (await pedir("POST", "/api/zonas", dueno.token, { nombre: `TF3 Zona ${randomUUID().slice(0, 6)}` })).json<{ id: string; nombre: string }>();
    const c = await clienteConEnlace(app, dueno, { zona_id: z.id });
    const nuevo = async () => (await pedir("POST", "/api/pedidos", cajero, { clave_idempotencia: randomUUID(), cliente_id: c.id, lineas: [{ presentacion_id: k.corona.caja, cantidad: 2 }, { presentacion_id: k.corona.six, cantidad: 1 }] })).json<{ id: string; version: number; lineas: { id: string; presentacion_id: string }[] }>();
    const hoy = await hoyMas(0);
    const p1 = await nuevo();
    const p2 = await nuevo();
    const p3 = await nuevo();
    await pedir("POST", `/api/pedidos/${p2.id}/confirmar`, dueno.token, { version: 1, fecha_entrega: hoy, entrega_tipo: "recoge" });
    await pedir("POST", `/api/pedidos/${p3.id}/confirmar`, dueno.token, { version: 1, fecha_entrega: hoy });
    const l = p3.lineas.find((x) => x.presentacion_id === k.corona.caja)!.id;
    await pedir("POST", `/api/pedidos/${p3.id}/faltantes`, dueno.token, { version: 1, lineas: [{ pedido_linea_id: l, causa: "otro", opciones: [] }] });
    expect(p1.id).toBeTruthy();

    const d = (await pedir("GET", `/api/despacho?fecha=${hoy}`, dueno.token)).json();
    expect(d.pedidos).toMatchObject({
      por_confirmar: base.pedidos.por_confirmar + 1,
      esperando_cliente: base.pedidos.esperando_cliente + 1,
      confirmados_sin_ruta: base.pedidos.confirmados_sin_ruta + 1,
      recoge: base.pedidos.recoge + 1,
    });
    expect(d.pedidos.por_zona).toContainEqual({ zona: z.nombre, pedidos: 1, sin_ruta: 1, total: "950.00" });
    expect(d.avisos_pendientes).toBeGreaterThanOrEqual(3);
    // Un plazo lejano no cuenta; uno que cae dentro de la hora si.
    await pool.query("update app.propuesta_faltante set limite_en = now() + interval '3 hours' where pedido_linea_id = $1", [l]);
    expect((await pedir("GET", "/api/despacho", dueno.token)).json().pedidos.faltantes_vencen_1h).toBe(base.pedidos.faltantes_vencen_1h);
    await pool.query("update app.propuesta_faltante set limite_en = now() + interval '30 minutes' where pedido_linea_id = $1", [l]);
    const d2 = (await pedir("GET", "/api/despacho", dueno.token)).json();
    expect(d2.pedidos.faltantes_vencen_1h).toBe(base.pedidos.faltantes_vencen_1h + 1);
    // Sin ruta hasta F6: ningun bloque de surtido, rutas ni cierre.
    expect(d2).not.toHaveProperty("surtido");
    expect(d2).not.toHaveProperty("rutas");
    expect(d2).not.toHaveProperty("cierre");
  });

  it("respaldo (solo configuracion.editar): sin archivo de estado = vencido en rojo; nunca con otro permiso", async () => {
    const r = (await pedir("GET", "/api/despacho", dueno.token)).json();
    expect(r.respaldo).toEqual({ ultimo: null, ok: false, vencido: true });
    expect((await pedir("GET", "/api/despacho", cajero)).json()).not.toHaveProperty("respaldo");
    void errorDe;
  });
});

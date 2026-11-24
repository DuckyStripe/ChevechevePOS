import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar, errorDe } from "./ayuda.js";
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

const cuerpo = () => ({ proveedor_id: e.modelo.id, presentacion_id: e.k.corona.caja, costo_presentacion: "280.00", desde: e.hoy, hasta: e.manana });
const corona = async (token: string) => {
  const r = (await pedir("GET", "/api/surtido", token)).json<{ proveedores: { lineas: Record<string, unknown>[] }[] }>();
  return r.proveedores.flatMap((g) => g.lineas).find((x) => x.producto_id === e.k.corona.id)!;
};

describe("/api/promociones", () => {
  it("permisos: Almacenista crea (201) y ve; Cajero y Repartidor 403 (con detalle); 401 sin sesion", async () => {
    expect((await pedir("GET", "/api/promociones")).statusCode).toBe(401);
    const r = await pedir("POST", "/api/promociones", almacenista, cuerpo());
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({
      proveedor: { id: e.modelo.id, nombre: e.modelo.nombre }, presentacion: { id: e.k.corona.caja, factor: 24 }, producto: { id: e.k.corona.id },
      costo_presentacion: "280.00", minimo_cantidad: 1, desde: e.hoy, hasta: e.manana, vigente: true, notas: null,
    });
    for (const t of [cajero, repartidor]) {
      expect((await pedir("POST", "/api/promociones", t, cuerpo())).statusCode).toBe(403);
      const g = await pedir("GET", "/api/promociones", t);
      expect(g.statusCode).toBe(403);
      expect(errorDe(g)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "surtido.ver" } });
    }
    expect(errorDe(await pedir("POST", "/api/promociones", cajero, cuerpo()))).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "compras.registrar" } });
    // Administrador tambien puede ver, sin costos.ver: la promocion es lo que cuesta, igual que una compra
    const conCosto = (await pedir("GET", "/api/promociones", admin)).json<{ items: Record<string, unknown>[] }>();
    expect(conCosto.items[0]).toHaveProperty("costo_presentacion", "280.00");
    // Solo surtido.ver: ve la promocion pero no lo que cuesta (misma regla que /surtido)
    const sinCosto = (await pedir("GET", "/api/promociones", soloVer)).json<{ items: Record<string, unknown>[] }>();
    expect(sinCosto.items).toHaveLength(1);
    expect(sinCosto.items[0]).not.toHaveProperty("costo_presentacion");
  });

  it("validacion: hasta < desde, costo mal escrito y minimo 0 -> 400; proveedor inexistente 404; presentacion inexistente 409", async () => {
    expect((await pedir("POST", "/api/promociones", dueno.token, { ...cuerpo(), desde: e.manana, hasta: e.hoy })).statusCode).toBe(400);
    expect((await pedir("POST", "/api/promociones", dueno.token, { ...cuerpo(), costo_presentacion: "-5" })).statusCode).toBe(400);
    expect((await pedir("POST", "/api/promociones", dueno.token, { ...cuerpo(), minimo_cantidad: 0 })).statusCode).toBe(400);
    expect((await pedir("POST", "/api/promociones", dueno.token, { ...cuerpo(), proveedor_id: "999999999" })).statusCode).toBe(404);
    const r = await pedir("POST", "/api/promociones", dueno.token, { ...cuerpo(), presentacion_id: "999999999" });
    expect(r.statusCode).toBe(409);
    expect(errorDe(r).codigo).toBe("PRESENTACION_NO_VALIDA");
  });

  it("lista con ?vigentes y ?proveedor_id; editar (costo, fechas) y borrar; la vencida no afecta a la lista de surtido", async () => {
    const vieja = (await pedir("POST", "/api/promociones", dueno.token, { ...cuerpo(), costo_presentacion: "100.00", desde: await hoyMas(-10), hasta: await hoyMas(-5) })).json<{ id: string; vigente: boolean }>();
    expect(vieja.vigente).toBe(false);
    const todas = (await pedir("GET", `/api/promociones?proveedor_id=${e.modelo.id}`, almacenista)).json<{ items: { id: string; vigente: boolean }[]; total: number }>();
    expect(todas.total).toBe(2);
    const vigentes = (await pedir("GET", `/api/promociones?proveedor_id=${e.modelo.id}&vigentes=true`, almacenista)).json<{ items: { id: string }[]; total: number }>();
    expect(vigentes.items.map((x) => x.id)).not.toContain(vieja.id);
    expect(vigentes.total).toBe(1);

    // Duenio ve el ahorro (300.00 - 280.00) * 2 cajas; quien solo ve la lista no ve ninguna llave de costo
    expect(await corona(dueno.token)).toMatchObject({ costo_promocion: "280.00", ahorro: "40.00" });
    expect(llaves(await corona(soloVer)).filter((k) => /costo|ahorro/.test(k))).toEqual([]);

    const id = vigentes.items[0]!.id;
    const ed = await pedir("PATCH", `/api/promociones/${id}`, almacenista, { costo_presentacion: "270.00", minimo_cantidad: 5, notas: "Solo esta semana" });
    expect(ed.statusCode).toBe(200);
    expect(ed.json()).toMatchObject({ costo_presentacion: "270.00", minimo_cantidad: 5, notas: "Solo esta semana" });
    expect(await corona(dueno.token)).toMatchObject({ promocion_id: null, ahorro: null }); // minimo 5 > 2 cajas
    expect((await pedir("PATCH", `/api/promociones/${id}`, almacenista, { desde: e.manana, hasta: e.hoy })).statusCode).toBe(400);
    expect((await pedir("PATCH", `/api/promociones/${id}`, almacenista, { hasta: await hoyMas(-30) })).statusCode).toBe(400); // contra el desde guardado
    expect((await pedir("PATCH", `/api/promociones/999999999`, almacenista, { costo_presentacion: "1.00" })).statusCode).toBe(404);
    expect((await pedir("PATCH", `/api/promociones/${id}`, cajero, { costo_presentacion: "1.00" })).statusCode).toBe(403);

    expect((await pedir("DELETE", `/api/promociones/${id}`, cajero)).statusCode).toBe(403);
    expect((await pedir("DELETE", `/api/promociones/${id}`, almacenista)).statusCode).toBe(204);
    expect((await pedir("DELETE", `/api/promociones/${id}`, almacenista)).statusCode).toBe(404);
    expect(await corona(dueno.token)).toMatchObject({ promocion_id: null });
  });
});

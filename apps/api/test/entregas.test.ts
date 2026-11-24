import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar, errorDe, pool } from "./ayuda.js";
import { crearUsuarioF3, pedirPersonal, snapshotF3, tokenF3, type Snapshot } from "./ayuda-f3.js";
import { bodegaAntes, escenarioF6, limpiarF6, pedidoConfirmado, repartidorF6, rutaConPedidos, type BodegaAntes, type Dueno, type EscenarioF6 } from "./ayuda-f6.js";
import { sufijo } from "./ayuda-f2.js";
import { clienteMx } from "./ayuda-f7.js";

let app: FastifyInstance;
let antes: Snapshot;
let bodega: BodegaAntes;
let pedir: ReturnType<typeof pedirPersonal>;
let dueno: Dueno;
let e: EscenarioF6;

beforeAll(async () => {
  antes = await snapshotF3();
  bodega = await bodegaAntes();
  app = await crearApp();
  pedir = pedirPersonal(app);
  const u = await crearUsuarioF3("Dueño");
  dueno = { token: await entrar(app, u), id: u.id };
  e = await escenarioF6(app, dueno, { n: 0 });
});
afterAll(async () => {
  await limpiarF6(app, antes, bodega);
  await cerrarPoolPruebas();
});

describe("quien puede entregar", () => {
  it("reparto: solo el repartidor de la ruta (otro repartidor y el dueno -> 403 RUTA_AJENA; sin permiso 403); el cobro se valida antes de entregar", async () => {
    const A = await clienteMx(app, dueno, 1);
    const P = await pedidoConfirmado(app, dueno, e.k, A.id, e.manana, [{ presentacion_id: e.k.corona.six, cantidad: 1 }]);
    const rep = await repartidorF6(app);
    const r = await rutaConPedidos(app, dueno, e, rep.id, [P]);
    await pedir("POST", `/api/rutas/${r.id}/cargar`, dueno.token);
    expect((await pedir("POST", `/api/rutas/${r.id}/iniciar`, rep.token, {})).statusCode).toBe(200);
    const cuerpo = { clave_idempotencia: randomUUID(), pagos: [{ metodo: "efectivo", monto: "110.00" }] };
    const otro = await repartidorF6(app);
    const ajeno = await pedir("POST", `/api/pedidos/${P}/entregar`, otro.token, cuerpo);
    expect(ajeno.statusCode).toBe(403);
    expect(errorDe(ajeno).codigo).toBe("RUTA_AJENA");
    expect(errorDe(await pedir("POST", `/api/pedidos/${P}/entregar`, dueno.token, cuerpo)).codigo).toBe("RUTA_AJENA");
    expect((await pedir("POST", `/api/pedidos/${P}/entregar`, await tokenF3(app, "Almacenista"), cuerpo)).statusCode).toBe(403);
    expect(errorDe(await pedir("POST", `/api/pedidos/${P}/entregar`, rep.token, { ...cuerpo, pagos: [{ metodo: "efectivo", monto: "100.00" }] })).codigo).toBe("PAGOS_NO_CUADRAN");
    expect(errorDe(await pedir("POST", `/api/pedidos/${P}/entregar`, rep.token, { ...cuerpo, lineas: [{ pedido_linea_id: "999999999", cantidad_entregada: 1 }] })).codigo).toBe("LINEA_NO_VALIDA");
    expect(errorDe(await pedir("POST", `/api/pedidos/${P}/entregar`, rep.token, { ...cuerpo, foto_entrega: "../etc/passwd" })).codigo).toBe("VALIDACION");
    expect((await pedir("POST", `/api/pedidos/${P}/entregar`, rep.token, cuerpo)).statusCode).toBe(201);
    expect((await pool.query("select recibio from app.pedido where id = $1", [P])).rows[0].recibio).toBeNull();
    expect(errorDe(await pedir("POST", `/api/pedidos/${P}/entregar`, rep.token, { ...cuerpo, clave_idempotencia: randomUUID() })).codigo).toBe("ESTADO_NO_VALIDO");
  });

  it("recoge en bodega: sin turno de mostrador -> 409 TURNO_NO_ABIERTO; con turno el cajero entrega y la venta queda en ese turno con origen pedido", async () => {
    const B = await clienteMx(app, dueno, 2);
    const p = (await pedir("POST", "/api/pedidos", dueno.token, { clave_idempotencia: randomUUID(), cliente_id: B.id, entrega_tipo: "recoge", lineas: [{ presentacion_id: e.k.corona.six, cantidad: 1 }] })).json<{ id: string }>();
    expect((await pedir("POST", `/api/pedidos/${p.id}/confirmar`, dueno.token, { version: 1, fecha_entrega: e.manana })).statusCode).toBe(200);
    const cajero = await crearUsuarioF3("Cajero");
    const token = await entrar(app, cajero);
    const cuerpo = { clave_idempotencia: randomUUID(), pagos: [{ metodo: "efectivo", monto: "110.00" }], efectivo_recibido: "200.00", recibio: "El mismo" };
    expect(errorDe(await pedir("POST", `/api/pedidos/${p.id}/entregar`, token, cuerpo)).codigo).toBe("TURNO_NO_ABIERTO");
    const caja = (await pedir("POST", "/api/cajas", dueno.token, { nombre: `TF7 Caja ${sufijo()}` })).json<{ id: string }>();
    const turno = (await pedir("POST", "/api/turnos", token, { caja_id: caja.id, fondo_inicial: "0" })).json<{ id: string }>();
    const r = await pedir("POST", `/api/pedidos/${p.id}/entregar`, token, cuerpo);
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({ venta: { total: "110.00", cambio: "90.00" }, pedido: { estado: "entregado", recibio: "El mismo" }, saldo_cliente: { saldo: "0.00" } });
    expect((await pool.query("select origen, turno_caja_id::text as t from app.venta where id = $1", [r.json().venta.id])).rows[0]).toEqual({ origen: "pedido", t: turno.id });
    await pedir("POST", `/api/turnos/${turno.id}/cerrar`, token, { efectivo_contado: "110.00" });
  });
});

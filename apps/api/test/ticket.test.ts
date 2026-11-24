import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar, pool } from "./ayuda.js";
import { crearUsuarioF3, limpiarF3, pedirPersonal, snapshotF3, type Snapshot } from "./ayuda-f3.js";
import { hoyMas } from "./ayuda-f2.js";
import type { Dueno } from "./ayuda-f6.js";
import { dineroMalo } from "./ayuda-f7.js";
import { catalogoF8, clientesF8, llaves, pedidoF8, turnoMostrador, vender } from "./ayuda-f8.js";

let app: FastifyInstance;
let antes: Snapshot;
let pedir: ReturnType<typeof pedirPersonal>;
let dueno: Dueno;

const sesion = async (rol: "Dueño" | "Cajero"): Promise<Dueno> => {
  const u = await crearUsuarioF3(rol);
  return { id: u.id, token: await entrar(app, u) };
};

beforeAll(async () => {
  antes = await snapshotF3();
  app = await crearApp();
  pedir = pedirPersonal(app);
  dueno = await sesion("Dueño");
});
afterAll(async () => {
  await limpiarF3(app, antes);
  await cerrarPoolPruebas();
});

describe("ticket y recoge", () => {
  it("reimprimir = mismo ticket; sin llaves de impuestos; saldo_credito null sin cliente y el saldo de C con fiado; venta ajena 404 al Cajero", async () => {
    const k = await catalogoF8(app, dueno.token);
    const { C } = await clientesF8(app, dueno, k);
    const cajero = await sesion("Cajero");
    const otro = await sesion("Cajero");
    await turnoMostrador(app, dueno.token, cajero.token);

    const contado = await vender(app, cajero.token, { lineas: [{ presentacion_id: k.corona.six, cantidad: 1 }], pagos: [{ metodo: "efectivo", monto: "105.00" }], efectivo_recibido: "200.00" });
    expect(contado.statusCode, contado.body).toBe(201);
    const fiado = await vender(app, cajero.token, { cliente_id: C.id, lineas: [{ presentacion_id: k.corona.caja, cantidad: 1 }], pagos: [{ metodo: "efectivo", monto: "250.00" }, { metodo: "credito", monto: "150.00" }] });
    expect(fiado.statusCode, fiado.body).toBe(201);

    for (const venta of [contado, fiado]) {
      const id = venta.json<{ venta_id: string }>().venta_id;
      const t1 = await pedir("GET", `/api/ventas/${id}/ticket`, cajero.token);
      const t2 = await pedir("GET", `/api/ventas/${id}/ticket`, cajero.token);
      expect(t1.statusCode).toBe(200);
      expect(t2.json()).toEqual(t1.json());
      expect(t1.json()).toEqual(venta.json()); // el que devolvio el cobro es el mismo que se reimprime
      expect(llaves(t1.json()).filter((l) => /iva|ieps|impuesto/i.test(l))).toEqual([]);
      expect(dineroMalo(t1.json())).toEqual([]);
      expect((await pedir("GET", `/api/ventas/${id}/ticket`, otro.token)).statusCode).toBe(404);
      expect((await pedir("GET", `/api/ventas/${id}/ticket`, dueno.token)).statusCode).toBe(200);
    }
    expect(contado.json().saldo_credito).toBeNull();
    expect(fiado.json().saldo_credito).toBe("150.00");
  });

  it("recoge: el pedido entregado con el turno de mostrador es una venta origen pedido en ese turno", async () => {
    const k = await catalogoF8(app, dueno.token);
    const { M } = await clientesF8(app, dueno, k);
    const cajero = await sesion("Cajero");
    const turno = await turnoMostrador(app, dueno.token, cajero.token);
    const pedido = await pedidoF8(app, dueno.token, M.id, await hoyMas(0), [{ presentacion_id: k.corona.caja, cantidad: 1 }], "recoge");
    const r = await pedir("POST", `/api/pedidos/${pedido}/entregar`, cajero.token, { clave_idempotencia: randomUUID(), pagos: [{ metodo: "efectivo", monto: "380.00" }], efectivo_recibido: "400.00" });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({ venta: { total: "380.00", cambio: "20.00" }, pedido: { estado: "entregado" } });
    const v = await pool.query("select origen, turno_caja_id::text as t from app.venta where id = $1", [r.json().venta.id]);
    expect(v.rows[0]).toEqual({ origen: "pedido", t: turno });
  });
});

import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar, errorDe, pool } from "./ayuda.js";
import { crearUsuarioF3, pedirPersonal, snapshotF3, type Snapshot } from "./ayuda-f3.js";
import { bodegaAntes, clienteEn, crearVehiculo, limpiarF6, ponerBodega, rutaEnCurso, type BodegaAntes, type Dueno } from "./ayuda-f6.js";
import { hoyMas } from "./ayuda-f2.js";
import { dineroMalo, hoyLocal } from "./ayuda-f7.js";
import { catalogoF8, clientesF8, pedidoF8, turnoMostrador, vender } from "./ayuda-f8.js";

let app: FastifyInstance;
let antes: Snapshot;
let bodega: BodegaAntes;
let pedir: ReturnType<typeof pedirPersonal>;
let dueno: Dueno;
let cajero: Dueno;
let cajero2: Dueno;

const sesion = async (rol: "Dueño" | "Cajero"): Promise<Dueno> => {
  const u = await crearUsuarioF3(rol);
  return { id: u.id, token: await entrar(app, u) };
};

beforeAll(async () => {
  antes = await snapshotF3();
  bodega = await bodegaAntes();
  app = await crearApp();
  pedir = pedirPersonal(app);
  dueno = await sesion("Dueño");
  cajero = await sesion("Cajero");
  cajero2 = await sesion("Cajero");
});
afterAll(async () => {
  await limpiarF6(app, antes, bodega);
  await cerrarPoolPruebas();
});

describe("mostrador: turno, cambio, credito y mayoreo", () => {
  it("sin turno -> 409 TURNO_NO_ABIERTO; con turno de ruta -> 409 TURNO_NO_VALIDO", async () => {
    const k = await catalogoF8(app, dueno.token);
    const lineas = [{ presentacion_id: k.corona.six, cantidad: 1 }];
    const pagos = [{ metodo: "efectivo" as const, monto: "105.00" }];
    const sin = await vender(app, cajero.token, { lineas, pagos });
    expect(sin.statusCode).toBe(409);
    expect(errorDe(sin).codigo).toBe("TURNO_NO_ABIERTO");

    // quien vende y ademas tiene un turno de ruta abierto: la venta de mostrador no vale
    const u = await crearUsuarioF3({ permisos: ["rutas.operar", "ventas.crear", "caja.operar"] });
    const rep: Dueno = { id: u.id, token: await entrar(app, u) };
    await ponerBodega(app, dueno, "19.000000", "-99.000000");
    const cliente = await clienteEn(app, dueno, 19, -99.01);
    const manana = await hoyMas(1);
    const pedido = await pedidoF8(app, dueno.token, cliente.id, manana, [{ presentacion_id: k.corona.six, cantidad: 1 }]);
    const vehiculo = await crearVehiculo(app, dueno);
    await rutaEnCurso(app, dueno, { vehiculo, manana }, rep, [pedido]);
    const deRuta = await vender(app, rep.token, { lineas, pagos });
    expect(deRuta.statusCode, deRuta.body).toBe(409);
    expect(errorDe(deRuta).codigo).toBe("TURNO_NO_VALIDO");
  });

  it("venta con cambio: 201 Ticket total 105.00 cambio 95.00; misma clave 200 mismo folio; otro cuerpo 409 IDEMPOTENCIA_CONFLICTO", async () => {
    const k = await catalogoF8(app, dueno.token);
    await turnoMostrador(app, dueno.token, cajero.token, "1000.00");
    const cuerpo = { clave_idempotencia: randomUUID(), lineas: [{ presentacion_id: k.corona.six, cantidad: 1 }], pagos: [{ metodo: "efectivo", monto: "105.00" }], efectivo_recibido: "200.00" };
    const r1 = await pedir("POST", "/api/ventas", cajero.token, cuerpo);
    expect(r1.statusCode, r1.body).toBe(201);
    expect(r1.json()).toMatchObject({ total: "105.00", cambio: "95.00", efectivo_recibido: "200.00" });
    expect(dineroMalo(r1.json())).toEqual([]);
    const r2 = await pedir("POST", "/api/ventas", cajero.token, cuerpo);
    expect(r2.statusCode).toBe(200);
    expect(r2.json().folio).toBe(r1.json().folio);
    const otro = await pedir("POST", "/api/ventas", cajero.token, { ...cuerpo, efectivo_recibido: "300.00" });
    expect(otro.statusCode).toBe(409);
    expect(errorDe(otro).codigo).toBe("IDEMPOTENCIA_CONFLICTO");
  });

  it("mixta efectivo + credito: CxC 150.00 con vence_el hoy + 7; credito sin cliente 409 CREDITO_SIN_CLIENTE; suma distinta 409 PAGOS_NO_CUADRAN", async () => {
    const k = await catalogoF8(app, dueno.token);
    const { C } = await clientesF8(app, dueno, k);
    await turnoMostrador(app, dueno.token, cajero2.token);
    const lineas = [{ presentacion_id: k.corona.caja, cantidad: 1 }];
    const r = await vender(app, cajero2.token, { cliente_id: C.id, lineas, pagos: [{ metodo: "efectivo", monto: "250.00" }, { metodo: "credito", monto: "150.00" }] });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({ total: "400.00", saldo_credito: "150.00" });
    const cxc = await pool.query<{ monto: string; vence_el: string }>("select monto::text as monto, vence_el::text as vence_el from app.cuenta_por_cobrar where cliente_id = $1", [C.id]);
    expect(cxc.rows).toEqual([{ monto: "150.00", vence_el: await hoyLocal(7) }]);

    const sinCliente = await vender(app, cajero2.token, { lineas, pagos: [{ metodo: "efectivo", monto: "250.00" }, { metodo: "credito", monto: "150.00" }] });
    expect(sinCliente.statusCode).toBe(409);
    expect(errorDe(sinCliente).codigo).toBe("CREDITO_SIN_CLIENTE");
    const noCuadra = await vender(app, cajero2.token, { cliente_id: C.id, lineas, pagos: [{ metodo: "efectivo", monto: "250.00" }, { metodo: "credito", monto: "100.00" }] });
    expect(noCuadra.statusCode).toBe(409);
    expect(errorDe(noCuadra).codigo).toBe("PAGOS_NO_CUADRAN");
  });

  it("mayoreo: M paga su lista (380.00) sin permiso; Cajero con otra lista o precio manual 403 SIN_PERMISO_PRECIO; Dueno 201", async () => {
    const k = await catalogoF8(app, dueno.token);
    const { M } = await clientesF8(app, dueno, k);
    const cajeroM = await sesion("Cajero");
    await turnoMostrador(app, dueno.token, cajeroM.token);
    await turnoMostrador(app, dueno.token, dueno.token);
    const caja = { presentacion_id: k.corona.caja, cantidad: 1 };

    const lista = await vender(app, cajeroM.token, { cliente_id: M.id, lineas: [caja], pagos: [{ metodo: "efectivo", monto: "380.00" }] });
    expect(lista.statusCode, lista.body).toBe(201);
    expect(lista.json().lineas[0]).toMatchObject({ precio_unitario: "380.00", importe: "380.00" });

    const otraLista = await vender(app, cajeroM.token, { cliente_id: M.id, lista_precio_id: k.menudeo, lineas: [caja], pagos: [{ metodo: "efectivo", monto: "400.00" }] });
    expect(otraLista.statusCode).toBe(403);
    expect(errorDe(otraLista).codigo).toBe("SIN_PERMISO_PRECIO");
    const manual = await vender(app, cajeroM.token, { cliente_id: M.id, lineas: [{ ...caja, precio_unitario: "390.00" }], pagos: [{ metodo: "efectivo", monto: "390.00" }] });
    expect(manual.statusCode).toBe(403);
    expect(errorDe(manual).codigo).toBe("SIN_PERMISO_PRECIO");

    const d = await vender(app, dueno.token, { cliente_id: M.id, lineas: [{ ...caja, precio_unitario: "390.00" }], pagos: [{ metodo: "efectivo", monto: "390.00" }] });
    expect(d.statusCode, d.body).toBe(201);
    expect(d.json().lineas[0]).toMatchObject({ precio_unitario: "390.00", importe: "390.00" });
  });
});

describe("mostrador: existencias", () => {
  it("ultima caja concurrente: dos conexiones venden 1 Caja de Victoria (24 pz) a la vez -> una 201, la otra 409 STOCK_INSUFICIENTE; existencia final 0", async () => {
    const k = await catalogoF8(app, dueno.token);
    const a = await sesion("Cajero");
    const b = await sesion("Cajero");
    await turnoMostrador(app, dueno.token, a.token);
    await turnoMostrador(app, dueno.token, b.token);
    const venta = (token: string) => vender(app, token, { lineas: [{ presentacion_id: k.victoria.caja, cantidad: 1 }], pagos: [{ metodo: "efectivo", monto: "390.00" }] });
    const r = await Promise.all([venta(a.token), venta(b.token)]);
    expect(r.map((x) => x.statusCode).sort()).toEqual([201, 409]);
    expect(errorDe(r.find((x) => x.statusCode === 409)!).codigo).toBe("STOCK_INSUFICIENTE");
    const ex = await pool.query<{ cantidad: number }>("select cantidad from app.existencia where producto_id = $1", [k.victoria.id]);
    expect(ex.rows[0]!.cantidad).toBe(0);
  });

  it("no vender lo cargado: ruta cargada con 126 pz de Corona, mostrador 5 Cajas -> 409 STOCK_INSUFICIENTE {disponible 114, comprometido 126}", async () => {
    const k = await catalogoF8(app, dueno.token);
    await ponerBodega(app, dueno, "19.000000", "-99.000000");
    const cliente = await clienteEn(app, dueno, 19, -99.02);
    const manana = await hoyMas(1);
    const pedido = await pedidoF8(app, dueno.token, cliente.id, manana, [{ presentacion_id: k.corona.caja, cantidad: 5 }, { presentacion_id: k.corona.six, cantidad: 1 }]);
    const u = await crearUsuarioF3("Repartidor");
    const rep: Dueno = { id: u.id, token: await entrar(app, u) };
    await rutaEnCurso(app, dueno, { vehiculo: await crearVehiculo(app, dueno), manana }, rep, [pedido]);
    const c = await sesion("Cajero");
    await turnoMostrador(app, dueno.token, c.token);
    const r = await vender(app, c.token, { lineas: [{ presentacion_id: k.corona.caja, cantidad: 5 }], pagos: [{ metodo: "efectivo", monto: "2000.00" }] });
    expect(r.statusCode, r.body).toBe(409);
    expect(errorDe(r)).toMatchObject({ codigo: "STOCK_INSUFICIENTE", detalles: { disponible: 114, comprometido: 126 } });
    // 4 Cajas (96 pz) si caben en las 114 libres
    const cabe = await vender(app, c.token, { lineas: [{ presentacion_id: k.corona.caja, cantidad: 4 }], pagos: [{ metodo: "efectivo", monto: "1600.00" }] });
    expect(cabe.statusCode, cabe.body).toBe(201);
  });
});

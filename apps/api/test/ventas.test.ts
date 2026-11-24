import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar, errorDe, pool } from "./ayuda.js";
import { catalogoF3, clienteConEnlace, crearUsuarioF3, limpiarF3, pedirPersonal, snapshotF3, type CatalogoF3, type Snapshot } from "./ayuda-f3.js";
import { conCredito, dineroMalo, hoyLocal } from "./ayuda-f7.js";
import { sufijo } from "./ayuda-f2.js";

let app: FastifyInstance;
let antes: Snapshot;
let pedir: ReturnType<typeof pedirPersonal>;
let dueno: { token: string; id: string };
let cajero: { token: string; id: string };
let cajero2: { token: string; id: string };
let admin: { token: string; id: string };
let k: CatalogoF3;

const sesion = async (rol: "Dueño" | "Cajero" | "Administrador" | "Repartidor") => {
  const u = await crearUsuarioF3(rol);
  return { token: await entrar(app, u), id: u.id };
};
const nuevaCaja = async (): Promise<string> => {
  const r = await pedir("POST", "/api/cajas", dueno.token, { nombre: `TF7 Caja ${sufijo()}` });
  expect(r.statusCode, r.body).toBe(201);
  return r.json<{ id: string }>().id;
};

beforeAll(async () => {
  antes = await snapshotF3();
  app = await crearApp();
  pedir = pedirPersonal(app);
  dueno = await sesion("Dueño");
  cajero = await sesion("Cajero");
  cajero2 = await sesion("Cajero");
  admin = await sesion("Administrador");
  k = await catalogoF3(app, dueno.token);
  // existencia de sobra para todas las ventas de este archivo (catalogoF3 deja 60 piezas)
  const aj = await pedir("POST", "/api/inventario/ajustes", dueno.token, { producto_id: k.corona.id, tipo: "ajuste_entrada", piezas: 600, costo_unitario: "12.50", motivo: "stock de prueba", clave_idempotencia: randomUUID() });
  expect(aj.statusCode, aj.body).toBe(201);
});
afterAll(async () => {
  await limpiarF3(app, antes);
  await cerrarPoolPruebas();
});

describe("cajas y turnos", () => {
  it("cajas: caja.operar las ve; solo configuracion.editar crea y edita; nombre repetido -> 409 DUPLICADO", async () => {
    const lista = await pedir("GET", "/api/cajas", cajero.token);
    expect(lista.statusCode).toBe(200);
    expect(lista.json().items.map((c: { nombre: string }) => c.nombre)).toContain("Mostrador");
    expect((await pedir("POST", "/api/cajas", cajero.token, { nombre: "TF7 no" })).statusCode).toBe(403);
    const nombre = `TF7 Caja ${sufijo()}`;
    const c = await pedir("POST", "/api/cajas", dueno.token, { nombre });
    expect(c.statusCode).toBe(201);
    expect(c.json()).toMatchObject({ nombre, activa: true, turno_abierto: null });
    expect((await pedir("POST", "/api/cajas", dueno.token, { nombre })).statusCode).toBe(409);
    const p = await pedir("PATCH", `/api/cajas/${c.json().id}`, dueno.token, { activa: false });
    expect(p.json()).toMatchObject({ activa: false });
    expect((await pedir("PATCH", "/api/cajas/999999999", dueno.token, { activa: false })).statusCode).toBe(404);
    expect((await pedir("GET", "/api/cajas")).statusCode).toBe(401);
  });

  it("abrir turno: 201; otra vez -> 409 TURNO_YA_ABIERTO; caja ocupada por otro -> 409 CAJA_OCUPADA; /turnos/actual y /auth/yo; sin caja.operar -> 403", async () => {
    const caja = await nuevaCaja();
    expect((await pedir("GET", "/api/turnos/actual", cajero.token)).json()).toBeNull();
    const t = await pedir("POST", "/api/turnos", cajero.token, { caja_id: caja, fondo_inicial: "100.00" });
    expect(t.statusCode).toBe(201);
    expect(t.json()).toMatchObject({ tipo: "mostrador", estado: "abierto", fondo_inicial: "100.00", caja: { id: caja }, usuario: { id: cajero.id } });
    expect(errorDe(await pedir("POST", "/api/turnos", cajero.token, { caja_id: caja, fondo_inicial: "0" })).codigo).toBe("TURNO_YA_ABIERTO");
    expect(errorDe(await pedir("POST", "/api/turnos", cajero2.token, { caja_id: caja, fondo_inicial: "0" })).codigo).toBe("CAJA_OCUPADA");
    expect((await pedir("GET", "/api/turnos/actual", cajero.token)).json().id).toBe(t.json().id);
    expect((await pedir("GET", "/api/auth/yo", cajero.token)).json().turno_abierto).toEqual({ id: t.json().id, tipo: "mostrador", caja_id: caja, ruta_id: null });
    expect((await pedir("POST", "/api/turnos", (await sesion("Administrador")).token, { caja_id: caja, fondo_inicial: "abc" })).statusCode).toBe(400);
    // cerrar para no dejar el turno abierto a las demas pruebas
    expect((await pedir("POST", `/api/turnos/${t.json().id}/cerrar`, cajero.token, { efectivo_contado: "100.00" })).statusCode).toBe(200);
  });

  it("GET /turnos: sin caja.supervisar solo los propios; con supervisar todos, con usuario {id, nombre}, caja {id, nombre}, abierto_en y fondo", async () => {
    const caja = await nuevaCaja();
    const t = await pedir("POST", "/api/turnos", cajero2.token, { caja_id: caja, fondo_inicial: "50.00" });
    const mio = await pedir("GET", "/api/turnos?estado=abierto", cajero.token);
    expect(mio.statusCode).toBe(200);
    expect(mio.json().items.map((x: { id: string }) => x.id)).not.toContain(t.json().id);
    const todos = await pedir("GET", "/api/turnos?estado=abierto", admin.token);
    const fila = todos.json().items.find((x: { id: string }) => x.id === t.json().id);
    expect(fila).toMatchObject({ usuario: { id: cajero2.id, nombre: expect.any(String) }, caja: { id: caja, nombre: expect.any(String) }, abierto_en: expect.any(String), fondo: "50.00", fondo_inicial: "50.00", estado: "abierto" });
    expect(todos.json()).toMatchObject({ pagina: 1 });
    // el resumen de un turno ajeno: 404 sin supervisar, 200 con supervisar
    expect((await pedir("GET", `/api/turnos/${t.json().id}/resumen`, cajero.token)).statusCode).toBe(404);
    expect((await pedir("GET", `/api/turnos/${t.json().id}/resumen`, admin.token)).statusCode).toBe(200);
    expect(errorDe(await pedir("POST", `/api/turnos/${t.json().id}/cerrar`, cajero.token, { efectivo_contado: "50.00" })).codigo).toBe("TURNO_AJENO");
    expect((await pedir("POST", `/api/turnos/${t.json().id}/cerrar`, cajero2.token, { efectivo_contado: "50.00" })).statusCode).toBe(200);
  });
});

describe("venta de mostrador", () => {
  it("venta en efectivo: ticket, cambio, idempotencia (201/200), vista previa en SQL, esperado del turno, cierre con diferencia", async () => {
    const caja = await nuevaCaja();
    const t = (await pedir("POST", "/api/turnos", cajero.token, { caja_id: caja, fondo_inicial: "100.00" })).json<{ id: string }>();
    const base = { lineas: [{ presentacion_id: k.corona.caja, cantidad: 1 }], pagos: [{ metodo: "efectivo", monto: "420.00" }], efectivo_recibido: "500.00" };

    // vista previa (/pos): monto null = el resto; todo sale de SQL
    const v = await pedir("POST", "/api/cobrar/vista", cajero.token, { lineas: base.lineas, pagos: [{ metodo: "efectivo", monto: null }], efectivo_recibido: "500.00" });
    expect(v.statusCode, v.body).toBe(200);
    expect(v.json()).toMatchObject({ total: "420.00", pagos: [{ metodo: "efectivo", monto: "420.00" }], pagado: "420.00", cambio: "80.00", cuadra: true, saldo: null });
    expect(dineroMalo(v.json())).toEqual([]);
    const mixta = await pedir("POST", "/api/cobrar/vista", cajero.token, { lineas: base.lineas, pagos: [{ metodo: "efectivo", monto: "100.00" }, { metodo: "credito", monto: null }] });
    expect(mixta.json()).toMatchObject({ credito: "320.00", pagado: "100.00", cuadra: true });
    // sin permiso de venta: el Repartidor no ve la vista del mostrador
    expect((await pedir("POST", "/api/cobrar/vista", (await (async () => { const u = await crearUsuarioF3("Repartidor"); return entrar(app, u); })()), { lineas: base.lineas, pagos: [] })).statusCode).toBe(403);

    const clave = randomUUID();
    const r1 = await pedir("POST", "/api/ventas", cajero.token, { clave_idempotencia: clave, ...base });
    expect(r1.statusCode, r1.body).toBe(201);
    expect(r1.json()).toMatchObject({
      venta_id: expect.any(String), folio: expect.stringMatching(/^V-/), total: "420.00", cambio: "80.00", efectivo_recibido: "500.00", cliente: null, usuario: { id: cajero.id, nombre: expect.any(String) },
      negocio: { nombre: expect.anything(), direccion: expect.anything(), telefono: expect.anything(), pie: expect.anything() },
      lineas: [{ cantidad: 1, precio_unitario: "420.00", importe: "420.00" }], pagos: [{ metodo: "efectivo", monto: "420.00" }],
    });
    expect(dineroMalo(r1.json())).toEqual([]);
    const r2 = await pedir("POST", "/api/ventas", cajero.token, { clave_idempotencia: clave, ...base });
    expect(r2.statusCode).toBe(200);
    expect(r2.json().venta_id).toBe(r1.json().venta_id);
    expect(errorDe(await pedir("POST", "/api/ventas", cajero.token, { clave_idempotencia: clave, ...base, efectivo_recibido: "600.00" })).codigo).toBe("IDEMPOTENCIA_CONFLICTO");
    expect((await pedir("GET", `/api/ventas/${r1.json().venta_id}/ticket`, cajero.token)).json()).toMatchObject({ venta_id: r1.json().venta_id, folio: r1.json().folio, total: "420.00" });

    // errores de la venta
    expect(errorDe(await pedir("POST", "/api/ventas", cajero.token, { clave_idempotencia: randomUUID(), ...base, efectivo_recibido: "100.00" })).codigo).toBe("EFECTIVO_INSUFICIENTE");
    expect(errorDe(await pedir("POST", "/api/ventas", cajero.token, { clave_idempotencia: randomUUID(), ...base, pagos: [{ metodo: "efectivo", monto: "400.00" }] })).codigo).toBe("PAGOS_NO_CUADRAN");
    expect((await pedir("POST", "/api/ventas", cajero.token, { clave_idempotencia: randomUUID(), ...base, pagos: [{ metodo: "efectivo", monto: "12345678.00" }] })).statusCode).toBe(400);
    expect(errorDe(await pedir("POST", "/api/ventas", cajero.token, { clave_idempotencia: randomUUID(), lineas: [{ presentacion_id: k.corona.caja, cantidad: 1 }], pagos: [{ metodo: "credito", monto: "420.00" }] })).codigo).toBe("CREDITO_SIN_CLIENTE");

    // resumen y cierre: 100 de fondo + 420 de venta = 520.00; contado 510.00 -> -10.00
    const res = await pedir("GET", `/api/turnos/${t.id}/resumen`, cajero.token);
    expect(res.json()).toMatchObject({ efectivo_esperado: "520.00", ventas: { num: 1, efectivo: "420.00" }, movimientos: [] });
    const mov = { clave_idempotencia: randomUUID(), tipo: "salida", monto: "20.00", motivo: "Hielo" };
    expect((await pedir("POST", `/api/turnos/${t.id}/movimientos`, cajero.token, mov)).statusCode).toBe(201);
    expect((await pedir("POST", `/api/turnos/${t.id}/movimientos`, cajero.token, mov)).statusCode).toBe(200);
    expect(errorDe(await pedir("POST", `/api/turnos/${t.id}/movimientos`, cajero.token, { ...mov, monto: "21.00" })).codigo).toBe("IDEMPOTENCIA_CONFLICTO");
    const cierre = await pedir("POST", `/api/turnos/${t.id}/cerrar`, cajero.token, { efectivo_contado: "500.00" });
    expect(cierre.statusCode).toBe(200);
    expect(cierre.json()).toMatchObject({ efectivo_esperado: "500.00", efectivo_contado: "500.00", diferencia: "0.00", estado: "cerrado", salidas: "20.00" });
    expect(errorDe(await pedir("POST", `/api/turnos/${t.id}/cerrar`, cajero.token, { efectivo_contado: "500.00" })).codigo).toBe("TURNO_NO_ABIERTO");
    // sin turno abierto no se vende
    expect(errorDe(await pedir("POST", "/api/ventas", cajero.token, { clave_idempotencia: randomUUID(), ...base })).codigo).toBe("TURNO_NO_ABIERTO");
  });

  it("credito: sin credito o pasado del limite -> 409 LIMITE_CREDITO_EXCEDIDO con detalle; solo la parte a fiado entra a la cuenta; vista con cliente avisa que se pasa", async () => {
    const caja = await nuevaCaja();
    const t = (await pedir("POST", "/api/turnos", cajero.token, { caja_id: caja, fondo_inicial: "0.00" })).json<{ id: string }>();
    const sinCredito = await clienteConEnlace(app, dueno);
    const conLimite = await clienteConEnlace(app, dueno);
    await conCredito(app, dueno, conLimite, "500.00", 7);
    const lineas = [{ presentacion_id: k.corona.caja, cantidad: 1 }];
    const e1 = await pedir("POST", "/api/ventas", cajero.token, { clave_idempotencia: randomUUID(), cliente_id: sinCredito.id, lineas, pagos: [{ metodo: "credito", monto: "420.00" }] });
    expect(e1.statusCode).toBe(409);
    expect(errorDe(e1)).toMatchObject({ codigo: "LIMITE_CREDITO_EXCEDIDO", detalles: { limite: "0.00", saldo: "0.00", disponible: "0.00" } });
    const vista = await pedir("POST", "/api/cobrar/vista", cajero.token, { cliente_id: sinCredito.id, lineas, pagos: [{ metodo: "credito", monto: null }] });
    expect(vista.json()).toMatchObject({ excede_limite: true, limite: "0.00", saldo: "0.00", saldo_despues: "420.00", disponible_despues: "0.00" });
    const ok = await pedir("POST", "/api/ventas", cajero.token, { clave_idempotencia: randomUUID(), cliente_id: conLimite.id, lineas, pagos: [{ metodo: "efectivo", monto: "20.00" }, { metodo: "credito", monto: "400.00" }] });
    expect(ok.statusCode, ok.body).toBe(201);
    expect(ok.json().saldo_credito).toBe("400.00");
    expect((await pool.query("select monto::text as m from app.cuenta_por_cobrar where cliente_id = $1", [conLimite.id])).rows).toEqual([{ m: "400.00" }]);
    expect(errorDe(await pedir("POST", "/api/ventas", cajero.token, { clave_idempotencia: randomUUID(), cliente_id: conLimite.id, lineas, pagos: [{ metodo: "credito", monto: "420.00" }] })).detalles).toEqual({ limite: "500.00", saldo: "400.00", disponible: "100.00" });
    await pedir("POST", `/api/turnos/${t.id}/cerrar`, cajero.token, { efectivo_contado: "20.00" });
  });
});

describe("ver, cancelar y devolver ventas", () => {
  it("solo las propias con ventas.ver (ajena 404); todas con ventas.ver_todas; cancelar solo el Dueno; devolver con reembolso en el turno de quien la recibe", async () => {
    const cajaC = await nuevaCaja();
    const tC = (await pedir("POST", "/api/turnos", cajero.token, { caja_id: cajaC, fondo_inicial: "0.00" })).json<{ id: string }>();
    const vta = await pedir("POST", "/api/ventas", cajero.token, { clave_idempotencia: randomUUID(), lineas: [{ presentacion_id: k.corona.caja, cantidad: 1 }], pagos: [{ metodo: "efectivo", monto: "420.00" }] });
    const id = vta.json<{ venta_id: string }>().venta_id;

    expect((await pedir("GET", `/api/ventas/${id}`, cajero2.token)).statusCode).toBe(404);
    expect((await pedir("GET", `/api/ventas/${id}/ticket`, cajero2.token)).statusCode).toBe(404);
    const lista2 = await pedir("GET", "/api/ventas", cajero2.token);
    expect(lista2.json().items.map((x: { id: string }) => x.id)).not.toContain(id);
    const det = await pedir("GET", `/api/ventas/${id}`, admin.token);
    expect(det.statusCode).toBe(200);
    expect(det.json()).toMatchObject({ id, estado: "completada", total: "420.00", cliente: null, usuario: { id: cajero.id }, pagos: [{ metodo: "efectivo", monto: "420.00" }], lineas: [{ cantidad: 1, piezas: 24, piezas_devueltas: 0, importe: "420.00" }] });
    expect(det.json()).not.toHaveProperty("utilidad"); // el Administrador no tiene costos.ver
    const detD = await pedir("GET", `/api/ventas/${id}`, dueno.token);
    expect(detD.json()).toMatchObject({ utilidad: "120.00" }); // 420.00 - 24 pz a 12.50
    expect(dineroMalo(detD.json())).toEqual([]);
    const hoy = await hoyLocal();
    expect((await pedir("GET", `/api/ventas?desde=${hoy}&hasta=${hoy}&estado=completada`, admin.token)).json().items.map((x: { id: string }) => x.id)).toContain(id);

    // cancelar: Administrador -> 403 SIN_PERMISO ventas.cancelar
    const prohibido = await pedir("POST", `/api/ventas/${id}/cancelar`, admin.token, { motivo: "x" });
    expect(prohibido.statusCode).toBe(403);
    expect(errorDe(prohibido).detalles).toEqual({ permiso: "ventas.cancelar" });
    // Dueno sin turno abierto -> 409 TURNO_NO_ABIERTO; con turno -> reembolso 420.00; repetir -> 409
    expect(errorDe(await pedir("POST", `/api/ventas/${id}/cancelar`, dueno.token, { motivo: "se equivoco" })).codigo).toBe("TURNO_NO_ABIERTO");
    const cajaD = await nuevaCaja();
    const tD = (await pedir("POST", "/api/turnos", dueno.token, { caja_id: cajaD, fondo_inicial: "0.00" })).json<{ id: string }>();
    const c = await pedir("POST", `/api/ventas/${id}/cancelar`, dueno.token, { motivo: "se equivoco" });
    expect(c.statusCode, c.body).toBe(200);
    expect(c.json()).toMatchObject({ venta: { id, estado: "cancelada" }, reembolso_efectivo: "420.00", reembolso_otros: "0.00" });
    expect(errorDe(await pedir("POST", `/api/ventas/${id}/cancelar`, dueno.token, { motivo: "otra" })).codigo).toBe("VENTA_YA_CANCELADA");
    expect((await pedir("GET", `/api/turnos/${tD.id}/resumen`, dueno.token)).json()).toMatchObject({ reembolsos: "420.00", efectivo_esperado: "-420.00" });

    // devolucion: 6 de las 24 piezas de otra venta -> 105.00 (420 * 6/24) de reembolso en el turno del Dueno
    const v2 = (await pedir("POST", "/api/ventas", cajero.token, { clave_idempotencia: randomUUID(), lineas: [{ presentacion_id: k.corona.caja, cantidad: 1 }], pagos: [{ metodo: "efectivo", monto: "420.00" }] })).json<{ venta_id: string }>().venta_id;
    const linea = (await pedir("GET", `/api/ventas/${v2}`, admin.token)).json().lineas[0].id as string;
    const claveDev = randomUUID();
    const dev = { clave_idempotencia: claveDev, motivo: "no vendio", lineas: [{ venta_linea_id: linea, piezas: 6, regresa_a_inventario: true }] };
    const d1 = await pedir("POST", `/api/ventas/${v2}/devoluciones`, dueno.token, dev);
    expect(d1.statusCode, d1.body).toBe(201);
    expect(d1.json()).toMatchObject({ total: "105.00", abono_credito: "0.00", reembolso_efectivo: "105.00" });
    expect((await pedir("POST", `/api/ventas/${v2}/devoluciones`, dueno.token, dev)).statusCode).toBe(200);
    expect(errorDe(await pedir("POST", `/api/ventas/${v2}/devoluciones`, dueno.token, { ...dev, clave_idempotencia: randomUUID(), lineas: [{ venta_linea_id: linea, piezas: 19, regresa_a_inventario: true }] })).codigo).toBe("DEVOLUCION_EXCEDE_VENDIDO");
    expect(errorDe(await pedir("POST", `/api/ventas/${v2}/cancelar`, dueno.token, { motivo: "x" })).codigo).toBe("VENTA_CON_DEVOLUCIONES");
    expect((await pedir("POST", `/api/ventas/${v2}/devoluciones`, cajero.token, dev)).statusCode).toBe(403);
    // un Repartidor (ventas.devolver, sin ventas.ver_todas) no devuelve una venta ajena: 404, igual que al consultarla
    const rep = await sesion("Repartidor");
    const ajena = await pedir("POST", `/api/ventas/${v2}/devoluciones`, rep.token, { ...dev, clave_idempotencia: randomUUID() });
    expect(ajena.statusCode).toBe(404);
    expect((await pedir("GET", `/api/ventas/${v2}`, rep.token)).statusCode).toBe(404);

    await pedir("POST", `/api/turnos/${tD.id}/cerrar`, dueno.token, { efectivo_contado: "0.00" }).catch(() => undefined);
    await pedir("POST", `/api/turnos/${tC.id}/cerrar`, cajero.token, { efectivo_contado: "0.00" });
  });
});

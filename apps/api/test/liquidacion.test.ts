import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar, errorDe, pool } from "./ayuda.js";
import { crearUsuarioF3, pedirCliente, activarCliente, pedirPersonal, snapshotF3, tokenF3, type CatalogoF3, type Snapshot } from "./ayuda-f3.js";
import { bodegaAntes, escenarioF6, limpiarF6, pedidoConfirmado, repartidorF6, rutaConPedidos, type BodegaAntes, type Dueno, type EscenarioF6, type RutaApi } from "./ayuda-f6.js";
import { clienteMx, conCredito, dineroMalo, hoyLocal, PNG, subir } from "./ayuda-f7.js";

// Antes de que `env.ts` se evalue: las fotos van a un directorio temporal, nunca a /datos/archivos.
const dir = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join: unir } = await import("node:path");
  const d = mkdtempSync(unir(tmpdir(), "chv-liq-"));
  process.env.ARCHIVOS_DIR = d;
  return d;
});

let app: FastifyInstance;
let antes: Snapshot;
let bodega: BodegaAntes;
let pedir: ReturnType<typeof pedirPersonal>;
let dueno: Dueno;
let rep: Dueno;
let e: EscenarioF6;

beforeAll(async () => {
  antes = await snapshotF3();
  bodega = await bodegaAntes();
  app = await crearApp();
  pedir = pedirPersonal(app);
  const u = await crearUsuarioF3("Dueño");
  dueno = { token: await entrar(app, u), id: u.id };
  rep = await repartidorF6(app);
  e = await escenarioF6(app, dueno, { n: 0 });
});
afterAll(async () => {
  await limpiarF6(app, antes, bodega);
  await cerrarPoolPruebas();
  rmSync(dir, { recursive: true, force: true });
});

const lineasDe = async (pedido: string) => (await pool.query<{ id: string; cantidad: number }>("select id::text as id, cantidad from app.pedido_linea where pedido_id = $1 order by numero", [pedido])).rows;

describe("flujo completo de una ruta con dinero (CONTRATOS §2.8, F7)", () => {
  it("iniciar con fondo -> entregar P1 parcial (201) y repetir (200) -> credito -> transferencia con comprobante -> abono en parada de cobro -> gasto -> no entregado -> terminar -> liquidacion 970.00 -> liquidar 960.00 = -10.00", async () => {
    const k: CatalogoF3 = e.k;
    const A = await clienteMx(app, dueno, 1);
    const C = await clienteMx(app, dueno, 2);
    const B = await clienteMx(app, dueno, 3);
    const D = await clienteMx(app, dueno, 4);
    await conCredito(app, dueno, C, "1000.00", 7);
    // D debe 300.00 vencido hace 10 dias: entra como parada de cobro
    const sal = await pedir("POST", `/api/clientes/${D.id}/saldo-inicial`, dueno.token, { monto: "300.00", vence_el: await hoyLocal(-10), concepto: "Libreta" });
    expect(sal.statusCode, sal.body).toBe(201);
    const P1 = await pedidoConfirmado(app, dueno, k, A.id, e.manana, [{ presentacion_id: k.corona.caja, cantidad: 1 }, { presentacion_id: k.corona.six, cantidad: 1 }]);
    const P2 = await pedidoConfirmado(app, dueno, k, C.id, e.manana, [{ presentacion_id: k.corona.six, cantidad: 1 }]);
    const P3 = await pedidoConfirmado(app, dueno, k, B.id, e.manana, [{ presentacion_id: k.corona.six, cantidad: 1 }]);
    const P4 = await pedidoConfirmado(app, dueno, k, C.id, e.manana, [{ presentacion_id: k.corona.six, cantidad: 2 }]);
    const ruta = await rutaConPedidos(app, dueno, e, rep.id, [P1, P2, P3, P4]);
    const cobro = await pedir("POST", `/api/rutas/${ruta.id}/cobros`, dueno.token, { cliente_id: D.id });
    expect(cobro.statusCode).toBe(200);
    expect((await pedir("POST", `/api/rutas/${ruta.id}/cobros`, dueno.token, { cliente_id: D.id })).statusCode).toBe(409); // PARADA_DUPLICADA
    const sug = await pedir("GET", `/api/rutas/${ruta.id}/sugerencias-cobro`, dueno.token);
    expect(sug.statusCode).toBe(200);
    expect((await pedir("POST", `/api/rutas/${ruta.id}/cargar`, dueno.token)).statusCode).toBe(200);

    // Iniciar con fondo
    const ini = await pedir("POST", `/api/rutas/${ruta.id}/iniciar`, rep.token, { fondo_inicial: "500.00" });
    expect(ini.statusCode).toBe(200);
    const turno = ini.json<{ turno: { id: string; fondo_inicial: string }; ruta: RutaApi }>();
    expect(turno.turno).toEqual({ id: expect.any(String), fondo_inicial: "500.00" });
    const paradaD = turno.ruta.paradas.find((p) => p.cliente.id === D.id)!;
    expect(paradaD).toMatchObject({ cliente: { saldo: "300.00", vencido: "300.00" } });
    expect((await pedir("GET", "/api/auth/yo", rep.token)).json().turno_abierto).toEqual({ id: turno.turno.id, tipo: "ruta", caja_id: null, ruta_id: ruta.id });

    // El repartidor puede usar /cobrar de su propio pedido (contexto + vista) y no el de otros
    const ctx = await pedir("GET", `/api/cobrar/contexto?pedido=${P1}`, rep.token);
    expect(ctx.statusCode).toBe(200);
    expect(ctx.json()).toMatchObject({ modo: "entrega", pedido: { id: P1, total: "530.00", entregable: true }, cliente: { id: A.id, saldo: "0.00", semaforo: { color: "verde" } }, turno: { id: turno.turno.id }, metodos: expect.arrayContaining(["efectivo", "credito"]) });
    expect(ctx.json().lineas).toHaveLength(2);
    const [lCaja, lSix] = await lineasDe(P1);
    const vista = await pedir("POST", "/api/cobrar/vista", rep.token, { pedido_id: P1, lineas: [{ pedido_linea_id: lSix!.id, cantidad_entregada: 0 }], pagos: [{ metodo: "efectivo", monto: null }], efectivo_recibido: "500.00" });
    expect(vista.statusCode).toBe(200);
    expect(vista.json()).toMatchObject({ total: "420.00", pagos: [{ metodo: "efectivo", monto: "420.00" }], pagado: "420.00", cambio: "80.00", falta: "0.00", cuadra: true });
    expect(dineroMalo(vista.json())).toEqual([]);
    expect((await pedir("GET", `/api/cobrar/contexto?pedido=${P1}`, (await repartidorF6(app)).token)).statusCode).toBe(403); // RUTA_AJENA

    // P1: parcial (solo la Caja) en efectivo
    const claveP1 = randomUUID();
    const cuerpoP1 = { clave_idempotencia: claveP1, lineas: [{ pedido_linea_id: lSix!.id, cantidad_entregada: 0 }], pagos: [{ metodo: "efectivo", monto: "420.00" }], efectivo_recibido: "500.00", recibio: "Doña Lupe" };
    const e1 = await pedir("POST", `/api/pedidos/${P1}/entregar`, rep.token, cuerpoP1);
    expect(e1.statusCode).toBe(201);
    expect(e1.json()).toMatchObject({ venta: { total: "420.00", cambio: "80.00" }, pedido: { id: P1, estado: "entregado", recibio: "Doña Lupe" }, saldo_cliente: { saldo: "0.00", vencido: "0.00", disponible: "0.00" }, aviso: { plantilla: "wa_nota_entrega", url: expect.stringContaining("https://wa.me/") } });
    expect(dineroMalo(e1.json())).toEqual([]);
    const e1b = await pedir("POST", `/api/pedidos/${P1}/entregar`, rep.token, cuerpoP1);
    expect(e1b.statusCode).toBe(200);
    expect(e1b.json().venta.id).toBe(e1.json().venta.id);
    expect((await pedir("POST", `/api/pedidos/${P1}/entregar`, rep.token, { ...cuerpoP1, recibio: "Otro" })).statusCode).toBe(409); // IDEMPOTENCIA_CONFLICTO
    expect(lCaja!.cantidad).toBe(1);

    // P2: a credito (C, limite 1000): CxC 110.00
    const e2 = await pedir("POST", `/api/pedidos/${P2}/entregar`, rep.token, { clave_idempotencia: randomUUID(), pagos: [{ metodo: "credito", monto: "110.00" }] });
    expect(e2.statusCode).toBe(201);
    expect(e2.json().saldo_cliente).toEqual({ saldo: "110.00", vencido: "0.00", disponible: "890.00" });
    // P3: transferencia con comprobante subido
    const foto = await subir(app, rep.token, PNG, "recibo.jpg");
    expect(foto.statusCode, foto.body).toBe(201);
    const comprobante = foto.json<{ comprobante: string }>().comprobante;
    expect(comprobante).toMatch(/^[0-9a-f]{64}\.png$/);
    const e3 = await pedir("POST", `/api/pedidos/${P3}/entregar`, rep.token, { clave_idempotencia: randomUUID(), pagos: [{ metodo: "transferencia", monto: "110.00", referencia: "ABC123", comprobante }] });
    expect(e3.statusCode).toBe(201);
    // un pago de 0.00 no es un pago (400 por validacion); el limite de credito se prueba en test/ventas.test.ts
    const cero = await pedir("POST", `/api/pedidos/${P4}/entregar`, rep.token, { clave_idempotencia: randomUUID(), pagos: [{ metodo: "credito", monto: "220.00" }, { metodo: "efectivo", monto: "0.00" }] });
    expect(cero.statusCode).toBe(400);

    // El repartidor ve la cuenta de D desde su parada (contexto de abono) y sus pendientes; la de un cliente que no esta en su ruta, no
    const cd = await pedir("GET", `/api/cobrar/contexto?cliente=${D.id}&parada=${paradaD.id}`, rep.token);
    expect(cd.statusCode, cd.body).toBe(200);
    expect(cd.json()).toMatchObject({ modo: "abono", cliente: { id: D.id, saldo: "300.00", vencido: "300.00" }, parada: { id: paradaD.id }, turno: { id: turno.turno.id }, cuentas: [{ concepto: "Libreta", saldo: "300.00" }] });
    expect((await pedir("GET", `/api/cobrar/contexto?cliente=${(await clienteMx(app, dueno, 9)).id}`, rep.token)).statusCode).toBe(404);
    // Abono en la parada de cobro de D: efectivo 200.00 (cobro con parada de la ruta del repartidor)
    const abono = await pedir("POST", "/api/abonos", rep.token, { clave_idempotencia: randomUUID(), cliente_id: D.id, metodo: "efectivo", monto: "200.00", ruta_parada_id: paradaD.id });
    expect(abono.statusCode).toBe(201);
    expect(abono.json()).toMatchObject({ saldo_cliente: { saldo: "100.00" }, aplicaciones: [{ monto: "200.00" }] });
    // El repartidor no cancela abonos ni liquida
    expect((await pedir("POST", `/api/abonos/${abono.json().id}/cancelar`, rep.token, { motivo: "x" })).statusCode).toBe(403);

    // Gasto: salida con clave en el turno de ruta; repetir -> misma fila (200)
    const gasto = { clave_idempotencia: randomUUID(), tipo: "salida", monto: "150.00", motivo: "Gasolina" };
    const g1 = await pedir("POST", `/api/turnos/${turno.turno.id}/movimientos`, rep.token, gasto);
    expect(g1.statusCode).toBe(201);
    const g2 = await pedir("POST", `/api/turnos/${turno.turno.id}/movimientos`, rep.token, gasto);
    expect(g2.statusCode).toBe(200);
    expect(g2.json().id).toBe(g1.json().id);

    // No entregado P4 y terminar
    const paradaP4 = turno.ruta.paradas.find((p) => p.pedido?.id === P4)!;
    expect((await pedir("POST", `/api/rutas/paradas/${paradaP4.id}/no-entregado`, rep.token, { motivo: "no_estaba" })).statusCode).toBe(200);
    expect((await pedir("POST", `/api/rutas/${ruta.id}/terminar`, rep.token)).statusCode).toBe(200);

    // Liquidacion: esperado = 500 + 420 + 200 - 150 = 970.00
    const liq = await pedir("GET", `/api/rutas/${ruta.id}/liquidacion`, rep.token);
    expect(liq.statusCode).toBe(200);
    expect(liq.json()).toMatchObject({
      ventas: { num: 3, canceladas: 0, efectivo: "420.00", transferencia: "110.00", tarjeta: "0.00", credito: "110.00" }, abonos: { efectivo: "200.00" }, salidas: "150.00", efectivo_esperado: "970.00",
      transferencias: [{ folio: expect.any(String), cliente: B.nombre, monto: "110.00", referencia: "ABC123", comprobante, verificado: false }],
      devoluciones_producto: [{ producto: k.corona.nombre, piezas: expect.any(Number) }], movimientos: [{ tipo: "salida", monto: "150.00", motivo: "Gasolina" }], ruta: { id: ruta.id, estado: "terminada" },
    });
    expect(dineroMalo(liq.json())).toEqual([]);
    expect(liq.json().transferencias[0].comprobante).toBe(comprobante);

    // Liquidar: el repartidor -> 403 SIN_PERMISO rutas.liquidar; el dueno con 960.00 -> -10.00
    const sin = await pedir("POST", `/api/rutas/${ruta.id}/liquidar`, rep.token, { efectivo_contado: "960.00" });
    expect(sin.statusCode).toBe(403);
    expect(errorDe(sin)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "rutas.liquidar" } });
    const fin = await pedir("POST", `/api/rutas/${ruta.id}/liquidar`, dueno.token, { efectivo_contado: "960.00", notas: "faltaron 10" });
    expect(fin.statusCode).toBe(200);
    expect(fin.json()).toMatchObject({ efectivo_esperado: "970.00", efectivo_contado: "960.00", diferencia: "-10.00", estado: "cerrado", ruta: { estado: "liquidada" } });
    const otra = await pedir("POST", `/api/rutas/${ruta.id}/liquidar`, dueno.token, { efectivo_contado: "1.00" });
    expect(otra.statusCode).toBe(200);
    expect(otra.json().diferencia).toBe("-10.00");
    expect((await pedir("GET", "/api/auth/yo", rep.token)).json().turno_abierto).toBeNull();

    // el comprobante: el repartidor no lo lee; el dueno si; nombre malo -> 404
    expect((await pedir("GET", `/api/comprobantes/${comprobante}`, rep.token)).statusCode).toBe(403);
    const img = await pedir("GET", `/api/comprobantes/${comprobante}`, dueno.token);
    expect(img.statusCode).toBe(200);
    expect(img.headers["cache-control"]).toBe("private, no-store");
    expect(img.headers["content-type"]).toBe("image/png");
    expect((await pedir("GET", "/api/comprobantes/..%2Fx.png", dueno.token)).statusCode).toBe(404);

    // Estado de cuenta del cliente C: panel (cobranza.ver) = enlace del cliente (mismo saldo_final); credito de /publico/cliente
    const ec = await pedir("GET", `/api/clientes/${C.id}/estado-cuenta`, dueno.token);
    expect(ec.statusCode).toBe(200);
    expect(ec.json()).toMatchObject({ saldo_final: "110.00", cliente: { id: C.id }, vencido: "0.00" });
    const cli = await activarCliente(app, C);
    const publico = pedirCliente(app);
    const ecp = await publico("GET", "/api/publico/estado-cuenta", cli);
    expect(ecp.statusCode).toBe(200);
    expect(ecp.json().saldo_final).toBe(ec.json().saldo_final);
    expect((await publico("GET", "/api/publico/cliente", cli)).json().credito).toEqual({ limite: "1000.00", saldo: "110.00", disponible: "890.00" });

    // Esa ruta ya liquidada: el repartidor ya no ve estado de cuenta ajeno (ruta no en curso) -> 404
    expect((await pedir("GET", `/api/clientes/${C.id}/estado-cuenta`, rep.token)).statusCode).toBe(404);
    // Resumen del dia del dueno: ganancia con costos.ver; el Administrador no la trae
    const r1 = await pedir("GET", "/api/cierre/resumen", dueno.token);
    expect(r1.statusCode).toBe(200);
    expect(r1.json()).toHaveProperty("ganancia");
    expect(dineroMalo(r1.json())).toEqual([]);
    const r2 = await pedir("GET", "/api/cierre/resumen", await tokenF3(app, "Administrador"));
    expect(r2.statusCode).toBe(200);
    expect(r2.json()).not.toHaveProperty("ganancia");
    expect((await pedir("GET", "/api/cierre/resumen", rep.token)).statusCode).toBe(403);
  });
});

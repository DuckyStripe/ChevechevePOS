import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar, errorDe, pool } from "./ayuda.js";
import { clienteConEnlace, crearUsuarioF3, limpiarF3, pedirPersonal, snapshotF3, type ClienteF3, type Snapshot } from "./ayuda-f3.js";
import { dineroMalo, hoyLocal } from "./ayuda-f7.js";

let app: FastifyInstance;
let antes: Snapshot;
let pedir: ReturnType<typeof pedirPersonal>;
let dueno: { token: string; id: string };
let admin: { token: string; id: string };
let cajero: { token: string; id: string };
let repartidor: { token: string; id: string };
let E: ClienteF3;

const sesion = async (rol: "Dueño" | "Cajero" | "Administrador" | "Repartidor") => {
  const u = await crearUsuarioF3(rol);
  return { token: await entrar(app, u), id: u.id };
};

beforeAll(async () => {
  antes = await snapshotF3();
  app = await crearApp();
  pedir = pedirPersonal(app);
  dueno = await sesion("Dueño");
  admin = await sesion("Administrador");
  cajero = await sesion("Cajero");
  repartidor = await sesion("Repartidor");
  E = await clienteConEnlace(app, dueno);
});
afterAll(async () => {
  await limpiarF3(app, antes);
  await cerrarPoolPruebas();
});

describe("cuentas por cobrar, abonos y transferencias", () => {
  it("saldo inicial (solo clientes.credito) -> cuentas con dias vencida y semaforo; el saldo aparece en /clientes con ?con_saldo y en el detalle", async () => {
    const mal = [{ monto: "0", vence_el: await hoyLocal(), concepto: "x" }, { monto: "10.00", vence_el: await hoyLocal(), concepto: "" }, { monto: "10.001", vence_el: await hoyLocal(), concepto: "x" }];
    for (const m of mal) expect((await pedir("POST", `/api/clientes/${E.id}/saldo-inicial`, dueno.token, m)).statusCode, JSON.stringify(m)).toBe(400);
    expect((await pedir("POST", `/api/clientes/${E.id}/saldo-inicial`, cajero.token, { monto: "10.00", vence_el: await hoyLocal(), concepto: "x" })).statusCode).toBe(403);
    expect((await pedir("POST", `/api/clientes/${E.id}/saldo-inicial`, dueno.token, { monto: "300.00", vence_el: await hoyLocal(-10), concepto: "Libreta" })).json()).toMatchObject({ origen: "saldo_inicial", monto: "300.00", saldo: "300.00", estado: "pendiente" });
    expect((await pedir("POST", `/api/clientes/${E.id}/saldo-inicial`, dueno.token, { monto: "200.00", vence_el: await hoyLocal(5), concepto: "Libreta 2" })).statusCode).toBe(201);

    const cxc = await pedir("GET", `/api/cuentas-por-cobrar?cliente_id=${E.id}`, cajero.token);
    expect(cxc.statusCode).toBe(200);
    expect(cxc.json().items).toMatchObject([
      { origen: "saldo_inicial", concepto: "Libreta", monto: "300.00", saldo: "300.00", dias_vencida: 10, semaforo: "rojo", cliente: { id: E.id, nombre: E.nombre } },
      { concepto: "Libreta 2", saldo: "200.00", dias_vencida: 0, semaforo: "rojo" },
    ]);
    expect(dineroMalo(cxc.json().items)).toEqual([]);
    expect((await pedir("GET", `/api/cuentas-por-cobrar?cliente_id=${E.id}&vencidas=true`, admin.token)).json().items).toHaveLength(1);
    expect((await pedir("GET", "/api/cuentas-por-cobrar", repartidor.token)).statusCode).toBe(403);

    const lista = await pedir("GET", `/api/clientes?con_saldo=true&buscar=${encodeURIComponent(E.nombre)}`, admin.token);
    expect(lista.json().items).toMatchObject([{ id: E.id, saldo: "500.00", vencido: "300.00" }]);
    const det = await pedir("GET", `/api/clientes/${E.id}`, admin.token);
    expect(det.json()).toMatchObject({ saldo: "500.00", vencido: "300.00", disponible: "0.00", semaforo: { color: "rojo", max_dias_vencido: 10, limite_sugerido: expect.stringMatching(/^\d+\.\d{2}$/) } });
    expect(dineroMalo(det.json())).toEqual([]);
  });

  it("abonos: FIFO con aplicaciones, idempotente (201/200), exceso -> ABONO_EXCEDE_SALDO, efectivo sin turno -> TURNO_NO_ABIERTO; transferencia sin turno si", async () => {
    const claveEf = randomUUID();
    const base = { cliente_id: E.id, metodo: "efectivo", monto: "50.00" };
    expect(errorDe(await pedir("POST", "/api/abonos", cajero.token, { clave_idempotencia: claveEf, ...base })).codigo).toBe("TURNO_NO_ABIERTO");
    const clave = randomUUID();
    const t = { clave_idempotencia: clave, cliente_id: E.id, metodo: "transferencia", monto: "400.00", referencia: "SPEI9" };
    const a1 = await pedir("POST", "/api/abonos", cajero.token, t);
    expect(a1.statusCode, a1.body).toBe(201);
    expect(a1.json()).toMatchObject({ folio: expect.stringMatching(/^A-/), monto: "400.00", aplicaciones: [{ monto: "300.00" }, { monto: "100.00" }], saldo_cliente: { saldo: "100.00", vencido: "0.00" } });
    expect(dineroMalo(a1.json())).toEqual([]);
    const a2 = await pedir("POST", "/api/abonos", cajero.token, t);
    expect(a2.statusCode).toBe(200);
    expect(a2.json().id).toBe(a1.json().id);
    expect(errorDe(await pedir("POST", "/api/abonos", cajero.token, { ...t, monto: "399.00" })).codigo).toBe("IDEMPOTENCIA_CONFLICTO");
    expect(errorDe(await pedir("POST", "/api/abonos", cajero.token, { ...t, clave_idempotencia: randomUUID(), monto: "600.00" })).codigo).toBe("ABONO_EXCEDE_SALDO");
    expect(errorDe(await pedir("POST", "/api/abonos", cajero.token, { ...t, clave_idempotencia: randomUUID(), monto: "10.00", cuentas: [{ cuenta_por_cobrar_id: "999999999", monto: "10.00" }] })).codigo).toBe("CUENTA_NO_VALIDA");
    // Repartidor: cobranza.abonar, pero sin parada solo a quien ve: un cliente que no esta en su ruta es 404 y no revela su saldo
    const ajeno = await pedir("POST", "/api/abonos", repartidor.token, { ...t, clave_idempotencia: randomUUID(), monto: "1.00" });
    expect(ajeno.statusCode).toBe(404);
    expect(ajeno.body).not.toContain("saldo");
    expect((await pedir("POST", "/api/abonos", (await sesion("Almacenista" as never)).token, t)).statusCode).toBe(403);

    const lista = await pedir("GET", `/api/abonos?cliente_id=${E.id}&metodo=transferencia&verificado=false`, admin.token);
    expect(lista.statusCode).toBe(200);
    expect(lista.json().items.find((x: { id: string }) => x.id === a1.json().id)).toMatchObject({ folio: a1.json().folio, cliente: { id: E.id }, metodo: "transferencia", monto: expect.stringMatching(/^\d+\.\d{2}$/), estado: "aplicado", verificado: false });
    expect((await pedir("GET", "/api/abonos", repartidor.token)).statusCode).toBe(403);
  });

  it("transferencias: solo cobranza.verificar; verificar es 204 y se repite sin error; el id de otra cosa -> 404; cancelar abono solo el Dueno y devuelve el saldo", async () => {
    const lista = await pedir("GET", "/api/transferencias?verificado=false", admin.token);
    expect(lista.statusCode).toBe(200);
    const fila = lista.json().items.find((x: { cliente: string; monto: string }) => x.cliente === E.nombre && x.monto === "400.00");
    expect(fila).toMatchObject({ tabla: "abono", id: expect.any(String), folio: expect.stringMatching(/^A-/), referencia: "SPEI9", comprobante: null, ruta: null, verificado_en: null });
    expect((await pedir("GET", "/api/transferencias", cajero.token)).statusCode).toBe(403);
    expect((await pedir("POST", "/api/transferencias/verificar", cajero.token, { tabla: "abono", id: fila.id })).statusCode).toBe(403);
    expect((await pedir("POST", "/api/transferencias/verificar", admin.token, { tabla: "abono", id: fila.id })).statusCode).toBe(204);
    expect((await pedir("POST", "/api/transferencias/verificar", admin.token, { tabla: "abono", id: fila.id })).statusCode).toBe(204);
    expect((await pedir("POST", "/api/transferencias/verificar", admin.token, { tabla: "abono", id: "999999999" })).statusCode).toBe(404);
    expect((await pedir("POST", "/api/transferencias/verificar", admin.token, { tabla: "otra", id: fila.id })).statusCode).toBe(400);
    expect((await pedir("GET", "/api/transferencias?verificado=true", admin.token)).json().items.map((x: { id: string }) => x.id)).toContain(fila.id);

    const prohibido = await pedir("POST", `/api/abonos/${fila.id}/cancelar`, admin.token, { motivo: "x" });
    expect(prohibido.statusCode).toBe(403);
    expect(errorDe(prohibido).detalles).toEqual({ permiso: "cobranza.cancelar_abono" });
    const ok = await pedir("POST", `/api/abonos/${fila.id}/cancelar`, dueno.token, { motivo: "se equivocaron" });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json()).toMatchObject({ estado: "cancelado", motivo_cancelacion: "se equivocaron" });
    expect(errorDe(await pedir("POST", `/api/abonos/${fila.id}/cancelar`, dueno.token, { motivo: "otra" })).codigo).toBe("ABONO_YA_CANCELADO");
    expect((await pedir("GET", `/api/clientes/${E.id}/estado-cuenta`, admin.token)).json()).toMatchObject({ saldo_final: "500.00" });
  });
});

describe("estado de cuenta, contexto de cobro y avisos de saldo", () => {
  it("estado de cuenta: cobranza.ver lo ve; el repartidor solo si el cliente esta en su ruta en curso (si no 404); trae cliente y negocio", async () => {
    const ec = await pedir("GET", `/api/clientes/${E.id}/estado-cuenta`, cajero.token);
    expect(ec.statusCode).toBe(200);
    expect(ec.json()).toMatchObject({ cliente: { id: E.id, nombre: E.nombre }, negocio: { nombre: expect.anything() }, saldo_inicial: "0.00", saldo_final: "500.00", vencido: "300.00" });
    expect(ec.json().movimientos.map((m: { tipo: string }) => m.tipo)).toEqual(["saldo_inicial", "saldo_inicial"]); // el abono cancelado no aparece
    expect(dineroMalo(ec.json())).toEqual([]);
    expect((await pedir("GET", `/api/clientes/${E.id}/estado-cuenta?desde=${await hoyLocal(1)}`, cajero.token)).json()).toMatchObject({ saldo_inicial: "500.00", movimientos: [] });
    expect((await pedir("GET", `/api/clientes/${E.id}/estado-cuenta`, repartidor.token)).statusCode).toBe(404);
    expect((await pedir("GET", "/api/clientes/999999999/estado-cuenta", dueno.token)).statusCode).toBe(404);
    expect((await pedir("GET", `/api/clientes/${E.id}/estado-cuenta?desde=ayer`, dueno.token)).statusCode).toBe(400);
  });

  it("GET /cobrar/contexto?cliente=: cuentas pendientes con folio o concepto, semaforo y metodos sin credito; el repartidor ajeno -> 404; parametros mal -> 400", async () => {
    const c = await pedir("GET", `/api/cobrar/contexto?cliente=${E.id}`, cajero.token);
    expect(c.statusCode).toBe(200);
    expect(c.json()).toMatchObject({ modo: "abono", cliente: { id: E.id, saldo: "500.00", semaforo: { color: expect.any(String) } }, parada: null, turno: null, metodos: ["efectivo", "transferencia", "tarjeta"] });
    expect(c.json().cuentas).toMatchObject([{ concepto: "Libreta", saldo: "300.00", dias_vencida: 10, venta_folio: null }, { concepto: "Libreta 2", saldo: "200.00", dias_vencida: 0 }]);
    expect(dineroMalo(c.json())).toEqual([]);
    expect((await pedir("GET", `/api/cobrar/contexto?cliente=${E.id}`, repartidor.token)).statusCode).toBe(404);
    expect((await pedir("GET", `/api/cobrar/contexto?cliente=${E.id}&parada=1`, cajero.token)).statusCode).toBe(404);
    expect((await pedir("GET", "/api/cobrar/contexto", cajero.token)).statusCode).toBe(400);
    expect((await pedir("GET", `/api/cobrar/contexto?cliente=${E.id}&pedido=1`, cajero.token)).statusCode).toBe(400);
    expect((await pedir("GET", `/api/cobrar/contexto?cliente=${E.id}`, (await sesion("Dueño")).token)).statusCode).toBe(200);
  });

  it("avisos: estado de cuenta y recordatorio traen saldo y el enlace con ?ir=estado-cuenta; el resumen del dia va solo al dueno, una vez al dia, y solo con reportes y costos", async () => {
    const aviso = await pedir("POST", "/api/avisos", admin.token, { clave_idempotencia: randomUUID(), cliente_id: E.id, plantilla: "wa_estado_cuenta" });
    expect(aviso.statusCode, aviso.body).toBe(201);
    expect(aviso.json().texto).toContain("500.00");
    expect(aviso.json().texto).toMatch(/\/p\/[^ ?]+\?ir=estado-cuenta/);
    const rec = await pedir("POST", "/api/avisos", admin.token, { clave_idempotencia: randomUUID(), cliente_id: E.id, plantilla: "wa_recordatorio_saldo" });
    expect(rec.json().texto).toContain("500.00");

    expect((await pedir("POST", "/api/avisos", admin.token, { plantilla: "wa_resumen_dia" })).statusCode).toBe(403); // sin costos.ver
    const r1 = await pedir("POST", "/api/avisos", dueno.token, { plantilla: "wa_resumen_dia", usuario_id: "1" });
    expect(r1.statusCode, r1.body).toBe(201);
    expect(r1.json()).toMatchObject({ plantilla: "wa_resumen_dia", cliente: null, texto: expect.stringContaining("Resumen del") });
    const r2 = await pedir("POST", "/api/avisos", dueno.token, { plantilla: "wa_resumen_dia", fecha: await hoyLocal() });
    expect(r2.statusCode).toBe(200);
    expect(r2.json().id).toBe(r1.json().id);
    const destino = (await pool.query<{ usuario_id: string }>("select usuario_id::text as usuario_id from app.aviso_cliente where id = $1", [r1.json().id])).rows[0]!.usuario_id;
    expect(destino).toBe(dueno.id);
    // solo su destinatario lo ve
    expect((await pedir("GET", "/api/avisos", dueno.token)).json().items.map((x: { id: string }) => x.id)).toContain(r1.json().id);
    expect((await pedir("GET", "/api/avisos", admin.token)).json().items.map((x: { id: string }) => x.id)).not.toContain(r1.json().id);
    expect((await pedir("POST", `/api/avisos/${r1.json().id}/enviado`, admin.token)).statusCode).toBe(404);
  });
});

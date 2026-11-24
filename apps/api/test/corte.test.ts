import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar, errorDe, pool } from "./ayuda.js";
import { crearUsuarioF3, limpiarF3, pedirPersonal, snapshotF3, type Snapshot } from "./ayuda-f3.js";
import type { Dueno } from "./ayuda-f6.js";
import { dineroMalo } from "./ayuda-f7.js";
import { catalogoF8, clientesF8, turnoMostrador, vender } from "./ayuda-f8.js";

let app: FastifyInstance;
let antes: Snapshot;
let pedir: ReturnType<typeof pedirPersonal>;
let dueno: Dueno;
let admin: Dueno;

const sesion = async (rol: "Dueño" | "Cajero" | "Administrador"): Promise<Dueno> => {
  const u = await crearUsuarioF3(rol);
  return { id: u.id, token: await entrar(app, u) };
};

beforeAll(async () => {
  antes = await snapshotF3();
  app = await crearApp();
  pedir = pedirPersonal(app);
  dueno = await sesion("Dueño");
  admin = await sesion("Administrador");
});
afterAll(async () => {
  await limpiarF3(app, antes);
  await cerrarPoolPruebas();
});

describe("corte de caja", () => {
  it("esperado 1205.00 (1000 + 105 + 400 + 250 + 18 - 18 - 500 - 50); cancelar: Administrador 403 SIN_PERMISO, Dueno 200 y sale del corte; cerrar con 1200.00 = -5.00; cerrar otra vez 409", async () => {
    const k = await catalogoF8(app, dueno.token);
    const { C } = await clientesF8(app, dueno, k);
    const turno = await turnoMostrador(app, dueno.token, dueno.token, "1000.00");
    const efectivo = (monto: string) => [{ metodo: "efectivo" as const, monto }];
    const unidad = (presentacion_id: string) => [{ presentacion_id, cantidad: 1 }];

    expect((await vender(app, dueno.token, { lineas: unidad(k.corona.six), pagos: efectivo("105.00") })).statusCode).toBe(201);
    expect((await vender(app, dueno.token, { lineas: unidad(k.corona.caja), pagos: efectivo("400.00") })).statusCode).toBe(201);
    const mixta = await vender(app, dueno.token, { cliente_id: C.id, lineas: unidad(k.corona.caja), pagos: [...efectivo("250.00"), { metodo: "credito", monto: "150.00" }] });
    expect(mixta.statusCode, mixta.body).toBe(201);
    const pieza = await vender(app, dueno.token, { lineas: unidad(k.corona.pieza), pagos: efectivo("18.00") });
    expect(pieza.statusCode, pieza.body).toBe(201);
    const piezaId = pieza.json<{ venta_id: string }>().venta_id;

    // cancelar: solo el Dueno; la Administradora recibe 403 con el permiso que falta
    const noPuede = await pedir("POST", `/api/ventas/${piezaId}/cancelar`, admin.token, { motivo: "se equivoco" });
    expect(noPuede.statusCode).toBe(403);
    expect(errorDe(noPuede)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "ventas.cancelar" } });
    const cancela = await pedir("POST", `/api/ventas/${piezaId}/cancelar`, dueno.token, { motivo: "se equivoco" });
    expect(cancela.statusCode, cancela.body).toBe(200);
    expect(cancela.json()).toMatchObject({ venta: { id: piezaId, estado: "cancelada" }, reembolso_efectivo: "18.00", reembolso_otros: "0.00" });

    expect((await pedir("POST", `/api/turnos/${turno}/movimientos`, dueno.token, { clave_idempotencia: randomUUID(), tipo: "retiro", monto: "500.00", motivo: "Al banco" })).statusCode).toBe(201);
    expect((await pedir("POST", `/api/turnos/${turno}/movimientos`, dueno.token, { clave_idempotencia: randomUUID(), tipo: "salida", monto: "50.00", motivo: "Bolsas" })).statusCode).toBe(201);

    const res = await pedir("GET", `/api/turnos/${turno}/resumen`, dueno.token);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      efectivo_esperado: "1205.00", fondo_inicial: "1000.00", retiros: "500.00", salidas: "50.00", reembolsos: "18.00",
      ventas: { num: 3, canceladas: 1, efectivo: "773.00", credito: "150.00" },
    });
    expect(dineroMalo(res.json())).toEqual([]);

    const cierre = await pedir("POST", `/api/turnos/${turno}/cerrar`, dueno.token, { efectivo_contado: "1200.00" });
    expect(cierre.statusCode, cierre.body).toBe(200);
    expect(cierre.json()).toMatchObject({ estado: "cerrado", efectivo_esperado: "1205.00", efectivo_contado: "1200.00", diferencia: "-5.00" });
    const otra = await pedir("POST", `/api/turnos/${turno}/cerrar`, dueno.token, { efectivo_contado: "1200.00" });
    expect(otra.statusCode).toBe(409);
    expect(errorDe(otra).codigo).toBe("TURNO_NO_ABIERTO");
  });

  it("corte supervisado: el Administrador (caja.supervisar) cierra el turno de un Cajero (cerrado_por = el); otro Cajero 403 TURNO_AJENO", async () => {
    const k = await catalogoF8(app, dueno.token);
    const c1 = await sesion("Cajero");
    const c2 = await sesion("Cajero");
    const turno = await turnoMostrador(app, dueno.token, c1.token, "200.00");
    expect((await vender(app, c1.token, { lineas: [{ presentacion_id: k.corona.six, cantidad: 1 }], pagos: [{ metodo: "efectivo", monto: "105.00" }] })).statusCode).toBe(201);

    const ajeno = await pedir("POST", `/api/turnos/${turno}/cerrar`, c2.token, { efectivo_contado: "305.00" });
    expect(ajeno.statusCode).toBe(403);
    expect(errorDe(ajeno).codigo).toBe("TURNO_AJENO");
    const sigue = await pool.query<{ estado: string }>("select estado from app.turno_caja where id = $1", [turno]);
    expect(sigue.rows[0]!.estado).toBe("abierto");

    const r = await pedir("POST", `/api/turnos/${turno}/cerrar`, admin.token, { efectivo_contado: "300.00" });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ estado: "cerrado", efectivo_esperado: "305.00", diferencia: "-5.00" });
    const fila = await pool.query<{ cerrado_por: string }>("select cerrado_por::text as cerrado_por from app.turno_caja where id = $1", [turno]);
    expect(fila.rows[0]!.cerrado_por).toBe(admin.id);
  });
});

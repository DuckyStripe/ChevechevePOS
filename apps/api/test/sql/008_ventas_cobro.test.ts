import { spawnSync } from "node:child_process";
import type pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { enTransaccion, error, pool, ROL } from "./ayuda.js";
import {
  abonar, borrarDesde, clienteCredito, credito, devolver, dia, efectivo, entregar, entregasBase, errorConDetalle, existenciaYKardex,
  fechar, fila, juego, lin, lineaPedido, marcarAgua, ROL3, resumenDia, saldoInicial, transferencia, turnoMostrador, usuarioF3, vender,
  type Juego,
} from "./ayuda-cobro.js";
import { pedido } from "./ayuda-pedidos.js";
import { pedidoConfirmado, repartidor, rutaCon } from "./ayuda-rutas.js";

afterAll(() => pool.end());

const q = (c: pg.PoolClient, sql: string, params: unknown[] = []) => c.query(sql, params).then((r) => r.rows);
const saldo = async (c: pg.PoolClient, cli: string) =>
  fila<{ saldo: string; vencido: string; max_dias_vencido: number; cuentas_pendientes: number; disponible: string }>(
    c, "select saldo::text, vencido::text, max_dias_vencido, cuentas_pendientes, disponible::text from app.v_saldo_cliente where cliente_id = $1", [cli]);
const resumen = async (c: pg.PoolClient, turno: string) => (await c.query("select app.fn_resumen_turno($1) as r", [turno])).rows[0].r;
const cerrarRuta = async (c: pg.PoolClient, j: Juego) => {
  await c.query("select app.fn_terminar_ruta($1, $2)", [j.rep, j.ruta]);
};

describe("migracion 008", () => {
  it("000-008 aplicadas; re-correr no aplica nada; las 5 funciones rehechas (y fn_puede_ver_aviso) tienen una sola sobrecarga; semilla Mostrador", async () => {
    const r = await pool.query("select archivo from app.migraciones order by archivo");
    expect(r.rows.map((x) => x.archivo)).toEqual(expect.arrayContaining([
      "000_base.sql", "001_auth.sql", "002_catalogo_inventario.sql", "003_compras.sql", "004_clientes_pedidos.sql", "006_surtido.sql", "007_rutas.sql", "008_ventas_cobro.sql"]));
    const p = spawnSync(process.execPath, ["scripts/migrar.mjs"], { encoding: "utf8", env: process.env });
    expect(p.stdout).toContain("nada pendiente");
    expect(p.status).toBe(0);
    for (const f of ["fn_iniciar_ruta", "fn_terminar_ruta", "fn_puede_ver_aviso", "fn_seguimiento_pedido", "fn_truncate_bloqueado"]) {
      const n = await pool.query("select count(*)::int as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'app' and p.proname = $1", [f]);
      expect(n.rows[0].n, f).toBe(1);
    }
    const caja = await pool.query("select nombre, sucursal_id::int as s, activa from app.caja where nombre = 'Mostrador'");
    expect(caja.rows).toEqual([{ nombre: "Mostrador", s: 1, activa: true }]);
  });

  it("14 permisos: Dueno todos; Administrador todos menos ventas.cambiar_precio, ventas.cancelar y cobranza.cancelar_abono; Repartidor y Cajero segun la matriz; Almacenista ninguno", async () => {
    await enTransaccion(async (c) => {
      const todos = ["ventas.crear", "ventas.ver", "ventas.ver_todas", "ventas.cambiar_precio", "ventas.credito", "ventas.cancelar", "ventas.devolver",
        "caja.operar", "caja.supervisar", "cobranza.ver", "cobranza.abonar", "cobranza.cancelar_abono", "cobranza.verificar", "reportes.ver"];
      expect((await c.query("select codigo from app.permiso where codigo = any($1)", [todos])).rowCount).toBe(14);
      const de = async (rol: string) => (await c.query(
        "select rp.permiso_codigo from app.rol_permiso rp join app.rol r on r.id = rp.rol_id where r.nombre = $1 and rp.permiso_codigo = any($2)", [rol, todos]))
        .rows.map((x) => x.permiso_codigo as string).sort();
      expect(await de("Dueño")).toEqual([...todos].sort());
      expect(await de("Administrador")).toEqual(todos.filter((x) => !["ventas.cambiar_precio", "ventas.cancelar", "cobranza.cancelar_abono"].includes(x)).sort());
      expect(await de("Repartidor")).toEqual(["cobranza.abonar", "ventas.credito", "ventas.devolver", "ventas.ver"]);
      expect(await de("Cajero")).toEqual(["caja.operar", "cobranza.abonar", "cobranza.ver", "ventas.crear", "ventas.credito", "ventas.ver"]);
      expect(await de("Almacenista")).toEqual([]);
    });
  });
});

describe("turnos de caja y de ruta", () => {
  it("iniciar abre el turno de ruta con el fondo y lo guarda en la ruta; repetir devuelve el mismo turno sin filas nuevas", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const t = await fila<Record<string, string>>(c, "select tipo, ruta_id::text, usuario_id::text, estado, fondo_inicial::text from app.turno_caja where id = $1", [j.turno]);
      expect(t).toEqual({ tipo: "ruta", ruta_id: j.ruta, usuario_id: j.rep, estado: "abierto", fondo_inicial: "500.00" });
      expect((await fila(c, "select turno_caja_id::text as t from app.ruta where id = $1", [j.ruta])).t).toBe(j.turno);
      const otra = (await c.query("select app.fn_iniciar_ruta($1, $2, '999.00') as id", [j.rep, j.ruta])).rows[0].id;
      expect(otra).toBe(j.turno);
      expect((await fila<{ n: number }>(c, "select count(*)::int as n from app.turno_caja where ruta_id = $1", [j.ruta])).n).toBe(1);
      expect((await fila(c, "select fondo_inicial::text as f from app.turno_caja where id = $1", [j.turno])).f).toBe("500.00");
    });
  });

  it("repartidor con turno de mostrador abierto no puede iniciar (TURNO_YA_ABIERTO); fondo negativo -> VALIDACION", async () => {
    await enTransaccion(async (c) => {
      const admin = await usuarioF3(c, ROL.admin);
      await turnoMostrador(c, admin);
      const j = await juego(c);
      const hoy = j.hoy;
      const ped = await pedidoConfirmado(c, j.A, [lin(j.corona.six, 1)], hoy, j.dueno);
      const r = await rutaCon(c, [ped], { fecha: hoy, usuario: j.dueno, repartidor: admin });
      await c.query("select app.fn_cargar_ruta($1, $2)", [j.dueno, r.id]);
      expect((await error(c, () => c.query("select app.fn_iniciar_ruta($1, $2, '10.00')", [admin, r.id]))).message).toBe("TURNO_YA_ABIERTO");
      const rep2 = await repartidor(c);
      const ped2 = await pedidoConfirmado(c, j.B, [lin(j.corona.six, 1)], hoy, j.dueno);
      const r2 = await rutaCon(c, [ped2], { fecha: hoy, usuario: j.dueno, repartidor: rep2 });
      await c.query("select app.fn_cargar_ruta($1, $2)", [j.dueno, r2.id]);
      expect((await errorConDetalle(c, () => c.query("select app.fn_iniciar_ruta($1, $2, '-1.00')", [rep2, r2.id]))).detalle).toEqual({ campo: "fondo_inicial" });
    });
  });

  it("fn_abrir_turno: CAJA_OCUPADA, TURNO_YA_ABIERTO, caja inactiva, sin caja.operar; el fondo no puede ser negativo", async () => {
    await enTransaccion(async (c) => {
      const caja = (await c.query("insert into app.caja (sucursal_id, nombre) values (1, 'T1') returning id")).rows[0].id as string;
      const u1 = await usuarioF3(c, ROL3.cajero);
      const u2 = await usuarioF3(c, ROL3.cajero);
      const t = (await c.query("select app.fn_abrir_turno($1, $2, '100.00') as id", [u1, caja])).rows[0].id;
      expect(await fila(c, "select tipo, estado, caja_id::text as caja, fondo_inicial::text as f from app.turno_caja where id = $1", [t])).toEqual({ tipo: "mostrador", estado: "abierto", caja, f: "100.00" });
      expect((await error(c, () => c.query("select app.fn_abrir_turno($1, $2, '0')", [u2, caja]))).message).toBe("CAJA_OCUPADA");
      const otra = (await c.query("insert into app.caja (sucursal_id, nombre) values (1, 'T2') returning id")).rows[0].id;
      expect((await error(c, () => c.query("select app.fn_abrir_turno($1, $2, '0')", [u1, otra]))).message).toBe("TURNO_YA_ABIERTO");
      await c.query("update app.caja set activa = false where id = $1", [otra]);
      expect((await error(c, () => c.query("select app.fn_abrir_turno($1, $2, '0')", [u2, otra]))).message).toBe("NO_ENCONTRADO");
      const rep = await repartidor(c);
      expect((await errorConDetalle(c, () => c.query("select app.fn_abrir_turno($1, $2, '0')", [rep, otra]))).detalle).toEqual({ permiso: "caja.operar" });
      const nueva = (await c.query("insert into app.caja (sucursal_id, nombre) values (1, 'T3') returning id")).rows[0].id;
      expect((await errorConDetalle(c, () => c.query("select app.fn_abrir_turno($1, $2, '-5')", [u2, nueva]))).detalle).toEqual({ campo: "fondo_inicial" });
    });
  });

  it("gasto en ruta: salida con clave; repetir -> misma fila; otra clave con otro cuerpo -> IDEMPOTENCIA_CONFLICTO; turno ajeno -> TURNO_AJENO; monto y motivo validados", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const clave = "11111111-1111-4111-8111-111111111111";
      const mov = (u: string, turno: string, monto: string, motivo = "Gasolina", k: string | null = clave, h: string | null = "h1") =>
        c.query("select movimiento_id, repetida from app.fn_movimiento_caja($1, $2, 'salida', $3, $4, $5, $6)", [u, turno, monto, motivo, k, h]);
      const a = (await mov(j.rep, j.turno, "150.00")).rows[0];
      expect(a.repetida).toBe(false);
      const b = (await mov(j.rep, j.turno, "150.00")).rows[0];
      expect(b).toEqual({ movimiento_id: a.movimiento_id, repetida: true });
      expect((await fila<{ n: number }>(c, "select count(*)::int as n from app.movimiento_caja where turno_caja_id = $1", [j.turno])).n).toBe(1);
      expect((await error(c, () => mov(j.rep, j.turno, "99.00", "Gasolina", clave, "h2"))).message).toBe("IDEMPOTENCIA_CONFLICTO");
      const otro = await repartidor(c);
      expect((await error(c, () => mov(otro, j.turno, "10.00", "Caseta", null, null))).message).toBe("TURNO_AJENO");
      expect((await errorConDetalle(c, () => mov(j.rep, j.turno, "0", "Caseta", null, null))).detalle).toEqual({ campo: "monto" });
      expect((await errorConDetalle(c, () => mov(j.rep, j.turno, "10.00", "   ", null, null))).detalle).toEqual({ campo: "motivo" });
      expect((await error(c, () => c.query("select * from app.fn_movimiento_caja($1, $2, 'reembolso', 10, 'x')", [j.rep, j.turno]))).message).toBe("VALIDACION");
      expect((await resumen(c, j.turno)).salidas).toBe("150.00");
    });
  });
});

describe("entrega de pedidos", () => {
  it("entrega parcial: P1 con 1 de 2 Cajas, efectivo 400.00 con 500.00 -> venta 400.00, cambio 100.00, costo 300.00, un movimiento -24, aviso con clave de ruta, cliente ya compro", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const l1 = await lineaPedido(c, j.P1, j.corona.caja);
      const { venta_id } = await entregar(c, j.rep, j.P1, { lineas: [{ pedido_linea_id: l1, cantidad_entregada: 1 }], ...efectivo("400.00", "500.00") });
      const v = await fila<Record<string, string>>(c, `select total::text, efectivo_recibido::text as recibido, cambio::text, origen, estado, turno_caja_id::text as turno, folio, cliente_id::text as cliente, pedido_id::text as pedido
        from app.venta where id = $1`, [venta_id]);
      expect(v).toMatchObject({ total: "400.00", recibido: "500.00", cambio: "100.00", origen: "pedido", estado: "completada", turno: j.turno, cliente: j.A, pedido: j.P1 });
      expect(v.folio).toMatch(/^V-\d{6}$/);
      expect(await q(c, "select cantidad, importe::text, costo_total::text as costo, costo_unitario::text as cu, precio_unitario::text as pu from app.venta_linea where venta_id = $1", [venta_id]))
        .toEqual([{ cantidad: 1, importe: "400.00", costo: "300.00", cu: "12.500000", pu: "400.00" }]);
      expect(await q(c, "select metodo, monto::text from app.venta_pago where venta_id = $1", [venta_id])).toEqual([{ metodo: "efectivo", monto: "400.00" }]);
      const movs = await q(c, "select tipo, cantidad, existencia_resultante from app.movimiento_inventario where producto_id = $1 and tipo = 'venta'", [j.corona.id]);
      expect(movs).toEqual([{ tipo: "venta", cantidad: -24, existencia_resultante: 216 }]);
      expect(await fila(c, "select estado, venta_id::text as v from app.pedido where id = $1", [j.P1])).toEqual({ estado: "entregado", v: venta_id });
      expect(await fila(c, "select cantidad_entregada as e from app.pedido_linea where id = $1", [l1])).toEqual({ e: 1 });
      expect((await fila(c, "select estado from app.ruta_parada where id = $1", [j.parada[j.P1]!])).estado).toBe("visitada");
      expect((await fila<{ y: boolean }>(c, "select ya_compro as y from app.cliente where id = $1", [j.A])).y).toBe(true);
      const av = await q(c, "select clave, vars, estado from app.aviso_cliente where pedido_id = $1 and plantilla = 'wa_nota_entrega'", [j.P1]);
      expect(av).toHaveLength(1);
      expect(av[0].clave).toMatch(new RegExp(`^wa_nota_entrega:p${j.P1}:v\\d+:r${j.ruta}$`));
      expect(av[0].vars).toMatchObject({ total: "400.00", pagado: "400.00", saldo: "0.00" });
      expect((await q(c, "select tipo from app.pedido_evento where pedido_id = $1 order by id desc limit 1", [j.P1]))[0].tipo).toBe("entregado");
    });
  });

  it("idempotencia: misma clave y cuerpo -> repetida sin filas nuevas; misma clave con otro cuerpo -> IDEMPOTENCIA_CONFLICTO; otra clave con el pedido ya entregado -> ESTADO_NO_VALIDO", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const clave = "22222222-2222-4222-8222-222222222222";
      const a = await entregar(c, j.rep, j.P1, { clave, ...efectivo("800.00") });
      expect(a.repetida).toBe(false);
      const cuenta = () => fila<{ v: number; m: number; a: number }>(c, `select (select count(*) from app.venta where pedido_id = $1)::int as v,
        (select count(*) from app.movimiento_inventario where tipo = 'venta' and producto_id = $2)::int as m,
        (select count(*) from app.aviso_cliente where pedido_id = $1 and plantilla = 'wa_nota_entrega')::int as a`, [j.P1, j.corona.id]);
      const antes = await cuenta();
      const b = await entregar(c, j.rep, j.P1, { clave, ...efectivo("800.00") });
      expect(b).toEqual({ venta_id: a.venta_id, repetida: true });
      expect(await cuenta()).toEqual(antes);
      expect((await error(c, () => entregar(c, j.rep, j.P1, { clave, hash: "otro", ...efectivo("800.00") }))).message).toBe("IDEMPOTENCIA_CONFLICTO");
      expect((await error(c, () => entregar(c, j.rep, j.P1, efectivo("800.00")))).message).toBe("ESTADO_NO_VALIDO");
      expect(await cuenta()).toEqual(antes);
    });
  });

  it("validaciones: ruta ajena, linea ajena o repetida, entrega de mas, todo en 0, sin permiso, pedido que no esta en ruta", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const otro = await repartidor(c);
      expect((await error(c, () => entregar(c, otro, j.P1, efectivo("800.00")))).message).toBe("RUTA_AJENA");
      const cajero = await usuarioF3(c, ROL3.cajero);
      expect((await errorConDetalle(c, () => entregar(c, cajero, j.P1, efectivo("800.00")))).detalle).toEqual({ permiso: "rutas.operar" });
      const l1 = await lineaPedido(c, j.P1, j.corona.caja);
      const l3 = await lineaPedido(c, j.P3, j.victoria.caja);
      expect((await error(c, () => entregar(c, j.rep, j.P1, { lineas: [{ pedido_linea_id: l1, cantidad_entregada: 3 }], ...efectivo("800.00") }))).message).toBe("ENTREGA_EXCEDE_PEDIDO");
      expect((await error(c, () => entregar(c, j.rep, j.P1, { lineas: [{ pedido_linea_id: l1, cantidad_entregada: 0 }], ...efectivo("0.01") }))).message).toBe("ENTREGA_VACIA");
      expect((await error(c, () => entregar(c, j.rep, j.P1, { lineas: [{ pedido_linea_id: l3, cantidad_entregada: 1 }], ...efectivo("390.00") }))).message).toBe("LINEA_NO_VALIDA");
      expect((await error(c, () => entregar(c, j.rep, j.P1, { lineas: [{ pedido_linea_id: l1, cantidad_entregada: 1 }, { pedido_linea_id: l1, cantidad_entregada: 1 }], ...efectivo("800.00") }))).message).toBe("VALIDACION");
      expect((await fila<{ n: number }>(c, "select count(*)::int as n from app.venta")).n).toBe(0);
      // un pedido confirmado a domicilio que no salio en ruta no se entrega
      const suelto = await pedidoConfirmado(c, j.A, [lin(j.corona.six, 1)], j.hoy, j.dueno);
      expect((await error(c, () => entregar(c, j.rep, suelto, efectivo("105.00")))).message).toBe("ESTADO_NO_VALIDO");
    });
  });

  it("credito: P2 todo a credito -> CxC 505.00 que vence en 7 dias; P4 excede el limite con detalle y nada cambia; a un cliente sin credito tambien", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      await entregar(c, j.rep, j.P2, credito("505.00"));
      const cxc = await fila(c, "select monto::text, saldo::text, estado, origen, vence_el::text as vence, (vence_el = app.fn_fecha_local(now()) + 7) as ok from app.cuenta_por_cobrar where cliente_id = $1 and origen = 'venta'", [j.C]);
      expect(cxc).toMatchObject({ monto: "505.00", saldo: "505.00", estado: "pendiente", origen: "venta", ok: true });
      expect(await saldo(c, j.C)).toMatchObject({ saldo: "505.00", disponible: "495.00", cuentas_pendientes: 1 });
      const e = await errorConDetalle(c, () => entregar(c, j.rep, j.P4, credito("800.00")));
      expect(e.message).toBe("LIMITE_CREDITO_EXCEDIDO");
      expect(e.detalle).toEqual({ limite: "1000.00", saldo: "505.00", disponible: "495.00" });
      expect(await fila(c, "select estado from app.pedido where id = $1", [j.P4])).toEqual({ estado: "en_ruta" });
      expect((await fila<{ n: number }>(c, "select count(*)::int as n from app.venta where pedido_id = $1", [j.P4])).n).toBe(0);
      expect((await errorConDetalle(c, () => entregar(c, j.rep, j.P1, credito("800.00")))).message).toBe("LIMITE_CREDITO_EXCEDIDO");
    });
  });

  it("vencido no bloquea [P6b]: D (limite 500, debe 300 vencido) compra 1 Six a credito en mostrador y queda en 405.00", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      expect(await saldo(c, j.D)).toMatchObject({ saldo: "300.00", vencido: "300.00", max_dias_vencido: 10, disponible: "200.00" });
      await turnoMostrador(c, j.dueno);
      const v = await vender(c, j.dueno, { cliente_id: j.D, lineas: [{ presentacion_id: j.corona.six, cantidad: 1 }], ...credito("105.00") });
      expect(v.repetida).toBe(false);
      expect(await saldo(c, j.D)).toMatchObject({ saldo: "405.00", disponible: "95.00" });
    });
  });

  it("pagos: sumas distintas -> PAGOS_NO_CUADRAN; efectivo recibido menor -> EFECTIVO_INSUFICIENTE; metodo repetido -> VALIDACION; credito sin permiso -> SIN_PERMISO", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      expect((await errorConDetalle(c, () => entregar(c, j.rep, j.P3, efectivo("389.00")))).message).toBe("PAGOS_NO_CUADRAN");
      expect((await error(c, () => entregar(c, j.rep, j.P3, efectivo("390.00", "300.00")))).message).toBe("EFECTIVO_INSUFICIENTE");
      expect((await error(c, () => entregar(c, j.rep, j.P3, { pagos: [{ metodo: "efectivo", monto: "200.00" }, { metodo: "efectivo", monto: "190.00" }] }))).message).toBe("VALIDACION");
      expect((await error(c, () => entregar(c, j.rep, j.P3, { pagos: [{ metodo: "cheque", monto: "390.00" }] }))).message).toBe("VALIDACION");
      const mixto = await entregar(c, j.rep, j.P3, { pagos: [{ metodo: "efectivo", monto: "90.00" }, { metodo: "transferencia", monto: "300.00", referencia: "XYZ" }], efectivo_recibido: "100.00" });
      expect(await q(c, "select metodo, monto::text from app.venta_pago where venta_id = $1 order by metodo", [mixto.venta_id])).toEqual([
        { metodo: "efectivo", monto: "90.00" }, { metodo: "transferencia", monto: "300.00" }]);
      expect((await fila(c, "select cambio::text as c from app.venta where id = $1", [mixto.venta_id])).c).toBe("10.00");
    });
  });

  it("transferencia: P3 con referencia y comprobante queda sin verificar; Administrador verifica; Repartidor -> SIN_PERMISO; los saldos no cambian", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const archivo = `${"a".repeat(64)}.png`;
      const { venta_id } = await entregar(c, j.rep, j.P3, transferencia("390.00", "ABC123", archivo));
      const pago = await fila<{ id: string; referencia: string; comprobante: string; verificado_en: string | null }>(c, "select id::text, referencia, comprobante, verificado_en from app.venta_pago where venta_id = $1", [venta_id]);
      expect(pago).toMatchObject({ referencia: "ABC123", comprobante: archivo, verificado_en: null });
      const antes = await saldo(c, j.B);
      expect((await errorConDetalle(c, () => c.query("select app.fn_verificar_pago($1, 'venta_pago', $2)", [j.rep, pago.id]))).detalle).toEqual({ permiso: "cobranza.verificar" });
      const admin = await usuarioF3(c, ROL.admin);
      await c.query("select app.fn_verificar_pago($1, 'venta_pago', $2)", [admin, pago.id]);
      const v = await fila<{ verificado_en: string | null; verificado_por: string }>(c, "select verificado_en, verificado_por::text from app.venta_pago where id = $1", [pago.id]);
      expect(v.verificado_en).not.toBeNull();
      expect(v.verificado_por).toBe(admin);
      expect(await saldo(c, j.B)).toEqual(antes);
      expect((await error(c, () => c.query("select app.fn_verificar_pago($1, 'venta_pago', 0)", [admin]))).message).toBe("NO_ENCONTRADO");
      expect((await error(c, () => c.query("select app.fn_verificar_pago($1, 'otra', 1)", [admin]))).message).toBe("VALIDACION");
      const efec = await entregar(c, j.rep, j.P1, efectivo("800.00"));
      const idEf = (await fila<{ id: string }>(c, "select id::text from app.venta_pago where venta_id = $1", [efec.venta_id])).id;
      expect((await error(c, () => c.query("select app.fn_verificar_pago($1, 'venta_pago', $2)", [admin, idEf]))).message).toBe("ESTADO_NO_VALIDO");
    });
  });

  it("mostrador contra carga: 5 Cajas con R cargada -> STOCK_INSUFICIENTE {disponible 114, comprometido 126}; 4 Cajas pasan (caso aislado)", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      await turnoMostrador(c, j.dueno);
      const e = await errorConDetalle(c, () => vender(c, j.dueno, { lineas: [{ presentacion_id: j.corona.caja, cantidad: 5 }], ...efectivo("2000.00") }));
      expect(e.message).toBe("STOCK_INSUFICIENTE");
      expect(e.detalle).toMatchObject({ disponible: 114, comprometido: 126 });
    });
    await enTransaccion(async (c) => {
      const j = await juego(c);
      await turnoMostrador(c, j.dueno);
      const v = await vender(c, j.dueno, { lineas: [{ presentacion_id: j.corona.caja, cantidad: 4 }], ...efectivo("1600.00") });
      expect(v.repetida).toBe(false);
      expect((await existenciaYKardex(c, j.corona.id)).cantidad).toBe(144);
    });
  });

  it("recoge en bodega: pedido confirmado sin turno de mostrador -> TURNO_NO_ABIERTO; con turno se vende en ese turno con origen pedido", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const ped = await pedido(c, j.A, [lin(j.corona.six, 2)], { captura: j.dueno, entrega_tipo: "recoge" });
      await c.query("select app.fn_confirmar_pedido($1, $2, $3::jsonb)", [j.dueno, ped, JSON.stringify({ version: 1, fecha_entrega: j.hoy })]);
      expect((await error(c, () => entregar(c, j.dueno, ped, efectivo("210.00")))).message).toBe("TURNO_NO_ABIERTO");
      const turno = await turnoMostrador(c, j.dueno);
      const { venta_id } = await entregar(c, j.dueno, ped, efectivo("210.00", "300.00"));
      expect(await fila(c, "select origen, turno_caja_id::text as t, total::text from app.venta where id = $1", [venta_id])).toEqual({ origen: "pedido", t: turno, total: "210.00" });
      expect((await fila(c, "select estado from app.pedido where id = $1", [ped])).estado).toBe("entregado");
      const av = await q(c, "select clave from app.aviso_cliente where pedido_id = $1 and plantilla = 'wa_nota_entrega'", [ped]);
      expect(av[0].clave).toMatch(new RegExp(`^wa_nota_entrega:p${ped}:v\\d+$`));
    });
  });

  it("no entregado y terminar: P4 'No estaba' -> no_entregado; terminar -> terminada; repetir terminar no falla ni agrega filas; paradas de cobro pendientes -> omitida", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      await c.query("select app.fn_marcar_no_entregado($1, $2, 'no_estaba')", [j.rep, j.parada[j.P4]!]);
      expect((await fila(c, "select estado from app.pedido where id = $1", [j.P4])).estado).toBe("no_entregado");
      await cerrarRuta(c, j);
      expect((await fila(c, "select estado from app.ruta where id = $1", [j.ruta])).estado).toBe("terminada");
      expect((await fila(c, "select estado from app.ruta_parada where id = $1", [j.paradaCobro])).estado).toBe("omitida");
      const eventos = () => fila<{ n: number }>(c, "select ((select count(*) from app.pedido_evento) + (select count(*) from app.aviso_cliente) + (select count(*) from app.notificacion))::int as n");
      const antes = await eventos();
      await cerrarRuta(c, j);
      expect(await eventos()).toEqual(antes);
      await c.query("select app.fn_liquidar_ruta($1, $2, '500.00', null)", [j.dueno, j.ruta]);
      await cerrarRuta(c, j);
      expect((await fila(c, "select estado from app.ruta where id = $1", [j.ruta])).estado).toBe("liquidada");
    });
  });
});

describe("liquidacion de la ruta", () => {
  it("flujo completo de la tabla: resumen con efectivo esperado 950.00, producto que regresa, liquidar 940.00 -> diferencia -10.00, repetir -> mismo resumen; existencias finales", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      await entregasBase(c, j);
      const ab = await abonar(c, j.rep, { cliente_id: j.D, monto: "200.00", ruta_parada_id: j.paradaCobro });
      expect(await fila(c, "select turno_caja_id::text as t, metodo, estado from app.abono where id = $1", [ab.abono_id])).toEqual({ t: j.turno, metodo: "efectivo", estado: "aplicado" });
      expect((await fila(c, "select estado from app.ruta_parada where id = $1", [j.paradaCobro])).estado).toBe("visitada");
      expect(await saldo(c, j.D)).toMatchObject({ saldo: "100.00" });
      await c.query("select app.fn_movimiento_caja($1, $2, 'salida', 150, 'Gasolina', '33333333-3333-4333-8333-333333333333', 'h')", [j.rep, j.turno]);
      await c.query("select app.fn_marcar_no_entregado($1, $2, 'no_estaba')", [j.rep, j.parada[j.P4]!]);
      expect((await error(c, () => c.query("select app.fn_liquidar_ruta($1, $2, '940.00', null)", [j.dueno, j.ruta]))).message).toBe("RUTA_NO_TERMINADA");
      await cerrarRuta(c, j);
      const r = await resumen(c, j.turno);
      expect(r).toMatchObject({
        tipo: "ruta", fondo_inicial: "500.00",
        ventas: { num: 3, canceladas: 0, efectivo: "400.00", transferencia: "390.00", tarjeta: "0.00", credito: "505.00" },
        abonos: { efectivo: "200.00", transferencia: "0.00", tarjeta: "0.00" },
        entradas: "0.00", salidas: "150.00", retiros: "0.00", reembolsos: "0.00", efectivo_esperado: "950.00", efectivo_contado: null, diferencia: null,
        devoluciones_producto: [{ producto: j.corona.nombre, piezas: 72 }],
      });
      expect(r.transferencias).toHaveLength(1);
      expect(r.transferencias[0]).toMatchObject({ monto: "390.00", referencia: "ABC123", verificado: false });
      expect((await errorConDetalle(c, () => c.query("select app.fn_liquidar_ruta($1, $2, '940.00', null)", [j.rep, j.ruta]))).detalle).toEqual({ permiso: "rutas.liquidar" });
      const admin = await usuarioF3(c, ROL.admin);
      const liq = (await c.query("select app.fn_liquidar_ruta($1, $2, '940.00', 'faltaron 10') as r", [admin, j.ruta])).rows[0].r;
      expect(liq).toMatchObject({ efectivo_esperado: "950.00", efectivo_contado: "940.00", diferencia: "-10.00" });
      expect(await fila(c, "select estado, cerrado_por::text as por, diferencia::text as d from app.turno_caja where id = $1", [j.turno])).toEqual({ estado: "cerrado", por: admin, d: "-10.00" });
      expect((await fila(c, "select estado from app.ruta where id = $1", [j.ruta])).estado).toBe("liquidada");
      const otra = (await c.query("select app.fn_liquidar_ruta($1, $2, '1.00', 'otra') as r", [admin, j.ruta])).rows[0].r;
      expect(otra).toEqual(liq);
      expect(await existenciaYKardex(c, j.corona.id)).toEqual({ cantidad: 186, kardex: 186 });
      expect(await existenciaYKardex(c, j.victoria.id)).toEqual({ cantidad: 0, kardex: 0 });
      // el turno cerrado ya no admite movimientos ni abonos en efectivo
      expect((await error(c, () => c.query("select * from app.fn_movimiento_caja($1, $2, 'salida', 1, 'x')", [j.rep, j.turno]))).message).toBe("TURNO_NO_ABIERTO");
      // con la ruta ya liquidada el repartidor ya no ve la cuenta de D (NO_ENCONTRADO); quien si la ve y no tiene turno recibe TURNO_NO_ABIERTO
      expect((await error(c, () => abonar(c, j.rep, { cliente_id: j.D, monto: "10.00" }))).message).toBe("NO_ENCONTRADO");
      const sinTurnoCajero = await usuarioF3(c, ROL3.cajero);
      expect((await error(c, () => abonar(c, sinTurnoCajero, { cliente_id: j.D, monto: "10.00" }))).message).toBe("TURNO_NO_ABIERTO");
    });
  });

  it("el dueno que tiene rutas.liquidar puede liquidar su propia ruta; contado negativo o con 3 decimales -> VALIDACION", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      await c.query("select app.fn_marcar_no_entregado($1, $2, 'cerrado')", [j.rep, j.parada[j.P1]!]);
      await cerrarRuta(c, j);
      expect((await errorConDetalle(c, () => c.query("select app.fn_liquidar_ruta($1, $2, '-1', null)", [j.dueno, j.ruta]))).detalle).toEqual({ campo: "efectivo_contado" });
      expect((await error(c, () => c.query("select app.fn_liquidar_ruta($1, $2, 500.001, null)", [j.dueno, j.ruta]))).message).toBe("VALIDACION");
      const r = (await c.query("select app.fn_liquidar_ruta($1, $2, '500.00', null) as r", [j.dueno, j.ruta])).rows[0].r;
      expect(r).toMatchObject({ efectivo_esperado: "500.00", diferencia: "0.00" });
    });
  });

  it("fn_cerrar_turno de mostrador: congela esperado y diferencia; ajeno -> TURNO_AJENO salvo caja.supervisar; turno de ruta -> TURNO_NO_VALIDO; cerrar dos veces -> TURNO_NO_ABIERTO", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const cajero = await usuarioF3(c, ROL3.cajero);
      const t = await turnoMostrador(c, cajero, "200.00");
      await vender(c, cajero, { lineas: [{ presentacion_id: j.corona.six, cantidad: 2 }], ...efectivo("210.00") });
      await c.query("select * from app.fn_movimiento_caja($1, $2, 'retiro', 100, 'Al banco')", [cajero, t]);
      const otro = await usuarioF3(c, ROL3.cajero);
      expect((await error(c, () => c.query("select app.fn_cerrar_turno($1, $2, '310.00', null)", [otro, t]))).message).toBe("TURNO_AJENO");
      expect((await error(c, () => c.query("select app.fn_cerrar_turno($1, $2, '310.00', null)", [cajero, j.turno]))).message).toBe("TURNO_NO_VALIDO");
      expect((await error(c, () => c.query("select app.fn_cerrar_turno($1, $2, '310.00', null)", [j.rep, j.turno]))).message).toBe("SIN_PERMISO");
      expect((await error(c, () => c.query("select app.fn_cerrar_turno($1, $2, '310.00', null)", [j.dueno, j.turno]))).message).toBe("TURNO_NO_VALIDO");
      const r = (await c.query("select app.fn_cerrar_turno($1, $2, '300.00', 'ok') as r", [cajero, t])).rows[0].r;
      expect(r).toMatchObject({ tipo: "mostrador", efectivo_esperado: "310.00", efectivo_contado: "300.00", diferencia: "-10.00" });
      expect(await fila(c, "select estado, notas_cierre from app.turno_caja where id = $1", [t])).toEqual({ estado: "cerrado", notas_cierre: "ok" });
      expect((await error(c, () => c.query("select app.fn_cerrar_turno($1, $2, '1', null)", [cajero, t]))).message).toBe("TURNO_NO_ABIERTO");
      // el supervisor (Dueno) si cierra el de otro
      const t2 = await turnoMostrador(c, otro, "50.00");
      expect((await c.query("select app.fn_cerrar_turno($1, $2, '50.00', null) as r", [j.dueno, t2])).rows[0].r).toMatchObject({ diferencia: "0.00" });
    });
  });
});

describe("cancelar venta y devolver", () => {
  it("cancelar: solo Dueno; P3 (transferencia) -> Victoria 24, pedido cancelado, reembolso otros 390.00; P1 sin turno de quien cancela -> TURNO_NO_ABIERTO, con turno reembolso 400.00; repetir -> VENTA_YA_CANCELADA", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const { v1, v3 } = await entregasBase(c, j);
      const admin = await usuarioF3(c, ROL.admin);
      expect((await errorConDetalle(c, () => c.query("select app.fn_cancelar_venta($1, $2, 'x')", [admin, v3]))).detalle).toEqual({ permiso: "ventas.cancelar" });
      const sinTurno = await usuarioF3(c, ROL3.dueno);
      expect((await error(c, () => c.query("select app.fn_cancelar_venta($1, $2, 'se equivoco')", [sinTurno, v1]))).message).toBe("TURNO_NO_ABIERTO");
      expect((await errorConDetalle(c, () => c.query("select app.fn_cancelar_venta($1, $2, '  ')", [j.dueno, v3]))).detalle).toEqual({ campo: "motivo" });
      const turno = await turnoMostrador(c, j.dueno, "0.00");
      const r3 = (await c.query("select app.fn_cancelar_venta($1, $2, 'no lo quiso') as r", [j.dueno, v3])).rows[0].r;
      expect(r3).toEqual({ reembolso_efectivo: "0.00", reembolso_otros: "390.00" });
      expect((await existenciaYKardex(c, j.victoria.id)).cantidad).toBe(24);
      expect(await fila(c, "select estado, motivo from app.pedido where id = $1", [j.P3])).toEqual({ estado: "cancelado", motivo: "no lo quiso" });
      expect(await fila(c, "select estado, motivo_cancelacion as m, cancelada_por::text as por from app.venta where id = $1", [v3])).toEqual({ estado: "cancelada", m: "no lo quiso", por: j.dueno });
      const r1 = (await c.query("select app.fn_cancelar_venta($1, $2, 'devolvio todo') as r", [j.dueno, v1])).rows[0].r;
      expect(r1).toEqual({ reembolso_efectivo: "400.00", reembolso_otros: "0.00" });
      expect(await q(c, "select tipo, monto::text, referencia_tabla, referencia_id::text as ref from app.movimiento_caja where turno_caja_id = $1", [turno]))
        .toEqual([{ tipo: "reembolso", monto: "400.00", referencia_tabla: "venta", ref: v1 }]);
      expect((await existenciaYKardex(c, j.corona.id)).cantidad).toBe(210); // 240 - 24 - 30 + 24 devuelto
      expect((await error(c, () => c.query("select app.fn_cancelar_venta($1, $2, 'otra vez')", [j.dueno, v1]))).message).toBe("VENTA_YA_CANCELADA");
      const rr = await resumen(c, j.turno);
      expect(rr.ventas).toMatchObject({ num: 1, canceladas: 2 });
    });
  });

  it("cancelar una venta a credito: la CxC queda cancelada; con abonos -> VENTA_CON_ABONOS", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const { v2 } = await entregasBase(c, j);
      await turnoMostrador(c, j.dueno);
      await abonar(c, j.dueno, { cliente_id: j.C, monto: "5.00" });
      expect((await error(c, () => c.query("select app.fn_cancelar_venta($1, $2, 'x')", [j.dueno, v2]))).message).toBe("VENTA_CON_ABONOS");
      const c2 = await clienteCredito(c, "1000.00", 7);
      const ventaB = await vender(c, j.dueno, { cliente_id: c2, lineas: [{ presentacion_id: j.corona.six, cantidad: 1 }], ...credito("105.00") });
      await c.query("select app.fn_cancelar_venta($1, $2, 'error de captura')", [j.dueno, ventaB.venta_id]);
      expect(await q(c, "select estado, saldo::text from app.cuenta_por_cobrar where venta_id = $1", [ventaB.venta_id])).toEqual([{ estado: "cancelada", saldo: "0.00" }]);
      expect((await saldo(c, c2)).saldo).toBe("0.00");
    });
  });

  it("devolucion: 1 Six de P2 baja el saldo a 400.00 y vuelve al inventario; misma clave -> repetida; 12 pz -> DEVOLUCION_EXCEDE_VENDIDO; cancelar la venta -> VENTA_CON_DEVOLUCIONES", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const { v2 } = await entregasBase(c, j);
      const six = (await fila<{ id: string }>(c, "select id::text from app.venta_linea where venta_id = $1 and cantidad = 1 and factor = 6", [v2])).id;
      const antes = (await existenciaYKardex(c, j.corona.id)).cantidad;
      const clave = "44444444-4444-4444-8444-444444444444";
      const d = await devolver(c, j.rep, v2, { clave, lineas: [{ venta_linea_id: six, piezas: 6, regresa_a_inventario: true }] });
      expect(d.repetida).toBe(false);
      expect(await fila(c, "select total::text, abono_credito::text as ab, reembolso_efectivo::text as re, folio, turno_caja_id from app.devolucion where id = $1", [d.devolucion_id]))
        .toMatchObject({ total: "105.00", ab: "105.00", re: "0.00" });
      expect((await saldo(c, j.C)).saldo).toBe("400.00");
      expect((await existenciaYKardex(c, j.corona.id)).cantidad).toBe(antes + 6);
      const otra = await devolver(c, j.rep, v2, { clave, lineas: [{ venta_linea_id: six, piezas: 6, regresa_a_inventario: true }] });
      expect(otra).toEqual({ devolucion_id: d.devolucion_id, repetida: true });
      expect((await fila<{ n: number }>(c, "select count(*)::int as n from app.devolucion where venta_id = $1", [v2])).n).toBe(1);
      expect((await error(c, () => devolver(c, j.rep, v2, { clave, hash: "x", lineas: [{ venta_linea_id: six, piezas: 6, regresa_a_inventario: true }] }))).message).toBe("IDEMPOTENCIA_CONFLICTO");
      expect((await error(c, () => devolver(c, j.rep, v2, { lineas: [{ venta_linea_id: six, piezas: 12, regresa_a_inventario: true }] }))).message).toBe("DEVOLUCION_EXCEDE_VENDIDO");
      expect((await error(c, () => devolver(c, j.rep, v2, { lineas: [{ venta_linea_id: six, piezas: 1, regresa_a_inventario: true }] }))).message).toBe("DEVOLUCION_EXCEDE_VENDIDO");
      expect((await error(c, () => c.query("select app.fn_cancelar_venta($1, $2, 'x')", [j.dueno, v2]))).message).toBe("VENTA_CON_DEVOLUCIONES");
      const cajero = await usuarioF3(c, ROL3.cajero);
      expect((await errorConDetalle(c, () => devolver(c, cajero, v2, { lineas: [{ venta_linea_id: six, piezas: 6, regresa_a_inventario: true }] }))).detalle).toEqual({ permiso: "ventas.devolver" });
    });
  });

  it("devolucion en efectivo: 12 pz danadas de P1 en turno de mostrador -> total 200.00 = round(400 * 12/24), reembolso 200.00, devolucion_venta +12 y merma danado -12", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const { v1 } = await entregasBase(c, j);
      const vl = (await fila<{ id: string }>(c, "select id::text from app.venta_linea where venta_id = $1", [v1])).id;
      const antes = (await existenciaYKardex(c, j.corona.id)).cantidad;
      const e = await error(c, () => devolver(c, j.dueno, v1, { lineas: [{ venta_linea_id: vl, piezas: 12, regresa_a_inventario: false }] }));
      expect(e.message).toBe("TURNO_NO_ABIERTO");
      const turno = await turnoMostrador(c, j.dueno);
      const d = await devolver(c, j.dueno, v1, { lineas: [{ venta_linea_id: vl, piezas: 12, regresa_a_inventario: false }], motivo: "se rompieron" });
      expect(await fila(c, "select total::text, abono_credito::text as ab, reembolso_efectivo::text as re, turno_caja_id::text as t from app.devolucion where id = $1", [d.devolucion_id]))
        .toEqual({ total: "200.00", ab: "0.00", re: "200.00", t: turno });
      expect(await q(c, "select tipo, cantidad, causa_merma from app.movimiento_inventario where producto_id = $1 and referencia_tabla = 'devolucion_linea' order by id", [j.corona.id]))
        .toEqual([{ tipo: "devolucion_venta", cantidad: 12, causa_merma: null }, { tipo: "merma", cantidad: -12, causa_merma: "danado" }]);
      expect((await existenciaYKardex(c, j.corona.id)).cantidad).toBe(antes);
      expect(await q(c, "select tipo, monto::text, motivo from app.movimiento_caja where turno_caja_id = $1", [turno])).toEqual([{ tipo: "reembolso", monto: "200.00", motivo: "se rompieron" }]);
      expect((await fila(c, "select piezas_devueltas as p from app.venta_linea where id = $1", [vl])).p).toBe(12);
      expect((await resumen(c, turno)).reembolsos).toBe("200.00");
    });
  });
});

describe("abonos y saldo inicial", () => {
  async function clienteE(c: pg.PoolClient) {
    const dueno = await usuarioF3(c, ROL3.dueno);
    const E = await clienteCredito(c, "1000.00", 7);
    const c1 = await saldoInicial(c, E, "300.00", await dia(c, -10), dueno);
    const c2 = await saldoInicial(c, E, "200.00", await dia(c, 5), dueno);
    return { dueno, E, c1, c2 };
  }

  it("abono FIFO: 400.00 aplica 300.00 y 100.00; 600.00 -> ABONO_EXCEDE_SALDO; cuentas que no suman -> APLICACION_NO_CUADRA; otro cliente -> CUENTA_NO_VALIDA; idempotente", async () => {
    await enTransaccion(async (c) => {
      const { dueno, E, c1, c2 } = await clienteE(c);
      await turnoMostrador(c, dueno);
      const clave = "55555555-5555-4555-8555-555555555555";
      const a = await abonar(c, dueno, { cliente_id: E, monto: "400.00", clave });
      expect(await q(c, "select cuenta_por_cobrar_id::text as c, monto::text from app.abono_aplicacion where abono_id = $1 order by cuenta_por_cobrar_id", [a.abono_id]))
        .toEqual([{ c: c1, monto: "300.00" }, { c: c2, monto: "100.00" }]);
      expect(await q(c, "select estado, saldo::text from app.cuenta_por_cobrar where id = any($1) order by id", [[c1, c2]])).toEqual([{ estado: "saldada", saldo: "0.00" }, { estado: "pendiente", saldo: "100.00" }]);
      expect((await saldo(c, E)).saldo).toBe("100.00");
      expect(await abonar(c, dueno, { cliente_id: E, monto: "400.00", clave })).toEqual({ abono_id: a.abono_id, repetida: true });
      expect((await fila<{ n: number }>(c, "select count(*)::int as n from app.abono where cliente_id = $1", [E])).n).toBe(1);
      expect((await error(c, () => abonar(c, dueno, { cliente_id: E, monto: "400.00", clave, hash: "x" }))).message).toBe("IDEMPOTENCIA_CONFLICTO");
      expect((await errorConDetalle(c, () => abonar(c, dueno, { cliente_id: E, monto: "600.00" }))).message).toBe("ABONO_EXCEDE_SALDO");
      expect((await error(c, () => abonar(c, dueno, { cliente_id: E, monto: "100.00", cuentas: [{ cuenta_por_cobrar_id: c2, monto: "150.00" }] }))).message).toBe("APLICACION_NO_CUADRA");
      const ajena = await saldoInicial(c, await clienteCredito(c, "10.00"), "50.00", await dia(c, 3), dueno);
      expect((await error(c, () => abonar(c, dueno, { cliente_id: E, monto: "50.00", cuentas: [{ cuenta_por_cobrar_id: ajena, monto: "50.00" }] }))).message).toBe("CUENTA_NO_VALIDA");
      expect((await error(c, () => abonar(c, dueno, { cliente_id: E, monto: "0" }))).message).toBe("VALIDACION");
      expect((await error(c, () => abonar(c, dueno, { cliente_id: E, monto: "10.00", metodo: "cheque" }))).message).toBe("VALIDACION");
      // a cuentas elegidas: 100.00 a la unica pendiente
      const b = await abonar(c, dueno, { cliente_id: E, monto: "100.00", cuentas: [{ cuenta_por_cobrar_id: c2, monto: "100.00" }] });
      expect(b.repetida).toBe(false);
      expect((await saldo(c, E)).saldo).toBe("0.00");
    });
  });

  it("cancelar abono: devuelve a cada cuenta su saldo y reembolsa 400.00 en el turno de quien cancela; Administrador -> SIN_PERMISO; repetir -> ABONO_YA_CANCELADO", async () => {
    await enTransaccion(async (c) => {
      const { dueno, E, c1, c2 } = await clienteE(c);
      const cajero = await usuarioF3(c, ROL3.cajero);
      await turnoMostrador(c, cajero);
      const a = await abonar(c, cajero, { cliente_id: E, monto: "400.00" });
      const admin = await usuarioF3(c, ROL.admin);
      expect((await errorConDetalle(c, () => c.query("select app.fn_cancelar_abono($1, $2, 'x')", [admin, a.abono_id]))).detalle).toEqual({ permiso: "cobranza.cancelar_abono" });
      expect((await error(c, () => c.query("select app.fn_cancelar_abono($1, $2, 'se equivoco')", [dueno, a.abono_id]))).message).toBe("TURNO_NO_ABIERTO");
      const t = await turnoMostrador(c, dueno);
      await c.query("select app.fn_cancelar_abono($1, $2, 'se equivoco')", [dueno, a.abono_id]);
      expect(await q(c, "select id::text, saldo::text, estado from app.cuenta_por_cobrar where id = any($1) order by id", [[c1, c2]]))
        .toEqual([{ id: c1, saldo: "300.00", estado: "pendiente" }, { id: c2, saldo: "200.00", estado: "pendiente" }]);
      expect(await q(c, "select tipo, monto::text, referencia_tabla from app.movimiento_caja where turno_caja_id = $1", [t])).toEqual([{ tipo: "reembolso", monto: "400.00", referencia_tabla: "abono" }]);
      expect(await fila(c, "select estado, cancelado_por::text as por, motivo_cancelacion as m from app.abono where id = $1", [a.abono_id])).toEqual({ estado: "cancelado", por: dueno, m: "se equivoco" });
      expect((await error(c, () => c.query("select app.fn_cancelar_abono($1, $2, 'otra')", [dueno, a.abono_id]))).message).toBe("ABONO_YA_CANCELADO");
      expect((await saldo(c, E)).saldo).toBe("500.00");
    });
  });

  it("abono en ruta: D en su parada de cobro con 200.00 -> turno de R, parada visitada, saldo 100.00; parada de otro cliente o de una ruta que no es suya -> ESTADO_NO_VALIDO", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      expect((await error(c, () => abonar(c, j.rep, { cliente_id: j.D, monto: "50.00", ruta_parada_id: j.parada[j.P2]! }))).message).toBe("ESTADO_NO_VALIDO");
      const admin = await usuarioF3(c, ROL.admin);
      await turnoMostrador(c, admin);
      expect((await error(c, () => abonar(c, admin, { cliente_id: j.D, monto: "50.00", ruta_parada_id: j.paradaCobro }))).message).toBe("ESTADO_NO_VALIDO");
      const a = await abonar(c, j.rep, { cliente_id: j.D, monto: "200.00", ruta_parada_id: j.paradaCobro });
      expect(await fila(c, "select turno_caja_id::text as t, ruta_parada_id::text as p from app.abono where id = $1", [a.abono_id])).toEqual({ t: j.turno, p: j.paradaCobro });
      expect((await fila(c, "select estado from app.ruta_parada where id = $1", [j.paradaCobro])).estado).toBe("visitada");
      expect((await saldo(c, j.D)).saldo).toBe("100.00");
      expect((await resumen(c, j.turno)).abonos.efectivo).toBe("200.00");
      // transferencia en ruta: no entra al efectivo pero si a la lista de transferencias
      await abonar(c, j.rep, { cliente_id: j.D, monto: "50.00", metodo: "transferencia", referencia: "TR1" });
      const r = await resumen(c, j.turno);
      expect(r.abonos).toMatchObject({ efectivo: "200.00", transferencia: "50.00" });
      expect(r.efectivo_esperado).toBe("700.00");
      expect(r.transferencias.map((t: { referencia: string }) => t.referencia)).toEqual(["TR1"]);
    });
  });

  it("abonos al fiado de un cliente sin deuda -> ABONO_EXCEDE_SALDO; cobranza.abonar es obligatorio", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      expect((await error(c, () => abonar(c, j.rep, { cliente_id: j.A, monto: "10.00", metodo: "transferencia" }))).message).toBe("ABONO_EXCEDE_SALDO");
      const almacenista = await usuarioF3(c, ROL3.almacenista);
      expect((await errorConDetalle(c, () => abonar(c, almacenista, { cliente_id: j.D, monto: "10.00", metodo: "transferencia" }))).detalle).toEqual({ permiso: "cobranza.abonar" });
    });
  });

  it("dos abonos concurrentes de 300.00 sobre un saldo de 500.00: el segundo -> ABONO_EXCEDE_SALDO", async () => {
    const marcas = await marcarAgua();
    try {
      const c0 = await pool.connect();
      let usuario = "";
      let E = "";
      try {
        await c0.query("begin");
        usuario = await usuarioF3(c0, ROL3.dueno);
        E = await clienteCredito(c0, "1000.00", 7);
        await saldoInicial(c0, E, "500.00", await dia(c0, 3), usuario);
        await c0.query("commit");
      } finally { c0.release(); }
      const a = await pool.connect();
      const b = await pool.connect();
      try {
        await a.query("begin");
        await b.query("begin");
        await abonar(a, usuario, { cliente_id: E, metodo: "transferencia", monto: "300.00", referencia: "A" });
        const segundo = abonar(b, usuario, { cliente_id: E, metodo: "transferencia", monto: "300.00", referencia: "B" }).then(() => "ok", (e: { message: string }) => e.message);
        await new Promise((r) => setTimeout(r, 400));
        await a.query("commit");
        expect(await segundo).toBe("ABONO_EXCEDE_SALDO");
        await b.query("rollback");
        expect((await pool.query("select saldo::text from app.v_saldo_cliente where cliente_id = $1", [E])).rows[0].saldo).toBe("200.00");
      } finally {
        await a.query("rollback").catch(() => undefined);
        await b.query("rollback").catch(() => undefined);
        a.release();
        b.release();
      }
    } finally { await borrarDesde(marcas); }
  });

  it("dos entregas del mismo pedido con claves distintas: una pasa y la otra -> ESTADO_NO_VALIDO; una sola venta", async () => {
    const marcas = await marcarAgua();
    try {
      const c0 = await pool.connect();
      let j: Juego;
      try {
        await c0.query("begin");
        j = await juego(c0);
        await c0.query("commit");
      } finally { c0.release(); }
      const a = await pool.connect();
      const b = await pool.connect();
      try {
        await a.query("begin");
        await b.query("begin");
        await entregar(a, j.rep, j.P1, efectivo("800.00"));
        const segunda = entregar(b, j.rep, j.P1, efectivo("800.00")).then(() => "ok", (e: { message: string }) => e.message);
        await new Promise((r) => setTimeout(r, 400));
        await a.query("commit");
        expect(await segunda).toBe("ESTADO_NO_VALIDO");
        await b.query("rollback");
        expect((await pool.query("select count(*)::int as n from app.venta where pedido_id = $1", [j.P1])).rows[0].n).toBe(1);
        expect((await pool.query("select cantidad from app.existencia where producto_id = $1 and sucursal_id = 1", [j.corona.id])).rows[0].cantidad).toBe(192);
      } finally {
        await a.query("rollback").catch(() => undefined);
        await b.query("rollback").catch(() => undefined);
        a.release();
        b.release();
      }
    } finally { await borrarDesde(marcas); }
  });

  it("saldo inicial: sin clientes.credito -> SIN_PERMISO; monto 0 -> VALIDACION; concepto vacio -> VALIDACION; aparece en v_saldo_cliente; no lo frena el limite", async () => {
    await enTransaccion(async (c) => {
      const cli = await clienteCredito(c, "100.00", 5);
      const cajero = await usuarioF3(c, ROL3.cajero);
      const admin = await usuarioF3(c, ROL.admin);
      const f = (u: string, monto: string, concepto = "Libreta") => c.query("select app.fn_saldo_inicial($1, $2, $3, $4::date, $5) as id", [u, cli, monto, "2020-01-01", concepto]);
      expect((await errorConDetalle(c, () => f(cajero, "50.00"))).detalle).toEqual({ permiso: "clientes.credito" });
      expect((await errorConDetalle(c, () => f(admin, "0"))).detalle).toEqual({ campo: "monto" });
      expect((await errorConDetalle(c, () => f(admin, "10.00", "  "))).detalle).toEqual({ campo: "concepto" });
      await f(admin, "500.00");
      expect(await saldo(c, cli)).toMatchObject({ saldo: "500.00", vencido: "500.00", disponible: "0.00" });
      expect((await fila(c, "select origen, concepto, estado from app.cuenta_por_cobrar where cliente_id = $1", [cli]))).toEqual({ origen: "saldo_inicial", concepto: "Libreta", estado: "pendiente" });
    });
  });
});

describe("semaforo de fiado y limite sugerido", () => {
  const semaforo = (c: pg.PoolClient, cli: string) =>
    fila<{ color: string; dias_promedio_pago: string | null; max_dias_vencido: number; limite_sugerido: string }>(
      c, "select color, dias_promedio_pago::text, max_dias_vencido, limite_sugerido::text from app.v_semaforo_cliente where cliente_id = $1", [cli]);

  it("verde si vence manana o no hay historial; amarillo vencido hace 5 dias; rojo vencido hace 20 o con saldo arriba del limite", async () => {
    await enTransaccion(async (c) => {
      const u = await usuarioF3(c, ROL3.dueno);
      const nuevo = async (limite: string, monto: string | null, dias: number) => {
        const cli = await clienteCredito(c, limite, 7);
        if (monto) await saldoInicial(c, cli, monto, await dia(c, dias), u);
        return cli;
      };
      expect((await semaforo(c, await nuevo("1000.00", null, 0))).color).toBe("verde");
      expect((await semaforo(c, await nuevo("1000.00", "100.00", 1))).color).toBe("verde");
      const am = await semaforo(c, await nuevo("1000.00", "100.00", -5));
      expect(am).toMatchObject({ color: "amarillo", max_dias_vencido: 5 });
      expect((await semaforo(c, await nuevo("1000.00", "100.00", -15))).color).toBe("amarillo");
      expect((await semaforo(c, await nuevo("1000.00", "100.00", -20))).color).toBe("rojo");
      const rojo = await semaforo(c, await nuevo("100.00", "150.00", 30));
      expect(rojo).toMatchObject({ color: "rojo", limite_sugerido: "150.00" });
    });
  });

  async function conHistorial(c: pg.PoolClient, diasPago: number) {
    const j = await juego(c);
    await turnoMostrador(c, j.dueno);
    const cli = await clienteCredito(c, "5000.00", 7);
    const ventas: string[] = [];
    for (let i = 0; i < 4; i++) {
      ventas.push((await vender(c, j.dueno, { cliente_id: cli, lineas: [{ presentacion_id: j.corona.caja, cantidad: 1 }], ...credito("400.00") })).venta_id);
    }
    const ab = await abonar(c, j.dueno, { cliente_id: cli, monto: "1600.00" });
    for (const v of ventas) {
      const cxc = (await fila<{ id: string }>(c, "select id::text from app.cuenta_por_cobrar where venta_id = $1", [v])).id;
      await fechar(c, "cuenta_por_cobrar", cxc, `${(await dia(c, -20))} 12:00:00-06`);
    }
    await fechar(c, "abono", ab.abono_id, `${(await dia(c, -20 + diasPago))} 12:00:00-06`);
    return cli;
  }

  it("limite sugerido: 1600.00 a credito en 56 dias, saldadas a los 3 dias, 7 dias de credito, verde -> 600.00; saldadas a los 10 dias (amarillo) -> 400.00", async () => {
    await enTransaccion(async (c) => {
      const cli = await conHistorial(c, 3);
      expect(await semaforo(c, cli)).toMatchObject({ color: "verde", dias_promedio_pago: "3.0", limite_sugerido: "600.00" });
    });
    await enTransaccion(async (c) => {
      const cli = await conHistorial(c, 10);
      expect(await semaforo(c, cli)).toMatchObject({ color: "amarillo", limite_sugerido: "400.00" });
    });
  });
});

describe("estado de cuenta", () => {
  it("E tras el abono: cargos 300.00 y 200.00, abono 400.00, saldo final 100.00 = v_saldo_cliente; con desde = manana -> saldo inicial 100.00 sin movimientos; lo cancelado no aparece", async () => {
    await enTransaccion(async (c) => {
      const dueno = await usuarioF3(c, ROL3.dueno);
      const E = await clienteCredito(c, "1000.00", 7);
      await saldoInicial(c, E, "300.00", await dia(c, -10), dueno);
      await saldoInicial(c, E, "200.00", await dia(c, 5), dueno);
      await turnoMostrador(c, dueno);
      await abonar(c, dueno, { cliente_id: E, monto: "400.00" });
      const ec = async (desde: string) => (await c.query("select app.fn_estado_cuenta($1, $2::date, app.fn_fecha_local(now())) as r", [E, desde])).rows[0].r;
      const r = await ec(await dia(c, -30));
      expect(r.saldo_inicial).toBe("0.00");
      expect(r.movimientos.map((m: Record<string, string>) => [m.tipo, m.cargo, m.abono, m.saldo])).toEqual([
        ["saldo_inicial", "300.00", "0.00", "300.00"], ["saldo_inicial", "200.00", "0.00", "500.00"], ["abono", "0.00", "400.00", "100.00"]]);
      expect(r.movimientos[0]).toMatchObject({ concepto: "Saldo de prueba" });
      expect(r.movimientos[2].folio).toMatch(/^A-\d{6}$/);
      expect(r.saldo_final).toBe("100.00");
      expect(r.saldo_final).toBe((await saldo(c, E)).saldo);
      expect(r.vencido).toBe("0.00");
      const manana = await ec(await dia(c, 1));
      expect(manana).toMatchObject({ saldo_inicial: "100.00", movimientos: [], saldo_final: "100.00" });
      // un abono cancelado no aparece
      const a2 = await abonar(c, dueno, { cliente_id: E, monto: "50.00" });
      await c.query("select app.fn_cancelar_abono($1, $2, 'mal')", [dueno, a2.abono_id]);
      const despues = await ec(await dia(c, -30));
      expect(despues.movimientos).toHaveLength(3);
      expect(despues.saldo_final).toBe("100.00");
    });
  });

  it("devolucion que baja el saldo aparece como abono con folio D y la CxC de una venta cancelada no aparece", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const { v2 } = await entregasBase(c, j);
      const six = (await fila<{ id: string }>(c, "select id::text from app.venta_linea where venta_id = $1 and factor = 6", [v2])).id;
      await devolver(c, j.rep, v2, { lineas: [{ venta_linea_id: six, piezas: 6, regresa_a_inventario: true }] });
      const ec = (await c.query("select app.fn_estado_cuenta($1, $2::date, $3::date) as r", [j.C, await dia(c, -5), j.hoy])).rows[0].r;
      expect(ec.movimientos.map((m: Record<string, string>) => [m.tipo, m.cargo, m.abono, m.saldo])).toEqual([["venta", "505.00", "0.00", "505.00"], ["devolucion", "0.00", "105.00", "400.00"]]);
      expect(ec.movimientos[1].folio).toMatch(/^D-\d{6}$/);
      expect(ec.saldo_final).toBe("400.00");
      // venta cancelada de otro cliente: su CxC no entra
      await turnoMostrador(c, j.dueno);
      const v = await vender(c, j.dueno, { cliente_id: j.D, lineas: [{ presentacion_id: j.corona.six, cantidad: 1 }], ...credito("105.00") });
      await c.query("select app.fn_cancelar_venta($1, $2, 'error')", [j.dueno, v.venta_id]);
      const ecD = (await c.query("select app.fn_estado_cuenta($1, $2::date, $3::date) as r", [j.D, await dia(c, -30), j.hoy])).rows[0].r;
      expect(ecD.movimientos).toHaveLength(1);
      expect(ecD.saldo_final).toBe("300.00");
    });
  });
});

describe("resumen del dia", () => {
  it("con el juego fijo tras las entregas: vendido 1295.00, ganancia 330.00, cobrado 600.00/390.00, fiado nuevo 505.00, por cobrar +605.00, por comprar = fn_lista_surtido(manana)", async () => {
    await enTransaccion(async (c) => {
      const hoy = await dia(c, 0);
      const antes = await resumenDia(c, hoy);
      const j = await juego(c);
      await entregasBase(c, j);
      await abonar(c, j.rep, { cliente_id: j.D, monto: "200.00", ruta_parada_id: j.paradaCobro });
      const despues = await resumenDia(c, hoy);
      const delta = async (clave: string) => (await c.query(
        "select ((($1::jsonb) #>> $3::text[])::numeric - (($2::jsonb) #>> $3::text[])::numeric)::text as d", [JSON.stringify(despues), JSON.stringify(antes), `{${clave}}`])).rows[0].d as string;
      expect(await delta("vendido")).toBe("1295.00");
      expect(await delta("ganancia")).toBe("330.00");
      expect(await delta("cobrado,efectivo")).toBe("600.00");
      expect(await delta("cobrado,transferencia")).toBe("390.00");
      expect(await delta("fiado_nuevo")).toBe("505.00");
      expect(await delta("por_cobrar")).toBe("605.00");
      const lista = await fila<{ n: number; costo: string }>(c, "select count(*)::int as n, coalesce(sum(costo_estimado), 0)::numeric(12,2)::text as costo from app.fn_lista_surtido(1, app.fn_fecha_local(now()) + 1)");
      expect(despues.por_comprar).toEqual({ productos: lista.n, costo_estimado: lista.costo });
    });
  });

  it("una devolucion del dia resta de lo vendido y de la ganancia", async () => {
    await enTransaccion(async (c) => {
      const hoy = await dia(c, 0);
      const j = await juego(c);
      const { v1 } = await entregasBase(c, j);
      const antes = await resumenDia(c, hoy);
      await turnoMostrador(c, j.dueno);
      const vl = (await fila<{ id: string }>(c, "select id::text from app.venta_linea where venta_id = $1", [v1])).id;
      await devolver(c, j.dueno, v1, { lineas: [{ venta_linea_id: vl, piezas: 12, regresa_a_inventario: true }] });
      const despues = await resumenDia(c, hoy);
      const d = async (clave: string) => (await c.query("select ((($1::jsonb) #>> $3::text[])::numeric - (($2::jsonb) #>> $3::text[])::numeric)::text as d", [JSON.stringify(despues), JSON.stringify(antes), `{${clave}}`])).rows[0].d as string;
      expect(await d("vendido")).toBe("-200.00");
      expect(await d("ganancia")).toBe("-50.00"); // 200.00 de importe - 150.00 de costo
    });
  });
});

describe("paradas de cobro", () => {
  it("fn_agregar_cobro: D en ruta planeada -> parada cobro; repetir -> PARADA_DUPLICADA; sin saldo -> ESTADO_NO_VALIDO; en curso -> RUTA_NO_EDITABLE; sugerencias lista a D y no a C", async () => {
    await enTransaccion(async (c) => {
      const dueno = await usuarioF3(c, ROL3.dueno);
      const hoy = await dia(c, 0);
      const j0 = await juego(c);
      expect((await error(c, () => c.query("select app.fn_agregar_cobro($1, $2, $3)", [j0.dueno, j0.ruta, j0.D]))).message).toBe("RUTA_NO_EDITABLE");
      const A = await clienteCredito(c, "1000.00", 7);
      const Cc = await clienteCredito(c, "1000.00", 7);
      const Dd = await clienteCredito(c, "500.00", 0);
      const Ee = await clienteCredito(c, "500.00", 0);
      await saldoInicial(c, Cc, "100.00", await dia(c, 5), dueno);
      await saldoInicial(c, Dd, "300.00", await dia(c, -10), dueno);
      const ped = await pedidoConfirmado(c, A, [lin(j0.corona.six, 1)], hoy, dueno);
      const r = await rutaCon(c, [ped], { fecha: hoy, usuario: dueno });
      const sug = await q(c, "select cliente_id::text as id, vencido::text, saldo::text from app.fn_sugerencias_cobro($1) where cliente_id = any($2)", [r.id, [Cc, Dd, Ee]]);
      expect(sug).toEqual([{ id: Dd, vencido: "300.00", saldo: "300.00" }]);
      const par = (await c.query("select app.fn_agregar_cobro($1, $2, $3) as id", [dueno, r.id, Dd])).rows[0].id;
      expect(await fila(c, "select tipo, pedido_id, estado, orden from app.ruta_parada where id = $1", [par])).toEqual({ tipo: "cobro", pedido_id: null, estado: "pendiente", orden: 2 });
      expect((await error(c, () => c.query("select app.fn_agregar_cobro($1, $2, $3)", [dueno, r.id, Dd]))).message).toBe("PARADA_DUPLICADA");
      expect((await errorConDetalle(c, () => c.query("select app.fn_agregar_cobro($1, $2, $3)", [dueno, r.id, Ee]))).detalle).toEqual({ motivo: "sin_saldo" });
      expect((await q(c, "select cliente_id from app.fn_sugerencias_cobro($1) where cliente_id = $2", [r.id, Dd]))).toEqual([]);
      const rep = await repartidor(c);
      expect((await errorConDetalle(c, () => c.query("select app.fn_agregar_cobro($1, $2, $3)", [rep, r.id, Cc]))).detalle).toEqual({ permiso: "rutas.planear" });
    });
  });

  it("parada de cobro no entregado: queda fallida sin pedido ni aviso; terminar la deja omitida si nadie paso", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const antes = (await fila<{ n: number }>(c, "select count(*)::int as n from app.aviso_cliente")).n;
      await c.query("select app.fn_marcar_no_entregado($1, $2, 'cerrado')", [j.rep, j.paradaCobro]);
      expect((await fila(c, "select estado from app.ruta_parada where id = $1", [j.paradaCobro])).estado).toBe("fallida");
      expect((await fila<{ n: number }>(c, "select count(*)::int as n from app.aviso_cliente")).n).toBe(antes);
    });
  });
});

describe("avisos y seguimiento", () => {
  it("el Repartidor ve wa_pedido_en_ruta, wa_entrega_fallida y wa_nota_entrega mientras la ruta esta en curso y ninguno cuando se liquida", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      await entregasBase(c, j);
      const ve = async (plantilla: string) => (await fila<{ v: boolean }>(c, "select app.fn_puede_ver_aviso($1, $2, $3) as v", [j.rep, j.P1, plantilla])).v;
      for (const p of ["wa_pedido_en_ruta", "wa_entrega_fallida", "wa_nota_entrega"]) expect(await ve(p), p).toBe(true);
      expect(await ve("wa_pedido_confirmado")).toBe(false);
      await c.query("select app.fn_marcar_no_entregado($1, $2, 'cerrado')", [j.rep, j.parada[j.P4]!]);
      await cerrarRuta(c, j);
      await c.query("select app.fn_liquidar_ruta($1, $2, '900.00', null)", [j.dueno, j.ruta]);
      for (const p of ["wa_pedido_en_ruta", "wa_entrega_fallida", "wa_nota_entrega"]) expect(await ve(p), p).toBe(false);
    });
  });

  it("el seguimiento de un pedido entregado trae 'recibio' y nunca la foto; sin entregar no trae 'recibio'", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const antes = (await c.query("select app.fn_seguimiento_pedido($1, $2) as r", [j.A, j.P1])).rows[0].r;
      expect(antes).not.toHaveProperty("recibio");
      const foto = `${"b".repeat(64)}.jpg`;
      await entregar(c, j.rep, j.P1, { ...efectivo("800.00"), recibio: "Doña Lupe", foto_entrega: foto });
      const r = (await c.query("select app.fn_seguimiento_pedido($1, $2) as r", [j.A, j.P1])).rows[0].r;
      expect(r.recibio).toBe("Doña Lupe");
      expect(r.etapa).toBe("entregado");
      expect(JSON.stringify(r)).not.toContain(foto);
      expect(r).not.toHaveProperty("foto_entrega");
      expect(await fila(c, "select recibio, foto_entrega from app.pedido where id = $1", [j.P1])).toEqual({ recibio: "Doña Lupe", foto_entrega: foto });
      expect(r.reparto).toBeNull();
    });
  });

  it("recibio de mas de 80 caracteres o foto con formato raro -> VALIDACION y no se entrega", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      expect((await errorConDetalle(c, () => entregar(c, j.rep, j.P1, { ...efectivo("800.00"), recibio: "x".repeat(81) }))).detalle).toEqual({ campo: "recibio" });
      expect((await errorConDetalle(c, () => entregar(c, j.rep, j.P1, { ...efectivo("800.00"), foto_entrega: "../etc/passwd" }))).detalle).toEqual({ campo: "foto_entrega" });
      expect((await fila(c, "select estado from app.pedido where id = $1", [j.P1])).estado).toBe("en_ruta");
    });
  });
});

describe("venta de mostrador", () => {
  it("venta en efectivo con cambio: total, costo por linea, movimiento y folio; publico en general; idempotente", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const cajero = await usuarioF3(c, ROL3.cajero);
      const turno = await turnoMostrador(c, cajero, "100.00");
      const clave = "66666666-6666-4666-8666-666666666666";
      const v = await vender(c, cajero, { clave, lineas: [{ presentacion_id: j.corona.caja, cantidad: 1 }, { presentacion_id: j.corona.pieza, cantidad: 3 }], ...efectivo("454.00", "500.00") });
      expect(await fila(c, "select total::text, cambio::text, efectivo_recibido::text as r, cliente_id, turno_caja_id::text as t, origen, folio from app.venta where id = $1", [v.venta_id]))
        .toMatchObject({ total: "454.00", cambio: "46.00", r: "500.00", cliente_id: null, t: turno, origen: "mostrador" });
      expect(await q(c, "select cantidad, importe::text, costo_total::text as costo from app.venta_linea where venta_id = $1 order by numero", [v.venta_id]))
        .toEqual([{ cantidad: 1, importe: "400.00", costo: "300.00" }, { cantidad: 3, importe: "54.00", costo: "37.50" }]);
      expect(await q(c, "select cantidad from app.movimiento_inventario where producto_id = $1 and tipo = 'venta' order by id", [j.corona.id])).toEqual([{ cantidad: -24 }, { cantidad: -3 }]);
      expect(await vender(c, cajero, { clave, lineas: [{ presentacion_id: j.corona.caja, cantidad: 1 }, { presentacion_id: j.corona.pieza, cantidad: 3 }], ...efectivo("454.00", "500.00") }))
        .toEqual({ venta_id: v.venta_id, repetida: true });
      expect((await resumen(c, turno)).efectivo_esperado).toBe("554.00");
    });
  });

  it("validaciones: sin turno, sin lineas, presentacion no vendible, credito a publico general o a quien no tiene limite, precio o lista distinta sin permiso", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const cajero = await usuarioF3(c, ROL3.cajero);
      const unaSix = { lineas: [{ presentacion_id: j.corona.six, cantidad: 1 }] };
      expect((await error(c, () => vender(c, cajero, { ...unaSix, ...efectivo("105.00") }))).message).toBe("TURNO_NO_ABIERTO");
      await turnoMostrador(c, cajero);
      expect((await error(c, () => vender(c, cajero, { lineas: [], ...efectivo("1.00") }))).message).toBe("VENTA_VACIA");
      await c.query("update app.presentacion set se_vende = false where id = $1", [j.corona.pieza]);
      expect((await error(c, () => vender(c, cajero, { lineas: [{ presentacion_id: j.corona.pieza, cantidad: 1 }], ...efectivo("18.00") }))).message).toBe("PRESENTACION_NO_VALIDA");
      expect((await error(c, () => vender(c, cajero, { ...unaSix, ...credito("105.00") }))).message).toBe("CREDITO_SIN_CLIENTE");
      expect((await error(c, () => vender(c, cajero, { ...unaSix, cliente_id: j.A, ...credito("105.00") }))).message).toBe("LIMITE_CREDITO_EXCEDIDO");
      expect((await error(c, () => vender(c, cajero, { lineas: [{ presentacion_id: j.corona.six, cantidad: 1, precio_unitario: "50.00" }], ...efectivo("50.00") }))).message).toBe("SIN_PERMISO_PRECIO");
      const mayoreo = (await fila<{ id: string }>(c, "select id::text from app.lista_precio where nombre = 'Mayoreo'")).id;
      expect((await error(c, () => vender(c, cajero, { ...unaSix, lista_precio_id: mayoreo, ...efectivo("105.00") }))).message).toBe("SIN_PERMISO_PRECIO");
      const sinCredito = await usuarioF3(c, ROL3.almacenista);
      expect((await errorConDetalle(c, () => vender(c, sinCredito, { ...unaSix, ...efectivo("105.00") }))).detalle).toEqual({ permiso: "ventas.crear" });
      // el Dueno si cambia el precio (por debajo del costo no se bloquea)
      const d = await usuarioF3(c, ROL3.dueno);
      await turnoMostrador(c, d);
      const v = await vender(c, d, { lineas: [{ presentacion_id: j.corona.six, cantidad: 1, precio_unitario: "50.00" }], ...efectivo("50.00") });
      expect(await fila(c, "select precio_lista::text as l, precio_unitario::text as u from app.venta_linea where venta_id = $1", [v.venta_id])).toEqual({ l: "105.00", u: "50.00" });
      // turno de ruta: no sirve para vender en mostrador
      const admin = await usuarioF3(c, ROL.admin);
      const ped = await pedidoConfirmado(c, j.A, [lin(j.corona.six, 1)], j.hoy, j.dueno);
      const r = await rutaCon(c, [ped], { fecha: j.hoy, usuario: j.dueno, repartidor: admin });
      await c.query("select app.fn_cargar_ruta($1, $2)", [j.dueno, r.id]);
      await c.query("select app.fn_iniciar_ruta($1, $2, '0')", [admin, r.id]);
      expect((await error(c, () => vender(c, admin, { ...unaSix, ...efectivo("105.00") }))).message).toBe("TURNO_NO_VALIDO");
    });
  });
});

describe("protecciones de las tablas de dinero", () => {
  it("lineas, pagos (salvo la verificacion), movimientos de caja, devoluciones y aplicaciones son inmutables; TRUNCATE bloqueado", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const { v1, v2 } = await entregasBase(c, j);
      await c.query("select app.fn_movimiento_caja($1, $2, 'salida', 1, 'x')", [j.rep, j.turno]);
      const six = (await fila<{ id: string }>(c, "select id::text from app.venta_linea where venta_id = $1 and factor = 6", [v2])).id;
      const dev = await devolver(c, j.rep, v2, { lineas: [{ venta_linea_id: six, piezas: 6, regresa_a_inventario: true }] });
      const dueno = await usuarioF3(c, ROL3.dueno);
      await turnoMostrador(c, dueno);
      const ab = await abonar(c, dueno, { cliente_id: j.D, monto: "10.00" });
      const casos: [string, string][] = [
        ["update app.venta_linea set importe = 1 where venta_id = $1", v1],
        ["delete from app.venta_linea where venta_id = $1", v1],
        ["update app.venta_pago set monto = 1 where venta_id = $1", v1],
        ["delete from app.venta_pago where venta_id = $1", v1],
        ["update app.movimiento_caja set monto = 1 where turno_caja_id = $1", j.turno],
        ["delete from app.movimiento_caja where turno_caja_id = $1", j.turno],
        ["update app.devolucion set total = 1 where id = $1", dev.devolucion_id],
        ["delete from app.devolucion_linea where devolucion_id = $1", dev.devolucion_id],
        ["update app.abono_aplicacion set monto = 1 where abono_id = $1", ab.abono_id],
        ["delete from app.abono_aplicacion where abono_id = $1", ab.abono_id],
      ];
      for (const [sql, id] of casos) expect((await error(c, () => c.query(sql, [id]))).message, sql).toBe("ESTADO_NO_VALIDO");
      for (const t of ["movimiento_caja", "venta_linea", "venta_pago", "devolucion", "devolucion_linea", "abono_aplicacion", "venta", "abono", "cuenta_por_cobrar"]) {
        expect((await error(c, () => c.query(`truncate app.${t} cascade`))).message, t).toBe("ESTADO_NO_VALIDO");
      }
    });
  });
});

/* ---------------------------------------------------------------- revision independiente de 008 */

const sinBandera = (c: pg.PoolClient) => c.query("select set_config('app.escribiendo_dinero', '', true)");
const PIEZAS_CAJA = 24;

describe("turno cerrado, carreras y devoluciones acumuladas", () => {
  /** Datos confirmados: juego, turno de mostrador del dueno y una venta de 1 Caja en efectivo. Devuelve lo necesario y los marcadores a borrar. */
  async function montar() {
    const c0 = await pool.connect();
    try {
      await c0.query("begin");
      const j = await juego(c0);
      const turno = await turnoMostrador(c0, j.dueno, "0.00");
      const v = await vender(c0, j.dueno, { lineas: [{ presentacion_id: j.corona.caja, cantidad: 1 }], ...efectivo("400.00") });
      const vl = (await fila<{ id: string }>(c0, "select id::text from app.venta_linea where venta_id = $1", [v.venta_id])).id;
      await c0.query("commit");
      return { j, turno, venta: v.venta_id, vl };
    } finally { c0.release(); }
  }
  /** A cierra el turno sin confirmar; B intenta `accion` con el mismo usuario; al confirmar A, B debe verlo cerrado. */
  async function carreraConCierre(accion: (b: pg.PoolClient, m: Awaited<ReturnType<typeof montar>>) => Promise<unknown>) {
    const marcas = await marcarAgua();
    try {
      const m = await montar();
      const a = await pool.connect();
      const b = await pool.connect();
      try {
        await a.query("begin");
        await b.query("begin");
        await a.query("select app.fn_cerrar_turno($1, $2, 400, null)", [m.j.dueno, m.turno]);
        const segundo = accion(b, m).then(() => "ok", (e: { message: string }) => e.message);
        await new Promise((r) => setTimeout(r, 400));
        await a.query("commit");
        expect(await segundo).toBe("TURNO_NO_ABIERTO");
        await b.query("rollback");
        // nada se escribio en el turno ya cerrado
        expect((await pool.query("select count(*)::int as n from app.movimiento_caja where turno_caja_id = $1", [m.turno])).rows[0].n).toBe(0);
      } finally {
        await a.query("rollback").catch(() => undefined);
        await b.query("rollback").catch(() => undefined);
        a.release();
        b.release();
      }
    } finally { await borrarDesde(marcas); }
  }

  it("cancelar una venta en efectivo mientras se cierra su turno -> TURNO_NO_ABIERTO y ningun reembolso", async () => {
    await carreraConCierre((b, m) => b.query("select app.fn_cancelar_venta($1, $2, 'x')", [m.j.dueno, m.venta]));
  });

  it("devolver con reembolso mientras se cierra el turno -> TURNO_NO_ABIERTO", async () => {
    await carreraConCierre((b, m) => devolver(b, m.j.dueno, m.venta, { lineas: [{ venta_linea_id: m.vl, piezas: 6, regresa_a_inventario: true }] }));
  });

  it("abonar en efectivo mientras se cierra el turno -> TURNO_NO_ABIERTO (tambien con transferencia: el turno propio ya cerro)", async () => {
    await carreraConCierre(async (b, m) => {
      await b.query("select app.fn_saldo_inicial($1, $2, 100, current_date, 'x')", [m.j.dueno, m.j.A]);
      return abonar(b, m.j.dueno, { cliente_id: m.j.A, metodo: "transferencia", monto: "50.00" });
    });
  });

  it("disparadores: movimiento, venta y abono nuevos en un turno cerrado -> TURNO_NO_ABIERTO aunque se salte la funcion", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const dueno = await usuarioF3(c, ROL3.dueno);
      const turno = await turnoMostrador(c, dueno);
      await c.query("select app.fn_cerrar_turno($1, $2, 0, null)", [dueno, turno]);
      await c.query("select set_config('app.escribiendo_dinero', '1', true)");
      expect((await error(c, () => c.query("insert into app.movimiento_caja (turno_caja_id, tipo, monto, motivo, usuario_id) values ($1, 'salida', 1, 'x', $2)", [turno, dueno]))).message).toBe("TURNO_NO_ABIERTO");
      expect((await error(c, () => c.query(
        `insert into app.abono (sucursal_id, folio, cliente_id, turno_caja_id, metodo, monto, usuario_id, clave_idempotencia, hash_solicitud)
         values (1, 'A-999999', $1, $2, 'efectivo', 1, $3, gen_random_uuid(), 'x')`, [j.D, turno, dueno]))).message).toBe("TURNO_NO_ABIERTO");
      expect((await error(c, () => c.query(
        `insert into app.venta (sucursal_id, folio, origen, turno_caja_id, lista_precio_id, usuario_id, clave_idempotencia, hash_solicitud)
         values (1, 'V-999999', 'mostrador', $1, (select id from app.lista_precio where es_predeterminada), $2, gen_random_uuid(), 'x')`, [turno, dueno]))).message).toBe("TURNO_NO_ABIERTO");
    });
  });

  it("dos aperturas de turno a la vez del mismo usuario: la segunda -> TURNO_YA_ABIERTO (no 23505)", async () => {
    const marcas = await marcarAgua();
    try {
      const c0 = await pool.connect();
      let dueno = "";
      let cajas: string[] = [];
      try {
        await c0.query("begin");
        dueno = await usuarioF3(c0, ROL3.dueno);
        cajas = [(await c0.query("insert into app.caja (sucursal_id, nombre) values (1, 'Carrera 1x') returning id::text as id")).rows[0].id,
          (await c0.query("insert into app.caja (sucursal_id, nombre) values (1, 'Carrera 2x') returning id::text as id")).rows[0].id];
        await c0.query("commit");
      } finally { c0.release(); }
      const a = await pool.connect();
      const b = await pool.connect();
      try {
        await a.query("begin");
        await b.query("begin");
        await a.query("select app.fn_abrir_turno($1, $2, 0)", [dueno, cajas[0]]);
        const segundo = b.query("select app.fn_abrir_turno($1, $2, 0)", [dueno, cajas[1]]).then(() => "ok", (e: { message: string }) => e.message);
        await new Promise((r) => setTimeout(r, 400));
        await a.query("commit");
        expect(await segundo).toBe("TURNO_YA_ABIERTO");
        await b.query("rollback");
      } finally {
        await a.query("rollback").catch(() => undefined);
        await b.query("rollback").catch(() => undefined);
        a.release();
        b.release();
      }
    } finally { await borrarDesde(marcas); }
  });

  it("devolver una Caja una pieza a la vez: las 24 devoluciones suman exactamente 400.00 (y 300.00 de costo); una mas -> DEVOLUCION_EXCEDE_VENDIDO", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const dueno = await usuarioF3(c, ROL3.dueno);
      await turnoMostrador(c, dueno);
      const v = await vender(c, dueno, { lineas: [{ presentacion_id: j.corona.caja, cantidad: 1 }], ...efectivo("400.00") });
      const vl = (await fila<{ id: string }>(c, "select id::text from app.venta_linea where venta_id = $1", [v.venta_id])).id;
      for (let i = 0; i < PIEZAS_CAJA; i++) await devolver(c, dueno, v.venta_id, { lineas: [{ venta_linea_id: vl, piezas: 1, regresa_a_inventario: true }] });
      expect(await fila(c, "select sum(d.total)::text as t, sum(d.reembolso_efectivo)::text as r from app.devolucion d where d.venta_id = $1", [v.venta_id])).toEqual({ t: "400.00", r: "400.00" });
      expect(await fila(c, "select sum(dl.importe)::text as i, sum(dl.costo_total)::text as c from app.devolucion_linea dl where dl.venta_linea_id = $1", [vl])).toEqual({ i: "400.00", c: "300.00" });
      expect((await error(c, () => devolver(c, dueno, v.venta_id, { lineas: [{ venta_linea_id: vl, piezas: 1, regresa_a_inventario: true }] }))).message).toBe("DEVOLUCION_EXCEDE_VENDIDO");
    });
  });

  it("devolucion parcial de una venta mixta (100.00 efectivo + 300.00 fiado): 18 pz bajan el fiado a 0.00; 6 pz mas se reembolsan en efectivo", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const dueno = await usuarioF3(c, ROL3.dueno);
      await turnoMostrador(c, dueno);
      const v = await vender(c, dueno, { cliente_id: j.C, lineas: [{ presentacion_id: j.corona.caja, cantidad: 1 }],
        pagos: [{ metodo: "efectivo", monto: "100.00" }, { metodo: "credito", monto: "300.00" }] });
      expect((await saldo(c, j.C)).saldo).toBe("300.00");
      const vl = (await fila<{ id: string }>(c, "select id::text from app.venta_linea where venta_id = $1", [v.venta_id])).id;
      const d1 = await devolver(c, dueno, v.venta_id, { lineas: [{ venta_linea_id: vl, piezas: 18, regresa_a_inventario: true }] });
      expect(await fila(c, "select total::text, abono_credito::text as ab, reembolso_efectivo::text as re from app.devolucion where id = $1", [d1.devolucion_id])).toEqual({ total: "300.00", ab: "300.00", re: "0.00" });
      expect((await saldo(c, j.C)).saldo).toBe("0.00");
      const d2 = await devolver(c, dueno, v.venta_id, { lineas: [{ venta_linea_id: vl, piezas: 6, regresa_a_inventario: true }] });
      expect(await fila(c, "select total::text, abono_credito::text as ab, reembolso_efectivo::text as re from app.devolucion where id = $1", [d2.devolucion_id])).toEqual({ total: "100.00", ab: "0.00", re: "100.00" });
    });
  });

  it("cancelar un abono despues de una devolucion que bajo la misma cuenta: la cuenta recupera lo abonado (saldo 400.00 de 505.00)", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const { v2 } = await entregasBase(c, j);
      const dueno = await usuarioF3(c, ROL3.dueno);
      await turnoMostrador(c, dueno);
      const ab = await abonar(c, dueno, { cliente_id: j.C, monto: "300.00" });
      expect((await saldo(c, j.C)).saldo).toBe("205.00");
      const six = (await fila<{ id: string }>(c, "select id::text from app.venta_linea where venta_id = $1 and factor = 6", [v2])).id;
      await devolver(c, dueno, v2, { lineas: [{ venta_linea_id: six, piezas: 6, regresa_a_inventario: true }] });
      expect((await saldo(c, j.C)).saldo).toBe("100.00");
      await c.query("select app.fn_cancelar_abono($1, $2, 'error')", [dueno, ab.abono_id]);
      expect(await saldo(c, j.C)).toMatchObject({ saldo: "400.00", cuentas_pendientes: 1 });
    });
  });

  it("una devolucion que no tiene importe (linea de precio 0.00) -> VALIDACION, no 23514", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const dueno = await usuarioF3(c, ROL3.dueno);
      await turnoMostrador(c, dueno);
      const v = await vender(c, dueno, { lineas: [{ presentacion_id: j.corona.caja, cantidad: 1 }, { presentacion_id: j.corona.pieza, cantidad: 1, precio_unitario: "0.00" }], ...efectivo("400.00") });
      const regalo = (await fila<{ id: string }>(c, "select id::text from app.venta_linea where venta_id = $1 and precio_unitario = 0", [v.venta_id])).id;
      expect((await errorConDetalle(c, () => devolver(c, dueno, v.venta_id, { lineas: [{ venta_linea_id: regalo, piezas: 1, regresa_a_inventario: true }] }))).detalle).toMatchObject({ campo: "lineas" });
    });
  });

  it("devoluciones_producto de la ruta suma lo que el repartidor recibio devuelto en sus visitas", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const { v1 } = await entregasBase(c, j);
      expect((await resumen(c, j.turno)).devoluciones_producto).toEqual([{ producto: j.corona.nombre, piezas: 72 }]);
      const vl = (await fila<{ id: string }>(c, "select id::text from app.venta_linea where venta_id = $1", [v1])).id;
      await devolver(c, j.rep, v1, { lineas: [{ venta_linea_id: vl, piezas: 6, regresa_a_inventario: true }] });
      expect((await resumen(c, j.turno)).devoluciones_producto).toEqual([{ producto: j.corona.nombre, piezas: 78 }]);
    });
  });
});

describe("entrega, vista previa y tablas guardadas", () => {
  it("solo el repartidor de la ruta entrega y ve la vista previa de sus pedidos: otro con rutas.planear (el dueno) -> RUTA_AJENA", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      expect((await errorConDetalle(c, () => entregar(c, j.dueno, j.P2, credito("505.00")))).message).toBe("RUTA_AJENA");
      expect((await error(c, () => c.query("select app.fn_vista_cobro($1, $2, $3::jsonb)", [j.dueno, j.P2, JSON.stringify({ pagos: [] })]))).message).toBe("RUTA_AJENA");
      const cajero = await usuarioF3(c, ROL3.cajero);
      expect((await error(c, () => c.query("select app.fn_vista_cobro($1, $2, $3::jsonb)", [cajero, j.P2, JSON.stringify({ pagos: [] })]))).message).toBe("SIN_PERMISO");
    });
  });

  it("fn_vista_cobro: el resto se calcula en SQL, el cambio sale del efectivo, el credito se compara con el limite y lo que no cuadra se reporta", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const vista = async (ped: string, datos: Record<string, unknown>) => (await c.query("select app.fn_vista_cobro($1, $2, $3::jsonb) as v", [j.rep, ped, JSON.stringify(datos)])).rows[0].v;
      const mixto = await vista(j.P2, { pagos: [{ metodo: "efectivo", monto: "100.00" }, { metodo: "credito", monto: null }], efectivo_recibido: "200.00" });
      expect(mixto).toMatchObject({ total: "505.00", pagado: "100.00", credito: "405.00", falta: "0.00", cuadra: true, cambio: "100.00", efectivo_insuficiente: false,
        saldo: "0.00", saldo_despues: "405.00", limite: "1000.00", disponible_despues: "595.00", excede_limite: false });
      expect(mixto.pagos).toEqual([{ metodo: "efectivo", monto: "100.00" }, { metodo: "credito", monto: "405.00" }]);
      // entrega parcial: solo la Caja (400.00); lo que falta se reporta
      const lCaja = await lineaPedido(c, j.P2, j.corona.caja);
      const lSix = await lineaPedido(c, j.P2, j.corona.six);
      const parcial = await vista(j.P2, { lineas: [{ pedido_linea_id: lSix, cantidad_entregada: 0 }], pagos: [{ metodo: "efectivo", monto: "100.00" }] });
      expect(parcial).toMatchObject({ total: "400.00", pagado: "100.00", falta: "300.00", cuadra: false });
      expect(lCaja).not.toBe(lSix);
      expect(await vista(j.P2, { pagos: [{ metodo: "efectivo", monto: null }], efectivo_recibido: "300.00" })).toMatchObject({ cambio: null, efectivo_insuficiente: true, cuadra: true });
      // la misma regla que la entrega: con C ya debiendo 505.00, P4 (800.00) a credito pasa del limite
      await entregar(c, j.rep, j.P2, credito("505.00"));
      expect(await vista(j.P4, { pagos: [{ metodo: "credito", monto: null }] })).toMatchObject({ saldo: "505.00", saldo_despues: "1305.00", disponible_despues: "0.00", excede_limite: true });
      expect((await errorConDetalle(c, () => entregar(c, j.rep, j.P4, credito("800.00")))).detalle).toEqual({ limite: "1000.00", saldo: "505.00", disponible: "495.00" });
      // errores de la vista
      expect((await error(c, () => vista(j.P4, { pagos: [{ metodo: "efectivo", monto: null }, { metodo: "credito", monto: null }] }))).message).toBe("VALIDACION");
      expect((await error(c, () => vista(j.P4, { pagos: [{ metodo: "efectivo", monto: "800.00" }, { metodo: "credito", monto: null }] }))).message).toBe("PAGOS_NO_CUADRAN");
    });
  });

  it("venta mixta contra el limite: solo la parte a fiado entra en la cuenta y en el limite", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const dueno = await usuarioF3(c, ROL3.dueno);
      await turnoMostrador(c, dueno);
      const mixta = (efec: string, cred: string, cajas = 1) => ({ cliente_id: j.C, lineas: [{ presentacion_id: j.corona.caja, cantidad: cajas }],
        pagos: [{ metodo: "efectivo", monto: efec }, { metodo: "credito", monto: cred }] });
      const v1 = await vender(c, dueno, mixta("100.00", "300.00"));
      expect(await q(c, "select monto::text, saldo::text from app.cuenta_por_cobrar where venta_id = $1", [v1.venta_id])).toEqual([{ monto: "300.00", saldo: "300.00" }]);
      expect((await errorConDetalle(c, () => vender(c, dueno, mixta("99.00", "701.00", 2)))).detalle).toEqual({ limite: "1000.00", saldo: "300.00", disponible: "700.00" });
      const v2 = await vender(c, dueno, mixta("100.00", "700.00", 2));
      expect(await q(c, "select monto::text from app.cuenta_por_cobrar where venta_id = $1", [v2.venta_id])).toEqual([{ monto: "700.00" }]);
      expect(await saldo(c, j.C)).toMatchObject({ saldo: "1000.00", disponible: "0.00" });
    });
  });

  it("fn_registrar_venta con p_pedido_id fuera de fn_entregar_pedido falla (ESTADO_NO_VALIDO)", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const datos = { clave_idempotencia: "77777777-7777-4777-8777-777777777777", lineas: [{ pedido_linea_id: await lineaPedido(c, j.P2, j.corona.caja), cantidad: 1 }], pagos: [{ metodo: "efectivo", monto: "400.00" }] };
      expect((await error(c, () => c.query("select * from app.fn_registrar_venta($1, $2::jsonb, 'h', $3)", [j.rep, JSON.stringify(datos), j.P2]))).message).toBe("ESTADO_NO_VALIDO");
    });
  });

  it("topes: importe de 1e10 o notas de mas de 500 caracteres -> VALIDACION; referencia de mas de 80 -> VALIDACION", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const dueno = await usuarioF3(c, ROL3.dueno);
      await turnoMostrador(c, dueno);
      const intento = (extra: Record<string, unknown>, precio = "400.00") => c.query("select * from app.fn_registrar_venta($1, $2::jsonb, 'h')", [dueno,
        JSON.stringify({ clave_idempotencia: crypto.randomUUID(), lineas: [{ presentacion_id: j.corona.caja, cantidad: 1, precio_unitario: precio }], pagos: [{ metodo: "efectivo", monto: precio }], ...extra })]);
      expect((await error(c, () => intento({ lineas: [{ presentacion_id: j.corona.caja, cantidad: 2, precio_unitario: "9999999999.99" }] }, "9999999999.99"))).message).toBe("VALIDACION");
      expect((await error(c, () => intento({ lineas: [{ presentacion_id: j.corona.caja, cantidad: 999999999 }] }))).message).toBe("VALIDACION");
      expect((await error(c, () => intento({ notas: "x".repeat(501) }))).message).toBe("VALIDACION");
      expect((await error(c, () => intento({ pagos: [{ metodo: "transferencia", monto: "400.00", referencia: "r".repeat(81) }] }))).message).toBe("VALIDACION");
      expect((await error(c, () => c.query("select app.fn_cerrar_turno($1, (select id from app.turno_caja where usuario_id = $1 and estado = 'abierto'), 0, $2)", [dueno, "n".repeat(501)]))).message).toBe("VALIDACION");
    });
  });

  it("estado de cuenta con hasta anterior a hoy: no cuenta lo posterior y su saldo_final no es el de hoy", async () => {
    await enTransaccion(async (c) => {
      const dueno = await usuarioF3(c, ROL3.dueno);
      const E = await clienteCredito(c, "1000.00", 7);
      const viejo = await saldoInicial(c, E, "300.00", await dia(c, 5), dueno);
      await fechar(c, "cuenta_por_cobrar", viejo, `${await dia(c, -10)} 12:00:00-06`);
      await saldoInicial(c, E, "200.00", await dia(c, 5), dueno);
      const ec = async (desde: string, hasta: string) => (await c.query("select app.fn_estado_cuenta($1, $2::date, $3::date) as r", [E, desde, hasta])).rows[0].r;
      const r = await ec(await dia(c, -30), await dia(c, -3));
      expect(r.movimientos.map((m: Record<string, string>) => [m.cargo, m.saldo])).toEqual([["300.00", "300.00"]]);
      expect(r.saldo_final).toBe("300.00");
      expect((await saldo(c, E)).saldo).toBe("500.00");
      const vacio = await ec(await dia(c, -2), await dia(c, -1));
      expect(vacio).toMatchObject({ saldo_inicial: "300.00", movimientos: [], saldo_final: "300.00" });
    });
  });

  it("INSERT, UPDATE y DELETE directos en venta, cuenta_por_cobrar, abono y turno_caja -> ESTADO_NO_VALIDO; sus funciones si escriben", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const { v2 } = await entregasBase(c, j);
      const dueno = await usuarioF3(c, ROL3.dueno);
      await turnoMostrador(c, dueno);
      const ab = await abonar(c, dueno, { cliente_id: j.C, monto: "10.00" });
      await sinBandera(c);
      const casos: string[] = [
        `update app.venta set notas = 'x' where id = ${v2}`,
        `delete from app.venta where id = ${v2}`,
        `update app.cuenta_por_cobrar set saldo = 0, estado = 'saldada' where venta_id = ${v2}`,
        `delete from app.cuenta_por_cobrar where venta_id = ${v2}`,
        `update app.abono set monto = 1 where id = ${ab.abono_id}`,
        `delete from app.abono where id = ${ab.abono_id}`,
        `update app.turno_caja set fondo_inicial = 1 where id = ${j.turno}`,
        `delete from app.turno_caja where id = ${j.turno}`,
        `insert into app.cuenta_por_cobrar (cliente_id, origen, concepto, monto, saldo, vence_el, creado_por) values (${j.A}, 'saldo_inicial', 'x', 1, 1, current_date, ${dueno})`,
      ];
      for (const sql of casos) expect((await error(c, () => c.query(sql))).message, sql).toBe("ESTADO_NO_VALIDO");
      // y quedan auditadas las que si escriben las funciones
      await c.query("select app.fn_cancelar_abono($1, $2, 'prueba')", [dueno, ab.abono_id]);
      expect((await fila<{ n: number }>(c, "select count(*)::int as n from app.auditoria where tabla = 'abono' and registro_id = $1", [ab.abono_id])).n).toBeGreaterThanOrEqual(2);
    });
  });
});

describe("segunda revision de 008", () => {
  it("devolver: el repartidor no devuelve el fiado de un cliente que no ve (NO_ENCONTRADO, el saldo no cambia); lo suyo y lo de su ruta si; ver_todas ve cualquiera", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const dueno = await usuarioF3(c, ROL3.dueno);
      await turnoMostrador(c, dueno);
      const X = await clienteCredito(c, "1000.00", 7);
      const v = await vender(c, dueno, { cliente_id: X, lineas: [{ presentacion_id: j.corona.caja, cantidad: 1 }], ...credito("400.00") });
      const vl = (await fila<{ id: string }>(c, "select id::text as id from app.venta_linea where venta_id = $1", [v.venta_id])).id;
      const lineas = [{ venta_linea_id: vl, piezas: 6, regresa_a_inventario: true }];
      expect((await error(c, () => devolver(c, j.rep, v.venta_id, { lineas }))).message).toBe("NO_ENCONTRADO");
      expect((await saldo(c, X)).saldo).toBe("400.00");
      // el mismo repartidor si devuelve lo de un cliente de su ruta en curso (C con P2) y lo que el mismo vendio
      const { v2 } = await entregasBase(c, j);
      const six = (await fila<{ id: string }>(c, "select id::text as id from app.venta_linea where venta_id = $1 and factor = 6", [v2])).id;
      await devolver(c, j.rep, v2, { lineas: [{ venta_linea_id: six, piezas: 6, regresa_a_inventario: true }] });
      // quien ve todas (el dueno) devuelve la del cliente X
      await devolver(c, dueno, v.venta_id, { lineas });
      expect((await saldo(c, X)).saldo).toBe("300.00");
    });
  });

  it("recoge en bodega no entrega lo que va cargado en una ruta en curso: 5 Cajas (120 pz) con 114 libres -> STOCK_INSUFICIENTE; 4 Cajas pasan", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const ped = await pedido(c, j.A, [lin(j.corona.caja, 5)], { captura: j.dueno, entrega_tipo: "recoge" });
      await c.query("select app.fn_confirmar_pedido($1, $2, $3::jsonb)", [j.dueno, ped, JSON.stringify({ version: 1, fecha_entrega: j.hoy })]);
      await turnoMostrador(c, j.dueno);
      const e = await errorConDetalle(c, () => entregar(c, j.dueno, ped, efectivo("2000.00")));
      expect(e.message).toBe("STOCK_INSUFICIENTE");
      expect(e.detalle).toMatchObject({ disponible: 114, comprometido: 126 });
      const linea = await lineaPedido(c, ped, j.corona.caja);
      const v = await entregar(c, j.dueno, ped, { lineas: [{ pedido_linea_id: linea, cantidad_entregada: 4 }], ...efectivo("1600.00") });
      expect(v.repetida).toBe(false);
    });
  });

  it("abonar sin parada: solo a un cliente cuya cuenta se ve (NO_ENCONTRADO si no; el saldo no se revela); con parada o con cobranza.ver si", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const dueno = await usuarioF3(c, ROL3.dueno);
      const X = await clienteCredito(c, "1000.00", 7);
      await saldoInicial(c, X, "300.00", await dia(c, 3), dueno);
      expect((await error(c, () => abonar(c, j.rep, { cliente_id: X, metodo: "transferencia", monto: "100.00" }))).message).toBe("NO_ENCONTRADO");
      expect((await saldo(c, X)).saldo).toBe("300.00");
      // el repartidor si abona sin parada a un cliente de su ruta en curso (D tiene parada de cobro: aqui sin ruta_parada_id)
      await abonar(c, j.rep, { cliente_id: j.D, metodo: "transferencia", monto: "100.00" });
      await turnoMostrador(c, dueno);
      await abonar(c, dueno, { cliente_id: X, monto: "100.00" }); // cobranza.ver
      expect((await saldo(c, X)).saldo).toBe("200.00");
    });
  });

  it("resumen del dia al dueno: sin signo de pesos en el codigo (lo pone la plantilla), pedirlo otra vez el mismo dia refresca las cifras en el mismo aviso", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const pedirResumen = async () => (await c.query("select aviso_id::text, repetido from app.fn_aviso_resumen_dia($1, $2::date)", [j.dueno, j.hoy])).rows[0];
      const a1 = await pedirResumen();
      expect(a1.repetido).toBe(false);
      const vars1 = (await fila<{ vars: Record<string, string> }>(c, "select vars from app.aviso_cliente where id = $1", [a1.aviso_id])).vars;
      expect(vars1.vendido).toBe("0.00");
      expect(vars1.por_comprar).toMatch(/^\d+\.\d{2}$/);
      expect((await fila<{ texto: string }>(c, "select texto from app.plantilla where clave = 'wa_resumen_dia'")).texto).toContain("por comprar: ${{por_comprar}}");
      await entregasBase(c, j);
      const a2 = await pedirResumen();
      expect(a2).toEqual({ aviso_id: a1.aviso_id, repetido: true });
      expect((await fila<{ vars: Record<string, string> }>(c, "select vars from app.aviso_cliente where id = $1", [a1.aviso_id])).vars.vendido).toBe("1295.00");
    });
  });

  it("transferencias por verificar: una sola vista; el mensaje de surtido y su plantilla viven en 008 (006 intacto)", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      await entregasBase(c, j);
      expect((await fila<{ n: number }>(c, "select count(*)::int as n from app.v_transferencia where sucursal_id = 1 and verificado_en is null and turno_caja_id = $1", [j.turno])).n).toBe(1);
      expect((await resumen(c, j.turno)).transferencias).toHaveLength(1);
      expect((await fila<{ texto: string }>(c, "select texto from app.plantilla where clave = 'surtido_linea_piezas'")).texto).toBe("{{cantidad}} piezas {{producto}}");
    });
  });
});

import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import type pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { enTransaccion, error, pool } from "./ayuda.js";
import {
  ajuste, borrarDesde, clienteCredito, comprarHace, compra, dia, efectivo, entregar, errorConDetalle, existenciaYKardex, fechar, fila, juegoL, juegoZ, lin, lineasDe, marcarAgua,
  movimientos, pedido, pedidoConfirmado, prenderLealtad, ROL3, rutaEnCurso, saldoLealtad, totalVenta, turnoMostrador, usuarioF3, vender, venderL,
  devolver, type JuegoL,
} from "./ayuda-crecimiento.js";

// F11 paquete B: lealtad simple y sugerencias de zona (011). Todo en transacciones que se deshacen, salvo la prueba de concurrencia.
afterAll(() => pool.end());

const q = (c: pg.PoolClient, sql: string, params: unknown[] = []) => c.query(sql, params).then((r) => r.rows);
const lealtad = async (c: pg.PoolClient, cli: string) => (await c.query("select app.fn_lealtad_cliente($1) as r", [cli])).rows[0].r as Record<string, unknown> | null;
const regalo = async (c: pg.PoolClient, venta: string) => (await c.query("select app.fn_regalo_venta($1) as r", [venta])).rows[0].r as Record<string, unknown> | null;
const carga = async (c: pg.PoolClient, ruta: string) => (await c.query("select app.fn_orden_carga($1) as r", [ruta])).rows[0].r as Record<string, unknown> & { regalos: unknown[] };
const mov = (c: pg.PoolClient, venta: string) => movimientos(c, venta);
const cuantas = async (c: pg.PoolClient, cli: string) => (await fila<{ n: number }>(c, "select count(*)::int as n from app.lealtad_movimiento where cliente_id = $1", [cli])).n;
const existe = async (c: pg.PoolClient, producto: string) => {
  const e = await existenciaYKardex(c, producto);
  expect(e.cantidad, "existencia = kardex").toBe(e.kardex);
  return e.cantidad;
};
const utilidad = (c: pg.PoolClient, donde: string, id: string) => fila<{ importe: string; costo: string; utilidad: string }>(
  c, `select sum(importe)::text as importe, sum(costo_total)::text as costo, sum(utilidad)::text as utilidad from app.v_ventas_lineas where ${donde} = $1`, [id]);

describe("migracion 011", () => {
  it("011 aplicada sin 010; re-correr no aplica nada; fn_registrar_venta, fn_orden_carga y fn_truncate_bloqueado tienen una sola sobrecarga", async () => {
    const r = await pool.query("select archivo from app.migraciones order by archivo");
    const archivos = r.rows.map((x) => x.archivo as string);
    expect(archivos).toEqual(expect.arrayContaining(["008_ventas_cobro.sql", "009_reportes.sql", "011_crecimiento.sql"]));
    expect(archivos.some((a) => a.startsWith("010_"))).toBe(false);
    const p = spawnSync(process.execPath, ["scripts/migrar.mjs"], { encoding: "utf8", env: process.env });
    expect(p.stdout).toContain("nada pendiente");
    expect(p.status).toBe(0);
    for (const f of ["fn_registrar_venta", "fn_orden_carga", "fn_truncate_bloqueado", "fn_lealtad_cliente", "fn_lealtad_configurar", "fn_regalo_venta", "fn_sugerencias_zona"]) {
      const n = await pool.query("select count(*)::int as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'app' and p.proname = $1", [f]);
      expect(n.rows[0].n, f).toBe(1);
    }
  });

  it("semilla: lealtad apagada, cada 10, sin regalo; plantillas de pantalla; sin permisos nuevos; la tabla y la vista existen", async () => {
    const cfg = await pool.query("select clave, valor from app.configuracion where clave like 'lealtad_%' order by clave");
    expect(cfg.rows).toEqual([
      { clave: "lealtad_activa", valor: false }, { clave: "lealtad_cada", valor: 10 }, { clave: "lealtad_presentacion_regalo_id", valor: null },
    ]);
    const pl = await pool.query("select clave, canal, titulo, texto, variables from app.plantilla where clave like 'pantalla_lealtad_%' order by clave");
    expect(pl.rows).toEqual([
      { clave: "pantalla_lealtad_avance", canal: "pantalla", titulo: null, texto: "Llevas {{llevas}} de {{meta}} cajas para una {{regalo}} gratis", variables: ["llevas", "meta", "regalo"] },
      { clave: "pantalla_lealtad_premio", canal: "pantalla", titulo: null, texto: "¡Ya ganaste! Tu siguiente pedido lleva {{regalo}} gratis", variables: ["regalo"] },
    ]);
    expect((await pool.query("select count(*)::int as n from app.permiso where codigo like '%lealtad%'")).rows[0].n).toBe(0);
    expect((await pool.query("select count(*)::int as n from app.auditoria where tabla in ('configuracion','plantilla') and registro_id like '%lealtad%'")).rows[0].n).toBe(0);
    const col = await pool.query("select data_type, is_nullable, column_default from information_schema.columns where table_schema = 'app' and table_name = 'presentacion' and column_name = 'cuenta_lealtad'");
    expect(col.rows).toEqual([{ data_type: "boolean", is_nullable: "NO", column_default: "false" }]);
    expect((await pool.query("select cliente_id, saldo from app.v_lealtad_saldo limit 0")).fields.map((f) => f.name)).toEqual(["cliente_id", "saldo"]);
  });
});

describe("tabla protegida", () => {
  it("insert, update y delete directos -> ESTADO_NO_VALIDO (solo funciones); con la bandera de dinero, update y delete siguen bloqueados (inmutable); truncate -> ESTADO_NO_VALIDO", async () => {
    await enTransaccion(async (c) => {
      const j = await juegoL(c);
      const v = (await venderL(c, j, [lin(j.corona.caja, 1)], "400.00")).venta_id;
      const m = (await q(c, "select id::text, venta_linea_id::text as linea from app.lealtad_movimiento where venta_id = $1", [v]))[0];
      // la venta dejo levantada la bandera de dinero en esta transaccion (en la API se cierra con el COMMIT): se baja para probar la guarda
      await c.query("select set_config('app.escribiendo_dinero', '', true)");
      const ins = `insert into app.lealtad_movimiento (cliente_id, venta_id, venta_linea_id, tipo, cantidad) values (${j.L}, ${v}, ${m.linea}, 'acumula', 1)`;
      expect((await errorConDetalle(c, () => c.query(ins))).message).toBe("ESTADO_NO_VALIDO");
      expect((await errorConDetalle(c, () => c.query(ins))).detalle).toEqual({ tabla: "lealtad_movimiento", motivo: "solo_funciones" });
      expect((await error(c, () => c.query("update app.lealtad_movimiento set cantidad = 99 where id = $1", [m.id]))).message).toBe("ESTADO_NO_VALIDO");
      expect((await error(c, () => c.query("delete from app.lealtad_movimiento where id = $1", [m.id]))).message).toBe("ESTADO_NO_VALIDO");
      await c.query("select app.fn_dinero_escribir()");
      expect((await errorConDetalle(c, () => c.query("update app.lealtad_movimiento set cantidad = 99 where id = $1", [m.id]))).detalle).toEqual({ tabla: "lealtad_movimiento", motivo: "inmutable" });
      expect((await error(c, () => c.query("delete from app.lealtad_movimiento where id = $1", [m.id]))).message).toBe("ESTADO_NO_VALIDO");
      expect((await error(c, () => c.query("truncate app.lealtad_movimiento"))).message).toBe("ESTADO_NO_VALIDO");
      expect(await saldoLealtad(c, j.L)).toBe(1);
    });
  });

  it("la tabla rechaza un signo que no corresponde al tipo y un acumula o canje sin linea (aunque se levante la bandera)", async () => {
    await enTransaccion(async (c) => {
      const j = await juegoL(c);
      const v = (await venderL(c, j, [lin(j.corona.caja, 1)], "400.00")).venta_id;
      const linea = (await lineasDe(c, v))[0]!.id;
      await c.query("select app.fn_dinero_escribir()");
      const ins = (tipo: string, cant: number, ln: string | null) => () =>
        c.query("insert into app.lealtad_movimiento (cliente_id, venta_id, venta_linea_id, tipo, cantidad) values ($1, $2, $3, $4, $5)", [j.L, v, ln, tipo, cant]);
      expect((await error(c, ins("acumula", -1, linea))).code).toBe("23514");
      expect((await error(c, ins("canje", 1, linea))).code).toBe("23514");
      expect((await error(c, ins("reverso", 0, null))).code).toBe("23514");
      expect((await error(c, ins("acumula", 1, null))).code).toBe("23514");
      expect((await error(c, ins("canje", -10, null))).code).toBe("23514");
      expect((await error(c, ins("otro", 1, linea))).code).toBe("23514");
    });
  });
});

describe("fn_lealtad_configurar", () => {
  it("Administrador -> SIN_PERMISO precios.editar; Cajero igual; la configuracion no cambia", async () => {
    await enTransaccion(async (c) => {
      const j = await juegoL(c, { prender: false });
      const admin = await usuarioF3(c, "(select id from app.rol where nombre = 'Administrador')");
      for (const u of [admin, j.cajero]) {
        const e = await errorConDetalle(c, () => c.query("select app.fn_lealtad_configurar($1, $2::jsonb)", [u, JSON.stringify({ lealtad_activa: false })]));
        expect(e.message).toBe("SIN_PERMISO");
        expect(e.detalle).toEqual({ permiso: "precios.editar" });
      }
      expect((await fila(c, "select valor from app.configuracion where clave = 'lealtad_activa'")).valor).toBe(false);
    });
  });

  it("prender sin regalo o con regalo inactivo, sin venta o con producto inactivo -> VALIDACION lealtad_presentacion_regalo_id; nada se escribe", async () => {
    await enTransaccion(async (c) => {
      const j = await juegoL(c, { prender: false });
      const conf = (datos: unknown) => () => c.query("select app.fn_lealtad_configurar($1, $2::jsonb)", [j.dueno, JSON.stringify(datos)]);
      const campo = { campo: "lealtad_presentacion_regalo_id" };
      let e = await errorConDetalle(c, conf({ lealtad_activa: true }));
      expect([e.message, e.detalle]).toEqual(["VALIDACION", campo]);
      e = await errorConDetalle(c, conf({ lealtad_activa: true, lealtad_presentacion_regalo_id: null }));
      expect([e.message, e.detalle]).toEqual(["VALIDACION", campo]);
      e = await errorConDetalle(c, conf({ lealtad_activa: true, lealtad_presentacion_regalo_id: "999999999" }));
      expect([e.message, e.detalle]).toEqual(["VALIDACION", campo]);
      await c.query("update app.presentacion set activa = false where id = $1", [j.corona.caja]);
      e = await errorConDetalle(c, conf({ lealtad_activa: true, lealtad_presentacion_regalo_id: j.corona.caja }));
      expect([e.message, e.detalle]).toEqual(["VALIDACION", campo]);
      await c.query("update app.presentacion set activa = true, se_vende = false where id = $1", [j.corona.caja]);
      e = await errorConDetalle(c, conf({ lealtad_activa: true, lealtad_presentacion_regalo_id: j.corona.caja }));
      expect([e.message, e.detalle]).toEqual(["VALIDACION", campo]);
      await c.query("update app.presentacion set se_vende = true where id = $1", [j.corona.caja]);
      await c.query("update app.producto set activo = false where id = $1", [j.corona.id]);
      e = await errorConDetalle(c, conf({ lealtad_activa: true, lealtad_presentacion_regalo_id: j.corona.caja }));
      expect([e.message, e.detalle]).toEqual(["VALIDACION", campo]);
      await c.query("update app.producto set activo = true where id = $1", [j.corona.id]);
      expect((await fila(c, "select valor from app.configuracion where clave = 'lealtad_activa'")).valor).toBe(false);
      expect(await lealtad(c, j.L)).toBeNull();
    });
  });

  it("lealtad_cada fuera de 1-1000 o no entero, llave desconocida y tipos mal formados -> VALIDACION con su campo", async () => {
    await enTransaccion(async (c) => {
      const j = await juegoL(c, { prender: false });
      const probar = async (datos: Record<string, unknown>, campo: string) => {
        const e = await errorConDetalle(c, () => c.query("select app.fn_lealtad_configurar($1, $2::jsonb)", [j.dueno, JSON.stringify(datos)]));
        expect([e.message, e.detalle], JSON.stringify(datos)).toEqual(["VALIDACION", { campo }]);
      };
      await probar({ lealtad_cada: 0 }, "lealtad_cada");
      await probar({ lealtad_cada: 1001 }, "lealtad_cada");
      await probar({ lealtad_cada: 2.5 }, "lealtad_cada");
      await probar({ lealtad_cada: "10" }, "lealtad_cada");
      await probar({ lealtad_cada: null }, "lealtad_cada");
      await probar({ lealtad_activa: "true" }, "lealtad_activa");
      await probar({ lealtad_activa: null }, "lealtad_activa");
      await probar({ lealtad_presentacion_regalo_id: 5 }, "lealtad_presentacion_regalo_id");
      await probar({ lealtad_presentacion_regalo_id: "abc" }, "lealtad_presentacion_regalo_id");
      await probar({ lealtad_bono: 1 }, "lealtad_bono");
      await probar({ negocio_nombre: "x" }, "negocio_nombre");
      // una llave valida junto a una mala no escribe nada
      await probar({ lealtad_cada: 5, lealtad_bono: 1 }, "lealtad_bono");
      expect((await fila(c, "select valor from app.configuracion where clave = 'lealtad_cada'")).valor).toBe(10);
    });
  });

  it("activa y regalo en una sola llamada pasan, se auditan con el usuario y la lealtad queda prendida; apagar no exige regalo", async () => {
    await enTransaccion(async (c) => {
      const j = await juegoL(c, { prender: false });
      await c.query("select app.fn_lealtad_configurar($1, $2::jsonb)", [j.dueno, JSON.stringify({ lealtad_activa: true, lealtad_presentacion_regalo_id: j.corona.caja })]);
      const cfg = await q(c, "select clave, valor, actualizado_por::text as por from app.configuracion where clave like 'lealtad_%' order by clave");
      expect(cfg).toEqual([
        { clave: "lealtad_activa", valor: true, por: j.dueno }, { clave: "lealtad_cada", valor: 10, por: null },
        { clave: "lealtad_presentacion_regalo_id", valor: j.corona.caja, por: j.dueno },
      ]);
      expect((await fila<{ n: number }>(c, "select count(*)::int as n from app.auditoria where tabla = 'configuracion' and registro_id = 'lealtad_activa'")).n).toBe(1);
      expect(await lealtad(c, j.L)).toMatchObject({ llevas: 0, meta: 10, premio: false });
      await c.query("select app.fn_lealtad_configurar($1, $2::jsonb)", [j.dueno, JSON.stringify({ lealtad_activa: false, lealtad_cada: 20 })]);
      expect(await lealtad(c, j.L)).toBeNull();
      expect((await fila(c, "select valor from app.configuracion where clave = 'lealtad_cada'")).valor).toBe(20);
      await c.query("select app.fn_lealtad_configurar($1, '{}'::jsonb)", [j.dueno]);
    });
  });
});

describe("lealtad apagada = nada cambia", () => {
  it("juego L pasos 1-4 con la semilla: 0 filas, V4 de 1 linea y costo 75.00, Corona 30, lealtad null, regalos [] y regalo_venta null", async () => {
    await enTransaccion(async (c) => {
      const j = await juegoL(c, { prender: false });
      const v1 = (await venderL(c, j, [lin(j.corona.caja, 4), lin(j.corona.six, 2)], "1810.00")).venta_id;
      await venderL(c, j, [lin(j.victoria.caja, 2)], "780.00");
      await venderL(c, j, [lin(j.corona.caja, 4)], "1600.00");
      const v4 = (await venderL(c, j, [lin(j.corona.six, 1)], "105.00")).venta_id;
      expect(await cuantas(c, j.L)).toBe(0);
      expect(await mov(c, v1)).toEqual([]);
      const ls = await lineasDe(c, v4);
      expect(ls.map((l) => [l.cantidad, l.importe, l.costo_total])).toEqual([[1, "105.00", "75.00"]]);
      expect(await totalVenta(c, v4)).toBe("105.00");
      expect(await existe(c, j.corona.id)).toBe(30);
      expect(await lealtad(c, j.L)).toBeNull();
      expect(await regalo(c, v4)).toBeNull();
      const hoy = await dia(c, 0);
      const ped = await pedidoConfirmado(c, j.L, [lin(j.victoria.caja, 1)], hoy, j.dueno);
      const r = await rutaEnCurso(c, j.dueno, [ped]);
      expect((await carga(c, r.ruta)).regalos).toEqual([]);
      expect(await saldoLealtad(c, j.L)).toBe(0);
    });
  });

  it("apagada aunque haya presentaciones marcadas y saldo de antes: apagar despues de acumular no vuelve a regalar ni a acumular", async () => {
    await enTransaccion(async (c) => {
      const j = await juegoL(c, { cajasVictoria: 12 });
      await venderL(c, j, [lin(j.victoria.caja, 10)], "3900.00");
      expect(await saldoLealtad(c, j.L)).toBe(10);
      await c.query("select app.fn_lealtad_configurar($1, $2::jsonb)", [j.dueno, JSON.stringify({ lealtad_activa: false })]);
      const v = (await venderL(c, j, [lin(j.corona.six, 1)], "105.00")).venta_id;
      expect((await lineasDe(c, v)).length).toBe(1);
      expect(await mov(c, v)).toEqual([]);
      expect(await saldoLealtad(c, j.L)).toBe(10);
    });
  });
});

describe("juego L: lealtad prendida", () => {
  it("pasos 1 a 10, cada numero exacto; existencia = kardex en cada paso", async () => {
    await enTransaccion(async (c) => {
      const j = await juegoL(c);
      const nombreRegalo = `${j.corona.nombre} Caja de 24`;
      const dueno = j.dueno;
      // paso 1
      const v1 = (await venderL(c, j, [lin(j.corona.caja, 4), lin(j.corona.six, 2)], "1810.00")).venta_id;
      expect(await totalVenta(c, v1)).toBe("1810.00");
      const l1 = await lineasDe(c, v1);
      expect(await mov(c, v1)).toEqual([{ tipo: "acumula", cantidad: 4, venta_linea_id: l1[0]!.id }]);
      expect(await saldoLealtad(c, j.L)).toBe(4);
      expect(await lealtad(c, j.L)).toEqual({
        llevas: 4, meta: 10, premio: false, regalo: { presentacion_id: j.corona.caja, producto: j.corona.nombre, presentacion: "Caja de 24" },
        texto: `Llevas 4 de 10 cajas para una ${nombreRegalo} gratis`,
      });
      expect(await existe(c, j.corona.id)).toBe(132);
      // paso 2
      const v2 = (await venderL(c, j, [lin(j.victoria.caja, 2)], "780.00")).venta_id;
      expect(await totalVenta(c, v2)).toBe("780.00");
      expect((await mov(c, v2)).map((m) => [m.tipo, m.cantidad])).toEqual([["acumula", 2]]);
      expect(await saldoLealtad(c, j.L)).toBe(6);
      expect(await existe(c, j.victoria.id)).toBe(72);
      // paso 3: la venta que completa 10 no lleva regalo; el premio queda pendiente
      const v3 = (await venderL(c, j, [lin(j.corona.caja, 4)], "1600.00")).venta_id;
      expect(await totalVenta(c, v3)).toBe("1600.00");
      expect((await lineasDe(c, v3)).length).toBe(1);
      expect((await mov(c, v3)).map((m) => [m.tipo, m.cantidad])).toEqual([["acumula", 4]]);
      expect(await saldoLealtad(c, j.L)).toBe(10);
      expect(await lealtad(c, j.L)).toEqual({
        llevas: 10, meta: 10, premio: true, regalo: { presentacion_id: j.corona.caja, producto: j.corona.nombre, presentacion: "Caja de 24" },
        texto: `¡Ya ganaste! Tu siguiente pedido lleva ${nombreRegalo} gratis`,
      });
      expect(await regalo(c, v3)).toBeNull();
      expect(await existe(c, j.corona.id)).toBe(36);
      // paso 4: regalo a precio 0 con costo normal
      const v4 = (await venderL(c, j, [lin(j.corona.six, 1)], "105.00")).venta_id;
      expect(await totalVenta(c, v4)).toBe("105.00");
      const l4 = await lineasDe(c, v4);
      expect(l4.length).toBe(2);
      expect(l4[0]).toMatchObject({ numero: 1, presentacion_id: j.corona.six, cantidad: 1, precio_unitario: "105.00", importe: "105.00", costo_total: "75.00" });
      expect(l4[1]).toMatchObject({
        numero: 2, presentacion_id: j.corona.caja, cantidad: 1, precio_lista: "400.00", precio_unitario: "0.00", importe: "0.00",
        costo_unitario: "12.500000", costo_total: "300.00",
      });
      expect(await mov(c, v4)).toEqual([{ tipo: "canje", cantidad: -10, venta_linea_id: l4[1]!.id }]);
      expect(await saldoLealtad(c, j.L)).toBe(0);
      expect(await lealtad(c, j.L)).toMatchObject({ llevas: 0, meta: 10, premio: false });
      expect((await q(c, "select metodo, monto::text from app.venta_pago where venta_id = $1", [v4]))).toEqual([{ metodo: "efectivo", monto: "105.00" }]);
      expect(await regalo(c, v4)).toEqual({ venta_linea_id: l4[1]!.id, producto: j.corona.nombre, presentacion: "Caja de 24", cantidad: 1 });
      expect(await existe(c, j.corona.id)).toBe(6);
      expect((await fila(c, "select sum(-cantidad)::int as n from app.movimiento_inventario where referencia_tabla = 'venta_linea' and referencia_id = $1", [l4[1]!.id])).n).toBe(24);
      // paso 5: utilidad = costo del programa
      expect(await utilidad(c, "venta_id", v4)).toEqual({ importe: "105.00", costo: "375.00", utilidad: "-270.00" });
      expect(await utilidad(c, "cliente_id", j.L)).toEqual({ importe: "4295.00", costo: "3505.00", utilidad: "790.00" });
      // paso 6
      const v5 = (await venderL(c, j, [lin(j.victoria.caja, 1)], "390.00")).venta_id;
      expect(await totalVenta(c, v5)).toBe("390.00");
      expect((await mov(c, v5)).map((m) => [m.tipo, m.cantidad])).toEqual([["acumula", 1]]);
      expect(await saldoLealtad(c, j.L)).toBe(1);
      expect(await existe(c, j.victoria.id)).toBe(48);
      // paso 7: el Dueno cancela V4 -> reverso +10, el premio vuelve a pendiente, el regalo regresa al inventario
      await turnoMostrador(c, dueno);
      await c.query("select app.fn_cancelar_venta($1, $2, 'prueba')", [dueno, v4]);
      expect(await mov(c, v4)).toEqual([{ tipo: "canje", cantidad: -10, venta_linea_id: l4[1]!.id }, { tipo: "reverso", cantidad: 10, venta_linea_id: null }]);
      expect(await saldoLealtad(c, j.L)).toBe(11);
      expect(await lealtad(c, j.L)).toMatchObject({ llevas: 11, meta: 10, premio: true });
      expect(await existe(c, j.corona.id)).toBe(36);
      expect(await utilidad(c, "cliente_id", j.L)).toEqual({ importe: "4580.00", costo: "3420.00", utilidad: "1160.00" });
      // paso 8: regalo otra vez (el canje de V4 ya no cuenta: es otra venta)
      const v6 = (await venderL(c, j, [lin(j.corona.six, 1)], "105.00")).venta_id;
      const l6 = await lineasDe(c, v6);
      expect(l6.length).toBe(2);
      expect(l6[1]).toMatchObject({ presentacion_id: j.corona.caja, precio_unitario: "0.00", importe: "0.00" });
      expect(await mov(c, v6)).toEqual([{ tipo: "canje", cantidad: -10, venta_linea_id: l6[1]!.id }]);
      expect(await saldoLealtad(c, j.L)).toBe(1);
      expect(await existe(c, j.corona.id)).toBe(6);
      // paso 9: devolver 2 Cajas de V1 (48 pz, regresan)
      await devolver(c, dueno, v1, { lineas: [{ venta_linea_id: l1[0]!.id, piezas: 48, regresa_a_inventario: true }] });
      expect(await mov(c, v1)).toEqual([{ tipo: "acumula", cantidad: 4, venta_linea_id: l1[0]!.id }, { tipo: "reverso", cantidad: -2, venta_linea_id: l1[0]!.id }]);
      expect(await saldoLealtad(c, j.L)).toBe(-1);
      expect(await lealtad(c, j.L)).toMatchObject({ llevas: 0, meta: 10, premio: false });
      expect(await existe(c, j.corona.id)).toBe(54);
      // paso 10: de la linea Victoria de V2, 12 pz y luego otras 12 pz
      const l2 = (await lineasDe(c, v2))[0]!;
      await devolver(c, dueno, v2, { lineas: [{ venta_linea_id: l2.id, piezas: 12, regresa_a_inventario: true }] });
      expect((await mov(c, v2)).map((m) => [m.tipo, m.cantidad])).toEqual([["acumula", 2]]);
      expect(await saldoLealtad(c, j.L)).toBe(-1);
      await devolver(c, dueno, v2, { lineas: [{ venta_linea_id: l2.id, piezas: 12, regresa_a_inventario: true }] });
      expect((await mov(c, v2)).map((m) => [m.tipo, m.cantidad])).toEqual([["acumula", 2], ["reverso", -1]]);
      expect(await saldoLealtad(c, j.L)).toBe(-2);
      expect(await lealtad(c, j.L)).toMatchObject({ llevas: 0, premio: false });
      expect(await existe(c, j.victoria.id)).toBe(72);
    });
  });

  it("devolver el regalo no repone el premio ni toca el saldo (el regalo solo no se puede devolver: devolucion sin importe)", async () => {
    await enTransaccion(async (c) => {
      const j = await juegoL(c, { cajasVictoria: 12 });
      await venderL(c, j, [lin(j.victoria.caja, 10)], "3900.00");
      const v = (await venderL(c, j, [lin(j.corona.six, 1)], "105.00")).venta_id;
      const [sixLinea, regaloLinea] = (await lineasDe(c, v)) as [Awaited<ReturnType<typeof lineasDe>>[number], Awaited<ReturnType<typeof lineasDe>>[number]];
      expect(await saldoLealtad(c, j.L)).toBe(0);
      await turnoMostrador(c, j.dueno);
      const sola = await errorConDetalle(c, () => devolver(c, j.dueno, v, { lineas: [{ venta_linea_id: regaloLinea.id, piezas: 24, regresa_a_inventario: true }] }));
      expect([sola.message, sola.detalle]).toEqual(["VALIDACION", { campo: "lineas", motivo: "sin_importe" }]);
      await devolver(c, j.dueno, v, { lineas: [
        { venta_linea_id: regaloLinea.id, piezas: 24, regresa_a_inventario: true }, { venta_linea_id: sixLinea.id, piezas: 6, regresa_a_inventario: true }] });
      expect(await mov(c, v)).toEqual([{ tipo: "canje", cantidad: -10, venta_linea_id: regaloLinea.id }]);
      expect(await saldoLealtad(c, j.L)).toBe(0);
    });
  });

  it("idempotencia: repetir V4 con la misma clave y cuerpo -> repetida true, sin segundo canje, linea ni movimiento", async () => {
    await enTransaccion(async (c) => {
      const j = await juegoL(c, { cajasVictoria: 12 });
      await venderL(c, j, [lin(j.victoria.caja, 10)], "3900.00");
      const clave = randomUUID();
      const a = await venderL(c, j, [lin(j.corona.six, 1)], "105.00", { clave, hash: "h-idem" });
      expect(a.repetida).toBe(false);
      const antes = [(await lineasDe(c, a.venta_id)).length, await cuantas(c, j.L), await existe(c, j.corona.id), await saldoLealtad(c, j.L)];
      const b = await venderL(c, j, [lin(j.corona.six, 1)], "105.00", { clave, hash: "h-idem" });
      expect(b).toEqual({ venta_id: a.venta_id, repetida: true });
      expect([(await lineasDe(c, a.venta_id)).length, await cuantas(c, j.L), await existe(c, j.corona.id), await saldoLealtad(c, j.L)]).toEqual(antes);
      expect(antes[0]).toBe(2);
      expect((await fila<{ n: number }>(c, "select count(*)::int as n from app.lealtad_movimiento where venta_id = $1 and tipo = 'canje'", [a.venta_id])).n).toBe(1);
    });
  });

  it("publico en general (sin cliente) con lealtad prendida: ni acumula, ni canjea, ni lleva regalo", async () => {
    await enTransaccion(async (c) => {
      const j = await juegoL(c, { cajasVictoria: 12 });
      const v = (await vender(c, j.cajero, { lineas: [lin(j.corona.caja, 3)], ...efectivo("1200.00") })).venta_id;
      expect(await mov(c, v)).toEqual([]);
      expect((await lineasDe(c, v)).length).toBe(1);
      // y un cliente con premio no lo gasta en una venta sin cliente
      await venderL(c, j, [lin(j.victoria.caja, 10)], "3900.00");
      const v2 = (await vender(c, j.cajero, { lineas: [lin(j.corona.six, 1)], ...efectivo("105.00") })).venta_id;
      expect((await lineasDe(c, v2)).length).toBe(1);
      expect(await mov(c, v2)).toEqual([]);
      expect(await saldoLealtad(c, j.L)).toBe(10);
    });
  });

  it("una venta canjea a lo mas un premio aunque el saldo pase de 2 metas; la linea marcada del mismo producto acumula y el regalo no", async () => {
    await enTransaccion(async (c) => {
      const j = await juegoL(c);
      await compra(c, j.corona.caja, 20, "300.00");
      await venderL(c, j, [lin(j.corona.caja, 20)], "8000.00");
      expect(await saldoLealtad(c, j.L)).toBe(20);
      const v = (await venderL(c, j, [lin(j.corona.caja, 1)], "400.00")).venta_id;
      const ls = await lineasDe(c, v);
      expect(ls.length).toBe(2);
      expect(await totalVenta(c, v)).toBe("400.00");
      expect(await mov(c, v)).toEqual([{ tipo: "acumula", cantidad: 1, venta_linea_id: ls[0]!.id }, { tipo: "canje", cantidad: -10, venta_linea_id: ls[1]!.id }]);
      expect(await saldoLealtad(c, j.L)).toBe(11);
      const v2 = (await venderL(c, j, [lin(j.corona.six, 1)], "105.00")).venta_id;
      expect((await lineasDe(c, v2)).length).toBe(2);
      expect(await saldoLealtad(c, j.L)).toBe(1);
      expect((await lineasDe(c, (await venderL(c, j, [lin(j.corona.six, 1)], "105.00")).venta_id)).length).toBe(1);
    });
  });

  it("cambiar la marca despues no reescribe nada: lo acumulado queda y la devolucion lo respeta", async () => {
    await enTransaccion(async (c) => {
      const j = await juegoL(c);
      const v = (await venderL(c, j, [lin(j.corona.caja, 3)], "1200.00")).venta_id;
      await c.query("update app.presentacion set cuenta_lealtad = false where id = $1", [j.corona.caja]);
      expect(await saldoLealtad(c, j.L)).toBe(3);
      const v2 = (await venderL(c, j, [lin(j.corona.caja, 2)], "800.00")).venta_id;
      expect(await mov(c, v2)).toEqual([]);
      const l = (await lineasDe(c, v))[0]!;
      await turnoMostrador(c, j.dueno);
      await devolver(c, j.dueno, v, { lineas: [{ venta_linea_id: l.id, piezas: 24, regresa_a_inventario: true }] });
      expect(await saldoLealtad(c, j.L)).toBe(2);
    });
  });

  it("regalo sin existencia: la venta pasa igual, sin linea regalo ni canje y el premio sigue pendiente; presentacion regalo inactiva igual; con 24 pz libres si lleva", async () => {
    await enTransaccion(async (c) => {
      const j = await juegoL(c, { cajasVictoria: 25 });
      await venderL(c, j, [lin(j.victoria.caja, 10)], "3900.00");
      expect(await saldoLealtad(c, j.L)).toBe(10);
      await ajuste(c, j.dueno, j.corona.id, "ajuste_salida", 234, { motivo: "prueba" });
      expect(await existe(c, j.corona.id)).toBe(6);
      // 6 pz libres: no cabe
      const v1 = (await venderL(c, j, [lin(j.victoria.caja, 1)], "390.00")).venta_id;
      expect(await totalVenta(c, v1)).toBe("390.00");
      expect((await lineasDe(c, v1)).length).toBe(1);
      expect((await mov(c, v1)).map((m) => [m.tipo, m.cantidad])).toEqual([["acumula", 1]]);
      expect(await regalo(c, v1)).toBeNull();
      expect(await saldoLealtad(c, j.L)).toBe(11);
      expect(await existe(c, j.corona.id)).toBe(6);
      // hay existencia pero la presentacion regalo esta inactiva
      await compra(c, j.corona.caja, 2, "300.00");
      await c.query("update app.presentacion set activa = false where id = $1", [j.corona.caja]);
      const v2 = (await venderL(c, j, [lin(j.victoria.caja, 1)], "390.00")).venta_id;
      expect((await lineasDe(c, v2)).length).toBe(1);
      expect(await regalo(c, v2)).toBeNull();
      expect(await saldoLealtad(c, j.L)).toBe(12);
      await c.query("update app.presentacion set activa = true, se_vende = false where id = $1", [j.corona.caja]);
      const v2b = (await venderL(c, j, [lin(j.victoria.caja, 1)], "390.00")).venta_id;
      expect((await lineasDe(c, v2b)).length).toBe(1);
      expect(await saldoLealtad(c, j.L)).toBe(13);
      await c.query("update app.presentacion set se_vende = true where id = $1", [j.corona.caja]);
      // justo 24 pz libres (54 - 30): cabe
      await ajuste(c, j.dueno, j.corona.id, "ajuste_salida", 30, { motivo: "prueba" });
      expect(await existe(c, j.corona.id)).toBe(24);
      const v3 = (await venderL(c, j, [lin(j.victoria.caja, 1)], "390.00")).venta_id;
      const l3 = await lineasDe(c, v3);
      expect(l3.length).toBe(2);
      expect(l3[1]).toMatchObject({ presentacion_id: j.corona.caja, importe: "0.00" });
      expect((await mov(c, v3)).map((m) => [m.tipo, m.cantidad])).toEqual([["acumula", 1], ["canje", -10]]);
      expect(await saldoLealtad(c, j.L)).toBe(4);
      expect(await existe(c, j.corona.id)).toBe(0);
      // ya sin existencia: el siguiente premio pendiente tampoco hace fallar la venta
      await venderL(c, j, [lin(j.victoria.caja, 6)], "2340.00");
      expect(await saldoLealtad(c, j.L)).toBe(10);
      const v4 = (await venderL(c, j, [lin(j.victoria.caja, 1)], "390.00")).venta_id;
      expect((await lineasDe(c, v4)).length).toBe(1);
      expect(await saldoLealtad(c, j.L)).toBe(11);
    });
  });

  it("mostrador vs carga: Corona 48 pz con 24 cargadas y 1 Six (6 pz) -> 48 - 24 - 6 < 24, sin regalo; con 24 pz mas si cabe", async () => {
    await enTransaccion(async (c) => {
      const j = await juegoL(c, { cajasVictoria: 15 });
      await venderL(c, j, [lin(j.victoria.caja, 10)], "3900.00");
      expect(await saldoLealtad(c, j.L)).toBe(10);
      await ajuste(c, j.dueno, j.corona.id, "ajuste_salida", 192, { motivo: "prueba" });
      expect(await existe(c, j.corona.id)).toBe(48);
      const otro = await clienteCredito(c, "0.00");
      const ped = await pedidoConfirmado(c, otro, [lin(j.corona.caja, 1)], await dia(c, 0), j.dueno);
      await rutaEnCurso(c, j.dueno, [ped]);
      expect((await fila(c, "select cargadas from app.v_comprometido where producto_id = $1", [j.corona.id])).cargadas).toBe(24);
      const v1 = (await venderL(c, j, [lin(j.corona.six, 1)], "105.00")).venta_id;
      expect((await lineasDe(c, v1)).length).toBe(1);
      expect(await mov(c, v1)).toEqual([]);
      expect(await saldoLealtad(c, j.L)).toBe(10);
      expect(await existe(c, j.corona.id)).toBe(42);
      // con 42 pz sigue sin caber (42 - 24 - 6 = 12); con 24 pz mas (66 - 24 - 6 = 36) si
      await compra(c, j.corona.caja, 1, "300.00");
      const v2 = (await venderL(c, j, [lin(j.corona.six, 1)], "105.00")).venta_id;
      expect((await lineasDe(c, v2)).length).toBe(2);
      expect(await saldoLealtad(c, j.L)).toBe(0);
      expect(await existe(c, j.corona.id)).toBe(36);
    });
  });

  it("reparto: fn_orden_carga trae regalos de L sin tocar paradas, totales ni cajas_totales; entregar P completo -> venta con 2 lineas, canje -10, acumula 2 y fn_regalo_venta", async () => {
    await enTransaccion(async (c) => {
      const j = await juegoL(c, { cajasVictoria: 12 });
      await venderL(c, j, [lin(j.victoria.caja, 10)], "3900.00");
      expect(await saldoLealtad(c, j.L)).toBe(10);
      const hoy = await dia(c, 0);
      const P = await pedidoConfirmado(c, j.L, [lin(j.victoria.caja, 2)], hoy, j.dueno);
      const r = await rutaEnCurso(c, j.dueno, [P]);
      const nombreL = (await fila<{ n: string }>(c, "select nombre as n from app.cliente where id = $1", [j.L])).n;
      const con = await carga(c, r.ruta);
      expect(con.regalos).toEqual([{ carga_n: 1, cliente: nombreL, producto: j.corona.nombre, presentacion: "Caja de 24", cantidad: 1 }]);
      await c.query("update app.configuracion set valor = 'false' where clave = 'lealtad_activa'");
      const sin = await carga(c, r.ruta);
      expect(sin.regalos).toEqual([]);
      expect({ ...con, regalos: undefined }).toEqual({ ...sin, regalos: undefined });
      expect(con.cajas_totales).toBe(2);
      await c.query("update app.configuracion set valor = 'true' where clave = 'lealtad_activa'");
      // el regalo es un aviso para cargar: no reserva (no cuenta como comprometido)
      expect((await q(c, "select cargadas from app.v_comprometido where producto_id = $1", [j.corona.id]))).toEqual([]);
      const { venta_id } = await entregar(c, r.rep, P, { ...efectivo("780.00"), con_regalo: true });
      const ls = await lineasDe(c, venta_id);
      expect(ls.length).toBe(2);
      expect(ls[1]).toMatchObject({ presentacion_id: j.corona.caja, cantidad: 1, precio_unitario: "0.00", importe: "0.00" });
      expect(await totalVenta(c, venta_id)).toBe("780.00");
      expect(await mov(c, venta_id)).toEqual([{ tipo: "acumula", cantidad: 2, venta_linea_id: ls[0]!.id }, { tipo: "canje", cantidad: -10, venta_linea_id: ls[1]!.id }]);
      expect(await regalo(c, venta_id)).toEqual({ venta_linea_id: ls[1]!.id, producto: j.corona.nombre, presentacion: "Caja de 24", cantidad: 1 });
      expect(await saldoLealtad(c, j.L)).toBe(2);
      expect(await existe(c, j.corona.id)).toBe(216);
      expect((await carga(c, r.ruta)).regalos).toEqual([]);
    });
  });

  it("reparto: un cliente con dos paradas de entrega y premio pendiente en la misma ruta lleva el regalo solo en la de mayor carga_n (la primera que se entrega)", async () => {
    await enTransaccion(async (c) => {
      const j = await juegoL(c, { cajasVictoria: 12 });
      await venderL(c, j, [lin(j.victoria.caja, 10)], "3900.00");
      const hoy = await dia(c, 0);
      const P1 = await pedidoConfirmado(c, j.L, [lin(j.victoria.caja, 1)], hoy, j.dueno);
      const P2 = await pedidoConfirmado(c, j.L, [lin(j.victoria.caja, 1)], hoy, j.dueno);
      const r = await rutaEnCurso(c, j.dueno, [P1, P2]);
      const nombreL = (await fila<{ n: string }>(c, "select nombre as n from app.cliente where id = $1", [j.L])).n;
      const regalos = (await carga(c, r.ruta)).regalos as { carga_n: number }[];
      expect(regalos).toHaveLength(1);
      expect(regalos[0]).toEqual({ carga_n: 2, cliente: nombreL, producto: j.corona.nombre, presentacion: "Caja de 24", cantidad: 1 });
    });
  });

  it("reparto sin con_regalo (o con false): la entrega pasa sin regalo ni canje, el saldo no baja y el premio sigue pendiente; con true si lo da; mostrador y recoge siguen automaticos", async () => {
    await enTransaccion(async (c) => {
      const j = await juegoL(c, { cajasVictoria: 15 });
      await venderL(c, j, [lin(j.victoria.caja, 10)], "3900.00");
      const hoy = await dia(c, 0);
      const P1 = await pedidoConfirmado(c, j.L, [lin(j.victoria.caja, 1)], hoy, j.dueno);
      const r = await rutaEnCurso(c, j.dueno, [P1]);
      const a = await entregar(c, r.rep, P1, efectivo("390.00"));
      expect((await lineasDe(c, a.venta_id)).length).toBe(1);
      expect(await regalo(c, a.venta_id)).toBeNull();
      expect(await mov(c, a.venta_id)).toEqual([{ tipo: "acumula", cantidad: 1, venta_linea_id: (await lineasDe(c, a.venta_id))[0]!.id }]);
      expect(await saldoLealtad(c, j.L)).toBe(11);
      expect((await lealtad(c, j.L))?.premio).toBe(true);
      const P2 = await pedidoConfirmado(c, j.L, [lin(j.victoria.caja, 1)], hoy, j.dueno);
      const r2 = await rutaEnCurso(c, j.dueno, [P2]);
      const b = await entregar(c, r2.rep, P2, { ...efectivo("390.00"), con_regalo: false });
      expect(await regalo(c, b.venta_id)).toBeNull();
      expect(await saldoLealtad(c, j.L)).toBe(12);
      const P3 = await pedidoConfirmado(c, j.L, [lin(j.victoria.caja, 1)], hoy, j.dueno);
      const r3 = await rutaEnCurso(c, j.dueno, [P3]);
      const d = await entregar(c, r3.rep, P3, { ...efectivo("390.00"), con_regalo: true });
      expect(await regalo(c, d.venta_id)).toMatchObject({ producto: j.corona.nombre, cantidad: 1 });
      expect(await saldoLealtad(c, j.L)).toBe(3);
      // un valor que no es booleano no se acepta
      const P4 = await pedidoConfirmado(c, j.L, [lin(j.victoria.caja, 1)], hoy, j.dueno);
      const r4 = await rutaEnCurso(c, j.dueno, [P4]);
      const mal = await errorConDetalle(c, () => entregar(c, r4.rep, P4, { ...efectivo("390.00"), con_regalo: "si" as unknown as boolean }));
      expect([mal.message, mal.detalle]).toEqual(["VALIDACION", { campo: "con_regalo" }]);
    });
  });

  it("regalo no vendible (presentacion inactiva, sin se_vende o producto inactivo): fn_lealtad_cliente da regalo null y premio false, y la carga no avisa; al corregirlo vuelve el premio", async () => {
    await enTransaccion(async (c) => {
      const j = await juegoL(c, { cajasVictoria: 12 });
      await venderL(c, j, [lin(j.victoria.caja, 10)], "3900.00");
      const P = await pedidoConfirmado(c, j.L, [lin(j.victoria.caja, 1)], await dia(c, 0), j.dueno);
      const r = await rutaEnCurso(c, j.dueno, [P]);
      expect((await lealtad(c, j.L))?.premio).toBe(true);
      expect((await carga(c, r.ruta)).regalos).toHaveLength(1);
      for (const [cambio, vuelta] of [
        ["update app.presentacion set activa = false where id = $1", "update app.presentacion set activa = true where id = $1"],
        ["update app.presentacion set se_vende = false where id = $1", "update app.presentacion set se_vende = true where id = $1"],
      ] as const) {
        await c.query(cambio, [j.corona.caja]);
        expect(await lealtad(c, j.L)).toMatchObject({ llevas: 10, premio: false, regalo: null });
        expect((await carga(c, r.ruta)).regalos).toEqual([]);
        await c.query(vuelta, [j.corona.caja]);
      }
      await c.query("update app.producto set activo = false where id = $1", [j.corona.id]);
      expect(await lealtad(c, j.L)).toMatchObject({ premio: false, regalo: null });
      expect((await carga(c, r.ruta)).regalos).toEqual([]);
      await c.query("update app.producto set activo = true where id = $1", [j.corona.id]);
      expect((await lealtad(c, j.L))?.premio).toBe(true);
      expect((await carga(c, r.ruta)).regalos).toHaveLength(1);
    });
  });

  it("una linea marcada vendida con precio 0.00 no acumula; la de precio normal si", async () => {
    await enTransaccion(async (c) => {
      const j = await juegoL(c);
      await turnoMostrador(c, j.dueno);
      const v = (await vender(c, j.dueno, { cliente_id: j.L, lineas: [{ presentacion_id: j.corona.caja, cantidad: 2, precio_unitario: "0.00" }, { presentacion_id: j.victoria.caja, cantidad: 1 }], ...efectivo("390.00") })).venta_id;
      const ls = await lineasDe(c, v);
      expect(await mov(c, v)).toEqual([{ tipo: "acumula", cantidad: 1, venta_linea_id: ls[1]!.id }]);
      expect(await saldoLealtad(c, j.L)).toBe(1);
    });
  });

  it("reparto sin existencia libre: el regalo no se da (la entrega pasa, el premio sigue pendiente y la existencia no queda negativa)", async () => {
    await enTransaccion(async (c) => {
      const j = await juegoL(c, { cajasVictoria: 12 });
      await venderL(c, j, [lin(j.victoria.caja, 10)], "3900.00");
      await ajuste(c, j.dueno, j.corona.id, "ajuste_salida", 240, { motivo: "prueba" });
      const P = await pedidoConfirmado(c, j.L, [lin(j.victoria.caja, 1)], await dia(c, 0), j.dueno);
      const r = await rutaEnCurso(c, j.dueno, [P]);
      const { venta_id } = await entregar(c, r.rep, P, { ...efectivo("390.00"), con_regalo: true });
      expect((await lineasDe(c, venta_id)).length).toBe(1);
      expect(await regalo(c, venta_id)).toBeNull();
      expect(await saldoLealtad(c, j.L)).toBe(11);
      expect(await existe(c, j.corona.id)).toBe(0);
    });
  });

  it("recoge en bodega: pedido recoge de L con premio, entregado con turno de mostrador -> regalo como en mostrador", async () => {
    await enTransaccion(async (c) => {
      const j = await juegoL(c, { cajasVictoria: 12 });
      await venderL(c, j, [lin(j.victoria.caja, 10)], "3900.00");
      const ped = await pedido(c, j.L, [lin(j.corona.six, 1)], { captura: j.dueno, entrega_tipo: "recoge" });
      await c.query("select app.fn_confirmar_pedido($1, $2, $3::jsonb)", [j.dueno, ped, JSON.stringify({ version: 1, fecha_entrega: await dia(c, 0) })]);
      const { venta_id } = await entregar(c, j.cajero, ped, efectivo("105.00"));
      const ls = await lineasDe(c, venta_id);
      expect(ls.length).toBe(2);
      expect(ls[1]).toMatchObject({ presentacion_id: j.corona.caja, importe: "0.00", precio_unitario: "0.00" });
      expect(await mov(c, venta_id)).toEqual([{ tipo: "canje", cantidad: -10, venta_linea_id: ls[1]!.id }]);
      expect(await regalo(c, venta_id)).toMatchObject({ producto: j.corona.nombre, presentacion: "Caja de 24", cantidad: 1 });
      expect(await saldoLealtad(c, j.L)).toBe(0);
    });
  });

  it("dos conexiones venden 1 Six a L con saldo 10 a la vez: exactamente un canje y un regalo; saldo final 0", async () => {
    const marcas = await marcarAgua();
    const marcaMov = (await pool.query("select coalesce(max(id), 0) as m from app.lealtad_movimiento")).rows[0].m as string;
    try {
      const c0 = await pool.connect();
      let j!: JuegoL;
      let cajero2 = "";
      try {
        await c0.query("begin");
        j = await juegoL(c0, { cajasVictoria: 12 });
        cajero2 = await usuarioF3(c0, ROL3.cajero);
        await turnoMostrador(c0, cajero2);
        await venderL(c0, j, [lin(j.victoria.caja, 10)], "3900.00");
        await c0.query("commit");
      } finally { c0.release(); }
      expect(await saldoLealtad(pool as unknown as pg.PoolClient, j.L)).toBe(10);
      const a = await pool.connect();
      const b = await pool.connect();
      try {
        await a.query("begin");
        await b.query("begin");
        await vender(a, j.cajero, { cliente_id: j.L, lineas: [lin(j.corona.six, 1)], ...efectivo("105.00") });
        const segunda = vender(b, cajero2, { cliente_id: j.L, lineas: [lin(j.corona.six, 1)], ...efectivo("105.00") }).then((r) => r.venta_id, (e: { message: string }) => e.message);
        await new Promise((r) => setTimeout(r, 400));
        await a.query("commit");
        const vb = await segunda;
        expect(vb).toMatch(/^\d+$/);
        await b.query("commit");
        const canjes = await pool.query("select count(*)::int as n from app.lealtad_movimiento where cliente_id = $1 and tipo = 'canje'", [j.L]);
        expect(canjes.rows[0].n).toBe(1);
        const regalos = await pool.query(
          `select count(*)::int as n from app.venta_linea vl join app.venta v on v.id = vl.venta_id
           where v.cliente_id = $1 and vl.precio_unitario = 0`, [j.L]);
        expect(regalos.rows[0].n).toBe(1);
        expect((await pool.query("select coalesce(sum(cantidad), 0)::int as s from app.lealtad_movimiento where cliente_id = $1", [j.L])).rows[0].s).toBe(0);
      } finally {
        await a.query("rollback").catch(() => undefined);
        await b.query("rollback").catch(() => undefined);
        a.release();
        b.release();
      }
    } finally {
      const l = await pool.connect();
      try {
        await l.query("begin");
        await l.query("set local session_replication_role = replica");
        await l.query("delete from app.lealtad_movimiento where id > $1", [marcaMov]);
        await l.query(`update app.configuracion set valor = case clave when 'lealtad_activa' then 'false'::jsonb when 'lealtad_cada' then '10'::jsonb else 'null'::jsonb end
                       where clave like 'lealtad_%'`);
        await l.query("commit");
      } finally { l.release(); }
      await borrarDesde(marcas);
    }
  }, 60_000);
});

describe("sugerencias de la zona (fn_sugerencias_zona)", () => {
  const sug = async (c: pg.PoolClient, cli: string) =>
    (await c.query("select presentacion_id::text, clientes from app.fn_sugerencias_zona($1)", [cli])).rows as { presentacion_id: string; clientes: number }[];

  it("juego Z: E -> [Corona Caja 4, Indio Caja 4, Carta Blanca Caja 3] en ese orden; F -> []; S sin zona -> []", async () => {
    await enTransaccion(async (c) => {
      const z = await juegoZ(c);
      expect(await sug(c, z.E)).toEqual([
        { presentacion_id: z.caja.Corona, clientes: 4 }, { presentacion_id: z.caja.Indio, clientes: 4 }, { presentacion_id: z.caja["Carta Blanca"], clientes: 3 },
      ]);
      expect(await sug(c, z.F)).toEqual([]);
      expect(await sug(c, z.S)).toEqual([]);
    });
  });

  it("propiedad: para cada cliente del juego, ningun producto sugerido esta entre sus compras completadas de la ventana", async () => {
    await enTransaccion(async (c) => {
      const z = await juegoZ(c);
      let con = 0;
      for (const cli of z.clientes) {
        const s = await sug(c, cli);
        con += s.length;
        expect(s.length).toBeLessThanOrEqual(3);
        const propios = new Set((await q(c,
          `select distinct vl.producto_id::text as p from app.venta v join app.venta_linea vl on vl.venta_id = v.id
           where v.cliente_id = $1 and v.estado = 'completada' and v.creado_en >= app.fn_inicio_dia(app.fn_fecha_local(now()) - 60)`, [cli])).map((r) => r.p as string));
        for (const x of s) {
          const prod = (await fila<{ p: string }>(c, "select producto_id::text as p from app.presentacion where id = $1", [x.presentacion_id])).p;
          expect(propios.has(prod), `cliente ${cli} producto ${prod}`).toBe(false);
        }
      }
      expect(con).toBeGreaterThan(0);
    });
  });

  it("la ventana: la compra de hace 60 dias cuenta (borde) y la de hace 61 no", async () => {
    await enTransaccion(async (c) => {
      const z = await juegoZ(c);
      const E2 = await clienteCredito(c, "0.00");
      await c.query("update app.cliente set zona_id = (select zona_id from app.cliente where id = $1) where id = $2", [z.E, E2]);
      // solo Modelo Caja (A, B, C en H-60) queda como candidata
      const otras = [z.caja.Corona, z.coronaSix, z.caja.Indio, z.caja["Carta Blanca"], z.caja.Sol, z.caja.Victoria];
      await c.query("update app.presentacion set activa = false where id = any($1)", [otras]);
      expect(await sug(c, E2)).toEqual([{ presentacion_id: z.caja.Modelo, clientes: 3 }]);
      const ventas = (await q(c, "select distinct v.id::text as id from app.venta v join app.venta_linea vl on vl.venta_id = v.id where vl.presentacion_id = $1", [z.caja.Modelo])).map((r) => r.id as string);
      expect(ventas.length).toBe(3);
      const h61 = (await fila<{ t: string }>(c, "select (app.fn_inicio_dia(app.fn_fecha_local(now()) - 61) + interval '12 hours')::text as t")).t;
      for (const v of ventas) await fechar(c, "venta", v, h61);
      expect(await sug(c, E2)).toEqual([]);
    });
  });

  it("la zona es la actual de cada comprador: si C se muda a otra zona dejan de contar sus compras; con 2 clientes no hay sugerencia", async () => {
    await enTransaccion(async (c) => {
      const z = await juegoZ(c);
      await c.query("update app.cliente set zona_id = (select zona_id from app.cliente where id = $1) where id = $2", [z.F, z.C]);
      expect(await sug(c, z.E)).toEqual([{ presentacion_id: z.caja.Corona, clientes: 3 }, { presentacion_id: z.caja.Indio, clientes: 3 }]);
    });
  });

  it("filtros de catalogo: producto o categoria inactivos, o sin precio en la lista del cliente, no se sugieren", async () => {
    await enTransaccion(async (c) => {
      const z = await juegoZ(c);
      await c.query("update app.producto set activo = false where id = $1", [z.producto.Indio]);
      expect((await sug(c, z.E)).map((x) => x.presentacion_id)).toEqual([z.caja.Corona, z.caja["Carta Blanca"], z.caja.Sol]);
      await c.query("update app.producto set activo = true where id = $1", [z.producto.Indio]);
      await c.query("update app.categoria set activa = false where id = (select categoria_id from app.producto where id = $1)", [z.producto.Corona]);
      expect((await sug(c, z.E)).map((x) => x.presentacion_id)).toEqual([z.caja.Indio, z.caja["Carta Blanca"], z.caja.Sol]);
      await c.query("update app.categoria set activa = true where id = (select categoria_id from app.producto where id = $1)", [z.producto.Corona]);
      await c.query("delete from app.precio where presentacion_id = $1", [z.caja.Indio]);
      expect((await sug(c, z.E)).map((x) => x.presentacion_id)).toEqual([z.caja.Corona, z.caja["Carta Blanca"], z.caja.Sol]);
    });
  });

  it("una por producto: con Corona Six comprada por mas clientes que la Caja gana el Six; empate de clientes -> mayor factor", async () => {
    await enTransaccion(async (c) => {
      const z = await juegoZ(c);
      // Corona Six: A, B, C ya la compraron (3); D tambien -> 4 como la Caja: empate, gana la de mayor factor (Caja)
      await comprarHace(c, z.cajero, z.D, z.coronaSix, 1, 10, "105.00");
      expect((await sug(c, z.E))[0]).toEqual({ presentacion_id: z.caja.Corona, clientes: 4 });
      // G tambien compra Six -> 5 contra 4: gana el Six
      await comprarHace(c, z.cajero, z.G, z.coronaSix, 1, 10, "105.00");
      expect((await sug(c, z.E))[0]).toEqual({ presentacion_id: z.coronaSix, clientes: 5 });
    });
  });

  it("el regalo de lealtad no cuenta para la zona: Pacifico tiene 2 compradores (A, B) y D la recibe de regalo; no llega a 3", async () => {
    await enTransaccion(async (c) => {
      const z = await juegoZ(c);
      await c.query("update app.presentacion set cuenta_lealtad = true where id = $1", [z.caja.Victoria]);
      await prenderLealtad(c, z.caja.Pacifico, 10, z.dueno);
      await vender(c, z.cajero, { cliente_id: z.D, lineas: [lin(z.caja.Victoria, 10)], ...efectivo("4000.00") });
      expect(await saldoLealtad(c, z.D)).toBe(10);
      const v = (await vender(c, z.cajero, { cliente_id: z.D, lineas: [lin(z.caja.Tecate, 1)], ...efectivo("400.00") })).venta_id;
      expect(await regalo(c, v)).toMatchObject({ cantidad: 1 });
      // se quitan del camino las demas candidatas: con el regalo contado, Pacifico (3) apareceria
      const otras = [z.caja.Corona, z.coronaSix, z.caja.Indio, z.caja["Carta Blanca"], z.caja.Sol, z.caja.Tecate];
      await c.query("update app.presentacion set activa = false where id = any($1)", [otras]);
      expect(await sug(c, z.E)).toEqual([]);
    });
  });
});


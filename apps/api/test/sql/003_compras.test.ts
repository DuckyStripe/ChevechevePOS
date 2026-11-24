import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { enTransaccion, error, pool, ROL } from "./ayuda.js";
import { ajuste, compra, dia, errorConDetalle, existencia, ponerPrecio, producto, proveedor, usuarioF2 } from "./ayuda-inventario.js";

afterAll(() => pool.end());

/** 10 cajas a `costo` de un producto con presentaciones [1, 24]. */
const cajas = (caja: string, cantidad: number, costo: string) => [{ presentacion_id: caja, cantidad, costo_presentacion: costo }];

const margenes = async (c: pg.PoolClient, compraId: string) =>
  (await c.query("select * from app.fn_margenes_compra($1)", [compraId])).rows;

describe("compras y costo promedio", () => {
  it("primera compra, promedio ponderado, linea de regalo", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24] });
      const caja = p.pf(24);

      const c1 = await compra(c, cajas(caja, 10, "300.00"));
      expect(await existencia(c, p.id)).toEqual({ cantidad: 240, costo_promedio: "12.500000" });
      const linea = await c.query("select importe, costo_unitario, piezas, factor from app.compra_linea where compra_id = $1", [c1.id]);
      expect(linea.rows).toEqual([{ importe: "3000.00", costo_unitario: "12.500000", piezas: 240, factor: 24 }]);
      expect((await c.query("select total from app.compra where id = $1", [c1.id])).rows[0].total).toBe("3000.00");

      await compra(c, cajas(caja, 10, "312.00"));
      expect(await existencia(c, p.id)).toEqual({ cantidad: 480, costo_promedio: "12.750000" });

      await compra(c, cajas(caja, 1, "0.00"));
      expect(await existencia(c, p.id)).toEqual({ cantidad: 504, costo_promedio: "12.142857" });
    });
  });

  it("redondeo de linea: 1 caja a 299.99", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24] });
      const k = await compra(c, cajas(p.pf(24), 1, "299.99"));
      const r = await c.query("select costo_unitario, importe from app.compra_linea where compra_id = $1", [k.id]);
      expect(r.rows[0]).toEqual({ costo_unitario: "12.499583", importe: "299.99" });
    });
  });

  it("desde existencia cero el promedio viejo no pesa", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24] });
      await compra(c, cajas(p.pf(24), 1, "300.00"));
      expect(await existencia(c, p.id)).toEqual({ cantidad: 24, costo_promedio: "12.500000" });
      await ajuste(c, p.usuario, p.id, "ajuste_salida", 24);
      expect(await existencia(c, p.id)).toEqual({ cantidad: 0, costo_promedio: "12.500000" });
      await compra(c, cajas(p.pf(24), 1, "336.00"));
      expect(await existencia(c, p.id)).toEqual({ cantidad: 24, costo_promedio: "14.000000" });
    });
  });

  it("existencia = suma del kardex y cada existencia_resultante es el acumulado", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24] });
      const caja = p.pf(24);
      await compra(c, cajas(caja, 10, "300.00"));
      const k2 = await compra(c, cajas(caja, 5, "312.00"));
      await c.query("select app.fn_cancelar_compra($1, $2, 'error de captura')", [p.usuario, k2.id]);
      await ajuste(c, p.usuario, p.id, "ajuste_entrada", 7);
      await ajuste(c, p.usuario, p.id, "ajuste_salida", 3);
      await ajuste(c, p.usuario, p.id, "merma", 11, { causa: "danado" });
      await c.query("select app.fn_contar_inventario($1, 1, $2, 300, 'conteo')", [p.usuario, p.id]);

      const e = await existencia(c, p.id);
      const m = await c.query("select cantidad, existencia_resultante, tipo from app.movimiento_inventario where producto_id = $1 order by id", [p.id]);
      let acum = 0;
      for (const f of m.rows) {
        acum += f.cantidad;
        expect(f.existencia_resultante).toBe(acum);
      }
      expect(m.rows.map((f) => f.tipo)).toEqual([
        "compra", "compra", "cancelacion_compra", "ajuste_entrada", "ajuste_salida", "merma", "ajuste_entrada",
      ]);
      expect(e.cantidad).toBe(acum);
      const suma = await c.query("select sum(cantidad)::int as s from app.movimiento_inventario where producto_id = $1", [p.id]);
      expect(e.cantidad).toBe(suma.rows[0].s);
    });
  });

  it("idempotencia: misma clave y hash devuelve la misma compra; otro hash, IDEMPOTENCIA_CONFLICTO", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24] });
      const u = await usuarioF2(c);
      const prov = await proveedor(c);
      const clave = randomUUID();
      const a = await compra(c, cajas(p.pf(24), 2, "300.00"), { usuario: u, proveedor: prov, clave, hash: "h1" });
      expect(a.repetida).toBe(false);
      const antes = (await c.query("select count(*)::int as n from app.movimiento_inventario where producto_id = $1", [p.id])).rows[0].n;
      const b = await compra(c, cajas(p.pf(24), 2, "300.00"), { usuario: u, proveedor: prov, clave, hash: "h1" });
      expect(b).toEqual({ id: a.id, repetida: true });
      const despues = (await c.query("select count(*)::int as n from app.movimiento_inventario where producto_id = $1", [p.id])).rows[0].n;
      expect(despues).toBe(antes);
      expect((await existencia(c, p.id)).cantidad).toBe(48);
      const e = await error(c, () => compra(c, cajas(p.pf(24), 3, "300.00"), { usuario: u, proveedor: prov, clave, hash: "h2" }));
      expect(e).toEqual({ code: "P0001", message: "IDEMPOTENCIA_CONFLICTO" });
    });
  });

  it("validaciones: COMPRA_VACIA, PRESENTACION_NO_VALIDA y folios consecutivos", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24] });
      expect(await error(c, () => compra(c, []))).toEqual({ code: "P0001", message: "COMPRA_VACIA" });

      await c.query("update app.presentacion set activa = false where id = $1", [p.pf(24)]);
      expect(await error(c, () => compra(c, cajas(p.pf(24), 1, "300.00")))).toEqual({ code: "P0001", message: "PRESENTACION_NO_VALIDA" });
      await c.query("update app.presentacion set activa = true, se_compra = false where id = $1", [p.pf(24)]);
      expect(await error(c, () => compra(c, cajas(p.pf(24), 1, "300.00")))).toEqual({ code: "P0001", message: "PRESENTACION_NO_VALIDA" });
      await c.query("update app.presentacion set se_compra = true where id = $1", [p.pf(24)]);

      // Los fallos de arriba no gastaron folio (validan antes de pedirlo).
      const sig = Number((await c.query("select coalesce((select siguiente from app.folio where sucursal_id = 1 and serie = 'C'), 1) as n")).rows[0].n);
      const a = await compra(c, cajas(p.pf(24), 1, "300.00"));
      const b = await compra(c, cajas(p.pf(24), 1, "300.00"));
      const folio = async (id: string) => (await c.query("select folio from app.compra where id = $1", [id])).rows[0].folio;
      expect(await folio(a.id)).toBe(`C-${String(sig).padStart(6, "0")}`);
      expect(await folio(b.id)).toBe(`C-${String(sig + 1).padStart(6, "0")}`);
    });
  });

  it("proveedor inactivo: ESTADO_NO_VALIDO", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24] });
      const prov = await proveedor(c);
      await c.query("update app.proveedor set activo = false where id = $1", [prov]);
      expect(await error(c, () => compra(c, cajas(p.pf(24), 1, "300.00"), { proveedor: prov }))).toEqual({ code: "P0001", message: "ESTADO_NO_VALIDO" });
    });
  });
});

describe("cancelar compra", () => {
  it("la segunda de dos compras: vuelve a 240 a 12.50; estado y auditoria de cancelacion; otra vez COMPRA_YA_CANCELADA", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24] });
      const caja = p.pf(24);
      await compra(c, cajas(caja, 10, "300.00"));
      const k2 = await compra(c, cajas(caja, 10, "312.00"));
      expect(await existencia(c, p.id)).toEqual({ cantidad: 480, costo_promedio: "12.750000" });

      await c.query("select app.fn_cancelar_compra($1, $2, 'se devolvio')", [p.usuario, k2.id]);
      expect(await existencia(c, p.id)).toEqual({ cantidad: 240, costo_promedio: "12.500000" });
      const r = await c.query("select estado, cancelada_en is not null as en, cancelada_por, motivo_cancelacion from app.compra where id = $1", [k2.id]);
      expect(r.rows[0]).toEqual({ estado: "cancelada", en: true, cancelada_por: p.usuario, motivo_cancelacion: "se devolvio" });
      const m = await c.query("select tipo, cantidad, costo_unitario, referencia_tabla from app.movimiento_inventario where producto_id = $1 order by id desc limit 1", [p.id]);
      expect(m.rows[0]).toEqual({ tipo: "cancelacion_compra", cantidad: -240, costo_unitario: "13.000000", referencia_tabla: "compra_linea" });

      expect(await error(c, () => c.query("select app.fn_cancelar_compra($1, $2, 'otra vez')", [p.usuario, k2.id]))).toEqual({ code: "P0001", message: "COMPRA_YA_CANCELADA" });
    });
  });

  it("cancelar la unica compra de un producto: existencia 0 y el promedio se queda", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24] });
      const k = await compra(c, cajas(p.pf(24), 10, "300.00"));
      await c.query("select app.fn_cancelar_compra($1, $2, 'x')", [p.usuario, k.id]);
      expect(await existencia(c, p.id)).toEqual({ cantidad: 0, costo_promedio: "12.500000" });
    });
  });

  it("con salidas posteriores: COMPRA_CON_SALIDAS {producto_id} y nada cambia (no se recorta el promedio)", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24] });
      const k = await compra(c, cajas(p.pf(24), 10, "300.00"));
      await ajuste(c, p.usuario, p.id, "merma", 10, { causa: "faltante" });
      const movs = async () => (await c.query("select count(*)::int as n from app.movimiento_inventario where producto_id = $1", [p.id])).rows[0].n;
      const antes = await movs();
      const e = await errorConDetalle(c, () => c.query("select app.fn_cancelar_compra($1, $2, 'x')", [p.usuario, k.id]));
      expect(e.message).toBe("COMPRA_CON_SALIDAS");
      expect(e.detalle).toEqual({ producto_id: Number(p.id) });
      expect((await c.query("select estado, cancelada_en from app.compra where id = $1", [k.id])).rows[0]).toEqual({ estado: "registrada", cancelada_en: null });
      expect(await movs()).toBe(antes);
      expect(await existencia(c, p.id)).toEqual({ cantidad: 230, costo_promedio: "12.500000" });
    });
  });

  it("revaluacion: corrige el promedio con permiso precios.editar, motivo y costo validos", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24] });
      const k = await compra(c, cajas(p.pf(24), 10, "300.00"));
      await ajuste(c, p.usuario, p.id, "ajuste_salida", 100, {});
      const rev = (usuario: string, costo: string | null, motivo: string | null) =>
        c.query("select app.fn_revaluar_costo($1, 1, $2, $3, $4) as id", [usuario, p.id, costo, motivo]);

      const id = (await rev(p.usuario, "13.25", "se compro mas caro")).rows[0].id;
      const m = await c.query("select tipo, cantidad, costo_unitario, existencia_resultante, costo_promedio_resultante, motivo from app.movimiento_inventario where id = $1", [id]);
      expect(m.rows[0]).toEqual({ tipo: "revaluacion", cantidad: 0, costo_unitario: "13.250000", existencia_resultante: 140, costo_promedio_resultante: "13.250000", motivo: "se compro mas caro" });
      expect(await existencia(c, p.id)).toEqual({ cantidad: 140, costo_promedio: "13.250000" });

      const admin = (await c.query(`insert into app.usuario (usuario, nombre, contrasena_hash, rol_id, sucursal_id)
        values ($1, 'A', 'h', ${ROL.admin}, 1) returning id`, [`tf2_adm${process.pid}`])).rows[0].id;
      const sp = await errorConDetalle(c, () => rev(admin, "1.00", "x"));
      expect(sp.message).toBe("SIN_PERMISO");
      expect(sp.detalle).toEqual({ permiso: "precios.editar" });
      expect((await error(c, () => rev(p.usuario, "1.00", " "))).message).toBe("AJUSTE_NO_VALIDO");
      expect((await error(c, () => rev(p.usuario, "-1", "x"))).message).toBe("COSTO_INVALIDO");
      expect((await error(c, () => rev(p.usuario, null, "x"))).message).toBe("COSTO_INVALIDO");
      expect(await existencia(c, p.id)).toEqual({ cantidad: 140, costo_promedio: "13.250000" });

      // Tras una revaluacion tampoco se puede cancelar la compra anterior.
      expect((await error(c, () => c.query("select app.fn_cancelar_compra($1, $2, 'x')", [p.usuario, k.id]))).message).toBe("COMPRA_CON_SALIDAS");
      // Directo en kardex: revaluacion solo con cantidad 0
      const e = await error(c, () => c.query("insert into app.movimiento_inventario (sucursal_id, producto_id, tipo, cantidad, costo_unitario, usuario_id) values (1, $1, 'revaluacion', 1, 1, $2)", [p.id, p.usuario]));
      expect(e.code).toBe("23514");
    });
  });

  it("todo o nada con varias lineas: si un producto tuvo salidas no se cancela ninguno", async () => {
    await enTransaccion(async (c) => {
      const a = await producto(c, { factores: [1, 24] });
      const b = await producto(c, { factores: [1, 24] });
      const k = await compra(c, [
        { presentacion_id: a.pf(24), cantidad: 1, costo_presentacion: "300.00" },
        { presentacion_id: b.pf(24), cantidad: 1, costo_presentacion: "300.00" },
      ]);
      await ajuste(c, b.usuario, b.id, "merma", 1, { causa: "danado" });
      const e = await errorConDetalle(c, () => c.query("select app.fn_cancelar_compra($1, $2, 'x')", [a.usuario, k.id]));
      expect(e.message).toBe("COMPRA_CON_SALIDAS");
      expect(e.detalle).toEqual({ producto_id: Number(b.id) });
      expect((await existencia(c, a.id)).cantidad).toBe(24);
      expect((await existencia(c, b.id)).cantidad).toBe(23);
    });
  });

  it("de la mas nueva a la mas vieja: cancelar B y luego A deja existencia y promedio iniciales; al reves, COMPRA_CON_SALIDAS", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24], costo: "10.00", piezas: 24 });
      const caja = p.pf(24);
      const a = await compra(c, cajas(caja, 1, "360.00"));
      const b = await compra(c, cajas(caja, 1, "480.00"));
      expect(await existencia(c, p.id)).toEqual({ cantidad: 72, costo_promedio: "15.000000" });

      await c.query("select app.fn_cancelar_compra($1, $2, 'b')", [p.usuario, b.id]);
      expect(await existencia(c, p.id)).toEqual({ cantidad: 48, costo_promedio: "12.500000" });
      await c.query("select app.fn_cancelar_compra($1, $2, 'a')", [p.usuario, a.id]);
      expect(await existencia(c, p.id)).toEqual({ cantidad: 24, costo_promedio: "10.000000" });

      // Al reves: la cancelacion de la vieja SI es salida para la nueva.
      const a2 = await compra(c, cajas(caja, 1, "360.00"));
      const b2 = await compra(c, cajas(caja, 1, "480.00"));
      await c.query("select app.fn_cancelar_compra($1, $2, 'a2')", [p.usuario, a2.id]);
      expect((await error(c, () => c.query("select app.fn_cancelar_compra($1, $2, 'b2')", [p.usuario, b2.id]))).message).toBe("COMPRA_CON_SALIDAS");
    });
  });
});

describe("margen y precio sugerido (A1)", () => {
  const sugerido = async (c: pg.PoolClient, compraId: string, caja: string, lista = "Menudeo") =>
    (await margenes(c, compraId)).find((r) => r.presentacion_id === caja && r.lista === lista);

  it("precio sugerido: promedio 12.75 -> 360.00; 13 -> 370.00; categoria 0.20 -> 390.00; producto 0.10 -> 350.00", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24] });
      await compra(c, cajas(p.pf(24), 10, "300.00"));
      const k = await compra(c, cajas(p.pf(24), 10, "312.00"));
      const f = await sugerido(c, k.id, p.pf(24));
      expect(f).toMatchObject({ costo_presentacion: "306.00", objetivo: "0.15", precio_sugerido: "360.00" });

      const q = await producto(c, { factores: [1, 24] });
      const k13 = await compra(c, cajas(q.pf(24), 10, "312.00"));
      expect(await sugerido(c, k13.id, q.pf(24))).toMatchObject({ costo_nuevo: "13.000000", costo_presentacion: "312.00", precio_sugerido: "370.00" });

      const cat = await producto(c, { factores: [1, 24], margenCategoria: "0.20" });
      const kc = await compra(c, cajas(cat.pf(24), 10, "312.00"));
      expect(await sugerido(c, kc.id, cat.pf(24))).toMatchObject({ objetivo: "0.2000", precio_sugerido: "390.00" });

      const pr = await producto(c, { factores: [1, 24], margenCategoria: "0.20", margen: "0.10" });
      const kp = await compra(c, cajas(pr.pf(24), 10, "312.00"));
      expect(await sugerido(c, kp.id, pr.pf(24))).toMatchObject({ objetivo: "0.1000", precio_sugerido: "350.00" });
    });
  });

  it("margen y alerta: 330 margen_bajo, 300 bajo_costo, 400 sin alerta, 0 sin margen", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24] });
      const caja = p.pf(24);
      await compra(c, cajas(caja, 10, "300.00"));
      const k = await compra(c, cajas(caja, 10, "312.00"));   // costo de caja 306.00

      await ponerPrecio(c, caja, "Menudeo", "330.00");
      const a = await sugerido(c, k.id, caja);
      expect(Number(a.margen)).toBeCloseTo(0.0727, 4);
      expect(a.alerta).toBe("margen_bajo");

      await ponerPrecio(c, caja, "Menudeo", "300.00");
      expect((await sugerido(c, k.id, caja)).alerta).toBe("bajo_costo");

      await ponerPrecio(c, caja, "Menudeo", "400.00");
      const d = await sugerido(c, k.id, caja);
      expect(d.alerta).toBeNull();
      expect(Number(d.margen)).toBeCloseTo(0.235, 4);

      await ponerPrecio(c, caja, "Menudeo", "0.00");
      const z = await sugerido(c, k.id, caja);
      expect(z.margen).toBeNull();
      expect(z.alerta).toBe("bajo_costo");
    });
  });

  it("filas: presentacion activa x lista activa; sin precio salen con precio, margen y alerta null; Mayoreo cae a Menudeo", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 6, 24] });
      await c.query("update app.presentacion set activa = false where id = $1", [p.pf(6)]);
      await c.query("update app.lista_precio set activa = false where nombre = 'Mayoreo'");
      const k = await compra(c, cajas(p.pf(24), 1, "300.00"));
      let filas = (await margenes(c, k.id)).filter((r) => r.producto_id === p.id);
      expect(filas).toHaveLength(2 * (await c.query("select count(*)::int as n from app.lista_precio where activa")).rows[0].n);
      expect(filas.every((r) => r.presentacion_id !== p.pf(6))).toBe(true);
      expect(filas.every((r) => r.precio === null && r.margen === null && r.alerta === null)).toBe(true);

      await c.query("update app.lista_precio set activa = true where nombre = 'Mayoreo'");
      await ponerPrecio(c, p.pf(24), "Menudeo", "330.00");
      filas = (await margenes(c, k.id)).filter((r) => r.presentacion_id === p.pf(24) && ["Menudeo", "Mayoreo"].includes(r.lista));
      expect(filas.map((r) => [r.lista, r.precio])).toEqual([["Menudeo", "330.00"], ["Mayoreo", "330.00"]]);
    });
  });

  it("costo_anterior y costo_nuevo: primera compra null; segunda 12.50 -> 12.75; dos lineas del mismo producto usan el ultimo movimiento", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24] });
      const caja = p.pf(24);
      const k1 = await compra(c, cajas(caja, 10, "300.00"));
      expect(await sugerido(c, k1.id, caja)).toMatchObject({ costo_anterior: null, costo_nuevo: "12.500000" });
      const k2 = await compra(c, cajas(caja, 10, "312.00"));
      expect(await sugerido(c, k2.id, caja)).toMatchObject({ costo_anterior: "12.500000", costo_nuevo: "12.750000" });

      const q = await producto(c, { factores: [1, 24] });
      const cq = q.pf(24);
      const k3 = await compra(c, [
        { presentacion_id: cq, cantidad: 1, costo_presentacion: "300.00" },
        { presentacion_id: cq, cantidad: 1, costo_presentacion: "312.00" },
      ]);
      expect(await sugerido(c, k3.id, cq)).toMatchObject({ costo_anterior: null, costo_nuevo: "12.750000" });
    });
  });
});

describe("v_por_caducar", () => {
  it("PEPS fisico: la existencia ocupa las compras mas nuevas, con o sin fecha", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c);
      const pieza = p.pf(1);
      const lin = async (cantidad: number, dias?: number) => [{
        presentacion_id: pieza, cantidad, costo_presentacion: "10.00",
        ...(dias === undefined ? {} : { caduca_el: await dia(c, dias) }),
      }];
      const filas = async () =>
        (await c.query("select compra_folio, piezas_estimadas, dias_restantes, presentacion_id from app.v_por_caducar where producto_id = $1 order by caduca_el", [p.id])).rows;

      const a = await compra(c, await lin(48, 10), { fecha: await dia(c, -2) });
      const b = await compra(c, await lin(24, 25), { fecha: await dia(c, -1) });
      const folio = async (id: string) => (await c.query("select folio from app.compra where id = $1", [id])).rows[0].folio;
      const fa = await folio(a.id), fb = await folio(b.id);

      expect(await filas()).toEqual([
        { compra_folio: fa, piezas_estimadas: 48, dias_restantes: 10, presentacion_id: pieza },
        { compra_folio: fb, piezas_estimadas: 24, dias_restantes: 25, presentacion_id: pieza },
      ]);

      await ajuste(c, p.usuario, p.id, "merma", 42, { causa: "caducado" });   // quedan 30
      expect(await filas()).toEqual([
        { compra_folio: fa, piezas_estimadas: 6, dias_restantes: 10, presentacion_id: pieza },
        { compra_folio: fb, piezas_estimadas: 24, dias_restantes: 25, presentacion_id: pieza },
      ]);

      await ajuste(c, p.usuario, p.id, "merma", 8, { causa: "caducado" });    // quedan 22
      expect(await filas()).toEqual([{ compra_folio: fb, piezas_estimadas: 22, dias_restantes: 25, presentacion_id: pieza }]);

      // Compra C sin caducidad: ocupa existencia (46) y no se lista; sin la regla saldrian B 24 y A 22.
      await compra(c, await lin(24), { fecha: await dia(c, 0) });
      expect((await existencia(c, p.id)).cantidad).toBe(46);
      expect(await filas()).toEqual([{ compra_folio: fb, piezas_estimadas: 22, dias_restantes: 25, presentacion_id: pieza }]);

      // Una compra cancelada no cuenta.
      const d = await compra(c, await lin(10, 5), { fecha: await dia(c, 0) });
      await c.query("select app.fn_cancelar_compra($1, $2, 'x')", [p.usuario, d.id]);
      expect(await filas()).toEqual([{ compra_folio: fb, piezas_estimadas: 22, dias_restantes: 25, presentacion_id: pieza }]);
    });
  });
});

describe("compras: redondeo, margenes degenerados y protecciones", () => {
  it("costo_presentacion con 3 decimales se redondea a centavos antes de calcular", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24] });
      const k = await compra(c, cajas(p.pf(24), 1, "299.999"));
      const l = await c.query("select costo_presentacion, importe, costo_unitario from app.compra_linea where compra_id = $1", [k.id]);
      expect(l.rows[0]).toEqual({ costo_presentacion: "300.00", importe: "300.00", costo_unitario: "12.500000" });
      expect((await c.query("select total from app.compra where id = $1", [k.id])).rows[0].total).toBe("300.00");
      expect(await existencia(c, p.id)).toEqual({ cantidad: 24, costo_promedio: "12.500000" });
    });
  });

  it("fn_margenes_compra con paso 0, objetivo 1 o sin llave de redondeo: no pierde filas y no divide entre cero", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24] });
      const k = await compra(c, cajas(p.pf(24), 1, "300.00"));
      const base = (await margenes(c, k.id)).length;
      expect(base).toBeGreaterThan(0);
      const sug = async () => (await margenes(c, k.id)).map((r) => r.precio_sugerido);

      await c.query("update app.configuracion set valor = '\"0.00\"' where clave = 'precio_redondeo'");
      let r = await sug();
      expect(r).toHaveLength(base);
      expect(r.every((x) => x === null)).toBe(true);

      await c.query("update app.configuracion set valor = '\"5.00\"' where clave = 'precio_redondeo'");
      await c.query("update app.configuracion set valor = '\"1\"' where clave = 'margen_objetivo'");
      r = await sug();
      expect(r).toHaveLength(base);
      expect(r.every((x) => x === null)).toBe(true);

      await c.query("update app.configuracion set valor = '\"0.15\"' where clave = 'margen_objetivo'");
      await c.query("delete from app.configuracion where clave = 'precio_redondeo'");
      r = await sug();
      expect(r).toHaveLength(base);
      expect(r.every((x) => x === null)).toBe(true);
    });
  });

  it("compra_linea y compra protegidas: UPDATE/DELETE/TRUNCATE; solo registrada -> cancelada", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24] });
      const k = await compra(c, cajas(p.pf(24), 1, "300.00"));
      const esperado = { code: "P0001", message: "COMPRA_INMUTABLE" };
      expect(await error(c, () => c.query("update app.compra_linea set cantidad = 5 where compra_id = $1", [k.id]))).toEqual(esperado);
      expect(await error(c, () => c.query("delete from app.compra_linea where compra_id = $1", [k.id]))).toEqual(esperado);
      expect(await error(c, () => c.query("update app.compra set total = 1 where id = $1", [k.id]))).toEqual(esperado);
      expect(await error(c, () => c.query("update app.compra set estado = 'cancelada', cancelada_en = now(), total = 1 where id = $1", [k.id]))).toEqual(esperado);
      expect(await error(c, () => c.query("delete from app.compra where id = $1", [k.id]))).toEqual(esperado);
      expect(await error(c, () => c.query("truncate app.compra cascade"))).toEqual(esperado);
      expect(await error(c, () => c.query("truncate app.compra_linea"))).toEqual(esperado);
      await c.query("select app.fn_cancelar_compra($1, $2, 'x')", [p.usuario, k.id]);
      expect(await error(c, () => c.query("update app.compra set estado = 'registrada', cancelada_en = null where id = $1", [k.id]))).toEqual(esperado);
    });
  });

  it("repetir la clave con otro usuario o sucursal: IDEMPOTENCIA_CONFLICTO", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24] });
      const u = await usuarioF2(c), otro = await usuarioF2(c);
      const prov = await proveedor(c);
      const clave = randomUUID();
      const a = await compra(c, cajas(p.pf(24), 1, "300.00"), { usuario: u, proveedor: prov, clave, hash: "h" });
      expect((await error(c, () => compra(c, cajas(p.pf(24), 1, "300.00"), { usuario: otro, proveedor: prov, clave, hash: "h" }))).message).toBe("IDEMPOTENCIA_CONFLICTO");
      const suc = (await c.query("insert into app.sucursal (nombre) values ('Otra') returning id")).rows[0].id;
      const datos = JSON.stringify({ clave_idempotencia: clave, proveedor_id: prov, fecha: await dia(c, 0), condicion_pago: "contado", lineas: cajas(p.pf(24), 1, "300.00") });
      expect((await error(c, () => c.query("select * from app.fn_registrar_compra($1, $2, $3::jsonb, 'h')", [u, suc, datos]))).message).toBe("IDEMPOTENCIA_CONFLICTO");
      expect((await compra(c, cajas(p.pf(24), 1, "300.00"), { usuario: u, proveedor: prov, clave, hash: "h" })).id).toBe(a.id);
    });
  });

  it("auditoria de compra y compra_linea (alta y cancelacion)", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24] });
      await c.query("select set_config('app.usuario_id', $1, true)", [p.usuario]);
      const k = await compra(c, cajas(p.pf(24), 1, "300.00"), { usuario: p.usuario });
      await c.query("select app.fn_cancelar_compra($1, $2, 'x')", [p.usuario, k.id]);
      const ac = await c.query("select accion from app.auditoria where tabla = 'compra' and registro_id = $1 order by id", [k.id]);
      expect(ac.rows.map((r) => r.accion)).toEqual(["insertar", "actualizar"]);
      const lid = (await c.query("select id from app.compra_linea where compra_id = $1", [k.id])).rows[0].id;
      const al = await c.query("select accion from app.auditoria where tabla = 'compra_linea' and registro_id = $1", [lid]);
      expect(al.rows.map((r) => r.accion)).toEqual(["insertar"]);
    });
  });
});

/** Datos confirmados (commit) para las pruebas con dos sesiones; quedan en la base de pruebas, que se recrea en cada corrida. */
async function confirmado<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const r = await fn(c);
    await c.query("commit");
    return r;
  } finally {
    c.release();
  }
}
/** Usuario confirmado sin permisos que alteren otras pruebas (Repartidor: solo catalogo.ver). */
const usuarioInocuo = (c: pg.PoolClient) => usuarioF2(c, "(select id from app.rol where nombre = 'Repartidor')");
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("concurrencia (dos sesiones)", () => {
  it("misma clave de idempotencia a la vez: una compra y la otra la repite", async () => {
    const fx = await confirmado(async (c) => {
      const u = await usuarioInocuo(c);
      const p = await producto(c, { factores: [1, 24], usuario: u });
      return { p, u, prov: await proveedor(c) };
    });
    const clave = randomUUID();
    const a = await pool.connect(), b = await pool.connect();
    try {
      await a.query("begin");
      await b.query("begin");
      const ra = await compra(a, cajas(fx.p.pf(24), 1, "300.00"), { usuario: fx.u, proveedor: fx.prov, clave, hash: "h" });
      const pb = compra(b, cajas(fx.p.pf(24), 1, "300.00"), { usuario: fx.u, proveedor: fx.prov, clave, hash: "h" });
      await pausa(300);
      await a.query("commit");
      const rb = await pb;
      await b.query("commit");
      expect(ra.repetida).toBe(false);
      expect(rb).toEqual({ id: ra.id, repetida: true });
      const n = await pool.query("select count(*)::int as n from app.movimiento_inventario where producto_id = $1", [fx.p.id]);
      expect(n.rows[0].n).toBe(1);
    } finally {
      await a.query("rollback").catch(() => undefined);
      await b.query("rollback").catch(() => undefined);
      a.release();
      b.release();
    }
  });

  it("dos conteos de un producto sin fila de existencia: se serializan y el segundo ya no encuentra diferencia", async () => {
    const fx = await confirmado(async (c) => ({ p: await producto(c, { usuario: await usuarioInocuo(c) }) }));
    const a = await pool.connect(), b = await pool.connect();
    try {
      await a.query("begin");
      await b.query("begin");
      const conteo = (c: pg.PoolClient) => c.query("select movimiento_id as id from app.fn_contar_inventario($1, 1, $2, 10, 'conteo')", [fx.p.usuario, fx.p.id]);
      const ra = await conteo(a);
      const pb = conteo(b);
      await pausa(300);
      await a.query("commit");
      const rb = await pb;
      await b.query("commit");
      expect(ra.rows[0].id).not.toBeNull();
      expect(rb.rows[0].id).toBeNull();
      expect(await existencia(pool as unknown as pg.PoolClient, fx.p.id)).toEqual({ cantidad: 10, costo_promedio: "0.000000" });
    } finally {
      await a.query("rollback").catch(() => undefined);
      await b.query("rollback").catch(() => undefined);
      a.release();
      b.release();
    }
  });

  it("compra y ajuste del mismo producto a la vez: existencia_resultante consistente en orden de id", async () => {
    const fx = await confirmado(async (c) => ({ p: await producto(c, { factores: [1, 24], costo: "12.50", usuario: await usuarioInocuo(c) }), prov: await proveedor(c) }));
    const a = await pool.connect(), b = await pool.connect();
    try {
      await a.query("begin");
      await b.query("begin");
      await compra(a, cajas(fx.p.pf(24), 1, "312.00"), { usuario: fx.p.usuario, proveedor: fx.prov });
      const pb = ajuste(b, fx.p.usuario, fx.p.id, "ajuste_entrada", 5);
      await pausa(300);
      await a.query("commit");
      await pb;
      await b.query("commit");
      const m = await pool.query("select cantidad, existencia_resultante from app.movimiento_inventario where producto_id = $1 order by id", [fx.p.id]);
      let acum = 0;
      for (const f of m.rows) {
        acum += f.cantidad;
        expect(f.existencia_resultante).toBe(acum);
      }
      expect(acum).toBe(240 + 24 + 5);
      expect((await existencia(pool as unknown as pg.PoolClient, fx.p.id)).cantidad).toBe(269);
    } finally {
      await a.query("rollback").catch(() => undefined);
      await b.query("rollback").catch(() => undefined);
      a.release();
      b.release();
    }
  });
});

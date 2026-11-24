import type pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { enTransaccion, error, pool } from "./ayuda.js";
import { errorConDetalle, ponerPrecio } from "./ayuda-inventario.js";
import {
  catalogoBase, cliente, clienteAtrasado, enlace, fila, notificaciones, pedido, pedidoEntregado,
} from "./ayuda-pedidos.js";

afterAll(() => pool.end());

const lin = (presentacion_id: string, cantidad: number) => ({ presentacion_id, cantidad });
const vista = async (c: pg.PoolClient, cli: string, lineas: unknown[]) =>
  (await c.query("select app.fn_vista_borrador($1, $2::jsonb) as v", [cli, JSON.stringify(lineas)])).rows[0].v;
const entregado = (c: pg.PoolClient, cli: string, dias: number, lineas: { presentacion: string; cantidad: number; entregada?: number; precio: string }[]) =>
  pedidoEntregado(c, cli, { creado_hace_dias: dias, lineas: lineas.map((l) => ({ ...l, entregada: l.entregada ?? l.cantidad })) });
const sugeridos = async (c: pg.PoolClient, cli: string) =>
  (await c.query("select id, estado, origen from app.pedido where cliente_id = $1 and origen = 'sugerido' order by id", [cli])).rows;

describe("frecuentes", () => {
  it("con historial: por numero de pedidos y luego por recencia; sin historial: favoritos primero", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      await entregado(c, cli, 10, [{ presentacion: k.caja, cantidad: 2, precio: "420.00" }, { presentacion: k.six, cantidad: 3, precio: "110.00" }]);
      await entregado(c, cli, 20, [{ presentacion: k.caja, cantidad: 1, precio: "420.00" }]);
      await entregado(c, cli, 30, [{ presentacion: k.caja, cantidad: 4, precio: "420.00" }, { presentacion: k.victoriaCaja, cantidad: 1, precio: "410.00" }]);
      await entregado(c, cli, 120, [{ presentacion: k.victoriaCaja, cantidad: 9, precio: "410.00" }]);   // fuera de los 90 dias
      const r = await c.query("select * from app.fn_frecuentes($1)", [cli]);
      expect(r.rows).toEqual([
        { presentacion_id: k.caja, veces: 3, ultima_cantidad: 2 },
        { presentacion_id: k.six, veces: 1, ultima_cantidad: 3 },
        { presentacion_id: k.victoriaCaja, veces: 1, ultima_cantidad: 1 },
      ]);
      expect((await c.query("select * from app.fn_frecuentes($1, 2)", [cli])).rows).toHaveLength(2);

      const nuevo = await cliente(c);
      await c.query("insert into app.cliente_favorito (cliente_id, presentacion_id, creado_en) values ($1, $2, now() - interval '1 hour'), ($1, $3, now())", [nuevo, k.caja, k.six]);
      expect((await c.query("select presentacion_id from app.fn_frecuentes($1)", [nuevo])).rows.map((x) => x.presentacion_id)).toEqual([k.six, k.caja]);
    });
  });
});

describe("cadencia y canasta (B5)", () => {
  it("30, 23, 16 y 9 dias: mediana 7, 9 desde el ultimo, atrasado; con el ultimo hace 8 no; intervalos 6 y 8 -> 7; con 2 pedidos no aparece", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cad = async (cli: string) => (await c.query("select mediana_dias, dias_desde_ultimo, atrasado, num_pedidos from app.v_cadencia_cliente where cliente_id = $1", [cli])).rows;
      const con = async (dias: number[]) => {
        const cli = await cliente(c);
        for (const d of dias) await entregado(c, cli, d, [{ presentacion: k.caja, cantidad: 2, precio: "420.00" }]);
        return cli;
      };
      expect(await cad(await con([30, 23, 16, 9]))).toEqual([{ mediana_dias: 7, dias_desde_ultimo: 9, atrasado: true, num_pedidos: 4 }]);
      expect(await cad(await con([29, 22, 15, 8]))).toEqual([{ mediana_dias: 7, dias_desde_ultimo: 8, atrasado: false, num_pedidos: 4 }]);
      expect((await cad(await con([20, 14, 6])))[0]).toMatchObject({ mediana_dias: 7, num_pedidos: 3 });
      expect(await cad(await con([20, 6]))).toEqual([]);
      // Solo cuentan los ultimos 10.
      const doce = await con([100, 95, 90, 80, 70, 60, 50, 40, 30, 20, 10, 5]);
      expect((await cad(doce))[0].num_pedidos).toBe(10);
    });
  });

  it("canasta: Caja x2 (2,2,3,2) y Six x2 (en 2 de 4: 1 y 3); Victoria en 1 de 4 queda fuera", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const caja = (cantidad: number) => ({ presentacion: k.caja, cantidad, precio: "420.00" });
      await entregado(c, cli, 30, [caja(2), { presentacion: k.six, cantidad: 1, precio: "110.00" }]);
      await entregado(c, cli, 23, [caja(2), { presentacion: k.victoriaCaja, cantidad: 5, precio: "410.00" }]);
      await entregado(c, cli, 16, [caja(3), { presentacion: k.six, cantidad: 3, precio: "110.00" }]);
      await entregado(c, cli, 9, [caja(2)]);
      const r = await c.query("select presentacion_id, cantidad from app.fn_canasta_tipica($1)", [cli]);
      expect(Object.fromEntries(r.rows.map((x) => [x.presentacion_id, x.cantidad]))).toEqual({ [k.caja]: 2, [k.six]: 2 });
    });
  });
});

describe("fn_sugerir_pedidos y aceptar propuesto", () => {
  it("23:59 -> 0; 00:00 -> propuesto con vence en 24 h y aviso sin precios; otra corrida no repite; rechazado no vuelve en el mismo ciclo", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const { cliente: cli } = await clienteAtrasado(c, k);
      await c.query(`update app.configuracion set valor = '"23:59"' where clave = 'sugerencia_hora'`);
      expect((await c.query("select app.fn_sugerir_pedidos() as n")).rows[0].n).toBe(0);
      expect(await sugeridos(c, cli)).toEqual([]);

      await c.query(`update app.configuracion set valor = '"00:00"' where clave = 'sugerencia_hora'`);
      expect((await c.query("select app.fn_sugerir_pedidos() as n")).rows[0].n).toBeGreaterThanOrEqual(1);
      const [s] = await sugeridos(c, cli);
      expect(s).toMatchObject({ estado: "propuesto", origen: "sugerido" });
      expect(await fila(c, "select propuesto_vence_en = now() + interval '24 hours' as vence, creado_por, total from app.pedido where id = $1", [s.id]))
        .toEqual({ vence: true, creado_por: null, total: "0.00" });
      expect((await c.query("select presentacion_id, cantidad_pedida from app.pedido_linea where pedido_id = $1", [s.id])).rows).toEqual([{ presentacion_id: k.caja, cantidad_pedida: 2 }]);
      const av = await fila<{ vars: Record<string, string>; estado: string }>(c, "select vars, estado from app.aviso_cliente where clave = $1", [`wa_lo_de_siempre:p${s.id}:v1`]);
      expect(av.estado).toBe("pendiente");
      expect(Object.keys(av.vars)).toEqual(["cliente"]);
      expect(await notificaciones(c, "pedido_nuevo", `pedido_nuevo:${s.id}`, [k.usuario])).toBe(0);

      await c.query("select app.fn_sugerir_pedidos()");
      expect(await sugeridos(c, cli)).toHaveLength(1);
      await c.query("select app.fn_cancelar_pedido_cliente($1, $2, 'no')", [cli, s.id]);
      await c.query("select app.fn_sugerir_pedidos()");
      expect(await sugeridos(c, cli)).toHaveLength(1);
      expect((await sugeridos(c, cli))[0].estado).toBe("cancelado");
    });
  });

  it("no sugiere: sugerir_pedido false, sin telefono, inactivo, sin enlace, con pedido recibido abierto, adelantado", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      await c.query(`update app.configuracion set valor = '"00:00"' where clave = 'sugerencia_hora'`);
      const excluidos: string[] = [];
      const optOut = (await clienteAtrasado(c, k)).cliente;
      await c.query("update app.cliente set sugerir_pedido = false where id = $1", [optOut]);
      excluidos.push(optOut);
      excluidos.push((await clienteAtrasado(c, k, { telefono: null })).cliente);
      const inactivo = (await clienteAtrasado(c, k)).cliente;
      await c.query("update app.cliente set activo = false where id = $1", [inactivo]);
      excluidos.push(inactivo);
      const sinEnlace = (await clienteAtrasado(c, k)).cliente;
      await c.query("update app.cliente_enlace set revocado_en = now(), motivo_revocacion = 'otro' where cliente_id = $1", [sinEnlace]);
      excluidos.push(sinEnlace);
      const abierto = (await clienteAtrasado(c, k)).cliente;
      await pedido(c, abierto, [lin(k.caja, 2), lin(k.six, 1)]);
      excluidos.push(abierto);
      const adelantado = await cliente(c);
      await enlace(c, adelantado, k.usuario);
      for (const d of [29, 22, 15, 8]) await entregado(c, adelantado, d, [{ presentacion: k.caja, cantidad: 2, precio: "420.00" }]);
      excluidos.push(adelantado);
      const bueno = (await clienteAtrasado(c, k)).cliente;

      await c.query("select app.fn_sugerir_pedidos()");
      for (const id of excluidos) expect(await sugeridos(c, id)).toEqual([]);
      expect(await sugeridos(c, bueno)).toHaveLength(1);
    });
  });

  it("vista borrador (C20): precios de hoy, subida de la Caja con precio_anterior, Six desactivada en quitadas", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      await entregado(c, cli, 9, [{ presentacion: k.caja, cantidad: 2, precio: "420.00" }, { presentacion: k.six, cantidad: 2, precio: "110.00" }]);
      const canasta = [lin(k.caja, 2), lin(k.six, 2)];

      let v = await vista(c, cli, canasta);
      expect(v).toMatchObject({ total_actual: "1060.00", hay_cambios: false, quitadas: [] });
      expect(v.lineas.map((l: { cambio: string | null }) => l.cambio)).toEqual([null, null]);

      await ponerPrecio(c, k.caja, "Menudeo", "430.00");
      v = await vista(c, cli, canasta);
      expect(v).toMatchObject({ total_actual: "1080.00", hay_cambios: true });
      expect(v.lineas[0]).toMatchObject({ presentacion_id: Number(k.caja), precio_anterior: "420.00", precio_actual: "430.00", cambio: "sube", cantidad: 2 });
      expect(v.lineas[1]).toMatchObject({ precio_anterior: "110.00", precio_actual: "110.00", cambio: null });
      await ponerPrecio(c, k.caja, "Menudeo", "400.00");
      expect((await vista(c, cli, canasta)).lineas[0].cambio).toBe("baja");
      await ponerPrecio(c, k.caja, "Menudeo", "430.00");

      await c.query("update app.presentacion set activa = false where id = $1", [k.six]);
      v = await vista(c, cli, canasta);
      expect(v.quitadas).toEqual([{ producto: "Corona Extra 355 ml lata", motivo: "ya_no_se_vende" }]);
      expect(v).toMatchObject({ total_actual: "860.00", hay_cambios: true });
      expect(v.lineas).toHaveLength(1);

      await c.query("update app.presentacion set activa = true where id = $1", [k.six]);
      await c.query("delete from app.precio where presentacion_id = $1", [k.six]);
      expect((await vista(c, cli, canasta)).quitadas).toEqual([{ producto: "Corona Extra 355 ml lata", motivo: "sin_precio" }]);
    });
  });

  it("aceptar propuesto: PRECIOS_CAMBIARON con la vista nueva y sin cambios; con el total nuevo -> recibido con precios de hoy; vencido PEDIDO_VENCIDO", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const { cliente: cli } = await clienteAtrasado(c, k);
      // Canasta con Caja x2 y Six x2 para que el total sea el del contrato.
      for (const d of [28, 21, 14, 7]) await entregado(c, cli, d, [{ presentacion: k.caja, cantidad: 2, precio: "420.00" }, { presentacion: k.six, cantidad: 2, precio: "110.00" }]);
      await c.query(`update app.configuracion set valor = '"00:00"' where clave = 'sugerencia_hora'`);
      // Se corre todo el historial 10 dias atras para que el cliente quede atrasado.
      await c.query("update app.pedido set creado_en = creado_en - interval '10 days' where cliente_id = $1 and estado = 'entregado'", [cli]);
      await c.query("select app.fn_sugerir_pedidos()");
      const [s] = await sugeridos(c, cli);
      expect(s.estado).toBe("propuesto");
      const comprometido = await c.query("select 1 from app.v_comprometido where sucursal_id = 1 and producto_id = $1", [k.corona.id]);
      expect(comprometido.rowCount).toBe(0);                                     // propuesto no cuenta

      const nuevoSeguimiento = async () => (await c.query("select app.fn_seguimiento_pedido($1, $2) as s", [cli, s.id])).rows[0].s;
      const seg = await nuevoSeguimiento();
      expect(seg).toMatchObject({ etapa: "propuesto", etiqueta: "Esperando tu confirmación", total: null, editable: false });
      expect(seg.borrador.total_actual).toBe("1060.00");
      expect(seg.lineas.every((l: { precio_unitario: string | null }) => l.precio_unitario === null)).toBe(true);

      await ponerPrecio(c, k.caja, "Menudeo", "430.00");
      const aceptar = (visto: string | null) => c.query("select app.fn_aceptar_propuesto($1, $2, $3)", [cli, s.id, visto]);
      const e = await errorConDetalle(c, () => aceptar("1060.00"));
      expect(e.message).toBe("PRECIOS_CAMBIARON");
      expect(e.detalle).toEqual(await vista(c, cli, [lin(k.six, 2), lin(k.caja, 2)]));
      expect(e.detalle).toMatchObject({ total_actual: "1080.00", hay_cambios: true });
      expect(await fila(c, "select estado, total from app.pedido where id = $1", [s.id])).toEqual({ estado: "propuesto", total: "0.00" });
      expect((await error(c, () => aceptar(null))).message).toBe("PRECIOS_CAMBIARON");

      await aceptar("1080.00");
      expect(await fila(c, "select estado, total, propuesto_vence_en, version from app.pedido where id = $1", [s.id])).toEqual({ estado: "recibido", total: "1080.00", propuesto_vence_en: null, version: 1 });
      expect((await c.query("select presentacion_id, precio_unitario, precio_lista from app.pedido_linea where pedido_id = $1 order by numero", [s.id])).rows)
        .toContainEqual({ presentacion_id: k.caja, precio_unitario: "430.00", precio_lista: "430.00" });
      expect(await notificaciones(c, "pedido_nuevo", `pedido_nuevo:${s.id}`, [k.usuario])).toBe(1);
      expect((await c.query("select tipo from app.pedido_evento where pedido_id = $1 order by id", [s.id])).rows.map((r) => r.tipo)).toEqual(["recibido", "recibido"]);
      expect((await error(c, () => aceptar("1080.00"))).message).toBe("ESTADO_NO_VALIDO");
    });
  });

  it("aceptar vencido: PEDIDO_VENCIDO; fn_vencer_propuestos cancela con 'sin respuesta' y la segunda corrida da 0", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const { cliente: cli } = await clienteAtrasado(c, k);
      const otro = await cliente(c);
      await c.query(`update app.configuracion set valor = '"00:00"' where clave = 'sugerencia_hora'`);
      await c.query("select app.fn_sugerir_pedidos()");
      const [s] = await sugeridos(c, cli);
      expect((await error(c, () => c.query("select app.fn_aceptar_propuesto($1, $2, '840.00')", [otro, s.id]))).message).toBe("NO_ENCONTRADO");
      await c.query("update app.pedido set propuesto_vence_en = now() - interval '1 minute' where id = $1", [s.id]);
      expect((await error(c, () => c.query("select app.fn_aceptar_propuesto($1, $2, '840.00')", [cli, s.id]))).message).toBe("PEDIDO_VENCIDO");

      expect((await c.query("select app.fn_vencer_propuestos() as n")).rows[0].n).toBeGreaterThanOrEqual(1);
      expect(await fila(c, "select estado, motivo, cancelado_por, propuesto_vence_en from app.pedido where id = $1", [s.id]))
        .toEqual({ estado: "cancelado", motivo: "sin respuesta", cancelado_por: null, propuesto_vence_en: null });
      expect((await c.query("select app.fn_vencer_propuestos() as n")).rows[0].n).toBe(0);
      expect((await error(c, () => c.query("select app.fn_aceptar_propuesto($1, $2, '840.00')", [cli, s.id]))).message).toBe("PEDIDO_VENCIDO");
      expect(await notificaciones(c, "pedido_cancelado_cliente", `pedido_cancelado_cliente:${s.id}`, [k.usuario])).toBe(0);
    });
  });
});

describe("interprete: aprendizaje (B6)", () => {
  it("correcciones: fila por cliente con veces 1 y luego 2; la global (cliente null) convive", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const corr = { correcciones: [{ texto: "cartón corona", presentacion_id: k.caja }] };
      await pedido(c, cli, [lin(k.caja, 2)], { extra: corr });
      const filas = () => c.query("select cliente_id, texto, presentacion_id, veces from app.cliente_alias where texto = 'carton corona' order by cliente_id nulls last");
      expect((await filas()).rows).toEqual([{ cliente_id: cli, texto: "carton corona", presentacion_id: k.caja, veces: 1 }]);
      await pedido(c, cli, [lin(k.caja, 2)], { extra: { correcciones: [{ texto: "Cartón Corona", presentacion_id: k.six }] } });
      expect((await filas()).rows).toEqual([{ cliente_id: cli, texto: "carton corona", presentacion_id: k.six, veces: 2 }]);
      await c.query("insert into app.cliente_alias (cliente_id, texto, presentacion_id) values (null, 'carton corona', $1)", [k.caja]);
      await c.query("insert into app.cliente_alias (cliente_id, texto, presentacion_id) values (null, 'carton corona', $1) on conflict (cliente_id, texto) do update set veces = cliente_alias.veces + 1", [k.caja]);
      const r = (await filas()).rows;
      expect(r).toHaveLength(2);
      expect(r[1]).toEqual({ cliente_id: null, texto: "carton corona", presentacion_id: k.caja, veces: 2 });
      // Un pedido repetido (misma clave) no vuelve a contar.
      const clave = "00000000-0000-4000-8000-000000000001";
      await pedido(c, cli, [lin(k.caja, 2)], { clave, extra: corr });
      await pedido(c, cli, [lin(k.caja, 2)], { clave, extra: corr });
      expect((await filas()).rows[0].veces).toBe(3);
    });
  });
});

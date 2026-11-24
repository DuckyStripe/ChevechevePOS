import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { enTransaccion, error, pool, ROL } from "./ayuda.js";
import { dia, errorConDetalle, ponerPrecio, producto } from "./ayuda-inventario.js";
import {
  catalogoBase, cliente, fila, notificaciones, pedido, pedidoEntregado, ROL3, usuarioF3,
  type CatalogoBase,
} from "./ayuda-pedidos.js";
import { rutaCon } from "./ayuda-rutas.js";

afterAll(() => pool.end());

const lin = (presentacion_id: string, cantidad: number) => ({ presentacion_id, cantidad });
const total = async (c: pg.PoolClient, id: string) => (await fila<{ total: string }>(c, "select total from app.pedido where id = $1", [id])).total;
const estado = async (c: pg.PoolClient, id: string) => (await fila<{ estado: string }>(c, "select estado from app.pedido where id = $1", [id])).estado;
const version = async (c: pg.PoolClient, id: string) => (await fila<{ version: number }>(c, "select version from app.pedido where id = $1", [id])).version;
const lineaId = async (c: pg.PoolClient, ped: string, presentacion: string) =>
  (await fila<{ id: string }>(c, "select id from app.pedido_linea where pedido_id = $1 and presentacion_id = $2 order by id limit 1", [ped, presentacion])).id;
const eventos = async (c: pg.PoolClient, ped: string) =>
  (await c.query("select tipo from app.pedido_evento where pedido_id = $1 order by id", [ped])).rows.map((r) => r.tipo);
const aviso = async (c: pg.PoolClient, clave: string) =>
  (await c.query("select estado, plantilla, cliente_id, pedido_id, vars from app.aviso_cliente where clave = $1", [clave])).rows[0];
const confirmar = (c: pg.PoolClient, usuario: string, ped: string, extra: Record<string, unknown> = {}, ver?: number) =>
  c.query("select app.fn_confirmar_pedido($1, $2, $3::jsonb) as r", [usuario, ped, JSON.stringify({ version: ver ?? 1, fecha_entrega: undefined, ...extra })]);

/** Confirma con fecha de entrega de hoy y devuelve el resultado. */
async function confirmarHoy(c: pg.PoolClient, usuario: string, ped: string, extra: Record<string, unknown> = {}) {
  const v = await version(c, ped);
  const r = await confirmar(c, usuario, ped, { fecha_entrega: await dia(c, 0), ...extra }, v);
  return r.rows[0].r as { pedido: Record<string, unknown>; advertencias: Record<string, unknown>[] };
}

/** Pedido 2 Cajas + 1 Six (950.00) confirmado, con una propuesta de faltante sobre la linea de Cajas. */
async function pedidoConFaltante(c: pg.PoolClient, k: CatalogoBase, cli: string) {
  const ped = await pedido(c, cli, [lin(k.caja, 2), lin(k.six, 1)]);
  await confirmarHoy(c, k.usuario, ped);
  const caja = await lineaId(c, ped, k.caja);
  const r = await c.query("select app.fn_proponer_faltantes($1, $2, $3::jsonb) as r", [k.usuario, ped, JSON.stringify({
    version: await version(c, ped),
    lineas: [{ pedido_linea_id: caja, causa: "sin_existencia", opciones: [
      { tipo: "sustituto", presentacion_id: k.victoriaCaja, cantidad: 2 }, { tipo: "reducir", cantidad: 1 }] }],
  })]);
  const propuesta = (await fila<{ id: string }>(c, "select id from app.propuesta_faltante where pedido_linea_id = $1", [caja])).id;
  const opciones = (await c.query("select id, tipo from app.propuesta_opcion where propuesta_id = $1 order by orden", [propuesta])).rows;
  return {
    ped, caja, propuesta, resultado: r.rows[0].r,
    sustituto: opciones.find((o) => o.tipo === "sustituto").id as string,
    reducir: opciones.find((o) => o.tipo === "reducir").id as string,
  };
}
const responder = (c: pg.PoolClient, cli: string, propuesta: string, opcion: string | null, usuario: string | null = null) =>
  c.query("select app.fn_responder_faltante($1, $2, $3, $4) as r", [cli, usuario, propuesta, opcion]);

describe("registrar pedido", () => {
  it("pedido minimo: 1 Caja -> PEDIDO_MINIMO con detalle exacto y nada insertado", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const antes = (await fila<{ n: number }>(c, "select count(*)::int as n from app.pedido where cliente_id = $1", [cli])).n;
      const e = await errorConDetalle(c, () => pedido(c, cli, [lin(k.caja, 1)]));
      expect(e.message).toBe("PEDIDO_MINIMO");
      expect(e.detalle).toEqual({ minimo: "500.00", total: "420.00", faltante: "80.00" });
      expect((await fila<{ n: number }>(c, "select count(*)::int as n from app.pedido where cliente_id = $1", [cli])).n).toBe(antes);
    });
  });

  it("pedido valido: 530.00, recibido, version 1, evento, precio_lista = precio_unitario, folios consecutivos", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const a = await pedido(c, cli, [lin(k.caja, 1), lin(k.six, 1)]);
      const b = await pedido(c, cli, [lin(k.caja, 1), lin(k.six, 1)]);
      const fa = await fila<Record<string, unknown>>(c, "select * from app.pedido where id = $1", [a]);
      expect(fa).toMatchObject({ total: "530.00", estado: "recibido", version: 1, origen: "enlace", creado_por: null, entrega_tipo: "reparto" });
      expect(await eventos(c, a)).toEqual(["recibido"]);
      const l = await c.query("select count(*)::int as n from app.pedido_linea where pedido_id = $1 and precio_lista = precio_unitario and cantidad = cantidad_pedida", [a]);
      expect(l.rows[0].n).toBe(2);
      const folio = async (id: string) => Number((await fila<{ folio: string }>(c, "select folio from app.pedido where id = $1", [id])).folio.slice(2));
      expect((await fila<{ folio: string }>(c, "select folio from app.pedido where id = $1", [a])).folio).toMatch(/^P-\d{6}$/);
      expect(await folio(b)).toBe((await folio(a)) + 1);
    });
  });

  it("lista del cliente: Mayoreo 2 Cajas + 1 Six = 910.00 (Six cae a Menudeo)", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c, { lista: "Mayoreo" });
      expect(await total(c, await pedido(c, cli, [lin(k.caja, 2), lin(k.six, 1)]))).toBe("910.00");
    });
  });

  it("oferta vigente con lista null: Mayoreo 2 Cajas = 760.00; si empieza manana = 800.00", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c, { lista: "Mayoreo" });
      const oferta = (desde: number, hasta: number) => dia(c, desde).then(async (d) => c.query(
        `insert into app.precio_oferta (presentacion_id, lista_precio_id, precio, desde, hasta, motivo, creado_por)
         values ($1, null, '380.00', $2, $3, 'promocion', $4) returning id`, [k.caja, d, await dia(c, hasta), k.usuario]));
      const o = await oferta(1, 5);
      expect(await total(c, await pedido(c, cli, [lin(k.caja, 2)]))).toBe("800.00");
      await c.query("delete from app.precio_oferta where id = $1", [o.rows[0].id]);
      await oferta(0, 5);
      expect(await total(c, await pedido(c, cli, [lin(k.caja, 2)]))).toBe("760.00");
    });
  });

  it("validaciones: PEDIDO_VACIO, PRESENTACION_NO_VALIDA, PRECIO_NO_DEFINIDO, FECHA_NO_VALIDA, CLIENTE_INACTIVO", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      expect((await error(c, () => pedido(c, cli, []))).message).toBe("PEDIDO_VACIO");
      expect((await error(c, () => pedido(c, cli, [lin(k.corona.pf(1), 1)]))).message).toBe("PRESENTACION_NO_VALIDA");
      await c.query("update app.producto set activo = false where id = $1", [k.victoria.id]);
      expect((await error(c, () => pedido(c, cli, [lin(k.victoriaCaja, 1)]))).message).toBe("PRESENTACION_NO_VALIDA");
      await c.query("update app.producto set activo = true where id = $1", [k.victoria.id]);
      await c.query("delete from app.precio where presentacion_id = $1", [k.victoriaCaja]);
      expect((await error(c, () => pedido(c, cli, [lin(k.victoriaCaja, 1)]))).message).toBe("PRECIO_NO_DEFINIDO");
      const ayer = await dia(c, -1);
      expect((await error(c, () => pedido(c, cli, [lin(k.caja, 2)], { fecha_solicitada: ayer }))).message).toBe("FECHA_NO_VALIDA");
      await c.query("update app.cliente set activo = false where id = $1", [cli]);
      expect((await error(c, () => pedido(c, cli, [lin(k.caja, 2)]))).message).toBe("CLIENTE_INACTIVO");
    });
  });

  it("idempotencia: misma clave y hash -> (id, true) sin lineas nuevas; otro hash -> IDEMPOTENCIA_CONFLICTO", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const clave = randomUUID();
      const a = await pedido(c, cli, [lin(k.caja, 2)], { clave, hash: "h1" });
      const r = await c.query("select * from app.fn_registrar_pedido($1, null, $2::jsonb, 'h1')", [cli, JSON.stringify({ clave_idempotencia: clave, lineas: [lin(k.caja, 2)], total_visto: "840.00" })]);
      expect(r.rows[0]).toEqual({ pedido_id: a, repetida: true });
      expect((await fila<{ n: number }>(c, "select count(*)::int as n from app.pedido_linea where pedido_id = $1", [a])).n).toBe(1);
      expect((await error(c, () => pedido(c, cli, [lin(k.caja, 2)], { clave, hash: "h2" }))).message).toBe("IDEMPOTENCIA_CONFLICTO");
    });
  });

  it("idempotencia con dos conexiones a la vez: un pedido, la otra repite", async () => {
    // Necesita datos confirmados (dos conexiones). Se crean y se borran al final, en orden de llaves foraneas,
    // para no ensuciar a las demas pruebas: folio P, bitacora, historial.
    const c0 = await pool.connect();
    let cli = "", pres = "", prod = "", cat = "", usuario = "";
    try {
      await c0.query("begin");
      usuario = await usuarioF3(c0, ROL.admin);
      const p = await producto(c0, { factores: [1, 24], usuario });
      pres = p.pf(24);
      prod = p.id;
      cat = p.categoria_id;
      await ponerPrecio(c0, pres, "Menudeo", "600.00");
      cli = await cliente(c0);
      await c0.query("commit");
    } finally { c0.release(); }
    const clave = randomUUID();
    const llamar = (c: pg.PoolClient) => c.query("select pedido_id, repetida from app.fn_registrar_pedido($1, null, $2::jsonb, 'h')",
      [cli, JSON.stringify({ clave_idempotencia: clave, lineas: [lin(pres, 1)], total_visto: "600.00" })]);
    const a = await pool.connect();
    const b = await pool.connect();
    let ped = "";
    try {
      await a.query("begin");
      await b.query("begin");
      const ra = await llamar(a);
      ped = ra.rows[0].pedido_id;
      const pb = llamar(b);                       // espera el candado de la clave
      await new Promise((r) => setTimeout(r, 300));
      await a.query("commit");
      const rb = await pb;
      await b.query("commit");
      expect(ra.rows[0].repetida).toBe(false);
      expect(rb.rows[0]).toEqual({ pedido_id: ped, repetida: true });
      const n = await pool.query("select count(*)::int as n from app.pedido where clave_idempotencia = $1", [clave]);
      expect(n.rows[0].n).toBe(1);
    } finally {
      await a.query("rollback").catch(() => undefined);
      await b.query("rollback").catch(() => undefined);
      a.release();
      b.release();
      const l = await pool.connect();
      try {
        await l.query("begin");
        if (ped) {
          await l.query("delete from app.notificacion where clave = $1", [`pedido_nuevo:${ped}`]);
          await l.query("alter table app.pedido_evento disable trigger trg_pedido_evento_inmutable");
          await l.query("delete from app.pedido_evento where pedido_id = $1", [ped]);
          await l.query("alter table app.pedido_evento enable trigger trg_pedido_evento_inmutable");
          await l.query("delete from app.pedido_linea where pedido_id = $1", [ped]);
          await l.query("delete from app.pedido where id = $1", [ped]);
        }
        // Las presentaciones nunca se borran (PRESENTACION_NO_BORRABLE): el producto de la prueba queda inactivo.
        await l.query("update app.presentacion set activa = false where producto_id = $1", [prod]);
        await l.query("update app.producto set activo = false where id = $1", [prod]);
        await l.query("delete from app.cliente where id = $1", [cli]);
        await l.query("delete from app.auditoria where usuario_id = $1 or (tabla = 'usuario' and registro_id = $1::text) or (tabla = 'cliente' and registro_id = $2::text)", [usuario, cli]);
        await l.query("delete from app.usuario where id = $1", [usuario]);
        // La bitacora de lo borrado arriba (el borrado tambien audita): solo lo de esta prueba.
        await l.query(`delete from app.auditoria where (tabla = 'cliente' and registro_id = $1::text) or (tabla = 'producto' and registro_id = $2::text)
          or (tabla = 'categoria' and registro_id = $3::text) or (tabla = 'presentacion' and registro_id in (select id::text from app.presentacion where producto_id = $2::bigint)) or (tabla = 'precio' and registro_id like $4)`,
          [cli, prod, cat, `${pres}:%`]);
        await l.query("delete from app.folio where serie = 'P' and not exists (select 1 from app.pedido)");
        await l.query("commit");
      } finally { l.release(); }
    }
  });

  it("origen: enlace notifica pedido_nuevo y no avisa; captura avisa wa_pedido_recibido y no notifica", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const admin = await usuarioF3(c, ROL3.admin);
      const sinPermiso = await usuarioF3(c, ROL3.repartidor);
      const a = await pedido(c, cli, [lin(k.caja, 2)]);
      expect(await notificaciones(c, "pedido_nuevo", `pedido_nuevo:${a}`, [k.usuario, admin])).toBe(2);
      expect(await notificaciones(c, "pedido_nuevo", `pedido_nuevo:${a}`, [sinPermiso])).toBe(0);
      expect((await c.query("select count(*)::int as n from app.aviso_cliente where pedido_id = $1", [a])).rows[0].n).toBe(0);

      const b = await pedido(c, cli, [lin(k.caja, 2)], { captura: k.usuario });
      expect(await notificaciones(c, "pedido_nuevo", `pedido_nuevo:${b}`, [k.usuario, admin])).toBe(0);
      const av = await aviso(c, `wa_pedido_recibido:p${b}:v1`);
      expect(av).toMatchObject({ plantilla: "wa_pedido_recibido", estado: "pendiente", cliente_id: cli });
      expect(Object.keys(av.vars).sort()).toEqual(["cliente", "folio", "total"]);
      expect((await fila<{ origen: string; creado_por: string }>(c, "select origen, creado_por from app.pedido where id = $1", [b]))).toEqual({ origen: "captura", creado_por: k.usuario });
      // Captura exige pedidos.capturar.
      expect((await error(c, () => pedido(c, cli, [lin(k.caja, 2)], { captura: sinPermiso }))).message).toBe("SIN_PERMISO");
    });
  });

  it("total solo por disparador: cambiar una linea recalcula; suma de importes = total", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const p = await pedido(c, cli, [lin(k.caja, 2), lin(k.six, 1)]);
      expect(await total(c, p)).toBe("950.00");
      await c.query("update app.pedido_linea set cantidad = 1, motivo_ajuste = 'prueba' where pedido_id = $1 and presentacion_id = $2", [p, k.caja]);
      expect(await total(c, p)).toBe("530.00");
      const s = await fila<{ s: string }>(c, "select sum(importe)::text as s from app.pedido_linea where pedido_id = $1", [p]);
      expect(s.s).toBe("530.00");
      await c.query("delete from app.pedido_linea where pedido_id = $1 and presentacion_id = $2", [p, k.six]);
      expect(await total(c, p)).toBe("420.00");
    });
  });

  it("total_visto distinto del real: PRECIOS_CAMBIARON con la vista y nada guardado", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const e = await errorConDetalle(c, () => pedido(c, cli, [lin(k.caja, 1), lin(k.six, 1)], { extra: { total_visto: "520.00" } }));
      expect(e.message).toBe("PRECIOS_CAMBIARON");
      expect(e.detalle).toMatchObject({ total_actual: "530.00" });
      expect((await fila<{ n: number }>(c, "select count(*)::int as n from app.pedido where cliente_id = $1", [cli])).n).toBe(0);
      expect(await total(c, await pedido(c, cli, [lin(k.caja, 1), lin(k.six, 1)], { extra: { total_visto: "530.00" } }))).toBe("530.00");
    });
  });
});

describe("edicion y cancelacion del cliente", () => {
  it("editar en recibido: 840.00, version 2, evento y notificacion; PEDIDO_CAMBIO; no editable despues; otro cliente NO_ENCONTRADO", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const otro = await cliente(c);
      const p = await pedido(c, cli, [lin(k.caja, 1), lin(k.six, 1)]);
      await c.query("select app.fn_editar_pedido_cliente($1, $2, $3::jsonb)", [cli, p, JSON.stringify({ lineas: [lin(k.caja, 2)], total_visto: "840.00" })]);
      expect(await total(c, p)).toBe("840.00");
      expect(await version(c, p)).toBe(2);
      expect(await eventos(c, p)).toEqual(["recibido", "editado_cliente"]);
      expect(await notificaciones(c, "pedido_modificado", `pedido_modificado:${p}:2`, [k.usuario])).toBe(1);
      expect((await error(c, () => confirmar(c, k.usuario, p, { fecha_entrega: undefined }, 1))).message).toBe("PEDIDO_CAMBIO");
      expect((await error(c, () => c.query("select app.fn_editar_pedido_cliente($1, $2, $3::jsonb)", [otro, p, JSON.stringify({ lineas: [lin(k.caja, 2)], total_visto: "840.00" })]))).message).toBe("NO_ENCONTRADO");
      // Bajo el minimo: PEDIDO_MINIMO y la edicion no se guarda.
      expect((await error(c, () => c.query("select app.fn_editar_pedido_cliente($1, $2, $3::jsonb)", [cli, p, JSON.stringify({ lineas: [lin(k.caja, 1)], total_visto: "420.00" })]))).message).toBe("PEDIDO_MINIMO");
      expect(await total(c, p)).toBe("840.00");

      await confirmarHoy(c, k.usuario, p);
      expect((await error(c, () => c.query("select app.fn_editar_pedido_cliente($1, $2, $3::jsonb)", [cli, p, JSON.stringify({ lineas: [lin(k.caja, 2)], total_visto: "840.00" })]))).message).toBe("PEDIDO_NO_EDITABLE");
      expect((await error(c, () => c.query("select app.fn_cancelar_pedido_cliente($1, $2, 'x')", [cli, p]))).message).toBe("PEDIDO_NO_EDITABLE");
    });
  });

  it("cancelar del cliente en recibido: cancelado, cancelado_por null y notificacion", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const p = await pedido(c, cli, [lin(k.caja, 2)]);
      await c.query("select app.fn_cancelar_pedido_cliente($1, $2, 'ya no')", [cli, p]);
      expect(await fila(c, "select estado, cancelado_por, motivo, cancelado_en is not null as en from app.pedido where id = $1", [p]))
        .toEqual({ estado: "cancelado", cancelado_por: null, motivo: "ya no", en: true });
      expect(await notificaciones(c, "pedido_cancelado_cliente", `pedido_cancelado_cliente:${p}`, [k.usuario])).toBe(1);
    });
  });
});

describe("confirmar, advertencias y ajustar", () => {
  it("confirmar: version, fecha, aviso; fecha ayer FECHA_NO_VALIDA; precio sin permiso SIN_PERMISO_PRECIO, con permiso motivo y total", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const admin = await usuarioF3(c, ROL3.admin);
      const p = await pedido(c, cli, [lin(k.caja, 1), lin(k.six, 1)]);
      const lcaja = await lineaId(c, p, k.caja);

      expect((await error(c, () => confirmar(c, k.usuario, p, { fecha_entrega: "2000-01-01" }))).message).toBe("FECHA_NO_VALIDA");
      const cambio = { lineas: [{ pedido_linea_id: lcaja, precio_unitario: "400.00", motivo_ajuste: "trato" }] };
      const hoy = await dia(c, 0);
      expect((await error(c, () => confirmar(c, admin, p, { fecha_entrega: hoy, ...cambio }))).message).toBe("SIN_PERMISO_PRECIO");
      expect(await estado(c, p)).toBe("recibido");

      const r = await confirmarHoy(c, k.usuario, p, cambio);
      expect(r.pedido).toMatchObject({ estado: "confirmado", total: "510.00", version: 2 });
      expect(await fila(c, "select precio_unitario, precio_lista, motivo_ajuste from app.pedido_linea where id = $1", [lcaja]))
        .toEqual({ precio_unitario: "400.00", precio_lista: "420.00", motivo_ajuste: "trato" });
      const f = await fila<Record<string, unknown>>(c, "select estado, confirmado_por, fecha_entrega::text as f from app.pedido where id = $1", [p]);
      expect(f).toMatchObject({ estado: "confirmado", confirmado_por: k.usuario, f: await dia(c, 0) });
      expect((await aviso(c, `wa_pedido_confirmado:p${p}:v2`)).vars).toMatchObject({ total: "510.00" });
      // Sin cambios de lineas la version no sube.
      const q = await pedido(c, cli, [lin(k.caja, 2)]);
      await confirmarHoy(c, admin, q);
      expect(await version(c, q)).toBe(1);
      expect((await aviso(c, `wa_pedido_confirmado:p${q}:v1`)).estado).toBe("pendiente");
    });
  });

  it("advertencias y v_disponible: X 1 Caja -> {60,24,36}; Y 2 Cajas advierte 48 > 36 y confirma; luego -12; recibido y propuesto no cuentan; esperando_cliente cuenta sus lineas activas", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      await c.query(`update app.configuracion set valor = '"0.00"' where clave = 'pedido_minimo'`);
      const cli = await cliente(c);
      const disp = () => fila(c, "select existencia, confirmadas, cargadas, disponible from app.v_disponible where sucursal_id = 1 and producto_id = $1", [k.corona.id]);
      const x = await pedido(c, cli, [lin(k.caja, 1)]);
      expect(await disp()).toEqual({ existencia: 60, confirmadas: 0, cargadas: 0, disponible: 60 });
      const rx = await confirmarHoy(c, k.usuario, x);
      expect(rx.advertencias).toEqual([]);
      expect(await disp()).toEqual({ existencia: 60, confirmadas: 24, cargadas: 0, disponible: 36 });

      const y = await pedido(c, cli, [lin(k.caja, 2)]);
      const ry = await confirmarHoy(c, k.usuario, y);
      expect(ry.advertencias).toEqual([{ producto_id: Number(k.corona.id), producto: "Corona Extra 355 ml lata", requeridas: 48, disponibles: 36 }]);
      expect(await estado(c, y)).toBe("confirmado");
      expect(await disp()).toEqual({ existencia: 60, confirmadas: 72, cargadas: 0, disponible: -12 });

      // Cargado cuenta como cargada.
      await c.query("update app.pedido set estado = 'cargado' where id = $1", [x]);
      expect(await disp()).toEqual({ existencia: 60, confirmadas: 48, cargadas: 24, disponible: -12 });

      // recibido, propuesto y esperando_cliente no cuentan.
      const z = await pedido(c, cli, [lin(k.caja, 3)]);
      expect(await disp()).toMatchObject({ confirmadas: 48, cargadas: 24 });
      await c.query("update app.pedido set estado = 'propuesto', propuesto_vence_en = now() + interval '1 day' where id = $1", [z]);
      expect(await disp()).toMatchObject({ confirmadas: 48, cargadas: 24 });
      await c.query("update app.pedido set estado = 'esperando_cliente', propuesto_vence_en = null, respuesta_limite_en = now() + interval '1 hour', fecha_entrega = $2 where id = $1", [z, await dia(c, 0)]);
      // Decision de la revision: un pedido esperando_cliente SI compromete sus lineas activas; las lineas en faltante no.
      expect(await disp()).toMatchObject({ confirmadas: 120, cargadas: 24 });
      await c.query("update app.pedido_linea set estado = 'faltante' where pedido_id = $1", [z]);
      expect(await disp()).toMatchObject({ confirmadas: 48, cargadas: 24 });
    });
  });

  it("ajustar: bajar Six a 0 -> 840.00, version + 1, evento y aviso; en cargado subir -> AJUSTE_NO_VALIDO, bajar si", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const p = await pedido(c, cli, [lin(k.caja, 2), lin(k.six, 1)]);
      await confirmarHoy(c, k.usuario, p);
      const six = await lineaId(c, p, k.six);
      const ajustar = (ped: string, datos: Record<string, unknown>) =>
        c.query("select app.fn_ajustar_pedido($1, $2, $3::jsonb) as r", [k.usuario, ped, JSON.stringify(datos)]);

      expect((await error(c, () => ajustar(p, { lineas: [{ pedido_linea_id: six, cantidad: 0 }] }))).message).toBe("AJUSTE_NO_VALIDO");   // falta motivo
      const r = (await ajustar(p, { lineas: [{ pedido_linea_id: six, cantidad: 0, motivo_ajuste: "no hay" }] })).rows[0].r;
      expect(r.pedido).toMatchObject({ total: "840.00", version: 2, estado: "confirmado" });
      expect(await eventos(c, p)).toEqual(["recibido", "confirmado", "ajustado"]);
      const av = await aviso(c, `wa_pedido_ajustado:p${p}:v2`);
      expect(av.vars.cambios).toContain("Six: 1 → 0");
      expect(await fila(c, "select estado, cantidad, cantidad_pedida from app.pedido_linea where id = $1", [six])).toEqual({ estado: "quitada", cantidad: 0, cantidad_pedida: 1 });

      // Agregar (despacho): 1 Victoria Caja a precio de lista.
      const r2 = (await ajustar(p, { agregar: [lin(k.victoriaCaja, 1)] })).rows[0].r;
      expect(r2.pedido).toMatchObject({ total: "1250.00", version: 3 });
      expect((await fila<{ motivo_ajuste: string }>(c, "select motivo_ajuste from app.pedido_linea where pedido_id = $1 and presentacion_id = $2", [p, k.victoriaCaja])).motivo_ajuste).toBe("agregado por despacho");
      expect((await error(c, () => ajustar(p, {}))).message).toBe("AJUSTE_NO_VALIDO");

      const q = await pedido(c, cli, [lin(k.caja, 2), lin(k.six, 1)]);
      await confirmarHoy(c, k.usuario, q);
      await c.query("update app.pedido set estado = 'cargado' where id = $1", [q]);
      const sq = await lineaId(c, q, k.six);
      const cq = await lineaId(c, q, k.caja);
      expect((await error(c, () => ajustar(q, { lineas: [{ pedido_linea_id: sq, cantidad: 3, motivo_ajuste: "mas" }] }))).message).toBe("AJUSTE_NO_VALIDO");
      expect((await error(c, () => ajustar(q, { agregar: [lin(k.caja, 1)] }))).message).toBe("AJUSTE_NO_VALIDO");
      const bajar = (await ajustar(q, { lineas: [{ pedido_linea_id: cq, cantidad: 1, motivo_ajuste: "falto" }] })).rows[0].r;
      expect(bajar.pedido).toMatchObject({ total: "530.00" });
    });
  });
});

describe("faltantes y sustituciones", () => {
  it("proponer con sustituto: esperando_cliente, limite = ahora + 60 min, aviso que descarta el de confirmado; el cliente elige sustituto -> 930.00", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const f = await pedidoConFaltante(c, k, cli);
      expect(await total(c, f.ped)).toBe("950.00");
      expect(f.resultado.pedido).toMatchObject({ estado: "esperando_cliente", version: 2 });
      expect(f.resultado.propuestas).toHaveLength(1);
      expect(f.resultado.sugerencias[0].opciones.map((o: { producto: string }) => o.producto)).toEqual(["Victoria 355 ml lata"]);
      expect(await fila(c, `select p.respuesta_limite_en = now() + interval '60 minutes' as a, f.limite_en = p.respuesta_limite_en as b
        from app.pedido p, app.propuesta_faltante f where p.id = $1 and f.id = $2`, [f.ped, f.propuesta])).toEqual({ a: true, b: true });
      expect(await fila(c, "select tipo, presentacion_id, cantidad, precio_unitario, importe from app.propuesta_opcion where id = $1", [f.sustituto]))
        .toEqual({ tipo: "sustituto", presentacion_id: k.victoriaCaja, cantidad: 2, precio_unitario: "410.00", importe: "820.00" });
      expect(await fila(c, "select precio_unitario, importe from app.propuesta_opcion where id = $1", [f.reducir])).toEqual({ precio_unitario: "420.00", importe: "420.00" });
      expect((await aviso(c, `wa_pedido_confirmado:p${f.ped}:v1`)).estado).toBe("descartado");
      expect(await aviso(c, `wa_pedido_faltante:p${f.ped}:v2`)).toMatchObject({ estado: "pendiente" });
      expect(await estado(c, f.ped)).toBe("esperando_cliente");

      await responder(c, cli, f.propuesta, f.sustituto);
      expect(await fila(c, "select estado, cantidad, cantidad_pedida from app.pedido_linea where id = $1", [f.caja])).toEqual({ estado: "sustituida", cantidad: 0, cantidad_pedida: 2 });
      expect(await fila(c, "select estado, cantidad, cantidad_pedida, precio_unitario from app.pedido_linea where sustituye_linea_id = $1", [f.caja]))
        .toEqual({ estado: "activa", cantidad: 2, cantidad_pedida: 2, precio_unitario: "410.00" });
      expect(await total(c, f.ped)).toBe("930.00");
      expect(await fila(c, "select estado, respuesta_limite_en from app.pedido where id = $1", [f.ped])).toEqual({ estado: "confirmado", respuesta_limite_en: null });
      expect(await fila(c, "select estado, respondida_por, opcion_elegida_id from app.propuesta_faltante where id = $1", [f.propuesta]))
        .toEqual({ estado: "aceptada", respondida_por: null, opcion_elegida_id: f.sustituto });
      expect(await notificaciones(c, "faltante_respondido", `faltante:${f.propuesta}`, [k.usuario])).toBe(1);
      expect(await eventos(c, f.ped)).toEqual(["recibido", "confirmado", "faltante_propuesto", "faltante_respondido"]);
    });
  });

  it("reducir -> 530.00; rechazar -> linea quitada y 110.00", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const a = await pedidoConFaltante(c, k, cli);
      await responder(c, cli, a.propuesta, a.reducir);
      expect(await total(c, a.ped)).toBe("530.00");
      expect(await fila(c, "select estado, cantidad from app.pedido_linea where id = $1", [a.caja])).toEqual({ estado: "activa", cantidad: 1 });
      const b = await pedidoConFaltante(c, k, cli);
      await responder(c, cli, b.propuesta, null);
      expect(await total(c, b.ped)).toBe("110.00");
      expect(await fila(c, "select estado, cantidad from app.pedido_linea where id = $1", [b.caja])).toEqual({ estado: "quitada", cantidad: 0 });
      expect((await fila<{ estado: string }>(c, "select estado from app.propuesta_faltante where id = $1", [b.propuesta])).estado).toBe("rechazada");
    });
  });

  it("validaciones: PROPUESTA_CERRADA, LINEA_NO_VALIDA, reducir igual, FECHA_NO_VALIDA, recibido con fecha, PEDIDO_CAMBIO, dos faltantes", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const otro = await cliente(c);
      const f = await pedidoConFaltante(c, k, cli);
      expect((await error(c, () => responder(c, otro, f.propuesta, f.sustituto))).message).toBe("NO_ENCONTRADO");
      await responder(c, cli, f.propuesta, f.reducir);
      expect((await error(c, () => responder(c, cli, f.propuesta, f.reducir))).message).toBe("PROPUESTA_CERRADA");

      const proponer = (ped: string, datos: Record<string, unknown>) =>
        c.query("select app.fn_proponer_faltantes($1, $2, $3::jsonb) as r", [k.usuario, ped, JSON.stringify(datos)]);
      const hoy = await dia(c, 0);

      // Linea no activa (quitada) -> LINEA_NO_VALIDA.
      const p = await pedido(c, cli, [lin(k.caja, 2), lin(k.six, 1)]);
      await confirmarHoy(c, k.usuario, p);
      const caja = await lineaId(c, p, k.caja);
      const six = await lineaId(c, p, k.six);
      await c.query("select app.fn_ajustar_pedido($1, $2, $3::jsonb)", [k.usuario, p, JSON.stringify({ lineas: [{ pedido_linea_id: six, cantidad: 0, motivo_ajuste: "x" }] })]);
      const v = await version(c, p);
      expect((await error(c, () => proponer(p, { version: v, lineas: [{ pedido_linea_id: six, causa: "otro", opciones: [] }] }))).message).toBe("LINEA_NO_VALIDA");
      // reducir con la misma cantidad de la linea.
      expect((await error(c, () => proponer(p, { version: v, lineas: [{ pedido_linea_id: caja, causa: "otro", opciones: [{ tipo: "reducir", cantidad: 2 }] }] }))).message).toBe("LINEA_NO_VALIDA");
      // version vieja.
      expect((await error(c, () => proponer(p, { version: v - 1, lineas: [{ pedido_linea_id: caja, causa: "otro", opciones: [] }] }))).message).toBe("PEDIDO_CAMBIO");
      expect(await estado(c, p)).toBe("confirmado");

      // Desde recibido: sin fecha_entrega FECHA_NO_VALIDA; con fecha confirma lo demas.
      const q = await pedido(c, cli, [lin(k.caja, 2), lin(k.six, 1)]);
      const qc = await lineaId(c, q, k.caja);
      expect((await error(c, () => proponer(q, { version: 1, lineas: [{ pedido_linea_id: qc, causa: "otro", opciones: [] }] }))).message).toBe("FECHA_NO_VALIDA");
      await proponer(q, { version: 1, fecha_entrega: hoy, lineas: [{ pedido_linea_id: qc, causa: "danado", nota: "se rompio", opciones: [] }] });
      expect(await fila(c, "select estado, fecha_entrega::text as f, confirmado_por from app.pedido where id = $1", [q])).toEqual({ estado: "esperando_cliente", f: hoy, confirmado_por: k.usuario });
      expect((await error(c, () => proponer(q, { version: 2, lineas: [{ pedido_linea_id: qc, causa: "otro", opciones: [] }] }))).message).toBe("ESTADO_NO_VALIDO");

      // Dos faltantes: responder uno deja esperando_cliente; el segundo (si ya no queda nada) cancela el pedido.
      const r = await pedido(c, cli, [lin(k.caja, 2), lin(k.six, 1)]);
      await confirmarHoy(c, k.usuario, r);
      const rc = await lineaId(c, r, k.caja);
      const rs = await lineaId(c, r, k.six);
      await proponer(r, { version: 1, lineas: [{ pedido_linea_id: rc, causa: "otro", opciones: [] }, { pedido_linea_id: rs, causa: "otro", opciones: [] }] });
      const ps = (await c.query("select f.id from app.propuesta_faltante f join app.pedido_linea l on l.id = f.pedido_linea_id where l.pedido_id = $1 order by f.id", [r])).rows;
      await responder(c, cli, ps[0].id, null);
      expect(await estado(c, r)).toBe("esperando_cliente");
      await responder(c, cli, ps[1].id, null);
      // Rechazar todo deja el pedido sin lineas: se cancela 'sin_lineas' y el cliente recibe un aviso llano.
      expect(await fila(c, "select estado, motivo from app.pedido where id = $1", [r])).toEqual({ estado: "cancelado", motivo: "sin_lineas" });
      expect(await total(c, r)).toBe("0.00");
      expect((await fila<{ n: number }>(c, "select count(*)::int as n from app.aviso_cliente where pedido_id = $1 and plantilla = 'wa_pedido_ajustado' and estado = 'pendiente'", [r])).n).toBe(1);
    });
  });

  it("vencer faltantes: quitar -> 110.00; reducir con opcion -> 530.00; reducir sin opcion -> 110.00; nunca sustituto; segunda corrida 0", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const vencer = async (accion: string, ped: { propuesta: string }) => {
        await c.query(`update app.configuracion set valor = $1::jsonb where clave = 'faltante_accion_predeterminada'`, [JSON.stringify(accion)]);
        await c.query("update app.propuesta_faltante set limite_en = now() - interval '1 minute' where id = $1", [ped.propuesta]);
        return (await c.query("select app.fn_vencer_faltantes() as n")).rows[0].n as number;
      };
      const a = await pedidoConFaltante(c, k, cli);
      expect(await vencer("quitar", a)).toBeGreaterThanOrEqual(1);
      expect(await total(c, a.ped)).toBe("110.00");
      expect(await fila(c, "select estado, opcion_elegida_id, respondida_por from app.propuesta_faltante where id = $1", [a.propuesta])).toEqual({ estado: "vencida", opcion_elegida_id: null, respondida_por: null });
      expect(await estado(c, a.ped)).toBe("confirmado");
      expect(await eventos(c, a.ped)).toContain("faltante_vencido");
      expect((await c.query("select estado from app.aviso_cliente where pedido_id = $1 and plantilla = 'wa_pedido_ajustado'", [a.ped])).rows).toEqual([{ estado: "pendiente" }]);
      expect(await fila<{ n: number }>(c, "select count(*)::int as n from app.pedido_linea where pedido_id = $1 and presentacion_id = $2", [a.ped, k.victoriaCaja])).toEqual({ n: 0 });
      expect((await c.query("select app.fn_vencer_faltantes() as n")).rows[0].n).toBe(0);

      const b = await pedidoConFaltante(c, k, cli);
      await vencer("reducir", b);
      expect(await total(c, b.ped)).toBe("530.00");

      // reducir sin opcion reducir (solo sustituto): se quita; el sustituto nunca se acepta solo.
      const d = await pedido(c, cli, [lin(k.caja, 2), lin(k.six, 1)]);
      await confirmarHoy(c, k.usuario, d);
      const dc = await lineaId(c, d, k.caja);
      await c.query("select app.fn_proponer_faltantes($1, $2, $3::jsonb)", [k.usuario, d, JSON.stringify({
        version: 1, lineas: [{ pedido_linea_id: dc, causa: "otro", opciones: [{ tipo: "sustituto", presentacion_id: k.victoriaCaja, cantidad: 2 }] }] })]);
      const pd = (await fila<{ id: string }>(c, "select id from app.propuesta_faltante where pedido_linea_id = $1", [dc])).id;
      await vencer("reducir", { propuesta: pd });
      expect(await total(c, d)).toBe("110.00");
      expect((await c.query("select count(*)::int as n from app.pedido_linea where pedido_id = $1 and presentacion_id = $2", [d, k.victoriaCaja])).rows[0].n).toBe(0);
    });
  });

  it("cancelar faltante: la linea vuelve a activa con cantidad 2, propuesta cancelada, total 950.00", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const f = await pedidoConFaltante(c, k, cli);
      const sinPermiso = await usuarioF3(c, ROL3.almacenista);
      expect((await error(c, () => c.query("select app.fn_cancelar_faltante($1, $2)", [sinPermiso, f.propuesta]))).message).toBe("SIN_PERMISO");
      await c.query("select app.fn_cancelar_faltante($1, $2)", [k.usuario, f.propuesta]);
      expect(await fila(c, "select estado, cantidad from app.pedido_linea where id = $1", [f.caja])).toEqual({ estado: "activa", cantidad: 2 });
      expect(await fila(c, "select estado, respondida_por from app.propuesta_faltante where id = $1", [f.propuesta])).toEqual({ estado: "cancelada", respondida_por: k.usuario });
      expect(await total(c, f.ped)).toBe("950.00");
      expect(await estado(c, f.ped)).toBe("confirmado");
      expect((await error(c, () => c.query("select app.fn_cancelar_faltante($1, $2)", [k.usuario, f.propuesta]))).message).toBe("PROPUESTA_CERRADA");
    });
  });

  it("el personal responde por el cliente (pedidos.gestionar) y queda como respondida_por", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const f = await pedidoConFaltante(c, k, cli);
      const sin = await usuarioF3(c, ROL3.cajero);
      expect((await error(c, () => responder(c, cli, f.propuesta, f.reducir, sin))).message).toBe("SIN_PERMISO");
      await responder(c, cli, f.propuesta, f.reducir, k.usuario);
      expect((await fila<{ respondida_por: string }>(c, "select respondida_por from app.propuesta_faltante where id = $1", [f.propuesta])).respondida_por).toBe(k.usuario);
    });
  });
});

describe("cancelar y reprogramar (personal)", () => {
  it("cancelar: esperando_cliente cancela sus propuestas; desde entregado ESTADO_NO_VALIDO; cargado PEDIDO_EN_RUTA; motivo obligatorio", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const f = await pedidoConFaltante(c, k, cli);
      const cancelar = (ped: string, motivo: string | null = "no hubo") => c.query("select app.fn_cancelar_pedido($1, $2, $3)", [k.usuario, ped, motivo]);
      expect((await error(c, () => cancelar(f.ped, " "))).message).toBe("VALIDACION");
      await cancelar(f.ped);
      expect(await fila(c, "select estado, cancelado_por, motivo, respuesta_limite_en from app.pedido where id = $1", [f.ped]))
        .toEqual({ estado: "cancelado", cancelado_por: k.usuario, motivo: "no hubo", respuesta_limite_en: null });
      expect((await fila<{ estado: string }>(c, "select estado from app.propuesta_faltante where id = $1", [f.propuesta])).estado).toBe("cancelada");
      expect(await eventos(c, f.ped)).toContain("cancelado");
      expect((await error(c, () => responder(c, cli, f.propuesta, f.reducir))).message).toBe("PROPUESTA_CERRADA");

      const e = await pedidoEntregado(c, cli, { creado_hace_dias: 3, lineas: [{ presentacion: k.caja, cantidad: 2, entregada: 2, precio: "420.00" }] });
      expect((await error(c, () => cancelar(e))).message).toBe("ESTADO_NO_VALIDO");
      const p = await pedido(c, cli, [lin(k.caja, 2)]);
      await confirmarHoy(c, k.usuario, p);
      await c.query("update app.pedido set estado = 'cargado' where id = $1", [p]);
      expect((await error(c, () => cancelar(p))).message).toBe("PEDIDO_EN_RUTA");
      const q = await pedido(c, cli, [lin(k.caja, 2)]);
      await confirmarHoy(c, k.usuario, q);
      await cancelar(q);
      expect(await estado(c, q)).toBe("cancelado");
    });
  });

  it("reprogramar: no_entregado -> confirmado con fecha nueva y ruta null; ayer FECHA_NO_VALIDA; desde recibido ESTADO_NO_VALIDO", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const p = await pedido(c, cli, [lin(k.caja, 2)]);
      const repro = (ped: string, fecha: string) => c.query("select app.fn_reprogramar_pedido($1, $2, $3)", [k.usuario, ped, fecha]);
      expect((await error(c, () => repro(p, "2099-01-01"))).message).toBe("ESTADO_NO_VALIDO");
      await confirmarHoy(c, k.usuario, p);
      const ruta = await rutaCon(c, [], { fecha: await dia(c, 0), usuario: k.usuario }); // fk_pedido_ruta existe desde 007
      await c.query("update app.pedido set estado = 'no_entregado', ruta_id = $2, motivo = 'cerrado' where id = $1", [p, ruta.id]);
      const ayer = await dia(c, -1);
      expect((await error(c, () => repro(p, ayer))).message).toBe("FECHA_NO_VALIDA");
      await repro(p, await dia(c, 2));
      expect(await fila(c, "select estado, fecha_entrega::text as f, ruta_id from app.pedido where id = $1", [p])).toEqual({ estado: "confirmado", f: await dia(c, 2), ruta_id: null });
      expect(await eventos(c, p)).toContain("reprogramado");
    });
  });
});

describe("seguimiento, historial y avisos", () => {
  it("seguimiento: solo lo del cliente, sin notas internas, etapa, linea de tiempo publica, editable solo en recibido", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const otro = await cliente(c);
      const p = await pedido(c, cli, [lin(k.caja, 2), lin(k.six, 1)]);
      await c.query("update app.pedido set notas_internas = 'secreto-interno' where id = $1", [p]);
      const seg = async (cl: string, ped: string) => (await c.query("select app.fn_seguimiento_pedido($1, $2) as s", [cl, ped])).rows[0].s;

      expect((await error(c, () => seg(otro, p))).message).toBe("NO_ENCONTRADO");
      let s = await seg(cli, p);
      expect(s).toMatchObject({ etapa: "recibido", etiqueta: "Recibido", total: "950.00", editable: true, reparto: null });
      expect(s.lineas).toHaveLength(2);
      expect(JSON.stringify(s)).not.toContain("secreto-interno");
      expect(JSON.stringify(s)).not.toContain("notas_internas");

      await confirmarHoy(c, k.usuario, p);
      await c.query("insert into app.pedido_evento (pedido_id, tipo, publico) values ($1, 'cargado', false)", [p]);
      s = await seg(cli, p);
      expect(s).toMatchObject({ etapa: "confirmado", etiqueta: "Confirmado", editable: false });
      expect(s.linea_tiempo.map((t: { etapa: string }) => t.etapa)).toEqual(["recibido", "confirmado"]);

      const f = await pedidoConFaltante(c, k, cli);
      s = await seg(cli, f.ped);
      expect(s.etapa).toBe("esperando_cliente");
      expect(s.faltantes).toHaveLength(1);
      expect(s.faltantes[0]).toMatchObject({ propuesta_id: Number(f.propuesta), causa: "sin_existencia", linea: { producto: "Corona Extra 355 ml lata", cantidad: 2 } });
      expect(s.faltantes[0].opciones.map((o: { tipo: string; importe: string }) => [o.tipo, o.importe])).toEqual([["sustituto", "820.00"], ["reducir", "420.00"]]);
    });
  });

  it("historial inmutable: UPDATE, DELETE y TRUNCATE de pedido_evento -> ESTADO_NO_VALIDO", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const p = await pedido(c, cli, [lin(k.caja, 2)]);
      expect((await error(c, () => c.query("update app.pedido_evento set publico = false where pedido_id = $1", [p]))).message).toBe("ESTADO_NO_VALIDO");
      expect((await error(c, () => c.query("delete from app.pedido_evento where pedido_id = $1", [p]))).message).toBe("ESTADO_NO_VALIDO");
      expect((await error(c, () => c.query("truncate app.pedido_evento"))).message).toBe("ESTADO_NO_VALIDO");
      // El cambio de fn_truncate_bloqueado no rompio los demas casos.
      expect((await error(c, () => c.query("truncate app.compra cascade"))).message).toBe("COMPRA_INMUTABLE");
      expect((await error(c, () => c.query("truncate app.movimiento_inventario cascade"))).message).toBe("MOVIMIENTO_INMUTABLE");
    });
  });

  it("avisos: marcar enviado llena enviado_en/por; otra vez AVISO_NO_PENDIENTE; sin pedido descarta el del mismo cliente y plantilla; ck_aviso_destino", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const otro = await cliente(c);
      const sin = await usuarioF3(c, ROL3.almacenista);
      const nuevo = async (cl: string, plantilla: string, clave: string, ped: string | null = null) =>
        (await fila<{ id: string }>(c, "select app.fn_aviso_cliente($1, $2, $3, $4, '{}'::jsonb) as id", [cl, ped, plantilla, clave])).id;

      const a1 = await nuevo(cli, "wa_recordatorio_saldo", `wa_recordatorio_saldo:c${cli}:d1`);
      const o1 = await nuevo(otro, "wa_recordatorio_saldo", `wa_recordatorio_saldo:c${otro}:d1`);
      const a2 = await nuevo(cli, "wa_recordatorio_saldo", `wa_recordatorio_saldo:c${cli}:d2`);
      expect(await fila(c, "select estado from app.aviso_cliente where id = $1", [a1])).toEqual({ estado: "descartado" });
      expect(await fila(c, "select estado from app.aviso_cliente where id = $1", [o1])).toEqual({ estado: "pendiente" });
      // Misma clave: no duplica ni descarta nada.
      expect(await nuevo(cli, "wa_recordatorio_saldo", `wa_recordatorio_saldo:c${cli}:d2`)).toBe(a2);

      expect((await error(c, () => c.query("select app.fn_marcar_aviso($1, $2, 'enviado')", [sin, a2]))).message).toBe("SIN_PERMISO");
      await c.query("select app.fn_marcar_aviso($1, $2, 'enviado')", [k.usuario, a2]);
      expect(await fila(c, "select estado, enviado_por, enviado_en is not null as en from app.aviso_cliente where id = $1", [a2])).toEqual({ estado: "enviado", enviado_por: k.usuario, en: true });
      expect((await error(c, () => c.query("select app.fn_marcar_aviso($1, $2, 'enviado')", [k.usuario, a2]))).message).toBe("AVISO_NO_PENDIENTE");
      await c.query("select app.fn_marcar_aviso($1, $2, 'descartado')", [k.usuario, o1]);
      expect((await fila<{ enviado_en: string | null }>(c, "select enviado_en from app.aviso_cliente where id = $1", [o1])).enviado_en).toBeNull();

      const e = await error(c, () => c.query(
        "insert into app.aviso_cliente (cliente_id, usuario_id, plantilla, clave) values ($1, $2, 'wa_resumen_dia', 'x-dos-destinos')", [cli, k.usuario]));
      expect(e.code).toBe("23514");
      expect((await error(c, () => c.query("select app.fn_aviso_cliente($1, null, 'push_pedido_nuevo', 'x-push', '{}'::jsonb)", [cli]))).message).toBe("PLANTILLA_NO_EXISTE");
    });
  });
});

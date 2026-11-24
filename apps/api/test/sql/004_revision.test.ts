import { createHash, randomBytes, randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { enTransaccion, error, pool, ROL } from "./ayuda.js";
import { dia, errorConDetalle } from "./ayuda-inventario.js";
import { catalogoBase, cliente, clienteAtrasado, enlace, fila, notificaciones, pedido, ROL3, sha, usuarioF3, type CatalogoBase } from "./ayuda-pedidos.js";

// Pruebas de la revision independiente de 004 (vinculo de dispositivo, borde del cliente, avisos, pedidos vacios, folios, concurrencia).
afterAll(() => pool.end());

const lin = (presentacion_id: string, cantidad: number) => ({ presentacion_id, cantidad });
const estado = async (c: pg.PoolClient, id: string) => (await fila<{ estado: string }>(c, "select estado from app.pedido where id = $1", [id])).estado;
const avisosPendientes = async (c: pg.PoolClient, ped: string) =>
  (await fila<{ n: number }>(c, "select count(*)::int as n from app.aviso_cliente where pedido_id = $1 and estado = 'pendiente'", [ped])).n;
const hash = () => createHash("sha256").update(randomBytes(16)).digest("hex");
const confirmarHoy = async (c: pg.PoolClient, usuario: string, ped: string) => {
  const v = (await fila<{ version: number }>(c, "select version from app.pedido where id = $1", [ped])).version;
  await c.query("select app.fn_confirmar_pedido($1, $2, $3::jsonb)", [usuario, ped, JSON.stringify({ version: v, fecha_entrega: await dia(c, 0) })]);
};
const conPin = async (c: pg.PoolClient, enl: string, ip: string, ok: boolean, dispositivo: string) =>
  (await c.query("select app.fn_entrar_con_pin($1, $2, $3, $4, 'Chrome Android') as r", [enl, ip, ok, dispositivo])).rows[0].r;
const dispositivoOk = async (c: pg.PoolClient, tokenHash: string, dispositivo: string) =>
  (await c.query("select dispositivo_ok from app.fn_cliente_por_token($1, $2)", [tokenHash, dispositivo])).rows[0]?.dispositivo_ok;

describe("vinculo de dispositivo", () => {
  it("PIN tras quitar el dispositivo o tras reemplazar el enlace: fila nueva con hash nuevo, dispositivo_ok y sin bucle de PIN; un hash quitado o ajeno no se reutiliza", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const e1 = await enlace(c, cli, k.usuario);
      const d1 = hash();
      await c.query("select app.fn_elegir_pin($1, 'x', $2, 'Chrome Android')", [e1.id, d1]);
      expect(await dispositivoOk(c, e1.token_hash, d1)).toBe(true);

      // El personal quita ese navegador: pide PIN y el acierto registra otro dispositivo (hash nuevo).
      const did = (await fila<{ id: string }>(c, "select id from app.cliente_dispositivo where token_hash = $1", [d1])).id;
      await c.query("select app.fn_quitar_dispositivo($1, $2)", [k.usuario, did]);
      expect(await dispositivoOk(c, e1.token_hash, d1)).toBe(false);
      expect((await errorConDetalle(c, () => conPin(c, e1.id, "ip", true, d1))).message).toBe("ESTADO_NO_VALIDO");   // el hash quitado no vuelve
      const d2 = hash();
      expect((await conPin(c, e1.id, "ip", true, d2)).codigo).toBe("OK");
      expect(await dispositivoOk(c, e1.token_hash, d2)).toBe(true);
      expect((await c.query("select count(*)::int as n from app.cliente_dispositivo where cliente_enlace_id = $1", [e1.id])).rows[0].n).toBe(2);

      // Se reemplaza el enlace: el enlace nuevo no hereda dispositivos; el PIN se elige con un token nuevo.
      const e2 = await enlace(c, cli, k.usuario);
      expect(await dispositivoOk(c, e2.token_hash, d2)).toBe(false);
      expect((await error(c, () => c.query("select app.fn_elegir_pin($1, 'x', $2, 'Chrome Android')", [e2.id, d2]))).message).toBe("ESTADO_NO_VALIDO");   // d2 es de otro enlace
      const d3 = hash();
      await c.query("select app.fn_elegir_pin($1, 'x', $2, 'Chrome Android')", [e2.id, d3]);
      expect(await dispositivoOk(c, e2.token_hash, d3)).toBe(true);
    });
  });
});

describe("PIN: intentos viejos y ataque distribuido (SQL)", () => {
  it("fn_alertas_clientes limpia esperas y fallos de hace mas de un dia sin tocar acceso ni esperas vigentes", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const e = await enlace(c, cli, k.usuario);
      await c.query("insert into app.cliente_pin_espera (cliente_enlace_id, ip_hash, fallos, actualizado_en) values ($1, 'viejo', 2, now() - interval '2 days'), ($1, 'vigente', 0, now() - interval '2 days'), ($1, 'reciente', 1, now())", [e.id]);
      await c.query("update app.cliente_pin_espera set espera_hasta = now() + interval '5 minutes' where ip_hash = 'vigente'");
      await c.query("insert into app.cliente_pin_fallo (cliente_enlace_id, creado_en) values ($1, now() - interval '2 days'), ($1, now())", [e.id]);
      await c.query("select app.fn_alertas_clientes()");
      expect((await c.query("select ip_hash from app.cliente_pin_espera where cliente_enlace_id = $1 order by 1", [e.id])).rows.map((x) => x.ip_hash)).toEqual(["reciente", "vigente"]);
      expect((await c.query("select count(*)::int as n from app.cliente_pin_fallo where cliente_enlace_id = $1", [e.id])).rows[0].n).toBe(1);
      expect((await c.query("select count(*)::int as n from app.cliente_enlace where id = $1 and revocado_en is null", [e.id])).rows[0].n).toBe(1);
    });
  });

  it("20 PIN malos desde IP distintas: PIN_EN_ESPERA para todo el enlace 15 minutos, notificacion pin_ataque una vez por hora y el enlace queda igual", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const e = await enlace(c, cli, k.usuario);
      await c.query("select app.fn_elegir_pin($1, 'x', $2, 'Chrome Android')", [e.id, hash()]);
      for (let i = 0; i < 19; i++) expect((await conPin(c, e.id, `ip${i}`, false, hash())).codigo).toBe("PIN_INCORRECTO");
      expect(await notificaciones(c, "pin_ataque", "x", [k.usuario])).toBe(0);
      expect((await conPin(c, e.id, "ip19", false, hash())).codigo).toBe("PIN_INCORRECTO");   // el 20.o dispara la espera
      const hora = Math.floor(Date.now() / 3_600_000);
      const n = (await c.query("select count(*)::int as n from app.notificacion where evento = 'pin_ataque' and usuario_id = $1 and clave like $2", [k.usuario, `pin_ataque:${e.id}:%`])).rows[0].n;
      expect(n).toBe(1);
      expect(hora).toBeGreaterThan(0);
      const r = await conPin(c, e.id, "otra", true, hash());
      expect(r.codigo).toBe("PIN_EN_ESPERA");
      expect(r.segundos).toBeGreaterThanOrEqual(899);
      // Pasada la espera del enlace, el PIN correcto entra; nada se revoco.
      await c.query("update app.cliente_pin_espera set espera_hasta = now() - interval '1 minute' where cliente_enlace_id = $1 and ip_hash = '*'", [e.id]);
      expect((await conPin(c, e.id, "otra", true, hash())).codigo).toBe("OK");
      expect((await c.query("select count(*)::int as n from app.cliente_enlace where id = $1 and revocado_en is null", [e.id])).rows[0].n).toBe(1);
    });
  });
});

describe("borde del cliente en fn_registrar_pedido y fn_editar_pedido_cliente", () => {
  it("sin cliente resuelto: VALIDACION (el cuerpo no elige cliente); total_visto obligatorio; casts mal formados son VALIDACION", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const otro = await cliente(c);
      const reg = (cliente_id: string | null, usuario: string | null, datos: Record<string, unknown>) =>
        c.query("select * from app.fn_registrar_pedido($1, $2, $3::jsonb, 'h')", [cliente_id, usuario, JSON.stringify({ clave_idempotencia: randomUUID(), lineas: [lin(k.caja, 2)], ...datos })]);
      const msg = async (f: () => Promise<unknown>) => (await error(c, f)).message;

      expect(await msg(() => reg(null, null, { cliente_id: cli, total_visto: "840.00" }))).toBe("VALIDACION");
      // Con cliente resuelto, un cliente_id del cuerpo se ignora.
      const r = await reg(cli, null, { cliente_id: otro, total_visto: "840.00" });
      expect((await fila<{ cliente_id: string }>(c, "select cliente_id from app.pedido where id = $1", [r.rows[0].pedido_id])).cliente_id).toBe(cli);
      expect(await msg(() => reg(cli, null, {}))).toBe("VALIDACION");                                   // falta total_visto
      expect(await msg(() => reg(cli, null, { total_visto: "mucho" }))).toBe("VALIDACION");
      expect(await msg(() => reg(cli, null, { total_visto: "840.00", clave_idempotencia: "no-es-uuid" }))).toBe("VALIDACION");
      expect(await msg(() => reg(cli, null, { total_visto: "840.00", fecha_solicitada: "2026-02-31" }))).toBe("VALIDACION");
      expect(await msg(() => reg(cli, null, { total_visto: "840.00", fecha_solicitada: "manana" }))).toBe("VALIDACION");
      // El personal sigue sin total_visto.
      expect((await reg(null, k.usuario, { cliente_id: cli })).rows[0].repetida).toBe(false);

      const p = r.rows[0].pedido_id as string;
      const edit = (datos: Record<string, unknown>) => c.query("select app.fn_editar_pedido_cliente($1, $2, $3::jsonb)", [cli, p, JSON.stringify({ lineas: [lin(k.caja, 2)], ...datos })]);
      expect(await msg(() => edit({}))).toBe("VALIDACION");
      expect(await msg(() => edit({ total_visto: "840.00", fecha_solicitada: "2026-13-45" }))).toBe("VALIDACION");
      expect(await msg(() => edit({ total_visto: "800.00" }))).toBe("PRECIOS_CAMBIARON");
      await edit({ total_visto: "840.00" });
    });
  });

  it("IDEMPOTENCIA_CONFLICTO: misma clave y hash con otro cliente, o enlace contra captura; sin detalles del pedido ajeno", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const a = await cliente(c);
      const b = await cliente(c);
      const clave = randomUUID();
      const datos = JSON.stringify({ clave_idempotencia: clave, lineas: [lin(k.caja, 2)], total_visto: "840.00" });
      await c.query("select * from app.fn_registrar_pedido($1, null, $2::jsonb, 'h')", [a, datos]);
      const otroCliente = await errorConDetalle(c, () => c.query("select * from app.fn_registrar_pedido($1, null, $2::jsonb, 'h')", [b, datos]));
      expect(otroCliente.message).toBe("IDEMPOTENCIA_CONFLICTO");
      expect(otroCliente.detalle).toEqual({});
      // Misma clave, mismo cliente y hash, pero por captura del personal: tampoco es una repeticion.
      expect((await error(c, () => c.query("select * from app.fn_registrar_pedido($1, $2, $3::jsonb, 'h')", [a, k.usuario, datos]))).message).toBe("IDEMPOTENCIA_CONFLICTO");
    });
  });
});

describe("cancelar, avisos pendientes y propuestos", () => {
  it("cancelar (cliente o personal) descarta sus avisos pendientes; pedido ajeno NO_ENCONTRADO", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const otro = await cliente(c);
      const p = await pedido(c, cli, [lin(k.caja, 2)], { captura: k.usuario });       // aviso wa_pedido_recibido pendiente
      expect(await avisosPendientes(c, p)).toBe(1);
      expect((await error(c, () => c.query("select app.fn_cancelar_pedido_cliente($1, $2, 'x')", [otro, p]))).message).toBe("NO_ENCONTRADO");
      await c.query("select app.fn_cancelar_pedido_cliente($1, $2, 'ya no')", [cli, p]);
      expect(await avisosPendientes(c, p)).toBe(0);

      const q = await pedido(c, cli, [lin(k.caja, 2)], { captura: k.usuario });
      await confirmarHoy(c, k.usuario, q);
      expect(await avisosPendientes(c, q)).toBe(1);                                      // wa_pedido_confirmado
      await c.query("select app.fn_cancelar_pedido($1, $2, 'sin stock')", [k.usuario, q]);
      expect(await avisosPendientes(c, q)).toBe(0);
    });
  });

  it("propuesto: sin folio hasta aceptarse; el cliente que lo rechaza no notifica al personal y se descarta su aviso; al vencer tambien", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      await c.query(`update app.configuracion set valor = '"00:00"' where clave = 'sugerencia_hora'`);
      const a = await clienteAtrasado(c, k);
      const b = await clienteAtrasado(c, k);
      const x = await clienteAtrasado(c, k);
      expect(await (async () => (await c.query("select app.fn_sugerir_pedidos() as n")).rows[0].n)()).toBeGreaterThanOrEqual(3);
      const prop = async (cli: string) => (await fila<{ id: string; folio: string | null }>(c, "select id, folio from app.pedido where cliente_id = $1 and origen = 'sugerido'", [cli]));
      const pa = await prop(a.cliente);
      expect(pa.folio).toBeNull();
      expect(await avisosPendientes(c, pa.id)).toBe(1);

      // Rechazar: cancelado sin folio, sin aviso pendiente y sin notificar.
      await c.query("select app.fn_cancelar_pedido_cliente($1, $2, null)", [a.cliente, pa.id]);
      expect(await estado(c, pa.id)).toBe("cancelado");
      expect((await prop(a.cliente)).folio).toBeNull();
      expect(await avisosPendientes(c, pa.id)).toBe(0);
      expect(await notificaciones(c, "pedido_cancelado_cliente", `pedido_cancelado_cliente:${pa.id}`, [k.usuario])).toBe(0);

      // Aceptar: nace el folio P y se descarta el aviso.
      const pb = await prop(b.cliente);
      const total = (await c.query("select (app.fn_vista_borrador($1, (select jsonb_agg(jsonb_build_object('presentacion_id', presentacion_id, 'cantidad', cantidad_pedida)) from app.pedido_linea where pedido_id = $2)) ->> 'total_actual') as t", [b.cliente, pb.id])).rows[0].t;
      await c.query("select app.fn_aceptar_propuesto($1, $2, $3)", [b.cliente, pb.id, total]);
      const aceptado = await prop(b.cliente);
      expect(aceptado.folio).toMatch(/^P-\d{6}$/);
      expect(await avisosPendientes(c, pb.id)).toBe(0);

      // Vencer: cancelado sin folio y sin aviso.
      const px = await prop(x.cliente);
      await c.query("update app.pedido set propuesto_vence_en = now() - interval '1 minute' where id = $1", [px.id]);
      expect((await c.query("select app.fn_vencer_propuestos() as n")).rows[0].n).toBeGreaterThanOrEqual(1);
      expect(await avisosPendientes(c, px.id)).toBe(0);
      expect((await prop(x.cliente)).folio).toBeNull();
    });
  });
});

describe("pedidos sin lineas", () => {
  it("ajustar a cero en confirmado: PEDIDO_VACIO; vencer faltantes que dejan cero lineas cancela 'sin_lineas' con aviso", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const p = await pedido(c, cli, [lin(k.caja, 2)]);
      await confirmarHoy(c, k.usuario, p);
      const l = (await fila<{ id: string }>(c, "select id from app.pedido_linea where pedido_id = $1", [p])).id;
      const ajuste = { lineas: [{ pedido_linea_id: l, cantidad: 0, motivo_ajuste: "no hay" }] };
      expect((await error(c, () => c.query("select app.fn_ajustar_pedido($1, $2, $3::jsonb)", [k.usuario, p, JSON.stringify(ajuste)]))).message).toBe("PEDIDO_VACIO");
      expect(await estado(c, p)).toBe("confirmado");

      const v = (await fila<{ version: number }>(c, "select version from app.pedido where id = $1", [p])).version;
      await c.query("select app.fn_proponer_faltantes($1, $2, $3::jsonb)", [k.usuario, p, JSON.stringify({ version: v, lineas: [{ pedido_linea_id: l, causa: "otro", opciones: [] }] })]);
      await c.query("update app.propuesta_faltante set limite_en = now() - interval '1 minute' where pedido_linea_id = $1", [l]);
      await c.query("select app.fn_vencer_faltantes()");
      expect(await fila(c, "select estado, motivo from app.pedido where id = $1", [p])).toEqual({ estado: "cancelado", motivo: "sin_lineas" });
      expect((await fila<{ n: number }>(c, "select count(*)::int as n from app.aviso_cliente where pedido_id = $1 and plantilla = 'wa_pedido_ajustado' and estado = 'pendiente'", [p])).n).toBe(1);
    });
  });

  it("SIN_PERMISO_PRECIO tambien en fn_ajustar_pedido; con el permiso pasa", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const admin = await usuarioF3(c, ROL3.admin);
      const cli = await cliente(c);
      const p = await pedido(c, cli, [lin(k.caja, 2), lin(k.six, 1)]);
      await confirmarHoy(c, k.usuario, p);
      const l = (await fila<{ id: string }>(c, "select id from app.pedido_linea where pedido_id = $1 and presentacion_id = $2", [p, k.caja])).id;
      const ajuste = JSON.stringify({ lineas: [{ pedido_linea_id: l, precio_unitario: "400.00", motivo_ajuste: "trato" }] });
      expect((await error(c, () => c.query("select app.fn_ajustar_pedido($1, $2, $3::jsonb)", [admin, p, ajuste]))).message).toBe("SIN_PERMISO_PRECIO");
      await c.query("select app.fn_ajustar_pedido($1, $2, $3::jsonb)", [k.usuario, p, ajuste]);
    });
  });
});

describe("faltantes: limite del cliente y avisos del personal", () => {
  it("el cliente no responde despues de limite_en (PROPUESTA_CERRADA) pero el personal por llamada si", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const p = await pedido(c, cli, [lin(k.caja, 2), lin(k.six, 1)]);
      await confirmarHoy(c, k.usuario, p);
      const l = (await fila<{ id: string }>(c, "select id from app.pedido_linea where pedido_id = $1 and presentacion_id = $2", [p, k.caja])).id;
      const v = (await fila<{ version: number }>(c, "select version from app.pedido where id = $1", [p])).version;
      await c.query("select app.fn_proponer_faltantes($1, $2, $3::jsonb)", [k.usuario, p, JSON.stringify({ version: v, lineas: [{ pedido_linea_id: l, causa: "otro", opciones: [{ tipo: "reducir", cantidad: 1 }] }] })]);
      const prop = (await fila<{ id: string }>(c, "select id from app.propuesta_faltante where pedido_linea_id = $1", [l])).id;
      await c.query("update app.propuesta_faltante set limite_en = now() - interval '1 minute' where id = $1", [prop]);
      expect((await error(c, () => c.query("select app.fn_responder_faltante($1, null, $2, null)", [cli, prop]))).message).toBe("PROPUESTA_CERRADA");
      await c.query("select app.fn_responder_faltante($1, $2, $3, null)", [cli, k.usuario, prop]);
      expect(await estado(c, p)).toBe("confirmado");
    });
  });

  it("fn_marcar_aviso: el Repartidor (avisos.enviar sin pedidos.ver) recibe SIN_PERMISO hasta F6; el Cajero si marca", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      const rep = await usuarioF3(c, ROL3.repartidor);
      const caj = await usuarioF3(c, ROL3.cajero);
      const p = await pedido(c, cli, [lin(k.caja, 2)], { captura: k.usuario });
      const av = (await fila<{ id: string }>(c, "select id from app.aviso_cliente where pedido_id = $1", [p])).id;
      expect((await errorConDetalle(c, () => c.query("select app.fn_marcar_aviso($1, $2, 'enviado')", [rep, av]))).detalle).toEqual({ permiso: "pedidos.ver" });
      await c.query("select app.fn_marcar_aviso($1, $2, 'enviado')", [caj, av]);
      expect((await fila<{ estado: string }>(c, "select estado from app.aviso_cliente where id = $1", [av])).estado).toBe("enviado");
    });
  });
});

/* ---------------------------------------------------------------- dos conexiones (datos confirmados, se borran al final) */

describe("concurrencia con dos conexiones", () => {
  async function sembrar() {
    const c0 = await pool.connect();
    const ids: { cli: string; usuario: string; caja: string; prod: string; cat: string; ped: string[] } = { cli: "", usuario: "", caja: "", prod: "", cat: "", ped: [] };
    try {
      await c0.query("begin");
      ids.usuario = await usuarioF3(c0, ROL.admin);
      const { producto, ponerPrecio } = await import("./ayuda-inventario.js");
      const p = await producto(c0, { factores: [1, 24], usuario: ids.usuario });
      ids.caja = p.pf(24);
      ids.prod = p.id;
      ids.cat = p.categoria_id;
      await ponerPrecio(c0, ids.caja, "Menudeo", "600.00");
      ids.cli = await cliente(c0);
      await c0.query("commit");
    } finally { c0.release(); }
    return ids;
  }

  async function limpiar(ids: Awaited<ReturnType<typeof sembrar>>) {
    const l = await pool.connect();
    try {
      await l.query("begin");
      const peds = ids.ped.length ? ids.ped : [];
      await l.query("delete from app.notificacion where (datos ->> 'ruta') = any($1)", [peds.map((x) => `/pedidos/${x}`)]);
      await l.query("delete from app.aviso_cliente where cliente_id = $1", [ids.cli]);
      await l.query("alter table app.pedido_evento disable trigger trg_pedido_evento_inmutable");
      await l.query("delete from app.pedido_evento where pedido_id in (select id from app.pedido where cliente_id = $1)", [ids.cli]);
      await l.query("alter table app.pedido_evento enable trigger trg_pedido_evento_inmutable");
      await l.query("delete from app.propuesta_opcion where propuesta_id in (select f.id from app.propuesta_faltante f join app.pedido_linea pl on pl.id = f.pedido_linea_id join app.pedido p on p.id = pl.pedido_id where p.cliente_id = $1)", [ids.cli]);
      await l.query("update app.propuesta_faltante set opcion_elegida_id = null where pedido_linea_id in (select pl.id from app.pedido_linea pl join app.pedido p on p.id = pl.pedido_id where p.cliente_id = $1)", [ids.cli]);
      await l.query("delete from app.propuesta_faltante where pedido_linea_id in (select pl.id from app.pedido_linea pl join app.pedido p on p.id = pl.pedido_id where p.cliente_id = $1)", [ids.cli]);
      await l.query("delete from app.pedido_linea where pedido_id in (select id from app.pedido where cliente_id = $1)", [ids.cli]);
      await l.query("delete from app.pedido where cliente_id = $1", [ids.cli]);
      // Las presentaciones nunca se borran (PRESENTACION_NO_BORRABLE): el producto de la prueba queda inactivo.
      await l.query("update app.presentacion set activa = false where producto_id = $1", [ids.prod]);
      await l.query("update app.producto set activo = false where id = $1", [ids.prod]);
      await l.query("delete from app.cliente where id = $1", [ids.cli]);
      await l.query(`delete from app.auditoria where usuario_id = $1 or (tabla = 'cliente' and registro_id = $2) or (tabla = 'producto' and registro_id = $3)
        or (tabla = 'categoria' and registro_id = $4) or (tabla = 'usuario' and registro_id = $1::text)
        or (tabla = 'presentacion' and registro_id in (select id::text from app.presentacion where producto_id = $3::bigint)) or (tabla = 'precio' and registro_id like $5)`,
        [ids.usuario, ids.cli, ids.prod, ids.cat, `${ids.caja}:%`]);
      await l.query("delete from app.usuario where id = $1", [ids.usuario]);
      await l.query("delete from app.folio where serie = 'P' and not exists (select 1 from app.pedido)");
      await l.query("commit");
    } finally { l.release(); }
  }

  it("el cliente edita mientras el personal confirma: el que llega segundo ve el cambio (PEDIDO_CAMBIO o PEDIDO_NO_EDITABLE), nunca dos verdades", async () => {
    const ids = await sembrar();
    const a = await pool.connect();
    const b = await pool.connect();
    try {
      const pr = await pool.connect();
      let ped: string;
      try {
        ped = (await pr.query("select pedido_id from app.fn_registrar_pedido($1, null, $2::jsonb, 'h')", [ids.cli, JSON.stringify({ clave_idempotencia: randomUUID(), lineas: [lin(ids.caja, 1)], total_visto: "600.00" })])).rows[0].pedido_id;
      } finally { pr.release(); }
      ids.ped.push(ped);
      await a.query("begin");
      await b.query("begin");
      // El cliente edita (version 1 -> 2) y aun no confirma su transaccion; el personal intenta confirmar con la version 1.
      await a.query("select app.fn_editar_pedido_cliente($1, $2, $3::jsonb)", [ids.cli, ped, JSON.stringify({ lineas: [lin(ids.caja, 2)], total_visto: "1200.00" })]);
      const confirmando = b.query("select app.fn_confirmar_pedido($1, $2, $3::jsonb)", [ids.usuario, ped, JSON.stringify({ version: 1, fecha_entrega: await dia(b, 0) })]).then(() => "ok", (e: { message: string }) => e.message);
      await new Promise((r) => setTimeout(r, 300));
      await a.query("commit");
      expect(await confirmando).toBe("PEDIDO_CAMBIO");
      await b.query("rollback");
      expect((await pool.query("select estado, version, total from app.pedido where id = $1", [ped])).rows[0]).toEqual({ estado: "recibido", version: 2, total: "1200.00" });
    } finally {
      await a.query("rollback").catch(() => undefined);
      await b.query("rollback").catch(() => undefined);
      a.release();
      b.release();
      await limpiar(ids);
    }
  });

  it("fn_vencer_faltantes contra fn_responder_faltante: una sola gana, la propuesta queda cerrada una vez", async () => {
    const ids = await sembrar();
    const a = await pool.connect();
    const b = await pool.connect();
    try {
      await pool.query(`update app.configuracion set valor = '"quitar"' where clave = 'faltante_accion_predeterminada'`);
      const pr = await pool.connect();
      let ped: string, prop: string;
      try {
        ped = (await pr.query("select pedido_id from app.fn_registrar_pedido($1, $2, $3::jsonb, 'h')", [ids.cli, ids.usuario, JSON.stringify({ clave_idempotencia: randomUUID(), lineas: [lin(ids.caja, 3)] })])).rows[0].pedido_id;
        await pr.query("select app.fn_confirmar_pedido($1, $2, $3::jsonb)", [ids.usuario, ped, JSON.stringify({ version: 1, fecha_entrega: await dia(pr, 0) })]);
        const l = (await pr.query("select id from app.pedido_linea where pedido_id = $1", [ped])).rows[0].id;
        await pr.query("select app.fn_proponer_faltantes($1, $2, $3::jsonb)", [ids.usuario, ped, JSON.stringify({ version: 2 - 1, lineas: [{ pedido_linea_id: l, causa: "otro", opciones: [{ tipo: "reducir", cantidad: 1 }] }] })]).catch(async () => {
          const v = (await pr.query("select version from app.pedido where id = $1", [ped])).rows[0].version;
          await pr.query("select app.fn_proponer_faltantes($1, $2, $3::jsonb)", [ids.usuario, ped, JSON.stringify({ version: v, lineas: [{ pedido_linea_id: l, causa: "otro", opciones: [{ tipo: "reducir", cantidad: 1 }] }] })]);
        });
        prop = (await pr.query("select id from app.propuesta_faltante where pedido_linea_id = $1", [l])).rows[0].id;
        await pr.query("update app.propuesta_faltante set limite_en = now() - interval '1 minute' where id = $1", [prop]);
      } finally { pr.release(); }
      ids.ped.push(ped);
      await a.query("begin");
      await b.query("begin");
      await a.query("select app.fn_vencer_faltantes()");                          // toma el pedido y vence la propuesta
      const respondiendo = b.query("select app.fn_responder_faltante($1, $2, $3, null)", [ids.cli, ids.usuario, prop]).then(() => "ok", (e: { message: string }) => e.message);
      await new Promise((r) => setTimeout(r, 300));
      await a.query("commit");
      expect(await respondiendo).toBe("PROPUESTA_CERRADA");
      await b.query("rollback");
      const r = (await pool.query("select f.estado as propuesta, p.estado, p.total from app.propuesta_faltante f join app.pedido_linea l on l.id = f.pedido_linea_id join app.pedido p on p.id = l.pedido_id where f.id = $1", [prop])).rows[0];
      expect(r.propuesta).toBe("vencida");
      expect(r.estado).toBe("cancelado");   // accion 'quitar' sobre la unica linea: sin lineas, se cancela
    } finally {
      await a.query("rollback").catch(() => undefined);
      await b.query("rollback").catch(() => undefined);
      a.release();
      b.release();
      await limpiar(ids);
    }
  });
});

void sha;
void ({} as CatalogoBase);

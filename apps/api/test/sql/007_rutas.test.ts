import { spawnSync } from "node:child_process";
import type pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { enTransaccion, error, pool, ROL } from "./ayuda.js";
import { ajuste, dia, errorConDetalle } from "./ayuda-inventario.js";
import { notificaciones } from "./ayuda-pedidos.js";
import {
  catalogoBase, clienteEn, fila, pedidoConfirmado, repartidor, ROL3, rutaCon, usuarioF3, vehiculo,
} from "./ayuda-rutas.js";

afterAll(() => pool.end());

const lin = (presentacion_id: string, cantidad: number) => ({ presentacion_id, cantidad });
const estadoPedido = async (c: pg.PoolClient, id: string) => (await fila<{ estado: string }>(c, "select estado from app.pedido where id = $1", [id])).estado;
const rutaDe = async (c: pg.PoolClient, id: string) => (await fila<{ ruta_id: string | null }>(c, "select ruta_id from app.pedido where id = $1", [id])).ruta_id;
const eventos = async (c: pg.PoolClient, ped: string) => (await c.query("select tipo from app.pedido_evento where pedido_id = $1 order by id", [ped])).rows.map((r) => r.tipo as string);
const paradas = async (c: pg.PoolClient, ruta: string) =>
  (await c.query("select id, orden, estado, km_desde_anterior, pedido_id from app.ruta_parada where ruta_id = $1 order by orden", [ruta])).rows;
const rutaFila = async (c: pg.PoolClient, ruta: string) =>
  fila<{ estado: string; distancia_km: string | null; optimizada_en: Date | null; folio: string }>(c, "select estado, distancia_km, optimizada_en, folio from app.ruta where id = $1", [ruta]);
const movimientos = async (c: pg.PoolClient) => (await fila<{ n: number }>(c, "select count(*)::int as n from app.movimiento_inventario")).n;

/** Juego fijo de F6.md: 6 clientes en 19.000000, -99.0 + 0.01·i, cada uno con 1 pedido confirmado de 1 Six para mañana. */
async function juego(c: pg.PoolClient, n = 6) {
  const k = await catalogoBase(c);
  const manana = await dia(c, 1);
  const clientes: string[] = [];
  const pedidos: string[] = [];
  for (let i = 1; i <= n; i++) {
    const cli = await clienteEn(c, "19.000000", (-99 + 0.01 * i).toFixed(6), "Centro");
    clientes.push(cli);
    pedidos.push(await pedidoConfirmado(c, cli, [lin(k.six, 1)], manana, k.usuario));
  }
  return { k, manana, clientes, pedidos };
}

/** Ruta con los pedidos del juego asignados (paradas 1..n en el orden dado). */
async function rutaJuego(c: pg.PoolClient, o: { n?: number; capacidad?: number | null } = {}) {
  const j = await juego(c, o.n);
  const r = await rutaCon(c, j.pedidos, { fecha: j.manana, capacidad: o.capacidad });
  return { ...j, ...r };
}

const ordenar = (c: pg.PoolClient, u: string, ruta: string, ids: string[], km: number[] | null = null, opt = false) =>
  c.query("select app.fn_ordenar_ruta($1, $2, $3::bigint[], $4::numeric[], $5)", [u, ruta, ids, km, opt]);
const cargar = (c: pg.PoolClient, u: string, ruta: string) => c.query("select app.fn_cargar_ruta($1, $2) as r", [u, ruta]);
const iniciar = (c: pg.PoolClient, u: string, ruta: string) => c.query("select app.fn_iniciar_ruta($1, $2) as r", [u, ruta]);
const noEntregado = (c: pg.PoolClient, u: string, parada: string, motivo = "cerrado", nota: string | null = null) =>
  c.query("select app.fn_marcar_no_entregado($1, $2, $3, $4)", [u, parada, motivo, nota]);

describe("migracion y permisos", () => {
  it("007 aplicada; re-correr el migrador no aplica nada; 4 permisos nuevos con sus roles", async () => {
    await enTransaccion(async (c) => {
      const r = await c.query("select archivo from app.migraciones order by archivo");
      expect(r.rows.map((x) => x.archivo)).toEqual(expect.arrayContaining(["000_base.sql", "004_clientes_pedidos.sql", "007_rutas.sql"]));
      const nuevos = ["rutas.ver", "rutas.planear", "rutas.operar", "rutas.liquidar"];
      expect((await c.query("select codigo from app.permiso where codigo = any($1)", [nuevos])).rowCount).toBe(4);
      const de = async (rol: string) => (await c.query(
        "select rp.permiso_codigo from app.rol_permiso rp join app.rol r on r.id = rp.rol_id where r.nombre = $1 and rp.permiso_codigo = any($2)", [rol, nuevos])).rows.map((x) => x.permiso_codigo as string).sort();
      expect(await de("Dueño")).toEqual([...nuevos].sort());
      expect(await de("Administrador")).toEqual([...nuevos].sort());
      expect(await de("Repartidor")).toEqual(["rutas.operar"]);
      expect(await de("Almacenista")).toEqual(["rutas.ver"]);
      expect(await de("Cajero")).toEqual([]);
      expect((await c.query("select 1 from app.auditoria where tabla = 'rol_permiso' and registro_id like '%rutas.%'")).rowCount).toBe(0);
    });
    const p = spawnSync(process.execPath, ["scripts/migrar.mjs"], { encoding: "utf8", env: process.env });
    expect(p.stdout).toContain("nada pendiente");
    expect(p.status).toBe(0);
  });
});

describe("crear ruta", () => {
  it("repartidor sin rutas.operar, ajeno a la sucursal o inactivo -> REPARTIDOR_NO_VALIDO; vehiculo inactivo -> VALIDACION; folios R- consecutivos; sin rutas.planear -> SIN_PERMISO", async () => {
    await enTransaccion(async (c) => {
      const u = await usuarioF3(c);
      const manana = await dia(c, 1);
      const veh = await vehiculo(c);
      const rep = await repartidor(c);
      const crear = (datos: Record<string, unknown>, usuario = u) =>
        c.query("select app.fn_crear_ruta($1, 1, $2::jsonb) as id", [usuario, JSON.stringify({ fecha: manana, vehiculo_id: veh, repartidor_id: rep, ...datos })]);

      const cajero = await usuarioF3(c, ROL3.cajero);
      expect((await errorConDetalle(c, () => crear({ repartidor_id: cajero }))).message).toBe("REPARTIDOR_NO_VALIDO");
      const inactivo = await repartidor(c);
      await c.query("update app.usuario set activo = false where id = $1", [inactivo]);
      expect((await error(c, () => crear({ repartidor_id: inactivo }))).message).toBe("REPARTIDOR_NO_VALIDO");
      expect((await error(c, () => crear({ repartidor_id: "999999999" }))).message).toBe("REPARTIDOR_NO_VALIDO");
      const vInactivo = await vehiculo(c, { activo: false });
      const e = await errorConDetalle(c, () => crear({ vehiculo_id: vInactivo }));
      expect(e.message).toBe("VALIDACION");
      expect(e.detalle).toEqual({ campo: "vehiculo_id" });
      expect((await error(c, () => crear({ fecha: "no-es-fecha" }))).message).toBe("VALIDACION");
      expect((await errorConDetalle(c, () => crear({}, rep))).detalle).toEqual({ permiso: "rutas.planear" });

      const a = (await crear({ nombre: "  Norte mañana  " })).rows[0].id;
      const b = (await crear({})).rows[0].id;
      const fa = await fila<{ folio: string; nombre: string; estado: string }>(c, "select folio, nombre, estado from app.ruta where id = $1", [a]);
      const fb = await fila<{ folio: string; nombre: string | null }>(c, "select folio, nombre from app.ruta where id = $1", [b]);
      expect(fa).toMatchObject({ nombre: "Norte mañana", estado: "planeada" });
      expect(fa.folio).toMatch(/^R-\d{6}$/);
      expect(Number(fb.folio.slice(2))).toBe(Number(fa.folio.slice(2)) + 1);
      expect(fb.nombre).toBeNull();
    });
  });
});

describe("asignar, quitar y ordenar", () => {
  it("asignar: recibido/otra fecha/recoge -> NO_ASIGNABLE; en otra ruta -> EN_OTRA_RUTA; esperando_cliente y cliente sin ubicacion si; evento; ruta cargada -> NO_EDITABLE", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const manana = await dia(c, 1);
      const cli = await clienteEn(c, "19.000000", "-98.990000");
      const ok = await pedidoConfirmado(c, cli, [lin(k.six, 1)], manana, k.usuario);
      const ruta = await rutaCon(c, [], { fecha: manana });
      const asignar = (ruta_id: string, ids: string[], u = ruta.usuario) => c.query("select app.fn_asignar_pedidos($1, $2, $3::bigint[])", [u, ruta_id, ids]);

      // recibido (sin confirmar)
      const { pedido } = await import("./ayuda-pedidos.js");
      const recibido = await pedido(c, cli, [lin(k.six, 1)], { captura: k.usuario });
      const e = await errorConDetalle(c, () => asignar(ruta.id, [recibido]));
      expect(e.message).toBe("PEDIDO_NO_ASIGNABLE");
      expect(e.detalle).toEqual({ pedido_ids: [Number(recibido)] });
      // otra fecha
      const otraFecha = await pedidoConfirmado(c, cli, [lin(k.six, 1)], await dia(c, 3), k.usuario);
      expect((await error(c, () => asignar(ruta.id, [otraFecha]))).message).toBe("PEDIDO_NO_ASIGNABLE");
      // recoge en bodega
      const recoge = await pedido(c, cli, [lin(k.six, 1)], { captura: k.usuario, entrega_tipo: "recoge" });
      await c.query("select app.fn_confirmar_pedido($1, $2, $3::jsonb)", [k.usuario, recoge, JSON.stringify({ version: 1, fecha_entrega: manana })]);
      expect((await error(c, () => asignar(ruta.id, [recoge]))).message).toBe("PEDIDO_NO_ASIGNABLE");
      // todo o nada: uno bueno y uno malo no deja nada
      expect((await error(c, () => asignar(ruta.id, [ok, recibido]))).message).toBe("PEDIDO_NO_ASIGNABLE");
      expect(await rutaDe(c, ok)).toBeNull();

      await asignar(ruta.id, [ok]);
      expect(await rutaDe(c, ok)).toBe(ruta.id);
      expect(await eventos(c, ok)).toContain("asignado_ruta");
      expect(await paradas(c, ruta.id)).toMatchObject([{ orden: 1, estado: "pendiente", pedido_id: ok }]);

      const otra = await rutaCon(c, [], { fecha: manana });
      expect((await error(c, () => asignar(otra.id, [ok]))).message).toBe("PEDIDO_EN_OTRA_RUTA");

      // esperando_cliente y cliente sin ubicacion se asignan
      const sinUbicacion = await clienteEn(c, null, null);
      const espera = await pedidoConfirmado(c, sinUbicacion, [lin(k.six, 1)], manana, k.usuario);
      const linea = (await fila<{ id: string }>(c, "select id from app.pedido_linea where pedido_id = $1", [espera])).id;
      await c.query("select app.fn_proponer_faltantes($1, $2, $3::jsonb)", [k.usuario, espera, JSON.stringify({
        version: 1, lineas: [{ pedido_linea_id: linea, causa: "otro", opciones: [] }] })]);
      expect(await estadoPedido(c, espera)).toBe("esperando_cliente");
      await asignar(ruta.id, [espera]);
      expect((await paradas(c, ruta.id)).map((p) => p.orden)).toEqual([1, 2]);

      // sin permiso / ruta no editable
      const rep = await repartidor(c);
      expect((await errorConDetalle(c, () => asignar(otra.id, [], rep))).detalle).toEqual({ permiso: "rutas.planear" });
      await c.query("update app.ruta set estado = 'cargada' where id = $1", [ruta.id]);
      expect((await error(c, () => asignar(ruta.id, [ok]))).message).toBe("RUTA_NO_EDITABLE");
    });
  });

  it("ordenar: conjunto distinto -> PARADAS_NO_CUADRAN; manual borra km; con 7 km -> distancia = suma; quitar parada 2 de 3 recorre los ordenes", async () => {
    await enTransaccion(async (c) => {
      const r = await rutaJuego(c, { n: 6 });
      const ps = await paradas(c, r.id);
      const ids = ps.map((p) => p.id as string);
      expect((await error(c, () => ordenar(c, r.usuario, r.id, ids.slice(1)))).message).toBe("PARADAS_NO_CUADRAN");
      expect((await error(c, () => ordenar(c, r.usuario, r.id, [...ids, ids[0]!]))).message).toBe("PARADAS_NO_CUADRAN");
      expect((await error(c, () => ordenar(c, r.usuario, r.id, [...ids.slice(1), "999999999"]))).message).toBe("PARADAS_NO_CUADRAN");
      expect((await error(c, () => ordenar(c, r.usuario, r.id, ids, [1, 2, 3]))).message).toBe("VALIDACION");

      const invertido = [...ids].reverse();
      await ordenar(c, r.usuario, r.id, invertido, [1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05], true);
      const f = await rutaFila(c, r.id);
      expect(f.distancia_km).toBe("7.35");
      expect(f.optimizada_en).not.toBeNull();
      const despues = await paradas(c, r.id);
      expect(despues.map((p) => p.id)).toEqual(invertido);
      expect(despues.map((p) => p.km_desde_anterior)).toEqual(["1.05", "1.05", "1.05", "1.05", "1.05", "1.05"]);

      // orden manual: se borran km y distancia
      await ordenar(c, r.usuario, r.id, ids);
      expect(await rutaFila(c, r.id)).toMatchObject({ distancia_km: null, optimizada_en: null });
      expect((await paradas(c, r.id)).every((p) => p.km_desde_anterior === null)).toBe(true);

      // quitar la parada 2: quedan 1..5, el pedido queda libre con su evento
      const segunda = ps[1]!;
      await c.query("select app.fn_quitar_parada($1, $2)", [r.usuario, segunda.id]);
      expect((await paradas(c, r.id)).map((p) => p.orden)).toEqual([1, 2, 3, 4, 5]);
      expect(await rutaDe(c, segunda.pedido_id as string)).toBeNull();
      expect(await eventos(c, segunda.pedido_id as string)).toContain("quitado_ruta");
      expect((await error(c, () => c.query("select app.fn_quitar_parada($1, $2)", [r.usuario, segunda.id]))).message).toBe("NO_ENCONTRADO");
      await cargar(c, r.usuario, r.id);
      expect((await error(c, () => ordenar(c, r.usuario, r.id, ids.slice(0, 1)))).message).toBe("RUTA_NO_EDITABLE");
      expect((await error(c, () => c.query("select app.fn_quitar_parada($1, $2)", [r.usuario, ps[2]!.id]))).message).toBe("RUTA_NO_EDITABLE");
    });
  });

  it("quitar parada de 3: quedan ordenes 1 y 2 (la del medio)", async () => {
    await enTransaccion(async (c) => {
      const r = await rutaJuego(c, { n: 3 });
      const ps = await paradas(c, r.id);
      await c.query("select app.fn_quitar_parada($1, $2)", [r.usuario, ps[1]!.id]);
      const quedan = await paradas(c, r.id);
      expect(quedan.map((p) => [p.pedido_id, p.orden])).toEqual([[ps[0]!.pedido_id, 1], [ps[2]!.pedido_id, 2]]);
    });
  });
});

describe("pedido cancelado dentro de una ruta", () => {
  it("fn_cancelar_pedido en ruta planeada borra la parada y recorre; en ruta cargada -> PEDIDO_EN_RUTA", async () => {
    await enTransaccion(async (c) => {
      const r = await rutaJuego(c, { n: 3 });
      await c.query("select app.fn_cancelar_pedido($1, $2, 'ya no lo quiere')", [r.usuario, r.pedidos[0]]);
      expect(await rutaDe(c, r.pedidos[0]!)).toBeNull();
      expect((await paradas(c, r.id)).map((p) => [p.pedido_id, p.orden])).toEqual([[r.pedidos[1], 1], [r.pedidos[2], 2]]);
      expect(await eventos(c, r.pedidos[0]!)).toEqual(expect.arrayContaining(["asignado_ruta", "quitado_ruta", "cancelado"]));
      await cargar(c, r.usuario, r.id);
      expect((await error(c, () => c.query("select app.fn_cancelar_pedido($1, $2, 'tarde')", [r.usuario, r.pedidos[1]]))).message).toBe("PEDIDO_EN_RUTA");
      expect((await paradas(c, r.id))).toHaveLength(2);
    });
  });

  it("faltante que deja el pedido sin lineas (cancelado sin_lineas) tambien lo saca de la ruta planeada", async () => {
    await enTransaccion(async (c) => {
      const r = await rutaJuego(c, { n: 3 });
      const ped = r.pedidos[1]!;
      const linea = (await fila<{ id: string }>(c, "select id from app.pedido_linea where pedido_id = $1", [ped])).id;
      await c.query("select app.fn_proponer_faltantes($1, $2, $3::jsonb)", [r.k.usuario, ped, JSON.stringify({
        version: 1, lineas: [{ pedido_linea_id: linea, causa: "otro", opciones: [] }] })]);
      const prop = (await fila<{ id: string }>(c, "select id from app.propuesta_faltante where pedido_linea_id = $1", [linea])).id;
      await c.query("select app.fn_responder_faltante($1, null, $2, null)", [r.clientes[1], prop]);
      expect(await fila(c, "select estado, motivo from app.pedido where id = $1", [ped])).toEqual({ estado: "cancelado", motivo: "sin_lineas" });
      expect(await rutaDe(c, ped)).toBeNull();
      expect((await paradas(c, r.id)).map((p) => [p.pedido_id, p.orden])).toEqual([[r.pedidos[0], 1], [r.pedidos[2], 2]]);
      expect(await eventos(c, ped)).toContain("quitado_ruta");
    });
  });
});

describe("cargar y orden de carga", () => {
  it("ruta sin paradas -> RUTA_VACIA; esperando_cliente -> PEDIDO_ESPERANDO_CLIENTE; sin permiso -> SIN_PERMISO", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const manana = await dia(c, 1);
      const vacia = await rutaCon(c, [], { fecha: manana });
      expect((await error(c, () => cargar(c, vacia.usuario, vacia.id))).message).toBe("RUTA_VACIA");
      const cli = await clienteEn(c, "19.000000", "-98.990000");
      const ped = await pedidoConfirmado(c, cli, [lin(k.six, 1)], manana, k.usuario);
      const linea = (await fila<{ id: string }>(c, "select id from app.pedido_linea where pedido_id = $1", [ped])).id;
      await c.query("select app.fn_proponer_faltantes($1, $2, $3::jsonb)", [k.usuario, ped, JSON.stringify({
        version: 1, lineas: [{ pedido_linea_id: linea, causa: "otro", opciones: [] }] })]);
      const r = await rutaCon(c, [ped], { fecha: manana });
      const e = await errorConDetalle(c, () => cargar(c, r.usuario, r.id));
      expect(e.message).toBe("PEDIDO_ESPERANDO_CLIENTE");
      expect(e.detalle).toEqual({ pedido_ids: [Number(ped)] });
      expect((await errorConDetalle(c, () => cargar(c, r.repartidor, r.id))).detalle).toEqual({ permiso: "rutas.planear" });
      expect((await rutaFila(c, r.id)).estado).toBe("planeada");
    });
  });

  it("control de existencia: 72 pz con existencia 60 -> FALTA_SURTIR faltan 12 y nada cambia; con otra ruta cargada de 24 pz y esta de 48 -> faltan 12", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const manana = await dia(c, 1);
      const a = await clienteEn(c, "19.000000", "-98.990000");
      const b = await clienteEn(c, "19.000000", "-98.980000");
      const antes = await movimientos(c);
      const p1 = await pedidoConfirmado(c, a, [lin(k.caja, 2)], manana, k.usuario);
      const p2 = await pedidoConfirmado(c, b, [lin(k.caja, 1)], manana, k.usuario);
      const r = await rutaCon(c, [p1, p2], { fecha: manana });
      const e = await errorConDetalle(c, () => cargar(c, r.usuario, r.id));
      expect(e.message).toBe("FALTA_SURTIR");
      expect(e.detalle).toEqual([{ producto_id: Number(k.corona.id), producto: "Corona Extra 355 ml lata", faltan: 12 }]);
      expect((await rutaFila(c, r.id)).estado).toBe("planeada");
      expect(await estadoPedido(c, p1)).toBe("confirmado");
      expect(await notificaciones(c, "ruta_asignada", `ruta:${r.id}:cargada`, [r.repartidor])).toBe(0);

      // otra ruta ya cargada con 24 pz: queda 36 y esta pide 48
      await c.query("select app.fn_cancelar_ruta($1, $2)", [r.usuario, r.id]);
      const c1 = await clienteEn(c, "19.000000", "-98.970000");
      const c2 = await clienteEn(c, "19.000000", "-98.960000");
      const q1 = await pedidoConfirmado(c, c1, [lin(k.caja, 1)], manana, k.usuario);
      const q2 = await pedidoConfirmado(c, c2, [lin(k.caja, 2)], manana, k.usuario);
      const r1 = await rutaCon(c, [q1], { fecha: manana });
      const r2 = await rutaCon(c, [q2], { fecha: manana });
      await cargar(c, r1.usuario, r1.id);
      const e2 = await errorConDetalle(c, () => cargar(c, r2.usuario, r2.id));
      expect(e2.message).toBe("FALTA_SURTIR");
      expect((e2.detalle as { faltan: number }[])[0]!.faltan).toBe(12);
      expect(await movimientos(c)).toBe(antes);
    });
  });

  it("cargar ok: pedidos cargado, evento, notificacion solo al repartidor con datos.ruta = /reparto; capacidad 2 con 3 cajas -> advertencia y carga igual", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const manana = await dia(c, 1);
      const a = await clienteEn(c, "19.000000", "-98.990000", "Norte");
      const b = await clienteEn(c, "19.000000", "-98.980000", "Norte");
      const p1 = await pedidoConfirmado(c, a, [lin(k.caja, 2)], manana, k.usuario);
      const p2 = await pedidoConfirmado(c, b, [lin(k.caja, 1)], manana, k.usuario);
      await ajuste(c, k.usuario, k.corona.id, "ajuste_entrada", 40, { costo: "12.50" }); // 100 pz: caben las 3 cajas
      const r = await rutaCon(c, [p1, p2], { fecha: manana, capacidad: 2 });
      const antes = await movimientos(c);
      const res = (await cargar(c, r.usuario, r.id)).rows[0].r as { advertencias: unknown[]; cajas_totales: number; paradas: unknown[] };
      expect(res.cajas_totales).toBe(3);
      expect(res.advertencias).toEqual([{ codigo: "capacidad", cajas: 3, capacidad: 2 }]);
      expect(res.paradas).toHaveLength(2);
      expect((await rutaFila(c, r.id)).estado).toBe("cargada");
      expect(await estadoPedido(c, p1)).toBe("cargado");
      expect(await estadoPedido(c, p2)).toBe("cargado");
      expect(await eventos(c, p1)).toContain("cargado");
      const n = await c.query("select usuario_id, datos from app.notificacion where evento = 'ruta_asignada' and clave = $1", ["ruta:" + r.id + ":cargada"]);
      expect(n.rows).toEqual([{ usuario_id: r.repartidor, datos: { ruta: "/reparto" } }]);
      expect(await movimientos(c)).toBe(antes);
      expect((await error(c, () => cargar(c, r.usuario, r.id))).message).toBe("RUTA_NO_EDITABLE");
    });
  });

  it("LIFO: 3 paradas (orden 1, 2, 3) -> carga_n 3, 2, 1 y la lista empieza por la parada 3; totales y cajas", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const manana = await dia(c, 1);
      const cs = [await clienteEn(c, "19.000000", "-98.990000", "Sur"), await clienteEn(c, "19.000000", "-98.980000"), await clienteEn(c, "19.000000", "-98.970000", "Sur")];
      const p = [
        await pedidoConfirmado(c, cs[0]!, [lin(k.six, 2), lin(k.caja, 1)], manana, k.usuario),
        await pedidoConfirmado(c, cs[1]!, [lin(k.six, 1)], manana, k.usuario),
        await pedidoConfirmado(c, cs[2]!, [lin(k.caja, 1)], manana, k.usuario),
      ];
      const r = await rutaCon(c, p, { fecha: manana });
      const carga = (await c.query("select app.fn_orden_carga($1) as r", [r.id])).rows[0].r as {
        paradas: { carga_n: number; orden: number; cliente: string; zona: string | null; pedido_folio: string; lineas: { cantidad: number; presentacion: string; producto: string }[] }[];
        totales: { producto: string; presentacion: string; cantidad: number; piezas: number }[];
        cajas_totales: number;
      };
      expect(carga.paradas.map((x) => [x.carga_n, x.orden])).toEqual([[1, 3], [2, 2], [3, 1]]);
      expect(carga.paradas[0]).toMatchObject({ zona: "Sur", lineas: [{ cantidad: 1, presentacion: "Caja de 24", producto: "Corona Extra 355 ml lata" }] });
      expect(carga.paradas[1]!.zona).toBeNull();
      expect(carga.paradas[2]!.lineas).toHaveLength(2);
      expect(carga.totales).toEqual([
        { producto: "Corona Extra 355 ml lata", presentacion: "Caja de 24", cantidad: 2, piezas: 48 },
        { producto: "Corona Extra 355 ml lata", presentacion: "Six", cantidad: 3, piezas: 18 },
      ]);
      expect(carga.cajas_totales).toBe(4); // aproximacion: por linea ceil(piezas / 24), 1 + 1 + 1 + 1
    });
  });
});

describe("iniciar y reparto del cliente", () => {
  it("iniciar: repartidor ajeno -> RUTA_AJENA; no cargada -> ESTADO_NO_VALIDO; ok: ruta en_curso, pedidos en_ruta, un aviso wa_pedido_en_ruta por pedido con su parada; devuelve null", async () => {
    await enTransaccion(async (c) => {
      const r = await rutaJuego(c, { n: 3 });
      expect((await error(c, () => iniciar(c, r.repartidor, r.id))).message).toBe("ESTADO_NO_VALIDO");
      await cargar(c, r.usuario, r.id);
      const ajeno = await repartidor(c);
      expect((await error(c, () => iniciar(c, ajeno, r.id))).message).toBe("RUTA_AJENA");
      const cajero = await usuarioF3(c, ROL3.cajero);
      expect((await errorConDetalle(c, () => iniciar(c, cajero, r.id))).detalle).toEqual({ permiso: "rutas.operar" });
      const antes = await movimientos(c);
      expect((await iniciar(c, r.repartidor, r.id)).rows[0].r).toBeNull();
      expect((await rutaFila(c, r.id)).estado).toBe("en_curso");
      expect(await c.query("select iniciada_en from app.ruta where id = $1", [r.id]).then((x) => x.rows[0].iniciada_en)).not.toBeNull();
      for (const [i, ped] of r.pedidos.entries()) {
        expect(await estadoPedido(c, ped)).toBe("en_ruta");
        const av = await c.query("select vars, estado, clave from app.aviso_cliente where pedido_id = $1 and plantilla = 'wa_pedido_en_ruta'", [ped]);
        expect(av.rows).toHaveLength(1);
        expect(av.rows[0].vars).toMatchObject({ parada: i + 1, paradas: 3 });
        expect(av.rows[0].clave).toMatch(new RegExp(`^wa_pedido_en_ruta:p${ped}:v\\d+:r${r.id}$`));
        expect(await eventos(c, ped)).toContain("en_ruta");
      }
      expect(await movimientos(c)).toBe(antes);
      expect((await error(c, () => iniciar(c, r.repartidor, r.id))).message).toBe("ESTADO_NO_VALIDO");
    });
  });

  it("fn_reparto_pedido: parada 3 de 4 con 1.05 km c/u -> hasta = ahora + 57.6 min y desde = ahora; fallar la parada 1 -> antes_que_tu 1; no en_ruta -> null; el seguimiento solo trae su bloque", async () => {
    await enTransaccion(async (c) => {
      const r = await rutaJuego(c, { n: 4 });
      const ps = await paradas(c, r.id);
      expect((await c.query("select app.fn_reparto_pedido($1) as r", [r.pedidos[2]])).rows[0].r).toBeNull();
      await ordenar(c, r.usuario, r.id, ps.map((p) => p.id as string), [1.05, 1.05, 1.05, 1.05, 1.05], true);
      await cargar(c, r.usuario, r.id);
      await iniciar(c, r.repartidor, r.id);
      const reparto = async (ped: string) => (await c.query(
        `select x.r ->> 'parada' as parada, x.r ->> 'paradas' as paradas, x.r ->> 'antes_que_tu' as antes,
                extract(epoch from (x.r ->> 'llegada_estimada_hasta')::timestamptz - now()) / 60 as hasta_min,
                extract(epoch from (x.r ->> 'llegada_estimada_desde')::timestamptz - now()) / 60 as desde_min
           from (select app.fn_reparto_pedido($1) as r) x`, [ped])).rows[0];
      const a = await reparto(r.pedidos[2]!);
      expect([a.parada, a.paradas, a.antes]).toEqual(["3", "4", "2"]);
      expect(Number(a.hasta_min)).toBeGreaterThan(56.6);
      expect(Number(a.hasta_min)).toBeLessThan(58.6);
      expect(Math.abs(Number(a.desde_min))).toBeLessThan(1);

      await noEntregado(c, r.repartidor, ps[0]!.id as string);
      const b = await reparto(r.pedidos[2]!);
      expect([b.parada, b.paradas, b.antes]).toEqual(["3", "4", "1"]);
      expect((await c.query("select app.fn_reparto_pedido($1) as r", [r.pedidos[0]])).rows[0].r).toBeNull(); // no_entregado

      const seg = (await c.query("select app.fn_seguimiento_pedido($1, $2) as s", [r.clientes[2], r.pedidos[2]])).rows[0].s as Record<string, unknown>;
      expect(seg).toMatchObject({ etapa: "en_ruta", etiqueta: "En camino", reparto: { parada: 3, paradas: 4, antes_que_tu: 1 } });
      expect(Object.keys(seg.reparto as object).sort()).toEqual(["antes_que_tu", "llegada_estimada_desde", "llegada_estimada_hasta", "parada", "paradas"]);
      expect(JSON.stringify(seg)).not.toMatch(/repartidor|telefono|Prueba F3/i);
      // el pedido de otro cliente sigue siendo NO_ENCONTRADO
      expect((await error(c, () => c.query("select app.fn_seguimiento_pedido($1, $2)", [r.clientes[0], r.pedidos[2]]))).message).toBe("NO_ENCONTRADO");
    });
  });

  it("sin km (orden a mano) la hora solo cuenta paradas antes por minutos por parada", async () => {
    await enTransaccion(async (c) => {
      const r = await rutaJuego(c, { n: 3 });
      await cargar(c, r.usuario, r.id);
      await iniciar(c, r.repartidor, r.id);
      const m = await fila<{ m: string }>(c, "select extract(epoch from (app.fn_reparto_pedido($1) ->> 'llegada_estimada_hasta')::timestamptz - now()) / 60 as m", [r.pedidos[2]]);
      expect(Number(m.m)).toBeCloseTo(50, 1); // 2 * 10 + 30
    });
  });
});

describe("surtiendo", () => {
  it("pedido confirmado cuya linea deja v_disponible < 0 -> etapa surtiendo y fn_requiere_surtido; con existencia suficiente -> confirmado", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const manana = await dia(c, 1);
      const cli = await clienteEn(c, "19.000000", "-98.990000");
      const a = await pedidoConfirmado(c, cli, [lin(k.caja, 2)], manana, k.usuario); // 48 de 60
      expect((await c.query("select app.fn_requiere_surtido($1) as r", [a])).rows[0].r).toBe(false);
      expect((await c.query("select app.fn_seguimiento_pedido($1, $2) as s", [cli, a])).rows[0].s).toMatchObject({ etapa: "confirmado", etiqueta: "Confirmado" });
      const b = await pedidoConfirmado(c, cli, [lin(k.caja, 1)], manana, k.usuario); // 72 de 60
      for (const ped of [a, b]) {
        expect((await c.query("select app.fn_requiere_surtido($1) as r", [ped])).rows[0].r).toBe(true);
        expect((await c.query("select app.fn_seguimiento_pedido($1, $2) as s", [cli, ped])).rows[0].s).toMatchObject({ etapa: "surtiendo", etiqueta: "Preparando tu pedido" });
      }
      expect((await c.query("select app.fn_requiere_surtido(999999999) as r")).rows[0].r).toBe(false);
    });
  });
});

describe("no entregado, terminar y cancelar", () => {
  it("no entregado: parada fallida, pedido no_entregado, notificacion fallida:<pedido>, aviso; repetir no crea filas; ajeno -> RUTA_AJENA; ruta no en_curso -> ESTADO_NO_VALIDO", async () => {
    await enTransaccion(async (c) => {
      const r = await rutaJuego(c, { n: 3 });
      const ps = await paradas(c, r.id);
      expect((await error(c, () => noEntregado(c, r.repartidor, ps[0]!.id as string))).message).toBe("ESTADO_NO_VALIDO");
      await cargar(c, r.usuario, r.id);
      expect((await error(c, () => noEntregado(c, r.repartidor, ps[0]!.id as string))).message).toBe("ESTADO_NO_VALIDO");
      await iniciar(c, r.repartidor, r.id);
      const ajeno = await repartidor(c);
      expect((await error(c, () => noEntregado(c, ajeno, ps[0]!.id as string))).message).toBe("RUTA_AJENA");
      expect((await errorConDetalle(c, () => noEntregado(c, r.repartidor, ps[0]!.id as string, "   "))).detalle).toEqual({ campo: "motivo" });

      const ped = r.pedidos[0]!;
      const duenos = (await c.query("select u.id from app.usuario u where app.fn_tiene_permiso(u.id, 'pedidos.gestionar')")).rows.map((x) => x.id as string);
      const clave = `fallida:${ped}:r${r.id}`;
      const antesNotif = await notificaciones(c, "entrega_fallida", clave, duenos);
      await noEntregado(c, r.repartidor, ps[0]!.id as string, "cerrado");
      expect(await fila(c, "select estado, motivo from app.pedido where id = $1", [ped])).toEqual({ estado: "no_entregado", motivo: "estaba cerrado el negocio" });
      expect(await fila(c, "select estado, nota from app.ruta_parada where id = $1", [ps[0]!.id])).toEqual({ estado: "fallida", nota: "estaba cerrado el negocio" });
      expect(await eventos(c, ped)).toContain("no_entregado");
      const despuesNotif = await notificaciones(c, "entrega_fallida", clave, duenos);
      expect(despuesNotif).toBeGreaterThan(antesNotif);
      const avisos = async () => (await fila<{ n: number }>(c, "select count(*)::int as n from app.aviso_cliente where pedido_id = $1 and plantilla = 'wa_entrega_fallida'", [ped])).n;
      expect(await avisos()).toBe(1);

      // segunda llamada: sin error y sin filas nuevas (tambien con otro motivo)
      const eventosAntes = (await eventos(c, ped)).length;
      await noEntregado(c, r.repartidor, ps[0]!.id as string, "no_estaba");
      expect(await avisos()).toBe(1);
      expect(await notificaciones(c, "entrega_fallida", clave, duenos)).toBe(despuesNotif);
      expect((await eventos(c, ped)).length).toBe(eventosAntes);
      expect(await fila(c, "select motivo from app.pedido where id = $1", [ped])).toEqual({ motivo: "estaba cerrado el negocio" });
    });
  });

  it("terminar: 2 pendientes -> omitida y pedidos no_entregado 'no visitada' con notificacion; reprogramar -> confirmado sin ruta y asignable a otra", async () => {
    await enTransaccion(async (c) => {
      const r = await rutaJuego(c, { n: 3 });
      const ps = await paradas(c, r.id);
      expect((await error(c, () => c.query("select app.fn_terminar_ruta($1, $2)", [r.repartidor, r.id]))).message).toBe("ESTADO_NO_VALIDO");
      await cargar(c, r.usuario, r.id);
      await iniciar(c, r.repartidor, r.id);
      await noEntregado(c, r.repartidor, ps[0]!.id as string);
      const ajeno = await repartidor(c);
      expect((await error(c, () => c.query("select app.fn_terminar_ruta($1, $2)", [ajeno, r.id]))).message).toBe("RUTA_AJENA");
      await c.query("select app.fn_terminar_ruta($1, $2)", [r.repartidor, r.id]);
      expect((await rutaFila(c, r.id)).estado).toBe("terminada");
      expect((await paradas(c, r.id)).map((p) => p.estado)).toEqual(["fallida", "omitida", "omitida"]);
      for (const ped of r.pedidos.slice(1)) {
        expect(await fila(c, "select estado, motivo from app.pedido where id = $1", [ped])).toEqual({ estado: "no_entregado", motivo: "no alcanzamos a pasar" });
        const duenos = (await c.query("select u.id from app.usuario u where app.fn_tiene_permiso(u.id, 'pedidos.gestionar')")).rows.map((x) => x.id as string);
        expect(await notificaciones(c, "entrega_fallida", `fallida:${ped}:r${r.id}`, duenos)).toBeGreaterThan(0);
      }
      // no se puede cerrar dos veces ni iniciar
      expect((await error(c, () => c.query("select app.fn_terminar_ruta($1, $2)", [r.repartidor, r.id]))).message).toBe("ESTADO_NO_VALIDO");

      const ped = r.pedidos[1]!;
      await c.query("select app.fn_reprogramar_pedido($1, $2, $3)", [r.usuario, ped, r.manana]);
      expect(await fila(c, "select estado, ruta_id from app.pedido where id = $1", [ped])).toEqual({ estado: "confirmado", ruta_id: null });
      const otra = await rutaCon(c, [ped], { fecha: r.manana });
      expect(await rutaDe(c, ped)).toBe(otra.id);
      // la parada vieja queda como historial
      expect((await fila<{ n: number }>(c, "select count(*)::int as n from app.ruta_parada where pedido_id = $1", [ped])).n).toBe(2);
    });
  });

  it("cancelar ruta: planeada y cargada devuelven los pedidos a confirmado sin ruta; en_curso -> ESTADO_NO_VALIDO", async () => {
    await enTransaccion(async (c) => {
      const r = await rutaJuego(c, { n: 2 });
      await c.query("select app.fn_cancelar_ruta($1, $2)", [r.usuario, r.id]);
      expect((await rutaFila(c, r.id)).estado).toBe("cancelada");
      for (const ped of r.pedidos) expect(await fila(c, "select estado, ruta_id from app.pedido where id = $1", [ped])).toEqual({ estado: "confirmado", ruta_id: null });

      const s = await rutaCon(c, r.pedidos, { fecha: r.manana });
      await cargar(c, s.usuario, s.id);
      expect(await estadoPedido(c, r.pedidos[0]!)).toBe("cargado");
      await c.query("select app.fn_cancelar_ruta($1, $2)", [s.usuario, s.id]);
      for (const ped of r.pedidos) expect(await fila(c, "select estado, ruta_id from app.pedido where id = $1", [ped])).toEqual({ estado: "confirmado", ruta_id: null });
      expect((await error(c, () => c.query("select app.fn_cancelar_ruta($1, $2)", [s.usuario, s.id]))).message).toBe("ESTADO_NO_VALIDO");

      const t = await rutaCon(c, r.pedidos, { fecha: r.manana });
      await cargar(c, t.usuario, t.id);
      await iniciar(c, t.repartidor, t.id);
      expect((await error(c, () => c.query("select app.fn_cancelar_ruta($1, $2)", [t.usuario, t.id]))).message).toBe("ESTADO_NO_VALIDO");
      expect((await errorConDetalle(c, () => c.query("select app.fn_cancelar_ruta($1, $2)", [t.repartidor, t.id]))).detalle).toEqual({ permiso: "rutas.planear" });
    });
  });
});

describe("avisos del repartidor", () => {
  it("el Repartidor marca solo los avisos de sus rutas (ajeno o sin pedido -> NO_ENCONTRADO); Administrador cualquiera", async () => {
    await enTransaccion(async (c) => {
      const r = await rutaJuego(c, { n: 2 });
      const s = await rutaJuego(c, { n: 1 });
      await cargar(c, r.usuario, r.id);
      await iniciar(c, r.repartidor, r.id);
      await cargar(c, s.usuario, s.id);
      await iniciar(c, s.repartidor, s.id);
      const aviso = async (ped: string) =>
        (await fila<{ id: string }>(c, "select id from app.aviso_cliente where pedido_id = $1 and plantilla = 'wa_pedido_en_ruta'", [ped])).id;
      const suyo = await aviso(r.pedidos[0]!);
      const ajeno = await aviso(s.pedidos[0]!);
      const sinPedido = (await fila<{ id: string }>(c,
        "insert into app.aviso_cliente (cliente_id, plantilla, clave) values ($1, 'wa_enlace_cliente', $2) returning id", [r.clientes[0], `sin-pedido:${r.clientes[0]}:f6`])).id;
      const marcar = (u: string, id: string, estado = "enviado") => c.query("select app.fn_marcar_aviso($1, $2, $3)", [u, id, estado]);
      expect((await error(c, () => marcar(r.repartidor, ajeno))).message).toBe("NO_ENCONTRADO");
      expect((await error(c, () => marcar(r.repartidor, sinPedido))).message).toBe("NO_ENCONTRADO");
      expect((await error(c, () => marcar(r.repartidor, "999999999"))).message).toBe("NO_ENCONTRADO");
      await marcar(r.repartidor, suyo);
      expect(await fila(c, "select estado from app.aviso_cliente where id = $1", [suyo])).toEqual({ estado: "enviado" });
      expect((await error(c, () => marcar(r.repartidor, suyo, "descartado"))).message).toBe("AVISO_NO_PENDIENTE");
      await marcar(r.usuario, ajeno);
      await marcar(r.usuario, sinPedido, "descartado");
      expect((await c.query("select app.fn_puede_ver_aviso($1, $2) as v", [r.repartidor, r.pedidos[1]])).rows[0].v).toBe(true);
      expect((await c.query("select app.fn_puede_ver_aviso($1, $2) as v", [r.repartidor, s.pedidos[0]])).rows[0].v).toBe(false);
      expect((await c.query("select app.fn_puede_ver_aviso($1, null) as v", [r.repartidor])).rows[0].v).toBe(false);
      expect((await c.query("select app.fn_puede_ver_aviso($1, null) as v", [r.usuario])).rows[0].v).toBe(true);

      // ruta cancelada: el aviso ya no es suyo
      const t = await rutaJuego(c, { n: 1 });
      const av = await c.query("select id from app.aviso_cliente where pedido_id = $1 limit 1", [t.pedidos[0]]);
      expect((await c.query("select app.fn_puede_ver_aviso($1, $2) as v", [t.repartidor, t.pedidos[0]])).rows[0].v).toBe(true);
      await c.query("select app.fn_cancelar_ruta($1, $2)", [t.usuario, t.id]);
      expect((await c.query("select app.fn_puede_ver_aviso($1, $2) as v", [t.repartidor, t.pedidos[0]])).rows[0].v).toBe(false);
      expect(av.rowCount).toBeGreaterThan(0);
      // sin avisos.enviar: SIN_PERMISO
      const almacenista = await usuarioF3(c, ROL3.almacenista);
      expect((await errorConDetalle(c, () => marcar(almacenista, suyo))).detalle).toEqual({ permiso: "avisos.enviar" });
    });
    void ROL;
  });
});

describe("revision F6", () => {
  it("fecha pasada -> FECHA_NO_VALIDA; ruta de otra sucursal -> NO_ENCONTRADO; RUTA_LLENA al pasar de 200 paradas; indice de pedido por ruta", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const u = await usuarioF3(c);
      const veh = await vehiculo(c);
      const rep = await repartidor(c);
      const crear = (fecha: string) => c.query("select app.fn_crear_ruta($1, 1, $2::jsonb)", [u, JSON.stringify({ fecha, vehiculo_id: veh, repartidor_id: rep })]);
      const ayer = await dia(c, -1);
      expect((await error(c, () => crear(ayer))).message).toBe("FECHA_NO_VALIDA");
      await crear(await dia(c, 0));

      const manana = await dia(c, 1);
      const cli = await clienteEn(c, "19.000000", "-98.990000");
      const ped = await pedidoConfirmado(c, cli, [lin(k.six, 1)], manana, k.usuario);
      const r = await rutaCon(c, [], { fecha: manana, usuario: u });
      const otraSuc = (await c.query("insert into app.sucursal (nombre) values ('Otra') returning id")).rows[0].id;
      const forastero = (await c.query(
        `insert into app.usuario (usuario, nombre, contrasena_hash, rol_id, sucursal_id) values ('tf3_sql_otra' || $2::text, 'Otra', 'x', ${ROL.dueno}, $1) returning id`, [otraSuc, process.pid])).rows[0].id;
      expect((await error(c, () => c.query("select app.fn_asignar_pedidos($1, $2, $3::bigint[])", [forastero, r.id, [ped]]))).message).toBe("NO_ENCONTRADO");
      expect((await error(c, () => cargar(c, forastero, r.id))).message).toBe("NO_ENCONTRADO");

      await c.query(
        "insert into app.ruta_parada (ruta_id, orden, tipo, cliente_id) select $1, g, 'cobro', $2 from generate_series(1, 200) g", [r.id, cli]);
      const e = await errorConDetalle(c, () => c.query("select app.fn_asignar_pedidos($1, $2, $3::bigint[])", [u, r.id, [ped]]));
      expect(e.message).toBe("RUTA_LLENA");
      expect(e.detalle).toEqual({ ruta_id: Number(r.id), maximo: 200 });
      expect((await c.query("select 1 from pg_indexes where indexname = 'idx_pedido_ruta'")).rowCount).toBe(1);
    });
  });

  it("cargar revalida lo asignado: un pedido cuya fecha cambio -> PEDIDO_NO_ASIGNABLE y nada se carga", async () => {
    await enTransaccion(async (c) => {
      const r = await rutaJuego(c, { n: 2 });
      await c.query("update app.pedido set fecha_entrega = $2 where id = $1", [r.pedidos[0], await dia(c, 5)]);
      const e = await errorConDetalle(c, () => cargar(c, r.usuario, r.id));
      expect(e.message).toBe("PEDIDO_NO_ASIGNABLE");
      expect(e.detalle).toEqual({ pedido_ids: [Number(r.pedidos[0])] });
      expect((await rutaFila(c, r.id)).estado).toBe("planeada");
    });
  });

  it("iniciar con otra ruta en curso del mismo repartidor -> ESTADO_NO_VALIDO; cancelar una ruta cargada avisa al repartidor", async () => {
    await enTransaccion(async (c) => {
      const a = await rutaJuego(c, { n: 1 });
      const j = await juego(c, 1);
      const b = await rutaCon(c, j.pedidos, { fecha: j.manana, repartidor: a.repartidor, usuario: a.usuario });
      await cargar(c, a.usuario, a.id);
      await iniciar(c, a.repartidor, a.id);
      await cargar(c, b.usuario, b.id);
      const e = await errorConDetalle(c, () => iniciar(c, a.repartidor, b.id));
      expect(e.message).toBe("ESTADO_NO_VALIDO");
      expect(e.detalle).toMatchObject({ motivo: "otra_ruta_en_curso" });
      await c.query("select app.fn_cancelar_ruta($1, $2)", [b.usuario, b.id]);
      const n = await c.query("select titulo, datos from app.notificacion where evento = 'ruta_cancelada' and clave = $1 and usuario_id = $2", [`ruta:${b.id}:cancelada`, a.repartidor]);
      expect(n.rows).toEqual([{ titulo: "Ruta cancelada", datos: { ruta: "/reparto" } }]);
      // una ruta planeada que se cancela no avisa a nadie
      const c2 = await rutaCon(c, [], { fecha: j.manana, usuario: a.usuario });
      await c.query("select app.fn_cancelar_ruta($1, $2)", [a.usuario, c2.id]);
      expect((await c.query("select 1 from app.notificacion where clave = $1", [`ruta:${c2.id}:cancelada`])).rowCount).toBe(0);
    });
  });

  it("segunda falla del mismo pedido en otra ruta notifica de nuevo (clave por ruta); motivo `otro` pide nota; clave desconocida -> VALIDACION", async () => {
    await enTransaccion(async (c) => {
      const r = await rutaJuego(c, { n: 1 });
      await cargar(c, r.usuario, r.id);
      await iniciar(c, r.repartidor, r.id);
      const p1 = (await paradas(c, r.id))[0]!;
      expect((await errorConDetalle(c, () => noEntregado(c, r.repartidor, p1.id as string, "otro"))).detalle).toEqual({ campo: "nota" });
      expect((await errorConDetalle(c, () => noEntregado(c, r.repartidor, p1.id as string, "me dio flojera"))).detalle).toEqual({ campo: "motivo" });
      await noEntregado(c, r.repartidor, p1.id as string, "otro", "  se cayo la caja  ");
      expect(await fila(c, "select motivo from app.pedido where id = $1", [r.pedidos[0]])).toEqual({ motivo: "se cayo la caja" });
      await c.query("select app.fn_terminar_ruta($1, $2)", [r.repartidor, r.id]);
      await c.query("select app.fn_reprogramar_pedido($1, $2, $3)", [r.usuario, r.pedidos[0], r.manana]);
      const s = await rutaCon(c, [r.pedidos[0]!], { fecha: r.manana, usuario: r.usuario, repartidor: r.repartidor });
      await cargar(c, s.usuario, s.id);
      await iniciar(c, r.repartidor, s.id);
      const p2 = (await paradas(c, s.id))[0]!;
      await noEntregado(c, r.repartidor, p2.id as string, "cerrado");
      const duenos = (await c.query("select u.id from app.usuario u where app.fn_tiene_permiso(u.id, 'pedidos.gestionar')")).rows.map((x) => x.id as string);
      expect(await notificaciones(c, "entrega_fallida", `fallida:${r.pedidos[0]}:r${r.id}`, duenos)).toBeGreaterThan(0);
      expect(await notificaciones(c, "entrega_fallida", `fallida:${r.pedidos[0]}:r${s.id}`, duenos)).toBeGreaterThan(0);
    });
  });

  it("cancelar un pedido en ruta anula los km (la distancia mostrada es null) sin tocar la fila de la ruta", async () => {
    await enTransaccion(async (c) => {
      const r = await rutaJuego(c, { n: 3 });
      const ps = await paradas(c, r.id);
      await ordenar(c, r.usuario, r.id, ps.map((p) => p.id as string), [1, 1, 1, 1], true);
      expect((await fila<{ d: string }>(c, "select app.fn_ruta_distancia($1)::text as d", [r.id])).d).toBe("4.00");
      await c.query("select app.fn_cancelar_pedido($1, $2, 'ya no')", [r.usuario, r.pedidos[1]]);
      expect((await fila<{ d: string | null }>(c, "select app.fn_ruta_distancia($1)::text as d", [r.id])).d).toBeNull();
      expect((await rutaFila(c, r.id)).distancia_km).toBe("4.00"); // la ruta no se toco: solo se anularon las paradas
    });
  });

  it("fn_puede_ver_aviso del Repartidor: solo rutas sin terminar y solo plantillas de reparto", async () => {
    await enTransaccion(async (c) => {
      const r = await rutaJuego(c, { n: 1 });
      await cargar(c, r.usuario, r.id);
      await iniciar(c, r.repartidor, r.id);
      const ve = async (pl: string | null) => (await c.query("select app.fn_puede_ver_aviso($1, $2, $3) as v", [r.repartidor, r.pedidos[0], pl])).rows[0].v;
      expect(await ve("wa_pedido_en_ruta")).toBe(true);
      expect(await ve("wa_entrega_fallida")).toBe(true);
      expect(await ve("wa_nota_entrega")).toBe(true);
      expect(await ve("wa_pedido_confirmado")).toBe(false);
      expect(await ve("wa_datos_transferencia")).toBe(false);
      await c.query("select app.fn_terminar_ruta($1, $2)", [r.repartidor, r.id]);
      expect(await ve("wa_pedido_en_ruta")).toBe(false);
    });
  });

  it("fn_etapa_pedido y fn_pedidos_requieren_surtido coinciden con la regla de 006 (fn_pedido_requiere_surtido)", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const manana = await dia(c, 1);
      const cli = await clienteEn(c, "19.000000", "-98.990000");
      const a = await pedidoConfirmado(c, cli, [lin(k.caja, 2)], manana, k.usuario);
      const b = await pedidoConfirmado(c, cli, [lin(k.caja, 1)], await dia(c, 2), k.usuario);
      const solo = await Promise.all([a, b].map(async (p) => (await c.query("select app.fn_pedido_requiere_surtido($1) as v", [p])).rows[0].v as boolean));
      const lote = (await c.query("select x::text as id from app.fn_pedidos_requieren_surtido($1::bigint[]) x", [[a, b]])).rows.map((x) => x.id as string);
      expect([a, b].filter((_, i) => solo[i])).toEqual([a, b].filter((p) => lote.includes(p)));
      expect((await c.query("select app.fn_requiere_surtido($1) as v", [a])).rows[0].v).toBe(solo[0]);
      const etapa = (await c.query("select app.fn_etapa_pedido($1) as e", [a])).rows[0].e;
      expect(etapa).toBe(solo[0] ? "surtiendo" : "confirmado");
      expect((await c.query("select x from app.fn_pedidos_requieren_surtido('{}'::bigint[]) x")).rowCount).toBe(0);
    });
  });
});

import { createHash, randomBytes, randomUUID } from "node:crypto";
import type pg from "pg";
import { ROL } from "./ayuda.js";
import { dia, ponerPrecio, producto, type ProductoCreado } from "./ayuda-inventario.js";

let n = 0;
const sufijo = () => `${++n}x${process.pid}`;

export const ROL3 = {
  ...ROL,
  repartidor: "(select id from app.rol where nombre = 'Repartidor')",
  cajero: "(select id from app.rol where nombre = 'Cajero')",
  almacenista: "(select id from app.rol where nombre = 'Almacenista')",
};

/** Usuario con prefijo tf3_sql (los de F1 usan tapi_, los de F2 tf2_). */
export async function usuarioF3(c: pg.PoolClient, rol: string = ROL.dueno): Promise<string> {
  const r = await c.query(
    `insert into app.usuario (usuario, nombre, contrasena_hash, rol_id, sucursal_id)
     values ($1, 'Prueba F3', 'hash-secreto', ${rol}, 1) returning id`,
    [`tf3_sql${sufijo()}`],
  );
  return r.rows[0].id;
}

export interface CatalogoBase {
  corona: ProductoCreado;
  victoria: ProductoCreado;
  /** Presentaciones: Six y Caja de 24 de Corona; Caja de 24 de Victoria. */
  six: string;
  caja: string;
  victoriaCaja: string;
  usuario: string;
}

/** Juego fijo de F3.md: config, Corona (Pieza/Six/Caja), Victoria (Pieza/Caja), precios y equivalente. */
export async function catalogoBase(c: pg.PoolClient): Promise<CatalogoBase> {
  await c.query(`update app.configuracion set valor = '"500.00"' where clave = 'pedido_minimo'`);
  await c.query(`update app.configuracion set valor = '60' where clave = 'faltante_minutos_respuesta'`);
  await c.query(`update app.configuracion set valor = '"quitar"' where clave = 'faltante_accion_predeterminada'`);
  const corona = await producto(c, { factores: [1, 6, 24], nombre: "Corona Extra 355 ml lata", costo: "12.50", piezas: 60 });
  const victoria = await producto(c, { factores: [1, 24], nombre: "Victoria 355 ml lata", usuario: corona.usuario });
  await c.query("update app.presentacion set se_vende = false where id = any($1)", [[corona.pf(1), victoria.pf(1)]]);
  await ponerPrecio(c, corona.pf(6), "Menudeo", "110.00");
  await ponerPrecio(c, corona.pf(24), "Menudeo", "420.00");
  await ponerPrecio(c, corona.pf(24), "Mayoreo", "400.00");
  await ponerPrecio(c, victoria.pf(24), "Menudeo", "410.00");
  await c.query("insert into app.producto_equivalente (producto_id, equivalente_id, orden) values ($1, $2, 1)", [corona.id, victoria.id]);
  return { corona, victoria, six: corona.pf(6), caja: corona.pf(24), victoriaCaja: victoria.pf(24), usuario: corona.usuario };
}

/** Cliente (telefono por omision de 13 digitos; `telefono: null` = sin telefono). */
export async function cliente(
  c: pg.PoolClient,
  o: { lista?: "Menudeo" | "Mayoreo"; telefono?: string | null; ya_compro?: boolean } = {},
): Promise<string> {
  const r = await c.query(
    `insert into app.cliente (nombre, telefono_whatsapp, lista_precio_id, ya_compro)
     values ($1, $2, (select id from app.lista_precio where nombre = $3), $4) returning id`,
    [`Tienda ${sufijo()}`, o.telefono === undefined ? "5215512345678" : o.telefono, o.lista ?? "Menudeo", o.ya_compro ?? true],
  );
  return r.rows[0].id;
}

export const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Enlace vigente del cliente (forzado: no exige primera compra). Devuelve su id y el hash. */
export async function enlace(c: pg.PoolClient, clienteId: string, usuario: string): Promise<{ id: string; token_hash: string }> {
  const token_hash = sha(randomBytes(32).toString("hex"));
  const r = await c.query("select app.fn_generar_enlace($1, $2, $3, $4, true) as id", [usuario, clienteId, token_hash, randomBytes(60)]);
  return { id: r.rows[0].id, token_hash };
}

export interface OpcionesPedido {
  /** Usuario que captura; sin el, origen enlace. */
  captura?: string;
  fecha_solicitada?: string;
  notas?: string;
  entrega_tipo?: string;
  clave?: string;
  hash?: string;
  extra?: Record<string, unknown>;
}

/** Registra un pedido con `fn_registrar_pedido` (clave aleatoria). Devuelve el id. */
export async function pedido(
  c: pg.PoolClient, clienteId: string, lineas: { presentacion_id: string; cantidad: number }[], o: OpcionesPedido = {},
): Promise<string> {
  // El enlace siempre dice que total vio: por omision, el de hoy (como un cliente que no tardo).
  const visto = o.captura ? undefined : (await c.query("select app.fn_vista_borrador($1, $2::jsonb) ->> 'total_actual' as t", [clienteId, JSON.stringify(lineas)])).rows[0].t;
  const datos = {
    clave_idempotencia: o.clave ?? randomUUID(), lineas, fecha_solicitada: o.fecha_solicitada, notas: o.notas,
    entrega_tipo: o.entrega_tipo, total_visto: visto, ...o.extra,
  };
  const r = await c.query("select pedido_id from app.fn_registrar_pedido($1, $2, $3::jsonb, $4)", [
    clienteId, o.captura ?? null, JSON.stringify(datos), o.hash ?? "hash-1",
  ]);
  return r.rows[0].pedido_id;
}

/**
 * Inserta DIRECTO un pedido `entregado` (con el historial de entregas que piden las pruebas de F3). Desde 008 el pedido apunta a una
 * venta real: se crea una venta de mostrador en un turno ya cerrado (caja propia) solo para cumplir la llave; no mueve inventario.
 */
export async function pedidoEntregado(
  c: pg.PoolClient, clienteId: string,
  o: { creado_hace_dias: number; lineas: { presentacion: string; cantidad: number; entregada: number; precio: string }[] },
): Promise<string> {
  const f = await dia(c, 0);
  await c.query("select app.fn_dinero_escribir()"); // las tablas de dinero solo se escriben desde sus funciones; esto es un historial de prueba
  const caja = await c.query("insert into app.caja (sucursal_id, nombre) values (1, $1) returning id", [`Caja entregas ${sufijo()}`]);
  const usuario = await usuarioF3(c);
  const turno = await c.query(
    `insert into app.turno_caja (tipo, caja_id, usuario_id, estado, fondo_inicial, cerrado_en, cerrado_por, efectivo_esperado, efectivo_contado, diferencia)
     values ('mostrador', $1, $2, 'cerrado', 0, now(), $2, 0, 0, 0) returning id`,
    [caja.rows[0].id, usuario],
  );
  await c.query("alter table app.venta disable trigger trg_venta_turno_abierto"); // el historial se fabrica en un turno ya cerrado
  const venta = await c.query(
    `insert into app.venta (sucursal_id, folio, origen, turno_caja_id, cliente_id, lista_precio_id, usuario_id, clave_idempotencia, hash_solicitud)
     select 1, app.fn_siguiente_folio(1, 'V'), 'mostrador', $2::bigint, cl.id, cl.lista_precio_id, $3::bigint, $4::uuid, 'x' from app.cliente cl where cl.id = $1 returning id`,
    [clienteId, turno.rows[0].id, usuario, randomUUID()],
  );
  await c.query("alter table app.venta enable trigger trg_venta_turno_abierto");
  const p = await c.query(
    `insert into app.pedido (sucursal_id, folio, cliente_id, origen, estado, fecha_entrega, lista_precio_id, clave_idempotencia,
                             hash_solicitud, venta_id, creado_en, entregado_en)
     select 1, app.fn_siguiente_folio(1, 'P'), cl.id, 'enlace', 'entregado', $2::date, cl.lista_precio_id, $3, 'x',
            $5, now() - $4 * interval '1 day', now() - $4 * interval '1 day'
     from app.cliente cl where cl.id = $1 returning id`,
    [clienteId, f, randomUUID(), o.creado_hace_dias, venta.rows[0].id],
  );
  for (const [i, l] of o.lineas.entries()) {
    await c.query(
      `insert into app.pedido_linea (pedido_id, numero, presentacion_id, producto_id, factor, cantidad_pedida, cantidad,
                                     precio_lista, precio_unitario, cantidad_entregada, motivo_ajuste)
       select $1, $2, pz.id, pz.producto_id, pz.factor, $3, $3, $4, $4, $5, 'prueba' from app.presentacion pz where pz.id = $6`,
      [p.rows[0].id, i + 1, l.cantidad, l.precio, l.entregada, l.presentacion],
    );
  }
  return p.rows[0].id;
}

/** Cliente con enlace vigente y 4 pedidos entregados hace 30, 23, 16 y 9 dias (Caja x2, atrasado). */
export async function clienteAtrasado(
  c: pg.PoolClient, k: CatalogoBase, o: { telefono?: string | null } = {},
): Promise<{ cliente: string; enlace: { id: string; token_hash: string } }> {
  const id = await cliente(c, { telefono: o.telefono });
  const e = await enlace(c, id, k.usuario);
  for (const dias of [30, 23, 16, 9]) {
    await pedidoEntregado(c, id, { creado_hace_dias: dias, lineas: [{ presentacion: k.caja, cantidad: 2, entregada: 2, precio: "420.00" }] });
  }
  return { cliente: id, enlace: e };
}

/** Cuantas notificaciones de `evento` con esa `clave` recibieron estos usuarios. */
export async function notificaciones(c: pg.PoolClient, evento: string, clave: string, usuarios: string[]): Promise<number> {
  const r = await c.query(
    "select count(*)::int as n from app.notificacion where evento = $1 and clave = $2 and usuario_id = any($3)",
    [evento, clave, usuarios],
  );
  return r.rows[0].n;
}

export async function fila<T = Record<string, unknown>>(c: pg.PoolClient, sql: string, params: unknown[] = []): Promise<T> {
  return (await c.query(sql, params)).rows[0] as T;
}

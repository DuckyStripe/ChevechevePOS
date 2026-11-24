import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { cifrar, hashToken, nuevoToken } from "../src/modulos/clientes/token.js";
import { pool } from "./ayuda.js";
import { ayudaF2, sufijo } from "./ayuda-f2.js";
import { pedirPersonal } from "./ayuda-f3.js";
import { borrarDesde, marcarAgua } from "./sql/ayuda-cobro.js";
import { juegoZ, type JuegoZ } from "./sql/ayuda-crecimiento.js";
import { pool as poolSql } from "./sql/ayuda.js";

// F11: lealtad (juego L) y sugerencias de zona (juego Z) por HTTP. Productos `TF3 F11 ...` (los desactiva limpiarF3).

const ok = async <T extends { statusCode: number; body: string }>(r: T, que: string): Promise<T> => {
  if (r.statusCode >= 300) throw new Error(`${que}: ${r.statusCode} ${r.body}`);
  return r;
};

export interface CatalogoL {
  corona: { id: string; nombre: string; pieza: string; six: string; caja: string };
  victoria: { id: string; nombre: string; caja: string };
  menudeo: string;
}

/**
 * Juego fijo L de F11.md por la API: Corona Caja 400.00 (marcada para lealtad), Six 105.00, 240 pz a 12.50; Victoria Caja 390.00 (marcada),
 * 120 pz a 12.083333. Productos nuevos en cada llamada (existencias exactas).
 */
export async function catalogoL(app: FastifyInstance, dueno: string): Promise<CatalogoL> {
  const h = ayudaF2(app);
  const pedir = pedirPersonal(app);
  const listas = (await ok(await pedir("GET", "/api/listas-precio", dueno), "listas")).json().items as { id: string; nombre: string }[];
  const menudeo = listas.find((l) => l.nombre === "Menudeo")!.id;
  const categoria = await h.crearCategoria(dueno);
  const s = sufijo();
  const corona = await h.crearProducto(dueno, { nombre: `TF3 F11 Corona ${s}`, factores: [6, 24], categoria_id: categoria.id });
  const victoria = await h.crearProducto(dueno, { nombre: `TF3 F11 Victoria ${s}`, factores: [24], categoria_id: categoria.id });
  await ok(await pedir("PUT", "/api/precios", dueno, { precios: [
    { presentacion_id: corona.por(6).id, lista_precio_id: menudeo, precio: "105.00" },
    { presentacion_id: corona.por(24).id, lista_precio_id: menudeo, precio: "400.00" },
    { presentacion_id: victoria.por(24).id, lista_precio_id: menudeo, precio: "390.00" },
  ] }), "precios");
  for (const [p, piezas, costo] of [[corona.id, 240, "12.50"], [victoria.id, 120, "12.083333"]] as const) {
    await ok(await pedir("POST", "/api/inventario/ajustes", dueno, { producto_id: p, tipo: "inventario_inicial", piezas, costo_unitario: costo, clave_idempotencia: randomUUID() }), "existencia");
  }
  for (const id of [corona.por(24).id, victoria.por(24).id]) {
    await ok(await pedir("PATCH", `/api/presentaciones/${id}`, dueno, { cuenta_lealtad: true }), "marca");
  }
  return {
    corona: { id: corona.id, nombre: corona.nombre, pieza: corona.por(1).id, six: corona.por(6).id, caja: corona.por(24).id },
    victoria: { id: victoria.id, nombre: victoria.nombre, caja: victoria.por(24).id },
    menudeo,
  };
}

/** Borra los movimientos de lealtad de los clientes y usuarios `TF3` (la tabla es inmutable): va antes de `limpiarF3`/`limpiarF6`. */
export async function limpiarLealtad(): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('app.escribiendo_dinero', '1', true)");
    await c.query("alter table app.lealtad_movimiento disable trigger trg_lealtad_movimiento_inmutable");
    await c.query("alter table app.lealtad_movimiento disable trigger trg_lealtad_movimiento_guardado");
    await c.query("delete from app.lealtad_movimiento where cliente_id in (select id from app.cliente where nombre like 'TF3 %')");
    await c.query("alter table app.lealtad_movimiento enable trigger trg_lealtad_movimiento_guardado");
    await c.query("alter table app.lealtad_movimiento enable trigger trg_lealtad_movimiento_inmutable");
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

/** Recorre un JSON y devuelve las llaves que no deberian estar (conteos de clientes, ids de clientes, nombres, zonas). */
export function llavesDeZona(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(llavesDeZona);
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => [...(/^(clientes|cliente_id|nombre|zona)$/.test(k) ? [k] : []), ...llavesDeZona(x)]);
  return [];
}

export interface JuegoZHttp extends JuegoZ {
  /** Credenciales del enlace de E y de F (sin PIN: se activan por la API en la prueba). */
  enlace: Record<"E" | "F", { token: string }>;
}

/**
 * Monta el juego Z de F11.md (el mismo de las pruebas SQL de 011) confirmado, con un enlace para E y para F. `desmontar` borra todo lo creado
 * (marcas de agua de F8) incluidos los enlaces. Crear antes los usuarios de la prueba y despues montar el juego.
 */
export async function montarJuegoZ(): Promise<{ j: JuegoZHttp; desmontar: () => Promise<void> }> {
  const marcas = await marcarAgua();
  const c = await pool.connect();
  try {
    await c.query("begin");
    const base = await juegoZ(c);
    const enlace = {} as JuegoZHttp["enlace"];
    for (const [k, cliente] of [["E", base.E], ["F", base.F]] as const) {
      const token = nuevoToken();
      await c.query("select app.fn_generar_enlace($1, $2, $3, $4, true)", [base.dueno, cliente, hashToken(token), cifrar(token)]);
      enlace[k] = { token };
    }
    await c.query("commit");
    return {
      j: { ...base, enlace },
      desmontar: async () => {
        const l = await pool.connect();
        try {
          await l.query("begin");
          await l.query("set local session_replication_role = replica");
          const enlaces = `(select id from app.cliente_enlace where cliente_id > ${marcas.cliente})`;
          for (const t of ["cliente_pin_espera", "cliente_pin_fallo", "cliente_dispositivo"]) await l.query(`delete from app.${t} where cliente_enlace_id in ${enlaces}`);
          await l.query("delete from app.cliente_enlace where cliente_id > $1", [marcas.cliente]);
          await l.query("delete from app.lealtad_movimiento where venta_id > $1", [marcas.venta]);
          await l.query("commit");
        } catch (e) {
          await l.query("rollback").catch(() => undefined);
          throw e;
        } finally {
          l.release();
        }
        await borrarDesde(marcas);
        await poolSql.end();
      },
    };
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    await poolSql.end().catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

import { pool } from "./ayuda.js";
import { borrarDesde, marcarAgua } from "./sql/ayuda-cobro.js";
import { pool as poolSql } from "./sql/ayuda.js";
import { clienteCredito, efectivo, entregar, lin, pedidoConfirmado, repartidor, rutaCon } from "./sql/ayuda-cobro.js";
import { ponerPrecio, producto } from "./sql/ayuda-inventario.js";
import { juegoReportes, D0, type JuegoReportes } from "./sql/ayuda-reportes.js";
import { compra } from "./sql/ayuda-surtido.js";
import type pg from "pg";

// F9: el juego fijo de docs/fases/F9.md (el mismo de las pruebas SQL de 009) pero confirmado, para pegarle por HTTP.
// Ventas, compras y turnos van en fechas fijas pasadas; los turnos y ajustes de hoy son de usuarios y productos propios.
// Se limpia con la marca de agua de F8 (`borrarDesde`): crear antes los usuarios de la prueba y despues montar el juego.

export interface JuegoF9 extends JuegoReportes {
  /** Zona `TF9 ...` de A, B y C: aisla las cuentas por cobrar de otras suites. */
  zona: string;
  /** Categoria unica de los 4 productos: aisla el valorizado de otras suites. */
  categoria: string;
  /** Turno de la ruta R1. */
  turnoR: string;
  hoy: string;
  /** Un pedido que fallo en `ruta1` (fecha D0), se reprogramo y se entrego en `ruta2` (hoy): producto y categoria propios. */
  reprog: { pedido: string; ruta1: string; ruta2: string };
}

async function reprogramado(c: pg.PoolClient, dueno: string, hoy: string): Promise<JuegoF9["reprog"]> {
  const p = await producto(c, { factores: [1, 24], nombre: "Reprogramado", usuario: dueno });
  await ponerPrecio(c, p.pf(24), "Menudeo", "400.00");
  await compra(c, p.pf(24), 1, "300.00");
  const pedido = await pedidoConfirmado(c, await clienteCredito(c, "0.00"), [lin(p.pf(24), 1)], hoy, dueno);
  const rep = await repartidor(c);
  const r1 = await rutaCon(c, [pedido], { fecha: hoy, usuario: dueno, repartidor: rep });
  await c.query("select app.fn_cargar_ruta($1, $2)", [dueno, r1.id]);
  await c.query("select app.fn_iniciar_ruta($1, $2, '0.00')", [rep, r1.id]);
  const parada = (await c.query("select id from app.ruta_parada where ruta_id = $1", [r1.id])).rows[0].id as string;
  await c.query("select app.fn_marcar_no_entregado($1, $2, 'no_estaba')", [rep, parada]);
  await c.query("select app.fn_terminar_ruta($1, $2)", [rep, r1.id]);
  await c.query("select app.fn_liquidar_ruta($1, $2, '0.00', null)", [dueno, r1.id]);
  await c.query("update app.ruta set fecha = $2 where id = $1", [r1.id, D0]);
  await c.query("select app.fn_reprogramar_pedido($1, $2, $3::date)", [dueno, pedido, hoy]);
  const r2 = await rutaCon(c, [pedido], { fecha: hoy, usuario: dueno, repartidor: rep });
  await c.query("select app.fn_cargar_ruta($1, $2)", [dueno, r2.id]);
  await c.query("select app.fn_iniciar_ruta($1, $2, '0.00')", [rep, r2.id]);
  await entregar(c, rep, pedido, efectivo("400.00"));
  await c.query("select app.fn_terminar_ruta($1, $2)", [rep, r2.id]);
  await c.query("select app.fn_liquidar_ruta($1, $2, '400.00', null)", [dueno, r2.id]);
  return { pedido, ruta1: r1.id, ruta2: r2.id };
}

export async function montarJuego(): Promise<{ j: JuegoF9; desmontar: () => Promise<void> }> {
  const marcas = await marcarAgua();
  const c = await pool.connect();
  try {
    await c.query("begin");
    const base = await juegoReportes(c);
    const zona = (await c.query("insert into app.zona (nombre) values ($1) returning id", [`TF9 zona ${process.pid}`])).rows[0].id as string;
    await c.query("update app.cliente set zona_id = $2 where id = any($1)", [[base.A, base.B, base.C], zona]);
    const categoria = (await c.query("insert into app.categoria (nombre) values ($1) returning id", [`TF9 categoria ${process.pid}`])).rows[0].id as string;
    await c.query("update app.producto set categoria_id = $2 where id = any($1)", [base.productos, categoria]);
    const turnoR = (await c.query("select turno_caja_id from app.ruta where id = $1", [base.R1])).rows[0].turno_caja_id as string;
    const hoy = (await c.query("select app.fn_fecha_local(now())::text as d")).rows[0].d as string;
    const reprog = await reprogramado(c, base.dueno, hoy);
    await c.query("commit");
    return {
      j: { ...base, zona, categoria, turnoR, hoy, reprog },
      desmontar: async () => {
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

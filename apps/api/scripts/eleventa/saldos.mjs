// Parte `saldos`: carga el saldo de cada cliente ya importado como CxC `saldo_inicial` (fn_saldo_inicial, 008).
import { enmascarar, mapearCliente, resolverColumnas } from "./mapeo.mjs";

/** Llama `porFila(fn)` por cada fila; `ctx.concepto` lo escribe el dueño (el codigo no pone texto). */
export async function saldos(c, datos, mapeo, informe, ctx, porFila) {
  const col = resolverColumnas(datos.encabezados, "clientes", mapeo);
  if (col.nombre < 0 || col.saldo < 0) throw new Error(`Faltan columnas nombre y saldo. Encabezados leídos: ${datos.encabezados.join(" | ")}. Usa --mapeo`);
  Object.assign(informe, { leidas: datos.filas.length, cargados: 0, suma: "0.00", ya_tenian: 0, no_encontrados: 0, saldo_invalido: [] });
  const cargados = [];
  for (const [i, f] of datos.filas.entries()) {
    const fila = i + 2;
    const m = mapearCliente(f, col);
    if (m.rechazo) { informe.rechazadas.push({ fila, motivo: m.rechazo }); continue; }
    const d = m.dato;
    if (d.saldo_invalido) { informe.saldo_invalido.push({ fila, nombre: d.nombre }); continue; }
    if (d.saldo === null || Number(d.saldo) === 0) continue;
    await porFila(c, informe, fila, async () => {
      const cli = (await c.query(
        "select id from app.cliente where app.fn_normalizar(nombre) = app.fn_normalizar($1) and telefono_whatsapp is not distinct from $2 limit 1", [d.nombre, d.telefono])).rows[0];
      const quien = { fila, nombre: d.nombre, telefono: enmascarar(d.telefono) };
      if (!cli) { informe.no_encontrados++; informe.saltadas.push({ ...quien, motivo: "cliente_no_encontrado" }); return; }
      if ((await c.query("select 1 from app.cuenta_por_cobrar where cliente_id = $1 and origen = 'saldo_inicial' limit 1", [cli.id])).rowCount) {
        informe.ya_tenian++; informe.saltadas.push({ ...quien, motivo: "ya_tenia_saldo" }); return;
      }
      // vence = dia de operacion (Mexico) + dias de credito del cliente, calculado en SQL
      await c.query(
        `select app.fn_saldo_inicial($1, c.id, $3::numeric, (now() at time zone 'America/Mexico_City')::date + c.dias_credito, $4)
           from app.cliente c where c.id = $2`, [ctx.usuarioId, cli.id, d.saldo, ctx.concepto]);
      cargados.push(d.saldo);
      informe.cargados++;
    });
  }
  informe.suma = (await c.query("select coalesce(sum(x), 0)::numeric(14,2)::text as s from unnest($1::numeric[]) x", [cargados])).rows[0].s;
}

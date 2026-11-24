// Importador desde Eleventa (F3, paquete E). Lee CSV/XLSX exportados y carga por partes, cada una en UNA
// transaccion; `--simulacro` corre lo mismo y hace ROLLBACK (el reporte se escribe igual).
//
// Uso (dentro del contenedor de la API en produccion; contra la base de pruebas en desarrollo):
//   node scripts/importar-eleventa.mjs --parte catalogo|clientes|existencias|saldos --archivo <ruta>
//        --usuario <usuario del dueño> [--simulacro] [--corte] [--mapeo mapeo.json] [--reporte salida.json]
//
// - catalogo: llave = codigo de barras de la presentacion «Pieza». Departamento -> categoria; precio venta ->
//   Menudeo; precio mayoreo -> Mayoreo; minimo -> existencia_minima. Re-correr actualiza, no duplica.
// - clientes: llave = fn_normalizar(nombre) + telefono (52 + 10 digitos). Telefono invalido: se importa SIN
//   telefono y va al reporte (enmascarado). El saldo solo se reporta (suma), no se carga hasta F7.
// - existencias: inventario_inicial por fn_ajustar_inventario; solo productos sin movimientos. Requiere --corte.
// - saldos: requiere --corte y fn_saldo_inicial (008, F7): por ahora solo avisa (codigo de salida 2).
// - Columnas: supuestos de nombres de Eleventa, ajustables con --mapeo (ver eleventa/mapeo.mjs).
// - El archivo de origen nunca se modifica. Firebird (.fdb): pendiente del archivo real [P47].
// - El reporte nunca lleva telefonos completos.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { leerArchivo } from "./eleventa/leer.mjs";
import { mapearCliente, mapearProducto, resolverColumnas } from "./eleventa/mapeo.mjs";

const PARTES = ["catalogo", "clientes", "existencias", "saldos"];
const SIN_DEPARTAMENTO = "Sin departamento";

const nuevoInforme = (parte, simulacro) => ({
  parte, modo: simulacro ? "simulacro" : "real", leidas: 0, nuevas: 0, actualizadas: 0, sin_cambio: 0,
  saltadas: [], rechazadas: [], duplicados: [], avisos: [],
});

/** Ejecuta `fn` en un savepoint: si falla, la fila se rechaza y la transaccion sigue. */
async function porFila(c, informe, fila, fn) {
  await c.query("savepoint fila");
  try {
    await fn();
    await c.query("release savepoint fila");
    return true;
  } catch (e) {
    await c.query("rollback to savepoint fila");
    informe.rechazadas.push({ fila, motivo: e.message });
    return false;
  }
}

function leerFilas(datos, parte, mapeo, informe) {
  const col = resolverColumnas(datos.encabezados, parte === "existencias" ? "catalogo" : parte, mapeo);
  const obligatorias = { catalogo: ["codigo", "nombre", "precio"], existencias: ["codigo", "nombre", "existencia", "costo"], clientes: ["nombre"] }[parte] ?? [];
  const faltan = obligatorias.filter((k) => col[k] < 0);
  if (faltan.length) throw new Error(`Faltan columnas: ${faltan.join(", ")}. Encabezados leídos: ${datos.encabezados.join(" | ")}. Usa --mapeo`);
  informe.leidas = datos.filas.length;
  return col;
}

async function catalogo(c, datos, mapeo, informe, ctx) {
  const col = leerFilas(datos, "catalogo", mapeo, informe);
  const listas = Object.fromEntries((await c.query("select nombre, id from app.lista_precio where nombre in ('Menudeo','Mayoreo')")).rows.map((r) => [r.nombre, r.id]));
  if (!listas.Menudeo || !listas.Mayoreo) throw new Error("Faltan las listas Menudeo/Mayoreo (migración 002)");
  let categorias = new Map();
  const categoria = async (nombre) => {
    const k = (nombre ?? SIN_DEPARTAMENTO).toLowerCase();
    if (!categorias.has(k)) {
      const r = await c.query("select id from app.categoria where lower(nombre) = $1", [k]);
      categorias.set(k, r.rows[0]?.id ?? (await c.query("insert into app.categoria (nombre) values ($1) returning id", [nombre ?? SIN_DEPARTAMENTO])).rows[0].id);
    }
    return categorias.get(k);
  };
  const precio = (pres, lista, valor) => c.query(
    `insert into app.precio (presentacion_id, lista_precio_id, precio, actualizado_por) values ($1, $2, round($3::numeric, 2), $4)
     on conflict (presentacion_id, lista_precio_id) do update set precio = excluded.precio, actualizado_en = now(), actualizado_por = excluded.actualizado_por
       where app.precio.precio is distinct from excluded.precio`, [pres, lista, valor, ctx.usuarioId]);

  const vistos = new Map();
  for (const [i, f] of datos.filas.entries()) {
    const fila = i + 2;
    const m = mapearProducto(f, col);
    if (m.rechazo) { informe.rechazadas.push({ fila, motivo: m.rechazo }); continue; }
    const d = m.dato;
    if (vistos.has(d.codigo)) {
      informe.rechazadas.push({ fila, motivo: `código repetido (ya en la fila ${vistos.get(d.codigo)})` });
      informe.duplicados.push({ fila, codigo: d.codigo, primera: vistos.get(d.codigo) });
      continue;
    }
    vistos.set(d.codigo, fila);
    const ok = await porFila(c, informe, fila, async () => {
      const ex = (await c.query(
        `select p.id as producto_id, pr.id as presentacion_id, pr.factor from app.presentacion pr join app.producto p on p.id = pr.producto_id
          where pr.codigo_barras = $1`, [d.codigo])).rows[0];
      if (ex && Number(ex.factor) !== 1) throw new Error("el código ya pertenece a una presentación que no es Pieza");
      const cat = await categoria(d.departamento);
      let cambio = false;
      let pres;
      if (ex) {
        pres = ex.presentacion_id;
        cambio = (await c.query(
          `update app.producto set nombre = $2, categoria_id = $3, existencia_minima = $4, actualizado_en = now()
            where id = $1 and (nombre, categoria_id, existencia_minima) is distinct from ($2, $3, $4::int)`,
          [ex.producto_id, d.nombre, cat, d.minimo])).rowCount > 0;
      } else {
        const p = (await c.query("insert into app.producto (nombre, categoria_id, existencia_minima) values ($1, $2, $3) returning id", [d.nombre, cat, d.minimo])).rows[0];
        pres = (await c.query(
          "insert into app.presentacion (producto_id, nombre, factor, codigo_barras, se_vende) values ($1, 'Pieza', 1, $2, true) returning id", [p.id, d.codigo])).rows[0].id;
      }
      const cambioPrecio = (await precio(pres, listas.Menudeo, d.precio)).rowCount > 0;
      const cambioMay = d.mayoreo !== null && (await precio(pres, listas.Mayoreo, d.mayoreo)).rowCount > 0;
      if (!ex) informe.nuevas++;
      else if (cambio || cambioPrecio || cambioMay) informe.actualizadas++;
      else informe.sin_cambio++;
    });
    if (!ok) categorias = new Map(); // la categoria pudo crearse dentro del savepoint revertido
  }
}

async function clientes(c, datos, mapeo, informe) {
  const col = leerFilas(datos, "clientes", mapeo, informe);
  const lista = (await c.query("select id from app.lista_precio where es_predeterminada")).rows[0]?.id;
  if (!lista) throw new Error("No hay lista de precios predeterminada");
  informe.telefonos_invalidos = [];
  informe.sin_telefono = 0;
  informe.saldos = { clientes_con_saldo: 0, saldo_invalido: [], suma: "0.00", nota: "Solo reportado: se carga en F7 (fn_saldo_inicial)" };
  const saldos = [];
  const vistos = new Map();
  for (const [i, f] of datos.filas.entries()) {
    const fila = i + 2;
    const m = mapearCliente(f, col);
    if (m.rechazo) { informe.rechazadas.push({ fila, motivo: m.rechazo }); continue; }
    const d = m.dato;
    if (d.telefono_invalido) informe.telefonos_invalidos.push({ fila, nombre: d.nombre, telefono: d.telefono_invalido });
    else if (!d.telefono) informe.sin_telefono++;
    const llave = `${d.nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()}|${d.telefono ?? ""}`;
    if (vistos.has(llave)) {
      informe.saltadas.push({ fila, motivo: `cliente repetido en el archivo (fila ${vistos.get(llave)})` });
      informe.duplicados.push({ fila, nombre: d.nombre, primera: vistos.get(llave) });
      continue;
    }
    vistos.set(llave, fila);
    if (d.saldo_invalido) informe.saldos.saldo_invalido.push({ fila, nombre: d.nombre });
    else if (d.saldo !== null) { saldos.push(d.saldo); informe.saldos.clientes_con_saldo++; }
    await porFila(c, informe, fila, async () => {
      const ex = (await c.query(
        "select id from app.cliente where app.fn_normalizar(nombre) = app.fn_normalizar($1) and telefono_whatsapp is not distinct from $2 limit 1", [d.nombre, d.telefono])).rows[0];
      if (!ex) {
        await c.query(
          "insert into app.cliente (nombre, telefono_whatsapp, direccion, lista_precio_id, ya_compro) values ($1, $2, $3, $4, true)", [d.nombre, d.telefono, d.direccion, lista]);
        informe.nuevas++;
      } else {
        const r = await c.query(
          `update app.cliente set direccion = coalesce($2, direccion), ya_compro = true, actualizado_en = now()
            where id = $1 and (direccion is distinct from coalesce($2, direccion) or not ya_compro)`, [ex.id, d.direccion]);
        if (r.rowCount) informe.actualizadas++; else informe.sin_cambio++;
      }
    });
  }
  informe.saldos.suma = (await c.query("select coalesce(sum(x), 0)::text as s from unnest($1::numeric[]) x", [saldos])).rows[0].s;
}

async function existencias(c, datos, mapeo, informe, ctx) {
  const col = leerFilas(datos, "existencias", mapeo, informe);
  const vistos = new Map();
  for (const [i, f] of datos.filas.entries()) {
    const fila = i + 2;
    const m = mapearProducto(f, col, false);
    if (m.rechazo) { informe.rechazadas.push({ fila, motivo: m.rechazo }); continue; }
    const dato = m.dato;
    const codigo = dato.codigo;
    if (vistos.has(codigo)) { informe.rechazadas.push({ fila, motivo: `código repetido (fila ${vistos.get(codigo)})` }); informe.duplicados.push({ fila, codigo, primera: vistos.get(codigo) }); continue; }
    vistos.set(codigo, fila);
    if (dato.existencia === null) { informe.rechazadas.push({ fila, motivo: "existencia vacía" }); continue; }
    if (dato.existencia < 0) { informe.rechazadas.push({ fila, motivo: "existencia negativa" }); continue; }
    if (dato.costo === null) { informe.rechazadas.push({ fila, motivo: "sin costo" }); continue; }
    await porFila(c, informe, fila, async () => {
      const p = (await c.query("select pr.producto_id from app.presentacion pr where pr.codigo_barras = $1 and pr.factor = 1", [codigo])).rows[0];
      if (!p) throw new Error("el código no existe en el catálogo (corre catalogo primero)");
      const mov = (await c.query("select 1 from app.movimiento_inventario where producto_id = $1 and sucursal_id = $2 limit 1", [p.producto_id, ctx.sucursalId])).rowCount;
      if (mov) { informe.saltadas.push({ fila, motivo: "ya tiene movimientos de inventario" }); return; }
      if (dato.existencia === 0) { informe.saltadas.push({ fila, motivo: "existencia 0" }); return; }
      await c.query("select * from app.fn_ajustar_inventario($1, $2, $3, 'inventario_inicial', $4, $5::numeric)",
        [ctx.usuarioId, ctx.sucursalId, p.producto_id, dato.existencia, dato.costo]);
      informe.nuevas++;
    });
  }
}

const PARTE_FN = { catalogo, clientes, existencias };

/** Corre una parte. Devuelve el informe. Lanza Error con mensaje claro si el uso es invalido. */
export async function importar({ parte, archivo, usuario, simulacro = false, corte = false, mapeo = {}, url = process.env.DATABASE_URL }) {
  if (!PARTES.includes(parte)) throw new Error(`--parte debe ser una de: ${PARTES.join(", ")}`);
  if (!archivo || !usuario) throw new Error("Faltan --archivo y --usuario");
  if ((parte === "existencias" || parte === "saldos") && !corte)
    throw new Error(`La parte ${parte} se corre una sola vez, el día del corte: agrega --corte para confirmarlo`);
  if (!url) throw new Error("DATABASE_URL no está definida");
  const informe = nuevoInforme(parte, simulacro);
  if (parte === "saldos") {
    const e = new Error("La parte saldos llega en F7 (requiere fn_saldo_inicial, migración 008). Los saldos del archivo de clientes se reportan en la parte clientes.");
    e.codigoSalida = 2;
    throw e;
  }
  const datos = await leerArchivo(archivo);
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("begin");
    const u = (await c.query("select id, sucursal_id from app.usuario where usuario = $1 and activo", [usuario])).rows[0];
    if (!u) throw new Error(`El usuario ${usuario} no existe o está inactivo`);
    await c.query("select set_config('app.usuario_id', $1, true)", [String(u.id)]);
    await PARTE_FN[parte](c, datos, mapeo, informe, { usuarioId: u.id, sucursalId: u.sucursal_id });
    await c.query(simulacro ? "rollback" : "commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
  return informe;
}

function imprimir(r, ruta) {
  const l = (s) => console.log(s);
  l(`\nImportación Eleventa · ${r.parte} · ${r.modo.toUpperCase()}${r.modo === "simulacro" ? " (no se escribió nada)" : ""}`);
  l(`Leídas ${r.leidas} · nuevas ${r.nuevas} · actualizadas ${r.actualizadas} · sin cambio ${r.sin_cambio} · saltadas ${r.saltadas.length} · rechazadas ${r.rechazadas.length}`);
  for (const [t, xs] of [["Rechazadas", r.rechazadas], ["Saltadas", r.saltadas], ["Teléfonos inválidos (importados sin teléfono)", r.telefonos_invalidos ?? []]])
    if (xs.length) { l(`\n${t}:`); xs.slice(0, 50).forEach((x) => l(`  fila ${x.fila}: ${x.motivo ?? `${x.nombre} (${x.telefono})`}`)); if (xs.length > 50) l(`  … y ${xs.length - 50} más en el reporte`); }
  if (r.saldos) l(`\nSaldos (solo reporte, no se cargan hasta F7): ${r.saldos.clientes_con_saldo} clientes, suma ${r.saldos.suma}`);
  l(`\nReporte completo: ${ruta}`);
}

async function main() {
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const bandera = (n) => process.argv.includes(`--${n}`);
  try {
    const mapeo = arg("mapeo") ? JSON.parse(await readFile(arg("mapeo"), "utf8")) : {};
    const informe = await importar({ parte: arg("parte"), archivo: arg("archivo"), usuario: arg("usuario"), simulacro: bandera("simulacro"), corte: bandera("corte"), mapeo });
    const ruta = arg("reporte") ?? `reporte-eleventa-${informe.parte}-${informe.modo}.json`;
    await writeFile(ruta, JSON.stringify(informe, null, 2));
    imprimir(informe, ruta);
  } catch (e) {
    console.error(`[importar-eleventa] ${e.message}`);
    process.exit(e.codigoSalida ?? 1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

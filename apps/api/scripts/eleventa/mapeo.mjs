// Mapeo de columnas de Eleventa y normalizacion de valores (puro, sin base de datos).
//
// Los nombres de columna de Eleventa son SUPUESTOS [P46]: se comparan por encabezado sin acentos,
// mayusculas ni signos. Para ajustarlos al archivo real se pasa `--mapeo mapeo.json`:
//   { "catalogo": { "precio": ["P. Venta", "Precio Publico"] }, "clientes": { "saldo": "Adeudo" } }
// Cada campo acepta un texto o una lista; lo que pongas va ANTES de los alias por defecto.
// Campos de `catalogo` (tambien los usa `existencias`): codigo, nombre, departamento, costo, precio,
// mayoreo, existencia, minimo. Campos de `clientes`: nombre, telefono, direccion, saldo.

export const ALIAS = {
  catalogo: {
    codigo: ["Código", "Codigo de barras", "Código de barras", "Cod. Barras"],
    nombre: ["Descripción", "Producto", "Nombre"],
    departamento: ["Departamento", "Depto", "Categoría"],
    costo: ["Precio Costo", "Costo", "P. Costo"],
    precio: ["Precio Venta", "Precio", "P. Venta", "Precio Menudeo"],
    mayoreo: ["Precio Mayoreo", "Mayoreo", "P. Mayoreo"],
    existencia: ["Existencia", "Inv. Actual", "Cantidad", "Stock"],
    minimo: ["Inv. Mínimo", "Mínimo", "Existencia Mínima", "Min"],
  },
  clientes: {
    nombre: ["Nombre", "Cliente"],
    telefono: ["Teléfono", "Telefono", "Celular", "Tel."],
    direccion: ["Dirección", "Domicilio", "Calle"],
    saldo: ["Saldo", "Adeudo", "Saldo Actual"],
  },
};

export const norm = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Devuelve { campo: indiceDeColumna|-1 }. */
export function resolverColumnas(encabezados, parte, mapeo = {}) {
  const hs = encabezados.map(norm);
  const res = {};
  for (const [campo, porDefecto] of Object.entries(ALIAS[parte])) {
    const extra = [mapeo[parte]?.[campo] ?? []].flat();
    res[campo] = -1;
    for (const a of [...extra, ...porDefecto]) {
      const i = hs.indexOf(norm(a));
      if (i >= 0) { res[campo] = i; break; }
    }
  }
  return res;
}

const celda = (fila, col, campo) => (col[campo] >= 0 ? (fila[col[campo]] ?? "").trim() : "");

/** "$1,234.50" -> "1234.50" (texto: el dinero nunca se suma en JS). null si no es numero >= 0. */
export function parsearDinero(t) {
  const s = String(t ?? "").replace(/[$\s]/g, "").replace(/,(?=\d{3}(\D|$))/g, "");
  return /^\d+(\.\d+)?$/.test(s) ? s : null;
}

/** Entero >= 0 o negativo; "5", "5.0" validos; "2.5" no. null si invalido. */
export function parsearEntero(t) {
  const s = String(t ?? "").replace(/,/g, "").trim();
  return /^-?\d+(\.0+)?$/.test(s) ? Number(s.replace(/\.0+$/, "")) : null;
}

/** 10 digitos -> 52+; 12 con 52 igual; 13 con 521 -> 52 + ultimos 10; otro -> null. */
export function normalizarTelefono(t) {
  const d = String(t ?? "").replace(/\D/g, "");
  if (d.length === 10) return `52${d}`;
  if (d.length === 12 && d.startsWith("52")) return d;
  if (d.length === 13 && d.startsWith("521")) return `52${d.slice(-10)}`;
  return null;
}

export const enmascarar = (tel) => (tel ? `${tel.slice(0, 2)}******${tel.slice(-4)}` : "");
export const enmascararTextoTel = (t) => { const d = String(t ?? "").replace(/\D/g, ""); return d.length > 6 ? `${d.slice(0, 2)}******${d.slice(-4)}` : "******"; };

/** Fila de producto -> { ok, dato } o { rechazo }. */
export function mapearProducto(fila, col, conPrecio = true) {
  const nombre = celda(fila, col, "nombre");
  const codigo = celda(fila, col, "codigo");
  if (!nombre) return { rechazo: "sin nombre" };
  if (!codigo) return { rechazo: "sin código" };
  if (/^\d(\.\d+)?e\+?\d+$/i.test(codigo)) return { rechazo: "código en notación científica (formatea la columna como texto)" };
  const precio = conPrecio ? parsearDinero(celda(fila, col, "precio")) : null;
  if (conPrecio && precio === null) return { rechazo: "precio de venta vacío o no numérico" };
  const mayRaw = conPrecio ? celda(fila, col, "mayoreo") : "";
  const mayoreo = mayRaw === "" ? null : parsearDinero(mayRaw);
  if (mayRaw !== "" && mayoreo === null) return { rechazo: "precio de mayoreo no numérico" };
  const minRaw = celda(fila, col, "minimo");
  const minimo = minRaw === "" ? 0 : parsearEntero(minRaw);
  if (minimo === null || minimo < 0) return { rechazo: "mínimo no es entero ≥ 0" };
  const costoRaw = celda(fila, col, "costo");
  const costo = costoRaw === "" ? null : parsearDinero(costoRaw);
  if (costoRaw !== "" && costo === null) return { rechazo: "costo no numérico" };
  const exRaw = celda(fila, col, "existencia");
  const existencia = exRaw === "" ? null : parsearEntero(exRaw);
  if (exRaw !== "" && existencia === null) return { rechazo: "existencia no es entero" };
  return { dato: { codigo, nombre, departamento: celda(fila, col, "departamento") || null, precio, mayoreo, minimo, costo, existencia } };
}

/** Fila de cliente -> { dato } (telefono null + telefono_invalido si no sirve) o { rechazo }. */
export function mapearCliente(fila, col) {
  const nombre = celda(fila, col, "nombre");
  if (!nombre) return { rechazo: "sin nombre" };
  const telRaw = celda(fila, col, "telefono");
  const telefono = telRaw ? normalizarTelefono(telRaw) : null;
  const saldoRaw = celda(fila, col, "saldo");
  const saldo = saldoRaw === "" ? null : parsearDinero(saldoRaw);
  return {
    dato: {
      nombre, telefono, direccion: celda(fila, col, "direccion") || null,
      telefono_invalido: telRaw && !telefono ? enmascararTextoTel(telRaw) : null,
      saldo, saldo_invalido: saldoRaw !== "" && saldo === null,
    },
  };
}

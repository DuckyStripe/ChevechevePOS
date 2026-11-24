// Lector de exportaciones de Eleventa: CSV (, o ; detectado, comillas RFC 4180, BOM, UTF-8 o windows-1252)
// y XLSX (read-excel-file). Solo LEE el archivo: jamas lo abre para escritura.
// Devuelve { encabezados: string[], filas: string[][] } con todo como texto recortado.
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { TextDecoder } from "node:util";

export function decodificar(buf) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

/** Separador por la primera linea (fuera de comillas): gana el que mas aparece, `,` en empate. */
export function detectarSeparador(texto) {
  let comillas = false, comas = 0, puntos = 0;
  for (const ch of texto) {
    if (ch === '"') comillas = !comillas;
    else if (!comillas && (ch === "\n" || ch === "\r")) break;
    else if (!comillas && ch === ",") comas++;
    else if (!comillas && ch === ";") puntos++;
  }
  return puntos > comas ? ";" : ",";
}

export function parsearCsv(texto, sep = detectarSeparador(texto)) {
  const filas = [];
  let fila = [], celda = "", comillas = false;
  const cerrarCelda = () => { fila.push(celda); celda = ""; };
  const cerrarFila = () => { cerrarCelda(); filas.push(fila); fila = []; };
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') { celda += '"'; i++; } else comillas = false;
      } else celda += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) cerrarCelda();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && texto[i + 1] === "\n") i++;
      cerrarFila();
    } else celda += ch;
  }
  if (celda !== "" || fila.length) cerrarFila();
  return filas;
}

function aTexto(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

export async function leerArchivo(ruta) {
  const ext = extname(ruta).toLowerCase();
  let crudo;
  if (ext === ".xls") throw new Error("Formato .xls viejo: Ábrelo en Excel y guárdalo como CSV");
  if (ext === ".fdb") throw new Error("Lectura directa de Firebird (.fdb) pendiente: falta el archivo real de Eleventa [P47]. Exporta a CSV/XLSX");
  if (ext === ".xlsx") {
    const { readSheet } = await import("read-excel-file/node");
    crudo = await readSheet(ruta);
  } else if (ext === ".csv" || ext === ".txt") {
    crudo = parsearCsv(decodificar(await readFile(ruta)));
  } else throw new Error(`Formato no soportado: ${ext || "(sin extensión)"}. Usa .csv o .xlsx`);
  const filas = crudo.map((f) => f.map(aTexto)).filter((f) => f.some((c) => c !== ""));
  if (!filas.length) throw new Error("El archivo está vacío");
  return { encabezados: filas[0], filas: filas.slice(1) };
}

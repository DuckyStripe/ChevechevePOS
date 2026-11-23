import type { ErrorApi } from "@/lib/api-cliente";
import type { Ref } from "@/lib/tipos";

/** Nombre de una referencia que la API puede dar como `{id, nombre}` o como texto. */
export const nombreDe = (x: Ref | string | null | undefined): string => (x == null ? "—" : typeof x === "string" ? x : x.nombre);
export const idDe = (x: Ref | string | null | undefined): string => (x && typeof x === "object" ? String(x.id) : "");

/** Lista como arreglo, `{items}` o `{filas}` (el contrato no es uniforme en F2). */
export function itemsDe<T>(d: T[] | { items?: T[]; filas?: T[] } | null | undefined): T[] {
  if (!d) return [];
  if (Array.isArray(d)) return d;
  return d.items ?? d.filas ?? [];
}

export const hoyMX = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

/** `2026-11-23` o ISO -> «lun 23 nov». */
export function fecha(valor: string | null | undefined): string {
  if (!valor) return "—";
  const d = new Date(valor.length === 10 ? `${valor}T12:00:00` : valor);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Mexico_City" });
}

/** `"0.2500"` -> `"25%"` (solo para mostrar una razon, no dinero). */
export function porcentaje(valor: string | null | undefined): string {
  if (valor == null || valor === "") return "—";
  const n = Number(valor);
  if (!Number.isFinite(n)) return "—";
  return `${Number((n * 100).toFixed(1))}%`;
}

/** `"25"` -> `"0.2500"`; vacio -> null; fuera de 0-90 -> undefined (invalido). */
export function fraccion(texto: string): string | null | undefined {
  const t = texto.trim().replace("%", "");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 90) return undefined;
  return (n / 100).toFixed(4);
}

export const piezasTexto = (n: number) => `${n} ${n === 1 ? "pieza" : "piezas"}`;

export function cajasYSueltas(piezas: number, factor: number): string {
  if (factor <= 1) return piezasTexto(piezas);
  const cajas = Math.floor(piezas / factor);
  const sueltas = piezas % factor;
  return `${cajas} ${cajas === 1 ? "caja" : "cajas"} + ${sueltas} ${sueltas === 1 ? "suelta" : "sueltas"}`;
}

export const mayorFactor = (ps: { factor: number; activa: boolean }[]) => ps.filter((p) => p.activa).reduce((m, p) => Math.max(m, p.factor), 1);

export const CAUSAS_MERMA: { valor: string; texto: string }[] = [
  { valor: "caducado", texto: "Caducado" },
  { valor: "danado", texto: "Dañado" },
  { valor: "faltante", texto: "Faltante" },
  { valor: "regalo", texto: "Regalo" },
  { valor: "otro", texto: "Otro" },
];

export const TIPOS_MOVIMIENTO: Record<string, string> = {
  inventario_inicial: "Inventario inicial",
  compra: "Compra",
  cancelacion_venta: "Venta cancelada",
  devolucion_venta: "Devolución de venta",
  ajuste_entrada: "Entrada por ajuste",
  traspaso_entrada: "Traspaso de entrada",
  venta: "Venta",
  cancelacion_compra: "Compra cancelada",
  ajuste_salida: "Salida por ajuste",
  merma: "Merma",
  traspaso_salida: "Traspaso de salida",
  revaluacion: "Corrección de costo",
};

/** P6: texto llano; `STOCK_INSUFICIENTE` dice cuanto hay. Nunca el codigo. */
export function mensajeError(e: ErrorApi): string {
  const d = e.detalles as { disponible?: number | string } | undefined;
  if (e.codigo === "STOCK_INSUFICIENTE" && d?.disponible != null) return `Solo hay ${piezasTexto(Number(d.disponible))}.`;
  if (e.codigo === "SIN_PERMISO" || e.codigo === "SIN_PERMISO_PRECIO") return "Tu usuario no tiene permiso para hacer esto.";
  if (e.codigo === "DUPLICADO") return "Ya existe uno con ese nombre o código. Usa otro.";
  if (e.codigo === "FACTOR_INMUTABLE") return "No se puede cambiar cuántas piezas trae. Crea otra presentación.";
  if (e.codigo === "IDEMPOTENCIA_CONFLICTO") return "Eso ya se guardó antes con otros datos. Revisa Inventario antes de volver a intentarlo.";
  if (e.codigo === "COMPRA_INMUTABLE") return "Esta compra ya no se puede cambiar.";
  if (e.codigo === "COSTO_INVALIDO") return "Ese costo no es válido. Escríbelo como 12.50.";
  if (e.codigo === "IMAGEN_NO_VALIDA") return "Esa imagen no sirve. Prueba con una foto JPG, PNG o WebP.";
  return e.mensaje;
}

/** `imagen` = `<hash>.<ext>`; la miniatura es `<hash>-240.<ext>` (§4.5). */
export const urlImagen = (imagen: string) => `/img/${imagen}`;
export const urlMiniatura = (imagen: string) => `/img/${imagen.replace(/\.(jpg|png|webp)$/, "-240.$1")}`;

/* Importes solo para MOSTRAR un estimado (nunca se envian): centavos enteros. */
export const aCentavos = (valor: string): number | null => {
  const m = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(valor.trim());
  return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0") : null;
};
export const deCentavos = (c: number): string => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;

export const PRECIO_VALIDO = /^\d{1,10}(\.\d{1,2})?$/;

/** ISO -> «lun 23 nov, 14:05» en hora de la Ciudad de Mexico. */
export function fechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" });
}

/** Costo por pieza: hasta 6 decimales. */
export const COSTO_VALIDO = /^\d{1,8}(\.\d{1,6})?$/;
/** Solo para MOSTRAR «por caja»: micro-unidades enteras x piezas, redondeado a centavos. */
export function costoPorCaja(costoPieza: string, factor: number): string | null {
  const m = /^(\d{1,8})(?:\.(\d{1,6}))?$/.exec(costoPieza.trim());
  if (!m) return null;
  const micro = Number(m[1]) * 1_000_000 + Number((m[2] ?? "").padEnd(6, "0") || "0");
  return deCentavos(Math.round((micro * factor) / 10_000));
}

/** UUID v4 para `clave_idempotencia` (nace al abrir la pantalla y se conserva al reintentar). */
export function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

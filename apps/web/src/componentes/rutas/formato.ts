import type { RutaEstado } from "@/lib/tipos";

type Tono = "neutro" | "exito" | "peligro" | "aviso";

/** Estado de una ruta en palabras del vendedor (P6). */
export const ESTADO_RUTA: Record<RutaEstado, { texto: string; tono: Tono }> = {
  planeada: { texto: "Armándose", tono: "neutro" },
  cargada: { texto: "Cargada, lista para salir", tono: "aviso" },
  en_curso: { texto: "En camino", tono: "aviso" },
  terminada: { texto: "Terminada", tono: "exito" },
  liquidada: { texto: "Liquidada", tono: "exito" },
  cancelada: { texto: "Cancelada", tono: "peligro" },
};

/** `"12.61"` -> `"12.61 km"`. Solo formatea lo que da la API. */
export const kmTexto = (v: string | null | undefined): string => (v == null || v === "" ? "—" : `${v} km`);

export const piezasTexto = (n: number) => `${n} ${n === 1 ? "pieza" : "piezas"}`;
export const cajasTexto = (n: number) => `${n} ${n === 1 ? "caja" : "cajas"}`;

/** Solo digitos y `+`: para `tel:` y nada mas. */
export const telefonoLlamada = (t: string | null): string | null => {
  const d = (t ?? "").replace(/\D/g, "");
  return d.length >= 10 ? `+${d.length === 10 ? "52" : ""}${d}` : null;
};

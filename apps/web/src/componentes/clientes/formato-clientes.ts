import type { EstadoEnlace } from "@/lib/tipos";

export const DIAS_LARGOS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DIAS_CORTOS = ["", "lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

/** `[1,4]` -> «lun, jue». */
export const diasTexto = (d: number[] | null | undefined) => (d && d.length ? d.map((n) => DIAS_CORTOS[n] ?? "").join(", ") : "Sin día fijo");

export const ENLACE: Record<EstadoEnlace, { texto: string; tono: "neutro" | "exito" | "peligro" | "aviso" }> = {
  activo: { texto: "Link activo", tono: "exito" },
  sin_activar: { texto: "Link sin activar", tono: "aviso" },
  dado_de_baja: { texto: "Link dado de baja", tono: "peligro" },
  sin_link: { texto: "Sin link", tono: "neutro" },
};

/** Marcas amarillas de `GET /clientes` (solo avisan: nunca quitan acceso, C21). */
export const ALERTAS: Record<string, string> = {
  visitas: "Abre el link y no pide",
  inactivo: "Hace mucho que no pide",
  dispositivo_nuevo: "Entró desde un teléfono nuevo",
};

export const MOTIVOS_BAJA: { valor: string; texto: string }[] = [
  { valor: "ya_no_es_cliente", texto: "Ya no es cliente" },
  { valor: "reenviado", texto: "Reenvió el link a otra persona" },
  { valor: "solo_cotiza", texto: "Solo cotiza" },
  { valor: "otro", texto: "Otro motivo" },
];

export const TIPOS_NEGOCIO: { valor: string; texto: string }[] = [
  { valor: "tienda", texto: "Tienda" },
  { valor: "miscelanea", texto: "Miscelánea" },
  { valor: "deposito", texto: "Depósito" },
  { valor: "restaurante", texto: "Restaurante o bar" },
  { valor: "otro", texto: "Otro" },
];

/** Escribe solo los 10 digitos y se agrega la lada de Mexico (52); si ya trae 12-13 digitos se respeta. */
export function normalizarTelefono(texto: string): string | null | undefined {
  const d = texto.replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10) return `52${d}`;
  return /^\d{12,13}$/.test(d) ? d : undefined;
}

export const mapaDe = (lat: string, lng: string) => `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`;

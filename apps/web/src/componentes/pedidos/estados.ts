import type { PedidoFila } from "@/lib/tipos";

export const ESTADO_PEDIDO: Record<string, { texto: string; tono: "neutro" | "exito" | "peligro" | "aviso" }> = {
  propuesto: { texto: "Propuesto al cliente", tono: "neutro" },
  recibido: { texto: "Por confirmar", tono: "aviso" },
  esperando_cliente: { texto: "Esperando al cliente", tono: "aviso" },
  confirmado: { texto: "Confirmado", tono: "exito" },
  cargado: { texto: "Cargado", tono: "exito" },
  en_ruta: { texto: "En camino", tono: "exito" },
  entregado: { texto: "Entregado", tono: "exito" },
  no_entregado: { texto: "No se entregó", tono: "peligro" },
  cancelado: { texto: "Cancelado", tono: "peligro" },
};

export const ORIGEN_PEDIDO: Record<PedidoFila["origen"], string> = { enlace: "Por su link", captura: "Por llamada", sugerido: "Lo de siempre" };

export const EVENTO_PEDIDO: Record<string, string> = {
  recibido: "Entró el pedido",
  editado_cliente: "El cliente lo cambió",
  editado: "Se editó",
  confirmado: "Se confirmó",
  ajustado: "Se ajustó",
  faltante_propuesto: "Se le preguntó por un faltante",
  faltante_respondido: "El cliente contestó el faltante",
  faltante_vencido: "Venció el plazo del faltante",
  asignado_ruta: "Se puso en una ruta",
  quitado_ruta: "Se quitó de la ruta",
  cargado: "Se cargó",
  en_ruta: "Salió a reparto",
  entregado: "Se entregó",
  no_entregado: "No se pudo entregar",
  reprogramado: "Se cambió la fecha",
  cancelado: "Se canceló",
};

export const CAUSAS_FALTANTE: { valor: string; texto: string }[] = [
  { valor: "sin_existencia", texto: "Se acabó" },
  { valor: "proveedor_sin_producto", texto: "El proveedor no lo tiene" },
  { valor: "danado", texto: "Salió dañado" },
  { valor: "otro", texto: "Otra razón" },
];

/** Fecha de hoy en la Ciudad de Mexico (`YYYY-MM-DD`). */
export const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

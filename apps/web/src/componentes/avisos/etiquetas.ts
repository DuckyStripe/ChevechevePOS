/** Nombre llano de cada mensaje de WhatsApp para la bandeja (el texto en si lo arma la API desde la plantilla). */
export const PLANTILLAS_AVISO: Record<string, string> = {
  wa_pedido_recibido: "Pedido recibido",
  wa_pedido_confirmado: "Pedido confirmado",
  wa_pedido_ajustado: "Pedido ajustado",
  wa_pedido_faltante: "Producto que falta",
  wa_pedido_en_ruta: "Va en camino",
  wa_nota_entrega: "Nota de entrega",
  wa_enlace_cliente: "Link para pedir",
  wa_lo_de_siempre: "Lo de siempre",
  wa_recordatorio_saldo: "Recordatorio de saldo",
  wa_datos_transferencia: "Datos de transferencia",
  wa_estado_cuenta: "Estado de cuenta",
  wa_resumen_dia: "Resumen del día",
};

/** Los que se pueden crear a mano desde la bandeja (`POST /avisos`). */
export const PLANTILLAS_MANUALES = ["wa_recordatorio_saldo", "wa_enlace_cliente", "wa_datos_transferencia", "wa_estado_cuenta", "wa_resumen_dia"];

export const nombrePlantilla = (clave: string) => PLANTILLAS_AVISO[clave] ?? "Mensaje";

/** Nombres llanos de los eventos de `app.notificacion.evento` (CONTRATOS §2.1). */
export const EVENTOS: Record<string, string> = {
  pedido_nuevo: "Pedido nuevo",
  pedido_modificado: "Un cliente cambió su pedido",
  pedido_cancelado_cliente: "Un cliente canceló su pedido",
  faltante_respondido: "Un cliente contestó un faltante",
  surtido_listo: "La lista de compra está lista",
  ruta_asignada: "Te asignaron una ruta",
  entrega_fallida: "No se pudo entregar un pedido",
  ubicacion_propuesta: "Un cliente mandó su ubicación",
  dispositivo_nuevo: "Abrieron un link en un aparato nuevo",
  pin_ataque: "Muchos intentos fallidos de números en un link",
  visitas_sin_pedido: "Un cliente entra y no pide",
  cliente_inactivo: "Un cliente lleva tiempo sin pedir",
};

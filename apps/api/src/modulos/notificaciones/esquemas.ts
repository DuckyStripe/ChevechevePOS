import { z } from "zod";
import { idEsquema } from "../../comun/ids.js";
import { booleanoQuery, esquemaPagina } from "../../comun/paginacion.js";

// Misma lista que el CHECK de app.notificacion.evento (001 + pin_ataque de 004).
export const EVENTOS = [
  "pedido_nuevo", "pedido_modificado", "pedido_cancelado_cliente", "faltante_respondido", "surtido_listo",
  "ruta_asignada", "entrega_fallida", "ubicacion_propuesta", "dispositivo_nuevo", "visitas_sin_pedido", "cliente_inactivo", "pin_ataque",
] as const;

export const esquemaListaNotificaciones = esquemaPagina.extend({ no_leidas: booleanoQuery.optional() });
export const esquemaLeer = z.object({ ids: z.array(idEsquema).max(500).optional() });
export const esquemaPreferencias = z.object({
  preferencias: z.array(z.object({ evento: z.enum(EVENTOS), push: z.boolean() })).max(EVENTOS.length),
});

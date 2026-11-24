import { z } from "zod";
import { idEsquema } from "../../comun/ids.js";
import { esquemaPagina } from "../../comun/paginacion.js";

export const esquemaListaAvisos = esquemaPagina.extend({
  estado: z.enum(["pendiente", "enviado", "descartado"]).default("pendiente"),
  cliente_id: idEsquema.optional(),
  pedido_id: idEsquema.optional(),
});

/** Solo las plantillas que se mandan a mano (CONTRATOS §4.4); las de pedido las crea SQL. */
export const esquemaCrearAviso = z.object({
  clave_idempotencia: z.uuid(),
  cliente_id: idEsquema,
  plantilla: z.enum(["wa_recordatorio_saldo", "wa_enlace_cliente", "wa_datos_transferencia"]),
  pedido_id: idEsquema.optional(),
});

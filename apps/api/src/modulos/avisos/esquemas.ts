import { z } from "zod";
import { idEsquema } from "../../comun/ids.js";
import { esquemaPagina } from "../../comun/paginacion.js";

export const esquemaListaAvisos = esquemaPagina.extend({
  estado: z.enum(["pendiente", "enviado", "descartado"]).default("pendiente"),
  cliente_id: idEsquema.optional(),
  pedido_id: idEsquema.optional(),
});

/** Solo las plantillas que se mandan a mano (CONTRATOS §4.4); las de pedido las crea SQL. */
const aviso = z.object({
  clave_idempotencia: z.uuid(),
  cliente_id: idEsquema,
  plantilla: z.enum(["wa_recordatorio_saldo", "wa_enlace_cliente", "wa_datos_transferencia", "wa_estado_cuenta"]),
  pedido_id: idEsquema.optional(),
});
/** El resumen del dia va al dueño (la API lo resuelve; no se pide `usuario_id`): uno por dia, asi que no lleva clave de idempotencia. */
const resumenDia = z.object({ plantilla: z.literal("wa_resumen_dia"), fecha: z.iso.date().optional() });
export const esquemaCrearAviso = z.union([resumenDia, aviso]);

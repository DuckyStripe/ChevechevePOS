import { z } from "zod";
import { idEsquema } from "../../comun/ids.js";
import { esquemaPagina } from "../../comun/paginacion.js";

export const esquemaListaAuditoria = esquemaPagina.extend({
  tabla: z.string().regex(/^[a-z_]+$/).max(60).optional(),
  registro_id: z.string().max(100).optional(),
  usuario_id: idEsquema.optional(),
  desde: z.iso.date().optional(),
  hasta: z.iso.date().optional(),
});

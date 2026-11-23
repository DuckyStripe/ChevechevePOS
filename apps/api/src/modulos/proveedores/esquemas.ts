import { z } from "zod";
import { booleanoQuery, esquemaPagina } from "../../comun/paginacion.js";

export const esquemaListaProveedores = esquemaPagina.extend({
  buscar: z.string().trim().min(1).max(100).optional(),
  activo: booleanoQuery.optional(),
});

export const esquemaCrearProveedor = z.object({
  nombre: z.string().trim().min(1).max(100),
  telefono: z.string().trim().max(30).nullable().optional(),
  contacto: z.string().trim().max(100).nullable().optional(),
  notas: z.string().trim().max(500).nullable().optional(),
  activo: z.boolean().optional(),
});
export const esquemaEditarProveedor = esquemaCrearProveedor.partial();

import { z } from "zod";
import { booleanoQuery, esquemaPagina } from "../../comun/paginacion.js";

const nombre = z.string().trim().min(1).max(100);
/** Fraccion 0-0.9 como string decimal ("0.2000"): solo se valida, no se calcula con ella. */
export const margen = z
  .string()
  .regex(/^\d(\.\d{1,4})?$/, "Usa un decimal entre 0 y 0.9")
  .refine((v) => Number(v) <= 0.9, "Usa un decimal entre 0 y 0.9");

export const esquemaListaCategorias = esquemaPagina.extend({ activa: booleanoQuery.optional() });

export const esquemaCrearCategoria = z.object({
  nombre,
  orden: z.number().int().min(0).max(32000).optional(),
  margen_objetivo: margen.nullable().optional(),
  activa: z.boolean().optional(),
});
export const esquemaEditarCategoria = esquemaCrearCategoria.partial();

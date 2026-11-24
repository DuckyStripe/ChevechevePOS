import { z } from "zod";

export const esquemaAnio = z.object({ anio: z.coerce.number().int().min(2000).max(2100).optional() });

export const esquemaGuardarFechas = z.object({
  anio: z.number().int().min(2000).max(2100).optional(),
  fechas: z
    .array(z.object({ fecha: z.iso.date(), nombre: z.string().trim().min(1).max(60), factor: z.number().min(0.1).max(5) }))
    .max(400),
});

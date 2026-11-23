import { z } from "zod";

const permisos = z.array(z.string().regex(/^[a-z_]+\.[a-z_]+$/)).max(500).transform((a) => [...new Set(a)]);

export const esquemaCrearRol = z.object({
  nombre: z.string().trim().min(1).max(60),
  descripcion: z.string().trim().max(200).nullable().optional(),
  permisos,
});

export const esquemaEditarRol = esquemaCrearRol.partial();

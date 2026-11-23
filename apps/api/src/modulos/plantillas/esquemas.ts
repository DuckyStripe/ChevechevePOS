import { z } from "zod";

export const esquemaListaPlantillas = z.object({ canal: z.enum(["whatsapp", "push", "pantalla"]).optional() });
export const paramClave = z.object({ clave: z.string().regex(/^[a-z_]+$/).max(80) });

export const esquemaEditarPlantilla = z.object({
  titulo: z.string().trim().min(1).max(100).optional(),
  texto: z.string().min(1).max(1000),
});

export const esquemaVistaPrevia = z.object({
  vars: z.record(z.string(), z.union([z.string(), z.number()]).transform(String)).default({}),
});

/** Nombres usados como {{nombre}} dentro de un texto. */
export function variablesUsadas(texto: string): string[] {
  return [...texto.matchAll(/\{\{([^{}]*)\}\}/g)].map((m) => m[1]!);
}

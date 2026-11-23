import { z } from "zod";

/** id bigint: llega como string de digitos (o numero) y se maneja siempre como string. */
export const idEsquema = z.union([z.string().regex(/^[1-9]\d{0,17}$/), z.number().int().positive().max(Number.MAX_SAFE_INTEGER)]).transform(String);
export const paramId = z.object({ id: idEsquema });

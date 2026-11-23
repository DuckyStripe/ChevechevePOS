import { z } from "zod";

export const esquemaPagina = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  por_pagina: z.coerce.number().int().min(1).max(200).default(50),
});
export type Pagina = z.infer<typeof esquemaPagina>;

export const offset = (p: Pagina): number => (p.pagina - 1) * p.por_pagina;

/** Forma de toda lista (CONTRATOS §4.2). `total` llega de `count(*) over()` como string. */
export function listado<T>(items: T[], total: number | string, p: Pagina) {
  return { items, total: Number(total), pagina: p.pagina, por_pagina: p.por_pagina };
}

/** Booleano de query string: "true"/"1" y "false"/"0". */
export const booleanoQuery = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

/** Lista desde filas con columna `total` (`count(*) over()`): la quita de cada item. */
export function listadoDeFilas<T extends { total: string }>(filas: T[], p: Pagina) {
  const items = filas.map((f) => {
    const copia: Partial<T> = { ...f };
    delete copia.total;
    return copia as Omit<T, "total">;
  });
  return listado(items, filas[0]?.total ?? 0, p);
}

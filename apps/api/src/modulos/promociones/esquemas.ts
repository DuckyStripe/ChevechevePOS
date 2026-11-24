import { z } from "zod";
import { idEsquema } from "../../comun/ids.js";
import { booleanoQuery, esquemaPagina } from "../../comun/paginacion.js";

const fecha = z.iso.date();
const costo = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Usa un costo como 280 o 280.50");

export const esquemaListaPromociones = esquemaPagina.extend({
  vigentes: booleanoQuery.optional(),
  proveedor_id: idEsquema.optional(),
});

export const esquemaCrearPromocion = z
  .object({
    proveedor_id: idEsquema,
    presentacion_id: idEsquema,
    costo_presentacion: costo,
    minimo_cantidad: z.number().int().min(1).max(1_000_000).optional(),
    desde: fecha,
    hasta: fecha,
    notas: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .refine((p) => p.hasta >= p.desde, { path: ["hasta"], message: "La promocion no puede terminar antes de empezar" });

export const esquemaEditarPromocion = z.object({
  proveedor_id: idEsquema.optional(),
  presentacion_id: idEsquema.optional(),
  costo_presentacion: costo.optional(),
  minimo_cantidad: z.number().int().min(1).max(1_000_000).optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  notas: z.string().trim().min(1).max(500).nullable().optional(),
});

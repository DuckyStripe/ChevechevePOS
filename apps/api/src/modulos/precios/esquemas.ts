import { z } from "zod";
import { idEsquema } from "../../comun/ids.js";
import { idsCsv } from "../productos/esquemas.js";
import { booleanoQuery, esquemaPagina } from "../../comun/paginacion.js";

/** Importe como string decimal ("306.00"): solo se valida el formato. */
export const dinero = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Usa un importe como 280 o 280.50");
const fecha = z.iso.date();

export const esquemaCrearLista = z.object({ nombre: z.string().trim().min(1).max(60) });
export const esquemaEditarLista = z.object({
  nombre: z.string().trim().min(1).max(60).optional(),
  es_predeterminada: z.boolean().optional(),
  activa: z.boolean().optional(),
});

export const esquemaGuardarPrecios = z.object({
  precios: z
    .array(z.object({ presentacion_id: idEsquema, lista_precio_id: idEsquema, precio: dinero }))
    .min(1)
    .max(500)
    .refine((xs) => new Set(xs.map((x) => `${x.presentacion_id}:${x.lista_precio_id}`)).size === xs.length, "Hay precios repetidos"),
});

export const esquemaBajoCosto = z.object({ lista_precio_id: idEsquema.optional() });

export const esquemaSugeridos = z.object({
  producto_ids: idsCsv(200),
});

export const esquemaListaOfertas = esquemaPagina.extend({
  presentacion_id: idEsquema.optional(),
  vigentes: booleanoQuery.optional(),
});

const oferta = {
  lista_precio_id: idEsquema.nullable(),
  precio: dinero,
  desde: fecha,
  hasta: fecha,
  motivo: z.enum(["por_caducar", "promocion"]),
};
export const esquemaCrearOferta = z
  .object({ presentacion_id: idEsquema, ...oferta, lista_precio_id: oferta.lista_precio_id.optional() })
  .refine((o) => o.hasta >= o.desde, { path: ["hasta"], message: "La oferta no puede terminar antes de empezar" });
export const esquemaEditarOferta = z
  .object({
    lista_precio_id: oferta.lista_precio_id.optional(),
    precio: oferta.precio.optional(),
    desde: oferta.desde.optional(),
    hasta: oferta.hasta.optional(),
    motivo: oferta.motivo.optional(),
  })
  .refine((o) => !o.desde || !o.hasta || o.hasta >= o.desde, { path: ["hasta"], message: "La oferta no puede terminar antes de empezar" });

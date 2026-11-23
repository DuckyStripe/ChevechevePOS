import { z } from "zod";
import { idEsquema } from "../../comun/ids.js";
import { esquemaPagina } from "../../comun/paginacion.js";

const fecha = z.iso.date();

export const esquemaListaCompras = esquemaPagina.extend({
  desde: fecha.optional(),
  hasta: fecha.optional(),
  proveedor_id: idEsquema.optional(),
  estado: z.enum(["registrada", "cancelada"]).optional(),
  fecha_surtido: fecha.optional(),
});

export const esquemaCrearCompra = z.object({
  clave_idempotencia: z.uuid(),
  proveedor_id: idEsquema,
  folio_proveedor: z.string().trim().min(1).max(60).optional(),
  fecha,
  condicion_pago: z.enum(["contado", "credito"]),
  fecha_surtido: fecha.optional(),
  notas: z.string().trim().min(1).max(500).optional(),
  lineas: z
    .array(
      z.object({
        presentacion_id: idEsquema,
        cantidad: z.number().int().min(1).max(1_000_000),
        costo_presentacion: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Usa un costo como 300 o 300.50"),
        caduca_el: fecha.optional(),
      }),
    )
    .min(1)
    .max(200),
});

export const esquemaCancelarCompra = z.object({ motivo: z.string().trim().min(1).max(300) });

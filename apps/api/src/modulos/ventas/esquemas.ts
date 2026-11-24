import { z } from "zod";
import { dinero, pagosEsquema } from "../../comun/dinero.js";
import { idEsquema } from "../../comun/ids.js";
import { esquemaPagina } from "../../comun/paginacion.js";

export const esquemaVenta = z.object({
  clave_idempotencia: z.uuid(),
  cliente_id: idEsquema.optional(),
  lista_precio_id: idEsquema.optional(),
  lineas: z.array(z.object({ presentacion_id: idEsquema, cantidad: z.number().int().min(1).max(1_000_000), precio_unitario: dinero.optional() })).min(1).max(200),
  pagos: pagosEsquema,
  efectivo_recibido: dinero.optional(),
  notas: z.string().trim().min(1).max(500).optional(),
});

export const esquemaListaVentas = esquemaPagina.extend({
  desde: z.iso.date().optional(),
  hasta: z.iso.date().optional(),
  usuario_id: idEsquema.optional(),
  cliente_id: idEsquema.optional(),
  origen: z.enum(["mostrador", "pedido"]).optional(),
  estado: z.enum(["completada", "cancelada"]).optional(),
  folio: z.string().trim().min(1).max(30).optional(),
});

export const esquemaCancelarVenta = z.object({ motivo: z.string().trim().min(1).max(200) });

export const esquemaDevolucion = z.object({
  clave_idempotencia: z.uuid(),
  motivo: z.string().trim().min(1).max(200),
  lineas: z.array(z.object({ venta_linea_id: idEsquema, piezas: z.number().int().min(1).max(1_000_000), regresa_a_inventario: z.boolean() })).min(1).max(200),
});

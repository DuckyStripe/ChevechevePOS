import { z } from "zod";
import { comprobanteNombre, dinero, metodoPago } from "../../comun/dinero.js";
import { idEsquema } from "../../comun/ids.js";

export const esquemaContexto = z
  .object({ pedido: idEsquema.optional(), cliente: idEsquema.optional(), parada: idEsquema.optional() })
  .refine((q) => (q.pedido === undefined) !== (q.cliente === undefined), "Indica un pedido o un cliente");

/** Pago de la vista previa: `monto: null` = «el resto» (a lo mas uno). */
const pagoVista = z.object({
  metodo: metodoPago,
  monto: dinero.nullable(),
  referencia: z.string().trim().max(80).optional(),
  comprobante: comprobanteNombre.optional(),
});

const comunes = { pagos: z.array(pagoVista).max(4), efectivo_recibido: dinero.optional() };

/** Entrega de un pedido: lineas omitidas = completo. */
const vistaEntrega = z.object({
  pedido_id: idEsquema,
  lineas: z.array(z.object({ pedido_linea_id: idEsquema, cantidad_entregada: z.number().int().min(0).max(1_000_000) })).max(200).optional(),
  con_regalo: z.boolean().optional(),
  ...comunes,
});
/** Venta de mostrador (/pos): sin pedido. */
const vistaVenta = z.object({
  cliente_id: idEsquema.optional(),
  lista_precio_id: idEsquema.optional(),
  lineas: z.array(z.object({ presentacion_id: idEsquema, cantidad: z.number().int().min(1).max(1_000_000), precio_unitario: dinero.optional() })).min(1).max(200),
  ...comunes,
});
export const esquemaVista = z.union([vistaEntrega, vistaVenta]);

import { z } from "zod";

/** Importe de entrada: string con a lo mas 2 decimales y tope de 9,999,999.99 (lo que cabe sin desbordar los numeric(12,2) de sumas). La aritmetica es de SQL. */
export const dinero = z.string().regex(/^\d{1,7}(\.\d{1,2})?$/, "Usa un importe como 280 o 280.50");

export const comprobanteNombre = z.string().regex(/^[0-9a-f]{64}\.(jpg|png|webp)$/, "Foto no valida");

/** Metodos de cobro de una entrega o venta. */
export const metodoPago = z.enum(["efectivo", "transferencia", "tarjeta", "credito"]);

export const pagoEsquema = z.object({
  metodo: metodoPago,
  monto: dinero,
  referencia: z.string().trim().max(80).optional(),
  comprobante: comprobanteNombre.optional(),
});
export const pagosEsquema = z.array(pagoEsquema).max(4);

/** Forma comun de un saldo de cliente (v_saldo_cliente), todo en string de SQL. */
export const SALDO_CLIENTE = (alias: string) =>
  `json_build_object('saldo', ${alias}.saldo::text, 'vencido', ${alias}.vencido::text, 'disponible', ${alias}.disponible::text)`;

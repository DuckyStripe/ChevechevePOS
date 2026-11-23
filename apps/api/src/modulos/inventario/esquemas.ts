import { z } from "zod";
import { idEsquema } from "../../comun/ids.js";
import { booleanoQuery, esquemaPagina } from "../../comun/paginacion.js";

const TIPOS = [
  "inventario_inicial", "compra", "cancelacion_venta", "devolucion_venta", "ajuste_entrada", "traspaso_entrada",
  "venta", "cancelacion_compra", "ajuste_salida", "merma", "traspaso_salida", "revaluacion",
] as const;
const CAUSAS = ["caducado", "danado", "faltante", "regalo", "otro"] as const;
const costo = z.string().regex(/^\d{1,8}(\.\d{1,6})?$/, "Usa un costo como 12.5");
const fecha = z.iso.date();

export const esquemaExistencias = esquemaPagina.extend({
  buscar: z.string().trim().min(1).max(100).optional(),
  categoria_id: idEsquema.optional(),
  modo_surtido: z.enum(["inventario", "contra_pedido"]).optional(),
  bajo_minimo: booleanoQuery.optional(),
});

export const esquemaMovimientos = esquemaPagina.extend({
  producto_id: idEsquema.optional(),
  tipo: z.enum(TIPOS).optional(),
  causa_merma: z.enum(CAUSAS).optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
});

export const esquemaAjuste = z
  .object({
    producto_id: idEsquema,
    tipo: z.enum(["inventario_inicial", "ajuste_entrada", "ajuste_salida", "merma"]),
    piezas: z.number().int().min(1).max(10_000_000),
    costo_unitario: costo.optional(),
    motivo: z.string().trim().min(1).max(300).optional(),
    causa_merma: z.enum(CAUSAS).optional(),
    clave_idempotencia: z.uuid().optional(),
  })
  .refine((a) => a.tipo !== "merma" || a.causa_merma, { path: ["causa_merma"], message: "La merma necesita su causa" });

export const esquemaConteo = z.object({
  producto_id: idEsquema,
  piezas_contadas: z.number().int().min(0).max(10_000_000),
  motivo: z.string().trim().min(1).max(300),
  clave_idempotencia: z.uuid().optional(),
});

export const esquemaRevaluacion = z.object({
  producto_id: idEsquema,
  costo_unitario: costo,
  motivo: z.string().trim().min(1).max(300),
});

export const esquemaPorCaducar = esquemaPagina.extend({
  dias: z.coerce.number().int().min(0).max(3650).optional(),
  por_pagina: z.coerce.number().int().min(1).max(200).default(200),
});

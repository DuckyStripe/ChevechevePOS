import { z } from "zod";
import { idEsquema } from "../../comun/ids.js";
import { booleanoQuery, esquemaPagina } from "../../comun/paginacion.js";

const fecha = z.iso.date();
export const dinero = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Usa un importe como 300 o 300.50");
const cantidad = z.number().int().min(1).max(99_999);
const entregaTipo = z.enum(["reparto", "recoge"]);

export const ESTADOS_PEDIDO = ["propuesto", "recibido", "esperando_cliente", "confirmado", "cargado", "en_ruta", "entregado", "no_entregado", "cancelado"] as const;

export const esquemaListaPedidos = esquemaPagina.extend({
  estado: z.enum(ESTADOS_PEDIDO).optional(),
  fecha_entrega: fecha.optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  cliente_id: idEsquema.optional(),
  zona_id: idEsquema.optional(),
  ruta_id: idEsquema.optional(),
  sin_ruta: booleanoQuery.optional(),
  origen: z.enum(["enlace", "captura", "sugerido"]).optional(),
});

export const lineasNuevas = z.array(z.object({ presentacion_id: idEsquema, cantidad })).min(1).max(100);

export const esquemaCrearPedido = z.object({
  clave_idempotencia: z.uuid(),
  cliente_id: idEsquema,
  lineas: lineasNuevas,
  notas: z.string().trim().min(1).max(500).optional(),
  entrega_tipo: entregaTipo.optional(),
  fecha_solicitada: fecha.optional(),
  correcciones: z.array(z.object({ texto: z.string().trim().min(1).max(200), presentacion_id: idEsquema })).max(100).optional(),
});

const ajusteLinea = z.object({
  pedido_linea_id: idEsquema,
  cantidad: z.number().int().min(0).max(99_999).optional(),
  precio_unitario: dinero.optional(),
  motivo_ajuste: z.string().trim().min(1).max(200).optional(),
});
const agregar = z.array(z.object({ presentacion_id: idEsquema, cantidad })).max(100);

export const esquemaConfirmar = z.object({
  version: z.number().int().min(1),
  fecha_entrega: fecha,
  entrega_tipo: entregaTipo.optional(),
  lineas: z.array(ajusteLinea).max(200).optional(),
  agregar: agregar.optional(),
  notas_internas: z.string().trim().min(1).max(1000).optional(),
});

export const esquemaAjustar = z.object({
  version: z.number().int().min(1).optional(),
  lineas: z.array(ajusteLinea).max(200).optional(),
  agregar: agregar.optional(),
});

export const esquemaFaltantes = z.object({
  version: z.number().int().min(1),
  fecha_entrega: fecha.optional(),
  entrega_tipo: entregaTipo.optional(),
  lineas: z
    .array(
      z.object({
        pedido_linea_id: idEsquema,
        causa: z.enum(["sin_existencia", "proveedor_sin_producto", "danado", "otro"]),
        nota: z.string().trim().min(1).max(300).optional(),
        opciones: z
          .array(z.object({ tipo: z.enum(["sustituto", "reducir"]), presentacion_id: idEsquema.optional(), cantidad }))
          .max(10),
      }),
    )
    .min(1)
    .max(100),
});

export const esquemaSugerencias = z.object({ pedido_linea_id: idEsquema });
export const esquemaResponder = z.object({ opcion_id: idEsquema.nullable() });
export const esquemaCancelar = z.object({ motivo: z.string().trim().min(1).max(300) });
export const esquemaReprogramar = z.object({ fecha_entrega: fecha });
export const esquemaInterpretar = z.object({ cliente_id: idEsquema, texto: z.string().trim().min(1).max(2000) });

/** Cuerpos del enlace del cliente (los usa `modulos/publico`). `total_visto` es obligatorio: el cliente dice que total vio. */
export const esquemaPedidoCliente = z.object({
  clave_idempotencia: z.uuid(),
  lineas: lineasNuevas,
  total_visto: dinero,
  notas: z.string().trim().min(1).max(500).optional(),
  entrega_tipo: entregaTipo.optional(),
  fecha_solicitada: fecha.optional(),
});
export const esquemaEditarPedidoCliente = z.object({
  lineas: lineasNuevas,
  total_visto: dinero,
  notas: z.string().trim().max(500).optional(),
  entrega_tipo: entregaTipo.optional(),
  fecha_solicitada: fecha.optional(),
});

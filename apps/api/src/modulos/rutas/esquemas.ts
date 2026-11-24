import { z } from "zod";
import { dinero } from "../../comun/dinero.js";
import { idEsquema } from "../../comun/ids.js";
import { esquemaPagina } from "../../comun/paginacion.js";

export const esquemaListaRutas = esquemaPagina.extend({
  fecha: z.iso.date().optional(),
  estado: z.enum(["planeada", "cargada", "en_curso", "terminada", "liquidada", "cancelada"]).optional(),
  repartidor_id: idEsquema.optional(),
});

export const esquemaCrearRuta = z.object({
  fecha: z.iso.date(),
  nombre: z.string().trim().min(1).max(80).optional(),
  vehiculo_id: idEsquema,
  repartidor_id: idEsquema,
});

export const esquemaAsignar = z.object({ pedido_ids: z.array(idEsquema).min(1).max(200) });
export const esquemaOrden = z.object({ paradas: z.array(idEsquema).max(200) });
/** `motivo` es una clave (su texto sale de la plantilla `motivo_<clave>`); `otro` lleva la nota escrita. */
export const esquemaNoEntregado = z
  .object({ motivo: z.enum(["cerrado", "no_estaba", "no_quiso", "otro"]), nota: z.string().trim().min(1).max(200).optional() })
  .refine((d) => d.motivo !== "otro" || d.nota !== undefined, "Falta contar que paso");
/** Fondo para dar cambio que se lleva el repartidor (turno de ruta); por omision 0. */
export const esquemaIniciar = z.object({ fondo_inicial: dinero.default("0.00") });
export const esquemaCobro = z.object({ cliente_id: idEsquema });

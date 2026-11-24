import { z } from "zod";
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
export const esquemaNoEntregado = z.object({ motivo: z.string().trim().min(1).max(200) });
/** F6 ignora el fondo (lo pide F7 al abrir el turno de ruta): se acepta y no se usa. */
export const esquemaIniciar = z.object({ fondo_inicial: z.union([z.string(), z.number()]).optional() });

import { z } from "zod";
import { booleanoQuery, esquemaPagina } from "../../comun/paginacion.js";

const nombre = z.string().trim().min(1).max(100);
const placas = z.string().trim().min(1).max(20).nullable();
const capacidad = z.number().int().min(1).max(100000).nullable();

export const esquemaListaVehiculos = esquemaPagina.extend({ activo: booleanoQuery.optional() });
export const esquemaCrearVehiculo = z.object({ nombre, placas: placas.optional(), capacidad_cajas: capacidad.optional(), activo: z.boolean().optional() });
export const esquemaEditarVehiculo = z
  .object({ nombre: nombre.optional(), placas: placas.optional(), capacidad_cajas: capacidad.optional(), activo: z.boolean().optional() })
  .refine((d) => Object.keys(d).length > 0, "Nada que cambiar");

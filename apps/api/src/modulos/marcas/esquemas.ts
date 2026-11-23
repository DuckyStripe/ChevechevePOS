import { z } from "zod";
import { booleanoQuery, esquemaPagina } from "../../comun/paginacion.js";

export const esquemaListaMarcas = esquemaPagina.extend({ activa: booleanoQuery.optional() });

export const esquemaCrearMarca = z.object({ nombre: z.string().trim().min(1).max(100), activa: z.boolean().optional() });
export const esquemaEditarMarca = esquemaCrearMarca.partial();

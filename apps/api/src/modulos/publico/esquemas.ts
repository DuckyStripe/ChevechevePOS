import { z } from "zod";
import { idEsquema } from "../../comun/ids.js";
import { enMexico } from "../clientes/ubicacion.js";

export const esquemaPin = z.object({ pin: z.string().regex(/^\d{4}$/, "El PIN son 4 numeros") });
export const paramPresentacion = z.object({ presentacion_id: idEsquema });
export const esquemaResponderCliente = z.object({ opcion_id: idEsquema.nullable() });
export const esquemaCancelarCliente = z.object({ motivo: z.string().trim().min(1).max(300).optional() });
export const esquemaAceptar = z.object({ total_visto: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/) });

const coord = z.union([z.string().regex(/^-?\d{1,3}(\.\d+)?$/), z.number()]).transform(Number);
/** El GPS del telefono manda `precision_m`: mas de 100 m no sirve para ubicar una tienda. */
export const esquemaUbicacionCliente = z
  .object({ lat: coord, lng: coord, precision_m: z.number().min(0).max(100) })
  .refine((d) => enMexico(d.lat, d.lng), { message: "Fuera de Mexico", path: ["lat"] });

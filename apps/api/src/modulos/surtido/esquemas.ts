import { z } from "zod";
import { idEsquema } from "../../comun/ids.js";

const fecha = z.iso.date();

export const esquemaSurtido = z.object({ fecha: fecha.optional(), ruta_id: idEsquema.optional() });
export const esquemaMensaje = z.object({ fecha: fecha.optional(), proveedor_id: idEsquema });
export const esquemaPublicar = z.object({ fecha });

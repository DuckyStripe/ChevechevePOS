import { z } from "zod";
import { idEsquema } from "../../comun/ids.js";

// `agrupar` es una lista blanca (z.enum): el servicio la traduce a columnas con un mapa fijo y nunca interpola texto del cliente.
const fecha = z.iso.date();
const rango = { desde: fecha.optional(), hasta: fecha.optional() };

export const esquemaVentas = z.object({
  ...rango,
  agrupar: z.enum(["dia", "mes", "usuario", "cliente", "zona", "ruta", "origen", "producto", "categoria", "metodo"]).default("dia"),
});
export const esquemaCompras = z.object({ ...rango, agrupar: z.enum(["dia", "mes", "proveedor", "producto", "categoria"]).default("dia") });
export const esquemaUtilidad = z.object({ ...rango, agrupar: z.enum(["dia", "mes", "producto", "categoria", "origen"]).default("dia") });
export const esquemaEntregas = z.object({ ...rango, agrupar: z.enum(["dia", "ruta", "repartidor", "zona", "cliente"]).default("dia") });
export const esquemaFaltantes = z.object({ ...rango, agrupar: z.enum(["producto", "proveedor"]).default("producto") });
export const esquemaGanancia = z.object({ ...rango, agrupar: z.enum(["cliente", "ruta", "zona"]).default("cliente") });
export const esquemaValorizado = z.object({ categoria_id: idEsquema.optional() });
export const esquemaCxc = z.object({ al: fecha.optional(), zona_id: idEsquema.optional() });
export const esquemaCortes = z.object({
  ...rango,
  tipo: z.enum(["mostrador", "ruta"]).optional(),
  usuario_id: idEsquema.optional(),
  caja_id: idEsquema.optional(),
});

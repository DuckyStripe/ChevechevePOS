import { z } from "zod";
import { idEsquema } from "../../comun/ids.js";
import { booleanoQuery, esquemaPagina } from "../../comun/paginacion.js";
import { enMexico } from "./ubicacion.js";

const texto = (max: number) => z.string().trim().min(1).max(max);
const diasVisita = z.array(z.number().int().min(1).max(7)).max(7).refine((d) => new Set(d).size === d.length, "Dias repetidos");

export const esquemaListaClientes = esquemaPagina.extend({
  buscar: z.string().trim().min(1).max(100).optional(),
  zona_id: idEsquema.optional(),
  dia_visita: z.coerce.number().int().min(1).max(7).optional(),
  sin_ubicacion: booleanoQuery.optional(),
  con_propuesta: booleanoQuery.optional(),
  con_saldo: booleanoQuery.optional(), // el saldo llega con F7: hasta entonces no filtra
  alerta: z.enum(["visitas", "inactivo", "dispositivo_nuevo"]).optional(),
  enlace: z.enum(["activo", "sin_activar", "dado_de_baja", "sin_link"]).optional(),
  activo: booleanoQuery.optional(),
});

const campos = {
  nombre: texto(200),
  tipo_negocio: z.enum(["tienda", "miscelanea", "deposito", "restaurante", "otro"]),
  contacto: texto(200).nullable(),
  telefono_whatsapp: z.string().regex(/^\d{12,13}$/, "Escribe el telefono con lada: 52 y 10 digitos").nullable(),
  direccion: texto(500).nullable(),
  referencias: texto(500).nullable(),
  notas: texto(1000).nullable(),
  zona_id: idEsquema.nullable(),
  dias_visita: diasVisita,
  sugerir_pedido: z.boolean(),
  activo: z.boolean(),
};
// Lista de precios, limite y dias de credito: solo con `clientes.credito` (se exige despues del parse).
const credito = {
  lista_precio_id: idEsquema,
  limite_credito: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Usa un importe como 5000 o 5000.50"),
  dias_credito: z.number().int().min(0).max(365),
};

export const esquemaCrearCliente = z.object({ ...campos, ...credito, tipo_negocio: campos.tipo_negocio.optional(), dias_visita: diasVisita.optional(), sugerir_pedido: campos.sugerir_pedido.optional(), activo: campos.activo.optional() })
  .partial()
  .required({ nombre: true });
export const esquemaEditarCliente = z.object({ ...campos, ...credito }).partial().refine((d) => Object.keys(d).length > 0, "Nada que cambiar");
export const CAMPOS_CREDITO = Object.keys(credito);

const coord = z.union([z.string().regex(/^-?\d{1,3}(\.\d+)?$/), z.number()]).transform(Number);
export const esquemaUbicacion = z.union([
  z.object({ texto: texto(500) }),
  z.object({ lat: coord, lng: coord, fuente: z.enum(["mapa", "app"]) }).refine((d) => enMexico(d.lat, d.lng), "Fuera de Mexico"),
]);

export const esquemaEnlace = z.object({ forzar: z.boolean().optional() });
export const esquemaRevocar = z
  .object({
    cliente_ids: z.array(idEsquema).min(1).max(200),
    motivo: z.enum(["reenviado", "ya_no_es_cliente", "solo_cotiza", "otro"]),
    nota: texto(300).optional(),
  })
  .refine((d) => d.motivo !== "otro" || !!d.nota, { message: "Escribe cual es el motivo", path: ["nota"] });
export const paramDispositivo = z.object({ id: idEsquema, dispositivo_id: idEsquema });

export const esquemaListaZonas = esquemaPagina.extend({ activa: booleanoQuery.optional() });
export const esquemaCrearZona = z.object({ nombre: texto(100), activa: z.boolean().optional() });
export const esquemaEditarZona = z.object({ nombre: texto(100).optional(), activa: z.boolean().optional() }).refine((d) => Object.keys(d).length > 0, "Nada que cambiar");

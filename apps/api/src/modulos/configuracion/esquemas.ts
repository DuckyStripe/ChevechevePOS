import { z } from "zod";

const texto = (max: number) => z.string().trim().max(max);
const entero = (min: number, max: number) => z.number().int().min(min).max(max);
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const dinero = z.string().trim().regex(/^\d{1,10}(\.\d{1,2})?$/).transform((s) => {
  const [e = "0", d = ""] = s.split(".");
  return `${e}.${d.padEnd(2, "0")}`;
});
const origen = z.string().trim().refine((v) => {
  if (v === "") return true;
  try {
    const u = new URL(v);
    return (u.protocol === "https:" || u.protocol === "http:") && u.origin === v;
  } catch {
    return false;
  }
}, "Debe ser solo el origen, ej. https://pedidos.ejemplo.com");

// Una entrada por clave sembrada en 001 (respaldo_ultima_prueba es de solo lectura: no se edita aqui).
export const CLAVES_EDITABLES = {
  negocio_nombre: texto(100),
  negocio_telefono: texto(30),
  negocio_direccion: texto(200),
  negocio_whatsapp: z.string().trim().regex(/^(\d{10,15})?$/),
  ticket_pie: texto(200),
  credito_dias_predeterminado: entero(0, 365),
  pedido_minimo: dinero,
  hora_corte: hora,
  dias_aviso_caducidad: entero(0, 3650),
  url_publica: origen,
  faltante_minutos_respuesta: entero(1, 1440),
  faltante_accion_predeterminada: z.enum(["quitar", "reducir"]),
  reparto_minutos_por_parada: entero(1, 240),
  reparto_velocidad_kmh: entero(1, 120),
  transferencia_banco: texto(100),
  transferencia_titular: texto(100),
  transferencia_clabe: z.string().trim().regex(/^(\d{18})?$/),
  margen_objetivo: z.string().trim().regex(/^(0(\.\d{1,4})?|1(\.0{1,4})?)$/),
  precio_redondeo: dinero,
  sugerencia_dias_tolerancia: entero(0, 30),
  sugerencia_vigencia_horas: entero(1, 168),
  sugerencia_hora: hora,
  compra_cobertura_dias: entero(1, 365),
  compra_promedio_dias: entero(1, 365),
  semaforo_dias_rojo: entero(1, 365),
  visitas_umbral: entero(1, 100),
  visitas_dias: entero(1, 365),
  inactividad_dias: entero(1, 3650),
  enlace_tras_primera_compra: z.boolean(),
} as const;

const coord = (max: number) =>
  z
    .union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)])
    .transform(String)
    .refine((v) => Math.abs(Number(v)) <= max, "Fuera de rango");

const sucursal = z
  .object({ lat: coord(90).nullable(), lng: coord(180).nullable() })
  .refine((s) => (s.lat === null) === (s.lng === null), "Latitud y longitud van juntas");

export const esquemaEditarConfiguracion = z.object({ ...CLAVES_EDITABLES, sucursal }).partial().strict();

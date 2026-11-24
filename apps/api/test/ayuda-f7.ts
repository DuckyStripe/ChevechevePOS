import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { pool } from "./ayuda.js";
import { pedirPersonal, type ClienteF3 } from "./ayuda-f3.js";
import { clienteEn, type Dueno } from "./ayuda-f6.js";

// F7: lo comun de las pruebas de caja, venta, cobro y liquidacion por la API. Cajas de prueba se llaman `TF7 ...` (las limpia `borrarDinero`).

/** PNG minimo con firma real (los bytes magicos son lo que se revisa). */
export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("prueba-f7-" + randomUUID())]);

/** Cuerpo multipart con una sola parte de archivo; `nombre` es lo que dice el cliente (no importa: el tipo sale de los bytes). */
export function multipart(campo: string, datos: Buffer, nombre = "foto.jpg", tipo = "image/jpeg") {
  const limite = `----f7${randomUUID().replaceAll("-", "")}`;
  const cabeza = Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="${campo}"; filename="${nombre}"\r\nContent-Type: ${tipo}\r\n\r\n`);
  const cola = Buffer.from(`\r\n--${limite}--\r\n`);
  return { payload: Buffer.concat([cabeza, datos, cola]), headers: { "content-type": `multipart/form-data; boundary=${limite}` } };
}

export async function subir(app: FastifyInstance, token: string, datos: Buffer, nombre?: string, campo = "imagen") {
  const m = multipart(campo, datos, nombre);
  return app.inject({ method: "POST", url: "/api/comprobantes", payload: m.payload, headers: { ...m.headers, authorization: `Bearer ${token}`, "x-visitante-ip": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
}

/** Claves cuyo valor es dinero: string con 2 decimales (o null). */
const CLAVES_DINERO = new Set([
  "total", "monto", "saldo", "vencido", "disponible", "limite", "importe", "precio_unitario", "cambio", "efectivo_recibido", "fondo_inicial", "fondo",
  "efectivo_esperado", "efectivo_contado", "diferencia", "reembolso_efectivo", "reembolso_otros", "entradas", "salidas", "retiros", "reembolsos",
  "vendido", "ganancia", "fiado_nuevo", "por_cobrar", "saldo_inicial", "saldo_final", "cargo", "abono", "efectivo", "transferencia", "tarjeta", "credito",
  "pagado", "falta", "saldo_despues", "disponible_despues", "abono_credito", "limite_sugerido", "utilidad", "saldo_credito", "costo_estimado",
]);
/** Recorre la respuesta: todo lo que sea dinero es string `123.45` (nunca numero). Devuelve las rutas que no lo cumplen. */
export function dineroMalo(valor: unknown, ruta = "$"): string[] {
  if (Array.isArray(valor)) return valor.flatMap((v, i) => dineroMalo(v, `${ruta}[${i}]`));
  if (valor && typeof valor === "object") {
    return Object.entries(valor).flatMap(([k, v]) => {
      if (CLAVES_DINERO.has(k) && v !== null && v !== undefined && typeof v !== "object") return typeof v === "string" && /^-?\d+\.\d{2}$/.test(v) ? [] : [`${ruta}.${k}=${JSON.stringify(v)}`];
      return dineroMalo(v, `${ruta}.${k}`);
    });
  }
  return [];
}

/** Cliente con limite y dias de credito (Dueno: clientes.credito). */
export async function conCredito(app: FastifyInstance, dueno: Dueno, cliente: ClienteF3, limite: string, dias = 7): Promise<void> {
  const r = await pedirPersonal(app)("PATCH", `/api/clientes/${cliente.id}`, dueno.token, { limite_credito: limite, dias_credito: dias });
  if (r.statusCode !== 200) throw new Error(`credito: ${r.statusCode} ${r.body}`);
}

export const clienteMx = (app: FastifyInstance, dueno: Dueno, i: number): Promise<ClienteF3> => clienteEn(app, dueno, 19, -99 + 0.01 * i);

/** Hoy en fecha local (para vence_el). */
export async function hoyLocal(mas = 0): Promise<string> {
  return (await pool.query<{ d: string }>("select (app.fn_fecha_local(now()) + $1::int)::text as d", [mas])).rows[0]!.d;
}

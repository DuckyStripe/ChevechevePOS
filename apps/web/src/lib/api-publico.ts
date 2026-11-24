import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getBackendUrl } from "./backend-url";
import { COOKIE_CLIENTE, COOKIE_DISPOSITIVO } from "./cookies";
import { ipVisitante } from "./ip-visitante";
import type { ErrorApi, Resultado } from "./api-servidor";

const SIN_API: ErrorApi = {
  status: 502,
  codigo: "API_NO_DISPONIBLE",
  mensaje: "No se pudo contactar al servidor. Revisa tu señal e intenta de nuevo.",
};

/** Destinos permitidos de `?ir=` (CONTRATOS §2.12 B5); F3: solo `pedido-<digitos>`. */
export function destinoIr(ir: string | null | undefined): string {
  const m = /^pedido-(\d{1,18})$/.exec(ir ?? "");
  return m ? `/pedido/mis-pedidos/${m[1]}` : "/pedido";
}

/** Llamada de bajo nivel a `/api/publico/*` con las cookies del cliente. Sin redirecciones: la usa tambien `/pedido/pin`. */
export async function llamarPublico<T>(ruta: string): Promise<Resultado<T>> {
  const jar = await cookies();
  const token = jar.get(COOKIE_CLIENTE)?.value;
  if (!token) return { ok: false, error: { status: 401, codigo: "ENLACE_INVALIDO", mensaje: "Este link ya no está activo." } };
  const dispositivo = jar.get(COOKIE_DISPOSITIVO)?.value;

  const h: Record<string, string> = { "x-cliente-token": token, "x-visitante-ip": ipVisitante(await headers()) };
  if (dispositivo) h["x-cliente-dispositivo"] = dispositivo;

  let r: Response;
  try {
    r = await fetch(`${getBackendUrl()}/api/publico${ruta}`, { headers: h, cache: "no-store", signal: AbortSignal.timeout(15000) });
  } catch {
    return { ok: false, error: SIN_API };
  }
  const cuerpo = (await r.json().catch(() => null)) as { error?: Partial<ErrorApi> } | T | null;
  if (r.ok) return { ok: true, datos: cuerpo as T };
  const e = (cuerpo as { error?: Partial<ErrorApi> } | null)?.error;
  return {
    ok: false,
    error: { status: r.status, codigo: e?.codigo ?? "ERROR_INTERNO", mensaje: e?.mensaje ?? "Algo salió mal. Intenta de nuevo.", detalles: e?.detalles },
  };
}

/** Lectura desde Server Components del enlace: `ENLACE_INVALIDO` y `PIN_REQUERIDO` mandan a su pantalla; lo demas se devuelve para pintarlo. */
export async function apiPublico<T>(ruta: string): Promise<Resultado<T>> {
  const r = await llamarPublico<T>(ruta);
  if (!r.ok && r.error.codigo === "ENLACE_INVALIDO") redirect("/pedido/invalido");
  if (!r.ok && r.error.codigo === "PIN_REQUERIDO") redirect("/pedido/pin");
  return r;
}

/** Nombre, WhatsApp y textos para las pantallas sin sesion: `GET /api/publico/negocio` (sin token y sin contar como visita). */
export async function datosNegocio(): Promise<DatosSinSesion> {
  try {
    const r = await fetch(`${getBackendUrl()}/api/publico/negocio`, { headers: { "x-visitante-ip": ipVisitante(await headers()) }, cache: "no-store", signal: AbortSignal.timeout(10000) });
    return r.ok ? datosSinSesion(await r.json().catch(() => null)) : {};
  } catch {
    return {};
  }
}

/** Forma de los datos publicos del negocio de `ENLACE_INVALIDO` y `PIN_REQUERIDO` para las pantallas sin sesion. */
export type DatosSinSesion = { negocio?: { nombre?: string; whatsapp?: string }; textos?: { pedir_pin?: string; elegir_pin?: string; enlace_invalido?: string }; tiene_pin?: boolean };
export const datosSinSesion = (detalles: unknown): DatosSinSesion => (detalles && typeof detalles === "object" ? (detalles as DatosSinSesion) : {});
export const whatsappDe = (d: DatosSinSesion) => (d.negocio?.whatsapp ?? "").replace(/\D/g, "") || null;

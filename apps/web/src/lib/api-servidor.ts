import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getBackendUrl } from "./backend-url";
import { COOKIE_JWT } from "./cookies";
import { ipVisitante } from "./ip-visitante";
import type { Yo } from "./tipos";

export type ErrorApi = { codigo: string; mensaje: string; detalles?: unknown; status: number };
export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: ErrorApi };

const SIN_API: ErrorApi = {
  status: 502,
  codigo: "API_NO_DISPONIBLE",
  mensaje: "No se pudo contactar al servidor. Revisa tu conexión e intenta de nuevo.",
};

/** Lectura desde Server Components con el JWT de la cookie. 401 manda a /login; lo demas se devuelve para pintarlo. */
export async function apiServidor<T>(ruta: string, query?: Record<string, string | undefined>): Promise<Resultado<T>> {
  const jwt = (await cookies()).get(COOKIE_JWT)?.value;
  if (!jwt) redirect("/login");

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v) params.set(k, v);
  const qs = params.size ? `?${params}` : "";

  let r: Response;
  try {
    r = await fetch(`${getBackendUrl()}/api${ruta}${qs}`, {
      headers: { authorization: `Bearer ${jwt}`, "x-visitante-ip": ipVisitante(await headers()) },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return { ok: false, error: SIN_API };
  }
  if (r.status === 401) redirect("/login");

  const cuerpo = (await r.json().catch(() => null)) as { error?: Partial<ErrorApi> } | T | null;
  if (r.ok) return { ok: true, datos: cuerpo as T };
  const e = (cuerpo as { error?: Partial<ErrorApi> } | null)?.error;
  return {
    ok: false,
    error: { status: r.status, codigo: e?.codigo ?? "ERROR_INTERNO", mensaje: e?.mensaje ?? "Algo salió mal. Intenta de nuevo.", detalles: e?.detalles },
  };
}

/** Quien esta en sesion; una sola llamada por peticion aunque la pidan el layout y la pagina. */
export const obtenerYo = cache(() => apiServidor<Yo>("/auth/yo"));

export const tiene = (yo: Yo, permiso: string) => yo.permisos.includes(permiso);

import { NextResponse, type NextRequest } from "next/server";
import { getBackendUrl } from "./backend-url";
import { COOKIE_JWT } from "./cookies";
import { ipVisitante } from "./ip-visitante";

const TIMEOUT_MS = Number(process.env.BACKEND_TIMEOUT_MS ?? 15000);
const MAX_BODY_BYTES = 1_048_576;

const MENSAJES = {
  ORIGEN_INVALIDO: "La peticion no viene de esta pagina.",
  ARCHIVO_GRANDE: "El archivo es demasiado grande.",
  API_NO_DISPONIBLE: "No se pudo contactar al servidor. Revisa tu conexion e intenta de nuevo.",
  TIEMPO_AGOTADO: "El servidor tardo demasiado en responder. Intenta de nuevo.",
} as const;

export function errorBff(codigo: keyof typeof MENSAJES, status: number): NextResponse {
  return NextResponse.json({ error: { codigo, mensaje: MENSAJES[codigo] } }, { status });
}

/** Las escrituras solo valen si el `Origin` es el host propio (frena CSRF; con SameSite=Lax es la segunda barrera). */
export function origenValido(req: NextRequest): boolean {
  const origen = req.headers.get("origin");
  if (!origen) return false;
  try {
    return new URL(origen).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host);
  } catch {
    return false;
  }
}

/**
 * Lee el cuerpo con tope de bytes: rechaza por content-length antes de leer y corta el flujo al pasarse.
 * Devuelve null si excede (el llamador responde 413 ARCHIVO_GRANDE).
 */
export async function leerCuerpoLimitado(req: NextRequest, max = MAX_BODY_BYTES): Promise<Uint8Array<ArrayBuffer> | null> {
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > max) return null;
  const trozos: Uint8Array[] = [];
  let total = 0;
  const lector = req.body?.getReader();
  if (lector) {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await lector.cancel().catch(() => undefined);
        return null;
      }
      trozos.push(value);
    }
  }
  const salida = new Uint8Array(total);
  let pos = 0;
  for (const t of trozos) {
    salida.set(t, pos);
    pos += t.byteLength;
  }
  return salida;
}

/**
 * BFF: reenvia la peticion a la API. El navegador nunca habla con la API ni ve el JWT:
 * se lee de la cookie httpOnly y se manda como Bearer. `Authorization`, `Cookie` y
 * `X-Cliente-Token` entrantes se descartan (solo se copia content-type).
 * `ruta` es el path en la API, p. ej. "/api/productos".
 */
export async function proxyToBackend(req: NextRequest, ruta: string): Promise<NextResponse> {
  const conCuerpo = req.method !== "GET" && req.method !== "HEAD";
  if (conCuerpo && !origenValido(req)) return errorBff("ORIGEN_INVALIDO", 403);

  let cuerpo: Uint8Array<ArrayBuffer> | undefined;
  if (conCuerpo) {
    const leido = await leerCuerpoLimitado(req);
    if (!leido) return errorBff("ARCHIVO_GRANDE", 413);
    cuerpo = leido;
  }

  const headers = new Headers({ "x-visitante-ip": ipVisitante(req.headers) });
  const tipo = req.headers.get("content-type");
  if (tipo) headers.set("content-type", tipo);
  const jwt = req.cookies.get(COOKIE_JWT)?.value;
  if (jwt) headers.set("authorization", `Bearer ${jwt}`);

  let respuesta: Response;
  try {
    respuesta = await fetch(`${getBackendUrl()}${ruta}${req.nextUrl.search}`, {
      method: req.method,
      headers,
      body: cuerpo,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const timeout = err instanceof Error && err.name === "TimeoutError";
    return timeout ? errorBff("TIEMPO_AGOTADO", 504) : errorBff("API_NO_DISPONIBLE", 502);
  }

  // 204/205/304 no admiten cuerpo: new Response("") con esos estados lanza.
  const sinCuerpo = [204, 205, 304].includes(respuesta.status);
  const salida = new NextResponse(sinCuerpo ? null : await respuesta.text(), {
    status: respuesta.status,
    headers: { "content-type": respuesta.headers.get("content-type") ?? "application/json" },
  });
  // Cualquier 401 (sesion cerrada, token invalido) deja la cookie inservible: se borra.
  if (respuesta.status === 401) salida.cookies.delete(COOKIE_JWT);
  return salida;
}

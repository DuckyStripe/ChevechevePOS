import { NextResponse, type NextRequest } from "next/server";
import { getBackendUrl } from "./backend-url";
import { ipVisitante } from "./ip-visitante";
import { COOKIE_JWT, COOKIE_SESION } from "./sesion";

const TIMEOUT_MS = Number(process.env.BACKEND_TIMEOUT_MS ?? 15000);
const MAX_BODY_BYTES = 1_048_576;

/**
 * BFF: reenvia la peticion a la API. El navegador nunca habla con la API ni ve
 * el JWT: se lee de la cookie httpOnly y se manda como Bearer.
 * `ruta` es el path en la API, p. ej. "/api/productos".
 */
export async function proxyToBackend(req: NextRequest, ruta: string): Promise<NextResponse> {
  const conCuerpo = req.method !== "GET" && req.method !== "HEAD";
  let cuerpo: ArrayBuffer | undefined;
  if (conCuerpo) {
    cuerpo = await req.arrayBuffer();
    if (cuerpo.byteLength > MAX_BODY_BYTES) {
      return NextResponse.json({ codigo: "CUERPO_GRANDE", mensaje: "Peticion demasiado grande" }, { status: 413 });
    }
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
    return NextResponse.json(
      { codigo: timeout ? "TIEMPO_AGOTADO" : "API_NO_DISPONIBLE", mensaje: "No se pudo contactar al servidor" },
      { status: timeout ? 504 : 502 },
    );
  }

  const texto = await respuesta.text();
  const salida = new NextResponse(texto, {
    status: respuesta.status,
    headers: { "content-type": respuesta.headers.get("content-type") ?? "application/json" },
  });

  if (respuesta.status === 401) {
    let codigo: unknown;
    try {
      codigo = (JSON.parse(texto) as { codigo?: unknown }).codigo;
    } catch {
      // cuerpo no JSON: no es SESION_CERRADA
    }
    if (codigo === "SESION_CERRADA") {
      salida.cookies.delete(COOKIE_JWT);
      salida.cookies.delete(COOKIE_SESION);
    }
  }
  return salida;
}

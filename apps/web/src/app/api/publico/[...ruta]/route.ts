import { NextResponse, type NextRequest } from "next/server";
import { errorBff, leerCuerpoLimitado, origenValido } from "@/lib/api-proxy";
import { getBackendUrl } from "@/lib/backend-url";
import { COOKIE_CLIENTE, COOKIE_DISPOSITIVO } from "@/lib/cookies";
import { ipVisitante } from "@/lib/ip-visitante";

type Contexto = { params: Promise<{ ruta: string[] }> };

const TIMEOUT_MS = Number(process.env.BACKEND_TIMEOUT_MS ?? 15000);
const noEncontrado = () => NextResponse.json({ error: { codigo: "NO_ENCONTRADO", mensaje: "No encontramos eso." } }, { status: 404 });

/** Proxy del cliente (CONTRATOS §4.1): solo `/api/publico/*`; el token sale de la cookie y nunca se acepta `Authorization`. */
async function reenviar(req: NextRequest, { params }: Contexto) {
  const { ruta } = await params;
  // El PIN solo pasa por sus rutas propias: `dispositivo_token` no debe llegar al JS del navegador.
  if (ruta[0] === "pin") return noEncontrado();
  if (ruta.some((s) => s === "" || s === "." || s === ".." || s.includes("/") || s.includes("\\"))) return noEncontrado();

  const conCuerpo = req.method !== "GET" && req.method !== "HEAD";
  if (conCuerpo && !origenValido(req)) return errorBff("ORIGEN_INVALIDO", 403);
  let cuerpo: Uint8Array<ArrayBuffer> | undefined;
  if (conCuerpo) {
    const leido = await leerCuerpoLimitado(req, 65_536);
    if (!leido) return errorBff("ARCHIVO_GRANDE", 413);
    cuerpo = leido;
  }

  const token = req.cookies.get(COOKIE_CLIENTE)?.value;
  if (!token) return NextResponse.json({ error: { codigo: "ENLACE_INVALIDO", mensaje: "Este link ya no está activo." } }, { status: 401 });

  const h = new Headers({ "x-cliente-token": token, "x-visitante-ip": ipVisitante(req.headers) });
  const tipo = req.headers.get("content-type");
  if (tipo) h.set("content-type", tipo);
  const etag = req.headers.get("if-none-match");
  if (etag) h.set("if-none-match", etag);
  const dispositivo = req.cookies.get(COOKIE_DISPOSITIVO)?.value;
  if (dispositivo) h.set("x-cliente-dispositivo", dispositivo);

  let r: Response;
  try {
    r = await fetch(`${getBackendUrl()}/api/publico/${ruta.map(encodeURIComponent).join("/")}${req.nextUrl.search}`, {
      method: req.method,
      headers: h,
      body: cuerpo,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    return err instanceof Error && err.name === "TimeoutError" ? errorBff("TIEMPO_AGOTADO", 504) : errorBff("API_NO_DISPONIBLE", 502);
  }

  const sinCuerpo = [204, 205, 304].includes(r.status);
  const texto = sinCuerpo ? null : await r.text();
  const salida = new NextResponse(texto, {
    status: r.status,
    headers: {
      "content-type": r.headers.get("content-type") ?? "application/json",
      "cache-control": r.headers.get("cache-control") ?? "private, no-store",
    },
  });
  const nuevoEtag = r.headers.get("etag");
  if (nuevoEtag) salida.headers.set("etag", nuevoEtag);

  if (r.status === 401 && texto) {
    let codigo: string | undefined;
    try {
      codigo = (JSON.parse(texto.slice(0, 4096)) as { error?: { codigo?: string } } | null)?.error?.codigo;
    } catch {
      /* cuerpo que no es JSON: no es un error de la API */
    }
    if (codigo === "ENLACE_INVALIDO") {
      salida.cookies.delete(COOKIE_CLIENTE);
      salida.cookies.delete(COOKIE_DISPOSITIVO);
    }
  }
  return salida;
}

export { reenviar as GET, reenviar as POST, reenviar as PUT, reenviar as PATCH, reenviar as DELETE };

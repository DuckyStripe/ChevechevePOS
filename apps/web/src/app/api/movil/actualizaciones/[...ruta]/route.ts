import { NextResponse, type NextRequest } from "next/server";
import { getBackendUrl } from "@/lib/backend-url";
import { ipVisitante } from "@/lib/ip-visitante";

type Contexto = { params: Promise<{ ruta: string[] }> };

// Actualizaciones del cascarón (CONTRATOS §4.1/§4.6.1): solo GET y solo /api/movil/actualizaciones/*. expo-updates no manda cookie,
// y aquí tampoco se reenvía ninguna (ni Authorization). El cuerpo (APK de decenas de MB) pasa en flujo, nunca con text().
const TIMEOUT_MS = Number(process.env.BACKEND_TIMEOUT_MS ?? 15000);
const RUTAS = new Set(["manifiesto", "recursos", "apk"]);
const COPIAR = ["content-type", "content-length", "content-disposition", "cache-control", "expo-protocol-version", "expo-sfv-version"];

const noEncontrado = () => NextResponse.json({ error: { codigo: "NO_ENCONTRADO", mensaje: "No encontramos eso." } }, { status: 404 });
const falla = (codigo: string, mensaje: string, status: number) => NextResponse.json({ error: { codigo, mensaje } }, { status });

export async function GET(req: NextRequest, { params }: Contexto) {
  const { ruta } = await params;
  if (ruta.length > 2 || !RUTAS.has(ruta[0] ?? "") || ruta.some((s) => s === "" || s === "." || s === ".." || s.includes("/") || s.includes("\\"))) {
    return noEncontrado();
  }

  const h = new Headers({ "x-visitante-ip": ipVisitante(req.headers) });
  req.headers.forEach((valor, nombre) => {
    if (nombre.startsWith("expo-")) h.set(nombre, valor);
  });

  // El tiempo límite cubre hasta recibir cabeceras; después la descarga corre sin límite.
  const corte = new AbortController();
  const timer = setTimeout(() => corte.abort(), TIMEOUT_MS);
  let r: Response;
  try {
    r = await fetch(`${getBackendUrl()}/api/movil/actualizaciones/${ruta.map(encodeURIComponent).join("/")}`, {
      method: "GET",
      headers: h,
      signal: corte.signal,
      cache: "no-store",
    });
  } catch (err) {
    return err instanceof Error && err.name === "AbortError"
      ? falla("TIEMPO_AGOTADO", "El servidor tardo demasiado en responder. Intenta de nuevo.", 504)
      : falla("API_NO_DISPONIBLE", "No se pudo contactar al servidor. Revisa tu conexion e intenta de nuevo.", 502);
  } finally {
    clearTimeout(timer);
  }

  const cab = new Headers();
  for (const n of COPIAR) {
    const v = r.headers.get(n);
    if (v) cab.set(n, v);
  }
  return new Response([204, 205, 304].includes(r.status) ? null : r.body, { status: r.status, headers: cab });
}

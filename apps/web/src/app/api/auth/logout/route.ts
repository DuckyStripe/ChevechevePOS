import { NextResponse, type NextRequest } from "next/server";
import { errorBff, origenValido } from "@/lib/api-proxy";
import { getBackendUrl } from "@/lib/backend-url";
import { COOKIE_JWT } from "@/lib/cookies";
import { ipVisitante } from "@/lib/ip-visitante";

/** Cierra la sesion en la API y borra la cookie aunque la API falle. */
export async function POST(req: NextRequest) {
  if (!origenValido(req)) return errorBff("ORIGEN_INVALIDO", 403);
  const jwt = req.cookies.get(COOKIE_JWT)?.value;
  if (jwt) {
    try {
      await fetch(`${getBackendUrl()}/api/auth/logout`, {
        method: "POST",
        headers: { authorization: `Bearer ${jwt}`, "x-visitante-ip": ipVisitante(req.headers) },
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
    } catch {
      // Sin API igual se borra la cookie: la sesion expira sola.
    }
  }
  const salida = new NextResponse(null, { status: 204 });
  salida.cookies.delete(COOKIE_JWT);
  return salida;
}

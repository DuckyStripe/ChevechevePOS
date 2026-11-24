import type { NextRequest } from "next/server";
import { getBackendUrl } from "@/lib/backend-url";
import { COOKIE_JWT } from "@/lib/cookies";

// Foto de comprobante o de entrega: privada. El JWT sale de la cookie httpOnly; el cuerpo viaja en flujo (el proxy normal lee texto y dañaría la imagen).
const NOMBRE = /^[0-9a-f]{64}\.(jpg|png|webp)$/;
const noEncontrado = () => new Response("No encontramos esa foto.", { status: 404 });

export async function GET(req: NextRequest, { params }: { params: Promise<{ archivo: string }> }) {
  const { archivo } = await params;
  const jwt = req.cookies.get(COOKIE_JWT)?.value;
  if (!jwt) return new Response("Entra de nuevo.", { status: 401 });
  if (!NOMBRE.test(archivo)) return noEncontrado();
  let r: Response;
  try {
    r = await fetch(`${getBackendUrl()}/api/comprobantes/${archivo}`, { headers: { authorization: `Bearer ${jwt}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  } catch {
    return new Response("No se pudo cargar la foto.", { status: 502 });
  }
  const tipo = r.headers.get("content-type") ?? "";
  // 401 (sesión) y 403 (permiso) pasan tal cual con su cuerpo; solo un 404 real o algo que no es imagen es «no encontramos».
  if (r.status === 401 || r.status === 403) return new Response(await r.text(), { status: r.status, headers: { "content-type": tipo || "application/json" } });
  if (!r.ok || !r.body || !tipo.startsWith("image/")) return noEncontrado();
  return new Response(r.body, { headers: { "content-type": tipo, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}

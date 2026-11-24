import type { NextRequest } from "next/server";
import { getBackendUrl } from "@/lib/backend-url";
import { COOKIE_JWT } from "@/lib/cookies";

// Respaldo manual (CONTRATOS §3.2): el .dump viaja en flujo (el proxy normal lee texto y lo dañaría). Solo con permiso configuracion.editar (lo decide la API).
export async function GET(req: NextRequest) {
  const jwt = req.cookies.get(COOKIE_JWT)?.value;
  if (!jwt) return new Response("Entra de nuevo.", { status: 401 });
  let r: Response;
  try {
    r = await fetch(`${getBackendUrl()}/api/configuracion/respaldo`, { headers: { authorization: `Bearer ${jwt}` }, cache: "no-store", signal: AbortSignal.timeout(120000) });
  } catch {
    return new Response("No se pudo descargar el respaldo. Intenta de nuevo.", { status: 502 });
  }
  if (r.status === 404) return new Response("Todavía no hay un respaldo para descargar. Se hace cada noche a las 3:00.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  if (!r.ok || !r.body) return new Response(await r.text(), { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/json" } });
  const h = new Headers({ "content-type": "application/octet-stream", "cache-control": "private, no-store", "x-content-type-options": "nosniff" });
  for (const k of ["content-disposition", "content-length"]) {
    const v = r.headers.get(k);
    if (v) h.set(k, v);
  }
  return new Response(r.body, { headers: h });
}

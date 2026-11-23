import { getBackendUrl } from "@/lib/backend-url";

// Foto de catalogo: publica, sin cookie ni Authorization. Nombre validado antes de tocar la API.
const NOMBRE = /^[0-9a-f]{64}(-240)?\.(jpg|png|webp)$/;
const noEncontrado = () => new Response("No encontramos esa imagen.", { status: 404 });

export async function GET(_req: Request, { params }: { params: Promise<{ archivo: string }> }) {
  const { archivo } = await params;
  if (!NOMBRE.test(archivo)) return noEncontrado();
  let r: Response;
  try {
    r = await fetch(`${getBackendUrl()}/api/imagenes/${archivo}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  } catch {
    return new Response("No se pudo cargar la imagen.", { status: 502 });
  }
  const tipo = r.headers.get("content-type") ?? "";
  if (!r.ok || !r.body) return noEncontrado();
  if (!tipo.startsWith("image/")) return noEncontrado();
  // Cuerpo en flujo: nunca se lee completo en memoria.
  return new Response(r.body, {
    headers: { "content-type": tipo, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
  });
}

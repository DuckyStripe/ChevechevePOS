import { NextResponse, type NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api-proxy";

type Contexto = { params: Promise<{ ruta: string[] }> };

const noEncontrado = () => NextResponse.json({ error: { codigo: "NO_ENCONTRADO", mensaje: "No encontramos eso." } }, { status: 404 });

async function reenviar(req: NextRequest, { params }: Contexto) {
  const { ruta } = await params;
  // `/api/publico/*` es del enlace del cliente (F3), con su propio proxy: aqui nunca se reenvia.
  if (ruta[0] === "publico") return noEncontrado();
  // Segmentos ya decodificados por Next: nada de '.', '..', vacios ni separadores que escapen de /api/.
  if (ruta.some((s) => s === "" || s === "." || s === ".." || s.includes("/") || s.includes("\\"))) return noEncontrado();
  const destino = `/api/${ruta.map(encodeURIComponent).join("/")}`;
  const normal = new URL(destino, "http://api.local").pathname;
  if (!normal.startsWith("/api/") || normal.startsWith("/api/publico/") || normal === "/api/publico") return noEncontrado();
  return proxyToBackend(req, destino);
}

export { reenviar as GET, reenviar as POST, reenviar as PUT, reenviar as PATCH, reenviar as DELETE };

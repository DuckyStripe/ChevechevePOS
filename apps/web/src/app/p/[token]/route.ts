import { NextResponse, type NextRequest } from "next/server";
import { getBackendUrl } from "@/lib/backend-url";
import { COOKIE_CLIENTE, COOKIE_DISPOSITIVO, VIDA_COOKIE_CLIENTE, opcionesCookie } from "@/lib/cookies";
import { destinoIr } from "@/lib/api-publico";
import { ipVisitante } from "@/lib/ip-visitante";

// Canje del link (CONTRATOS §4.1): el token sale de la barra de direcciones con un 303 y queda solo en la cookie httpOnly.
// Nunca se loguea la URL: lleva el token.
const TOKEN = /^[A-Za-z0-9_-]{20,128}$/;

function ir(destino: string): NextResponse {
  // `Location` relativo: detras del proxy de Dokploy el host interno no sirve.
  const r = new NextResponse(null, { status: 303, headers: { location: destino } });
  r.headers.set("referrer-policy", "no-referrer");
  r.headers.set("cache-control", "no-store");
  return r;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const destino = destinoIr(req.nextUrl.searchParams.get("ir"));
  // Solo un 401 ENLACE_INVALIDO de la API borra cookies (C21). Un token mal formado, un 429 o un 5xx nunca tocan nada.
  const sinServicio = () => ir("/pedido/invalido?motivo=sin-servicio");
  if (!TOKEN.test(token)) return ir("/pedido/invalido");

  const h: Record<string, string> = { "x-cliente-token": token, "x-visitante-ip": ipVisitante(req.headers) };
  const dispositivo = req.cookies.get(COOKIE_DISPOSITIVO)?.value;
  if (dispositivo) h["x-cliente-dispositivo"] = dispositivo;

  let r: Response;
  try {
    r = await fetch(`${getBackendUrl()}/api/publico/cliente`, { headers: h, cache: "no-store", signal: AbortSignal.timeout(15000) });
  } catch {
    return sinServicio();
  }

  const poner = (res: NextResponse) => {
    res.cookies.set(COOKIE_CLIENTE, token, opcionesCookie(VIDA_COOKIE_CLIENTE));
    return res;
  };
  if (r.ok) return poner(ir(destino));

  const cuerpo = (await r.json().catch(() => null)) as { error?: { codigo?: string } } | null;
  if (r.status === 401 && cuerpo?.error?.codigo === "PIN_REQUERIDO") {
    return poner(ir(destino === "/pedido" ? "/pedido/pin" : `/pedido/pin?ir=${encodeURIComponent(req.nextUrl.searchParams.get("ir") ?? "")}`));
  }
  if (r.status === 401 && cuerpo?.error?.codigo === "ENLACE_INVALIDO") {
    const res = ir("/pedido/invalido");
    res.cookies.delete(COOKIE_CLIENTE);
    res.cookies.delete(COOKIE_DISPOSITIVO);
    return res;
  }
  return sinServicio();
}

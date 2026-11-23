import { NextResponse, type NextRequest } from "next/server";
import { errorBff, leerCuerpoLimitado, origenValido } from "@/lib/api-proxy";
import { getBackendUrl } from "@/lib/backend-url";
import { COOKIE_JWT, opcionesCookie } from "@/lib/cookies";
import { ipVisitante } from "@/lib/ip-visitante";

/** Canjea usuario y contrasena por la cookie `chv_jwt`; al navegador solo vuelve `{usuario}` (CONTRATOS §4.1). */
export async function POST(req: NextRequest) {
  if (!origenValido(req)) return errorBff("ORIGEN_INVALIDO", 403);

  let datos: unknown;
  try {
    const bytes = await leerCuerpoLimitado(req, 16_384);
    if (!bytes) return errorBff("ARCHIVO_GRANDE", 413);
    datos = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return NextResponse.json({ error: { codigo: "VALIDACION", mensaje: "Escribe tu usuario y tu contraseña." } }, { status: 400 });
  }
  const { usuario, contrasena } = (datos ?? {}) as Record<string, unknown>;
  // El WebView del cascarón agrega ChevecheveApp/<version> al User-Agent (CONTRATOS §3).
  const origen = (req.headers.get("user-agent") ?? "").includes("ChevecheveApp/") ? "app" : "web";

  let r: Response;
  try {
    r = await fetch(`${getBackendUrl()}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-visitante-ip": ipVisitante(req.headers) },
      body: JSON.stringify({ usuario, contrasena, origen }),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
  } catch {
    return errorBff("API_NO_DISPONIBLE", 502);
  }

  const cuerpo = (await r.json().catch(() => null)) as { token?: string; expira_en?: string; usuario?: unknown; error?: unknown } | null;
  if (!r.ok || !cuerpo?.token || !cuerpo.expira_en) {
    return NextResponse.json(cuerpo?.error ? { error: cuerpo.error } : { error: { codigo: "ERROR_INTERNO", mensaje: "No pudimos entrar. Intenta de nuevo." } }, {
      status: r.ok ? 502 : r.status,
    });
  }

  const segundos = Math.max(60, Math.floor((new Date(cuerpo.expira_en).getTime() - Date.now()) / 1000));
  const salida = NextResponse.json({ usuario: cuerpo.usuario });
  salida.cookies.set(COOKIE_JWT, cuerpo.token, opcionesCookie(segundos));
  return salida;
}

import { NextResponse, type NextRequest } from "next/server";
import { errorBff, leerCuerpoLimitado, origenValido } from "./api-proxy";
import { getBackendUrl } from "./backend-url";
import { COOKIE_CLIENTE, COOKIE_DISPOSITIVO, VIDA_COOKIE_CLIENTE, opcionesCookie } from "./cookies";
import { destinoIr } from "./api-publico";
import { ipVisitante } from "./ip-visitante";

/**
 * `POST /api/publico/pin/{elegir,entrar}` (CONTRATOS §4.1): llama la API, guarda `dispositivo_token` en la cookie
 * `chv_dispositivo` y responde SIN el token. Acepta JSON o formulario (la pantalla de numeros funciona sin JS).
 */
export async function procesarPin(req: NextRequest, accion: "elegir" | "entrar"): Promise<NextResponse> {
  if (!origenValido(req)) return errorBff("ORIGEN_INVALIDO", 403);
  const cuerpo = await leerCuerpoLimitado(req, 4096);
  if (!cuerpo) return errorBff("ARCHIVO_GRANDE", 413);

  const esForm = (req.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded");
  let pin = "";
  let ir = "";
  try {
    const texto = new TextDecoder().decode(cuerpo);
    if (esForm) {
      const f = new URLSearchParams(texto);
      pin = f.get("pin") ?? "";
      ir = f.get("ir") ?? "";
    } else pin = String((JSON.parse(texto) as { pin?: unknown }).pin ?? "");
  } catch {
    /* cuerpo ilegible: se trata como PIN invalido */
  }

  const volver = (params: Record<string, string>) => {
    const q = new URLSearchParams(params);
    if (ir) q.set("ir", ir);
    return new NextResponse(null, { status: 303, headers: { location: `/pedido/pin?${q}`, "cache-control": "no-store" } });
  };
  if (!/^\d{4}$/.test(pin)) {
    return esForm ? volver({ error: "VALIDACION" }) : NextResponse.json({ error: { codigo: "VALIDACION", mensaje: "Escribe exactamente 4 números." } }, { status: 400 });
  }

  const token = req.cookies.get(COOKIE_CLIENTE)?.value;
  if (!token) return esForm ? new NextResponse(null, { status: 303, headers: { location: "/pedido/invalido" } }) : NextResponse.json({ error: { codigo: "ENLACE_INVALIDO", mensaje: "Este link ya no está activo." } }, { status: 401 });

  const h: Record<string, string> = {
    "content-type": "application/json",
    "x-cliente-token": token,
    "x-visitante-ip": ipVisitante(req.headers),
    "user-agent": req.headers.get("user-agent") ?? "",
  };
  let r: Response;
  try {
    r = await fetch(`${getBackendUrl()}/api/publico/pin/${accion}`, { method: "POST", headers: h, body: JSON.stringify({ pin }), cache: "no-store", signal: AbortSignal.timeout(15000) });
  } catch {
    return esForm ? volver({ error: "API_NO_DISPONIBLE" }) : errorBff("API_NO_DISPONIBLE", 502);
  }
  const datos = (await r.json().catch(() => null)) as { dispositivo_token?: string; error?: { codigo?: string; mensaje?: string; detalles?: { intentos_restantes?: number; segundos?: number } } } | null;

  if (r.ok && datos?.dispositivo_token) {
    const salida = esForm
      ? new NextResponse(null, { status: 303, headers: { location: destinoIr(ir), "cache-control": "no-store" } })
      : NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
    salida.cookies.set(COOKIE_DISPOSITIVO, datos.dispositivo_token, opcionesCookie(VIDA_COOKIE_CLIENTE));
    return salida;
  }

  const e = datos?.error;
  if (esForm) {
    if (r.status === 401 && e?.codigo === "ENLACE_INVALIDO") return new NextResponse(null, { status: 303, headers: { location: "/pedido/invalido" } });
    const p: Record<string, string> = { error: e?.codigo ?? "ERROR_INTERNO" };
    if (e?.detalles?.intentos_restantes != null) p.restantes = String(e.detalles.intentos_restantes);
    if (e?.detalles?.segundos != null) p.segundos = String(e.detalles.segundos);
    return volver(p);
  }
  const salida = NextResponse.json({ error: { codigo: e?.codigo ?? "ERROR_INTERNO", mensaje: e?.mensaje ?? "Algo salió mal. Intenta de nuevo.", detalles: e?.detalles } }, { status: r.status });
  if (r.status === 401 && e?.codigo === "ENLACE_INVALIDO") {
    salida.cookies.delete(COOKIE_CLIENTE);
    salida.cookies.delete(COOKIE_DISPOSITIVO);
  }
  return salida;
}

import { readFileSync } from "node:fs";
import { importPKCS8, SignJWT } from "jose";
import { consulta } from "../../db/database.js";

// Envio de push por FCM HTTP v1 (CONTRATOS §2.5). Los estados del outbox los decide SQL (fn_envios_tomar / fn_envio_reservar /
// fn_envio_resultado): aqui solo se habla con FCM. Nunca se loguea el token del dispositivo ni el cuerpo de la notificacion.
// shortcut: si el proceso muere despues de que FCM acepto y antes de fn_envio_resultado, el aviso se repite a los 2 min (doble, nunca perdido).

export interface CuentaServicio { client_email: string; private_key: string; project_id: string; token_uri?: string }
interface Fila { envio_id: string; token_push: string; titulo: string; cuerpo: string; datos: Record<string, unknown>; evento: string; notificacion_id: string }
type Resultado =
  | { resultado: "enviada" }
  | { resultado: "temporal" | "invalido" | "permanente"; error: string }
  | { resultado: "abortar"; error: string };
type Registro = { warn: (o: object, m: string) => void; error: (o: object, m: string) => void };

export interface OpcionesEnvio {
  cuenta: CuentaServicio;
  /** Inyectable: las pruebas nunca salen a la red. */
  fetch?: typeof fetch;
  log: Registro;
  ahora?: () => number;
  limite?: number;
}

const ALCANCE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URI = "https://oauth2.googleapis.com/token";
const ESPERA_MAX_MS = 10_000;
const DIA_MS = 86_400_000;

/** Lee y valida el JSON de la cuenta de servicio. Devuelve el motivo si no sirve (para un solo log claro al arrancar). */
export function cargarCuenta(ruta: string): { cuenta: CuentaServicio } | { error: string } {
  let c: Partial<CuentaServicio>;
  try {
    c = JSON.parse(readFileSync(ruta, "utf8")) as Partial<CuentaServicio>;
  } catch {
    return { error: `FCM_CUENTA_SERVICIO (${ruta}) no existe, no se puede leer o no es JSON` };
  }
  const falta = (["client_email", "private_key", "project_id"] as const).filter((k) => typeof c[k] !== "string" || !c[k]);
  if (falta.length) return { error: `FCM_CUENTA_SERVICIO (${ruta}) no trae: ${falta.join(", ")}` };
  return { cuenta: { client_email: c.client_email!, private_key: c.private_key!, project_id: c.project_id!, ...(c.token_uri ? { token_uri: c.token_uri } : {}) } };
}

type CuerpoError = { error?: { status?: unknown; details?: Array<{ errorCode?: unknown; fieldViolations?: Array<{ field?: unknown }> }> } } | null;

/** Codigo de FCM apto para guardar: solo mayusculas y guion bajo; si no, el estado HTTP. */
function codigo(estado: number, cuerpo: CuerpoError): string {
  const e = cuerpo?.error;
  const c = e?.details?.find((d) => typeof d.errorCode === "string")?.errorCode ?? e?.status;
  return typeof c === "string" && /^[A-Z_]{3,40}$/.test(c) ? c : `HTTP_${estado}`;
}

/** INVALID_ARGUMENT que senala al token del dispositivo (message.token), no al contenido del mensaje. */
const apuntaAlToken = (cuerpo: CuerpoError) =>
  (cuerpo?.error?.details ?? []).some((d) => d.fieldViolations?.some((v) => typeof v.field === "string" && v.field.includes("message.token")));

/** Un ciclo de envio. Devuelve cuantos envios tomo. */
export function crearEnviador(op: OpcionesEnvio): () => Promise<number> {
  const http = op.fetch ?? fetch;
  const ahora = op.ahora ?? Date.now;
  const cuenta = op.cuenta;
  let acceso: { valor: string; vence: number } | undefined;
  let ultimaLimpieza = 0;

  // Token OAuth cacheado hasta 5 min antes de vencer.
  async function tokenAcceso(): Promise<string> {
    if (acceso && acceso.vence - 5 * 60_000 > ahora()) return acceso.valor;
    const uri = cuenta.token_uri ?? TOKEN_URI;
    const llave = await importPKCS8(cuenta.private_key, "RS256");
    const aserto = await new SignJWT({ scope: ALCANCE })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(cuenta.client_email).setSubject(cuenta.client_email).setAudience(uri)
      .setIssuedAt(Math.floor(ahora() / 1000)).setExpirationTime(Math.floor(ahora() / 1000) + 3600)
      .sign(llave);
    const r = await http(uri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: aserto }),
      signal: AbortSignal.timeout(ESPERA_MAX_MS),
    });
    if (!r.ok) throw new Error(`oauth ${r.status}`);
    const j = (await r.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token) throw new Error("oauth sin token");
    acceso = { valor: j.access_token, vence: ahora() + (j.expires_in ?? 3600) * 1000 };
    return acceso.valor;
  }

  async function enviar(f: Fila, bearer: string): Promise<Resultado> {
    let r: Response;
    try {
      r = await http(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(cuenta.project_id)}/messages:send`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` },
        // `data` solo admite cadenas: `datos` (con la ruta del enlace profundo) va como JSON.
        body: JSON.stringify({
          message: {
            token: f.token_push,
            notification: { title: f.titulo, body: f.cuerpo },
            data: { notificacion_id: String(f.notificacion_id), evento: f.evento, datos: JSON.stringify(f.datos ?? {}) },
            android: { priority: "HIGH", notification: { channel_id: "avisos" } },
          },
        }),
        signal: AbortSignal.timeout(ESPERA_MAX_MS),
      });
    } catch {
      return { resultado: "temporal", error: "RED" };
    }
    if (r.ok) return { resultado: "enviada" };
    const cuerpo = (await r.json().catch(() => null)) as CuerpoError;
    const cod = codigo(r.status, cuerpo);
    // Fallo de credenciales del proyecto: no es culpa del aviso. Se aborta el ciclo y no se gasta ningun intento.
    if (r.status === 401 || r.status === 403) {
      acceso = undefined;
      return { resultado: "abortar", error: cod };
    }
    if (cod === "UNREGISTERED") return { resultado: "invalido", error: cod };
    if (cod === "INVALID_ARGUMENT") return apuntaAlToken(cuerpo) ? { resultado: "invalido", error: cod } : { resultado: "permanente", error: cod };
    return { resultado: "temporal", error: cod };
  }

  return async () => {
    // Limpieza diaria (dentro de esta tarea: ya existe y corre sola).
    if (ahora() - ultimaLimpieza > DIA_MS) {
      ultimaLimpieza = ahora();
      await consulta("select app.fn_envios_purgar()");
    }
    const r = await consulta<Fila>("select * from app.fn_envios_tomar($1)", [op.limite ?? 50]);
    if (r.rows.length === 0) return 0;
    let bearer: string;
    try {
      bearer = await tokenAcceso();
    } catch {
      op.log.error({ codigo: "OAUTH" }, "push: no se pudo obtener el acceso a FCM; ciclo omitido, sin gastar intentos");
      return r.rows.length;
    }
    for (const f of r.rows) {
      if (!(await consulta<{ ok: boolean }>("select app.fn_envio_reservar($1) as ok", [f.envio_id])).rows[0]!.ok) continue;
      let res: Resultado;
      try {
        res = await enviar(f, bearer);
      } catch {
        res = { resultado: "temporal", error: "INTERNO" };
      }
      if (res.resultado === "abortar") {
        op.log.error({ codigo: res.error }, "push: FCM rechazo las credenciales; ciclo omitido, sin gastar intentos");
        return r.rows.length;
      }
      if (res.resultado !== "enviada") op.log.warn({ envio_id: f.envio_id, codigo: res.error }, "push: envio no entregado");
      await consulta("select app.fn_envio_resultado($1, $2, $3)", [f.envio_id, res.resultado, "error" in res ? res.error : null]);
    }
    return r.rows.length;
  };
}

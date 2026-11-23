/**
 * Cookie de sesion firmada (`chv_sesion`): `<payload base64url>.<hmac base64url>`.
 * Solo prueba que el usuario inició sesion y cuando expira; la autoridad real es
 * el JWT (`chv_jwt`) que valida la API. Usa Web Crypto para poder correr tambien
 * en el middleware (edge). La comparacion de firmas es de tiempo constante.
 */
export const COOKIE_SESION = "chv_sesion";
export const COOKIE_JWT = "chv_jwt";

export interface SesionPayload {
  uid: string;
  /** Expiracion, epoch en segundos. */
  exp: number;
}

const enc = new TextEncoder();

function secreto(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET debe tener al menos 32 caracteres");
  return s;
}

function aBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(texto: string): Uint8Array {
  const bin = atob(texto.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function firmar(datos: string): Promise<Uint8Array> {
  const llave = await crypto.subtle.importKey("raw", enc.encode(secreto()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", llave, enc.encode(datos)));
}

/** Comparacion de tiempo constante (equivalente a timingSafeEqual, que no existe en edge). */
function iguales(a: Uint8Array, b: Uint8Array): boolean {
  let dif = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) dif |= a[i]! ^ (b[i] ?? 0);
  return dif === 0;
}

export async function crearCookieSesion(uid: string, maxAgeSeg = Number(process.env.SESSION_MAX_AGE ?? 28800)): Promise<string> {
  const payload: SesionPayload = { uid, exp: Math.floor(Date.now() / 1000) + maxAgeSeg };
  const cuerpo = aBase64Url(enc.encode(JSON.stringify(payload)));
  return `${cuerpo}.${aBase64Url(await firmar(cuerpo))}`;
}

/** Devuelve el payload si la firma es valida y no ha expirado; si no, null. */
export async function leerCookieSesion(valor: string | undefined): Promise<SesionPayload | null> {
  if (!valor) return null;
  const [cuerpo, firma, resto] = valor.split(".");
  if (!cuerpo || !firma || resto !== undefined) return null;
  try {
    if (!iguales(await firmar(cuerpo), deBase64Url(firma))) return null;
    const payload = JSON.parse(new TextDecoder().decode(deBase64Url(cuerpo))) as SesionPayload;
    if (typeof payload.uid !== "string" || typeof payload.exp !== "number") return null;
    return payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}

/** Opciones comunes de las cookies httpOnly. `secure` en produccion salvo SESSION_COOKIE_SECURE=false (compose dev sin HTTPS). */
export function opcionesCookie(maxAgeSeg = Number(process.env.SESSION_MAX_AGE ?? 28800)) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.SESSION_COOKIE_SECURE !== "false",
    sameSite: "strict" as const,
    path: "/",
    maxAge: maxAgeSeg,
  };
}

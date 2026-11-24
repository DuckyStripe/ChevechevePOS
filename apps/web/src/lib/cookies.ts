/** Cookies del BFF (CONTRATOS §4.1): `chv_jwt` (personal), `chv_cliente` (enlace) y `chv_dispositivo` (navegador recordado del cliente). */
export const COOKIE_JWT = "chv_jwt";
export const COOKIE_CLIENTE = "chv_cliente";
export const COOKIE_DISPOSITIVO = "chv_dispositivo";

/** 400 dias: el maximo que aceptan los navegadores. */
export const VIDA_COOKIE_CLIENTE = 400 * 24 * 60 * 60;

/** `secure` en produccion salvo COOKIE_SECURE=false (compose dev sin HTTPS). `lax`: el link de WhatsApp debe llegar con cookie. */
export function opcionesCookie(maxAgeSeg: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeg,
  };
}

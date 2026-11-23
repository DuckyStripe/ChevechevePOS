/** Cookies del BFF (CONTRATOS §4.1). F3 agrega `chv_cliente` y `chv_dispositivo`. */
export const COOKIE_JWT = "chv_jwt";

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

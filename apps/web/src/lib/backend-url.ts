/** Solo desarrollo fuera de Docker: el puerto real de la API (docker-compose.dev.yml). */
const URL_DEV = "http://127.0.0.1:3860";

/**
 * URL de la API vista desde el SERVIDOR de Next (route handlers). En produccion
 * la API no esta publicada: se llega por la red interna (API_INTERNAL_URL).
 * Sin variable en produccion se lanza error en vez de apuntar a un default
 * inventado. Durante `next build` NODE_ENV ya es production pero la variable
 * aun no existe, por eso esa fase no lanza.
 */
export function getBackendUrl(): string {
  const url = process.env.API_INTERNAL_URL?.trim();
  if (url) return url.replace(/\/$/, "");

  if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error("API_INTERNAL_URL no esta configurada: el BFF no sabe donde esta la API.");
  }
  return URL_DEV;
}

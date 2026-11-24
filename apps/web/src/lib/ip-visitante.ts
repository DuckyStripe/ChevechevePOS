/**
 * IP del visitante, para mandarla a la API en `X-Visitante-Ip` (la API solo ve la IP del contenedor de Next).
 * Supuesto: delante hay UN proxy de confianza (Traefik) que agrega la IP del socket al final de `X-Forwarded-For`.
 * Se usa solo la entrada MAS A LA DERECHA; `X-Real-Ip` se ignora (el cliente puede mandarlo) y lo de la izquierda
 * tambien lo escribe el cliente. Solo decide cubetas de limite de tasa: no concede acceso a nada.
 */
export function ipVisitante(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "";
}

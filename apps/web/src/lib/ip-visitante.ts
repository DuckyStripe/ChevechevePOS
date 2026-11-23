/**
 * IP del visitante, para mandarla a la API en `X-Visitante-Ip` (la API solo ve
 * la IP del contenedor de Next). Supuesto: delante hay UN proxy de confianza
 * (Traefik) que fija `X-Real-Ip` y agrega la IP del socket al final de
 * `X-Forwarded-For`. Por eso: primero `X-Real-Ip`; si no, el valor MAS A LA
 * DERECHA de `X-Forwarded-For` (el de la izquierda lo controla el cliente).
 * Solo decide cubetas de limite de tasa: no concede acceso a nada.
 */
export function ipVisitante(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const reenviadas = headers.get("x-forwarded-for")?.split(",");
  return reenviadas?.at(-1)?.trim() ?? "";
}

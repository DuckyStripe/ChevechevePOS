import { esIpCloudflare, esIpPrivada, esIpValida } from "./ip-cloudflare";

/**
 * IP del visitante, para mandarla a la API en `X-Visitante-Ip` (la API solo ve la IP del contenedor de Next).
 * Supuesto: delante hay UN proxy de confianza (Traefik) que agrega la IP del socket al final de `X-Forwarded-For`.
 * El par es la entrada MAS A LA DERECHA; `X-Real-Ip` se ignora (el cliente puede mandarlo) y lo de la izquierda
 * tambien lo escribe el cliente.
 *
 * Producción va detrás de Cloudflare (túnel o nube naranja): el par es `cloudflared` (red privada) o un edge de
 * Cloudflare, y todas las visitas caerían en una sola cubeta (un atacante bloquearía a todas las tiendas). Solo en
 * esos dos casos se cree `CF-Connecting-IP`, que Cloudflare fija con la IP real; si el par es otro, se ignora.
 * Solo decide cubetas de limite de tasa: no concede acceso a nada.
 */
export function ipVisitante(headers: Headers): string {
  const par = limpiar(headers.get("x-forwarded-for")?.split(",").at(-1));
  if (par && (esIpCloudflare(par) || esIpPrivada(par))) {
    const cf = limpiar(headers.get("cf-connecting-ip"));
    if (cf && esIpValida(cf)) return cf;
  }
  return par;
}

/** Solo caracteres de una IPv4/IPv6 y un largo razonable; si no, nada. */
function limpiar(valor: string | null | undefined): string {
  const v = valor?.trim() ?? "";
  return v && v.length <= 64 && /^[0-9a-fA-F:.]+$/.test(v) ? v : "";
}

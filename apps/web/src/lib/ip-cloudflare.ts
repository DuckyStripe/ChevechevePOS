/**
 * Rangos de Cloudflare y comprobacion CIDR, sin dependencias ni `node:net`
 * (asi sirve igual en el runtime de Node que en el edge). Lo usa
 * `ip-visitante.ts` para decidir si se puede creer `CF-Connecting-IP`. Copiado de RefaccionPro.
 *
 * Fuente: https://www.cloudflare.com/ips-v4 y https://www.cloudflare.com/ips-v6
 * Copiados el 2026-10-13. Cloudflare los cambia muy rara vez y avisa antes;
 * si publica uno nuevo, las visitas que entren por el rango que falta caerian
 * en la cubeta de la IP del edge (no se bloquea a nadie, solo se agrupan).
 * No se descargan en runtime a proposito: el proceso no debe depender de red
 * para resolver una IP.
 */
export const CLOUDFLARE_IPV4 = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
] as const;

export const CLOUDFLARE_IPV6 = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
] as const;

/** IPv4 como 4 octetos, o null si no es una IPv4 valida. */
export function parseIpv4(ip: string): number[] | null {
  const partes = ip.split(".");
  if (partes.length !== 4) return null;
  const octetos: number[] = [];
  for (const p of partes) {
    if (!/^\d{1,3}$/.test(p)) return null;
    // Sin ceros a la izquierda: "010" es ambiguo (octal en algunos parsers).
    if (p.length > 1 && p[0] === "0") return null;
    const n = Number(p);
    if (n > 255) return null;
    octetos.push(n);
  }
  return octetos;
}

/** IPv6 como 8 grupos de 16 bits, o null si no es valida. Admite `::` y cola IPv4. */
export function parseIpv6(ip: string): number[] | null {
  if (!ip.includes(":")) return null;
  const mitades = ip.split("::");
  if (mitades.length > 2) return null;

  const grupos = (texto: string): number[] | null => {
    if (texto === "") return [];
    const out: number[] = [];
    const piezas = texto.split(":");
    for (let i = 0; i < piezas.length; i++) {
      const p = piezas[i];
      if (i === piezas.length - 1 && p.includes(".")) {
        const v4 = parseIpv4(p);
        if (!v4) return null;
        out.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(p)) return null;
      out.push(parseInt(p, 16));
    }
    return out;
  };

  const izq = grupos(mitades[0]);
  if (!izq) return null;
  if (mitades.length === 1) return izq.length === 8 ? izq : null;

  const der = grupos(mitades[1]);
  if (!der) return null;
  // Una cola IPv4 solo puede ir al final, nunca a la izquierda del `::`.
  if (mitades[0].includes(".")) return null;
  const faltan = 8 - izq.length - der.length;
  if (faltan < 1) return null;
  return [...izq, ...new Array<number>(faltan).fill(0), ...der];
}

/**
 * Forma normalizada de una IP: IPv4 en 4 octetos, IPv6 en 8 grupos. Una
 * IPv4 mapeada (`::ffff:a.b.c.d`, tambien en hex) se trata como IPv4.
 */
function normalizar(ip: string): { v: 4; partes: number[] } | { v: 6; partes: number[] } | null {
  const v4 = parseIpv4(ip);
  if (v4) return { v: 4, partes: v4 };
  const v6 = parseIpv6(ip);
  if (!v6) return null;
  const mapeada = v6.slice(0, 5).every((g) => g === 0) && v6[5] === 0xffff;
  if (mapeada) {
    return { v: 4, partes: [v6[6] >> 8, v6[6] & 0xff, v6[7] >> 8, v6[7] & 0xff] };
  }
  return { v: 6, partes: v6 };
}

/** true si `ip` es una IPv4 o IPv6 sintacticamente valida. */
export function esIpValida(ip: string): boolean {
  return normalizar(ip) !== null;
}

/** Compara los primeros `bits` de dos listas de partes de `ancho` bits cada una. */
function mismoPrefijo(a: number[], b: number[], bits: number, ancho: number): boolean {
  let restantes = bits;
  for (let i = 0; i < a.length && restantes > 0; i++) {
    const n = Math.min(ancho, restantes);
    const mascara = ((1 << n) - 1) << (ancho - n);
    if ((a[i] & mascara) !== (b[i] & mascara)) return false;
    restantes -= n;
  }
  return true;
}

/** true si `ip` cae dentro de `cidr` (misma familia; IPv4 mapeada cuenta como IPv4). */
export function ipEnCidr(ip: string, cidr: string): boolean {
  const [red, prefijoTxt] = cidr.split("/");
  const dir = normalizar(ip);
  const base = normalizar(red ?? "");
  if (!dir || !base || dir.v !== base.v) return false;
  const max = base.v === 4 ? 32 : 128;
  const prefijo = prefijoTxt === undefined ? max : Number(prefijoTxt);
  if (!Number.isInteger(prefijo) || prefijo < 0 || prefijo > max) return false;
  return mismoPrefijo(dir.partes, base.partes, prefijo, base.v === 4 ? 8 : 16);
}

/** true si `ip` pertenece a algun rango publicado de Cloudflare. */
export function esIpCloudflare(ip: string): boolean {
  // Las dos listas: una IPv4 mapeada (`::ffff:...`) se normaliza a IPv4.
  return [...CLOUDFLARE_IPV4, ...CLOUDFLARE_IPV6].some((cidr) => ipEnCidr(ip, cidr));
}

/**
 * Redes privadas y de loopback: el par es `cloudflared` (túnel de Cloudflare) u otro contenedor del mismo servidor.
 * Desde internet no se llega con una de estas IP de origen; solo alguien ya dentro de la red local podría inventar
 * `CF-Connecting-IP`, y eso solo cambia su cubeta de límite de tasa.
 */
const PRIVADAS = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "100.64.0.0/10", "::1/128", "fc00::/7"] as const;

/** true si `ip` es de una red privada o de loopback. */
export function esIpPrivada(ip: string): boolean {
  return PRIVADAS.some((cidr) => ipEnCidr(ip, cidr));
}

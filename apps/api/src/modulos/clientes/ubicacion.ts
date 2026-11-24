import { AppError } from "../../comun/errores.js";

export interface Coordenadas {
  lat: string;
  lng: string;
}

export type FetchUbicacion = (url: string, init: { redirect: "manual"; signal?: AbortSignal }) => Promise<{ status: number; headers: { get(n: string): string | null } }>;

/** Rango de Mexico (mismo que `ck_cliente_en_mexico`): fuera de el, SQL dejaria un 500. */
export function enMexico(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 14 && lat <= 33 && lng >= -119 && lng <= -86;
}

export const formatoCoord = (n: number): string => n.toFixed(6);

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
const PARES = [
  new RegExp(String.raw`@${NUM},\s*${NUM}`), // .../maps/place/X/@19.43,-99.13,17z
  new RegExp(String.raw`[?&](?:q|ll|query|center)=${NUM}(?:,|%2C)\s*${NUM}`), // ?q=19.43,-99.13
  new RegExp(String.raw`!3d${NUM}!4d${NUM}`), // data=!3d19.43!4d-99.13
  new RegExp(String.raw`^\s*${NUM}\s*[,;\s]\s*${NUM}\s*$`), // pegado a mano: 19.4326, -99.1332
];

/** Extrae `lat,lng` de un texto de Google Maps o de coordenadas sueltas. null si no hay un par dentro de Mexico. */
export function extraerCoordenadas(texto: string): Coordenadas | null {
  for (const re of PARES) {
    const m = re.exec(texto);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (enMexico(lat, lng)) return { lat: formatoCoord(lat), lng: formatoCoord(lng) };
  }
  return null;
}

const CORTOS = new Set(["maps.app.goo.gl", "goo.gl"]);
const esGoogle = (host: string) => host === "google.com" || host.endsWith(".google.com") || /^(www\.)?google\.com\.mx$/.test(host);

/**
 * Resuelve el texto pegado: coordenadas directas o URL. Un enlace corto de Google se sigue **una sola vez** (`redirect: 'manual'`)
 * y solo si `Location` es de *.google.com. `fetchFn` se inyecta en pruebas: nunca hay red real ahi.
 */
export async function resolverUbicacion(texto: string, fetchFn: FetchUbicacion = (u, i) => fetch(u, i)): Promise<Coordenadas> {
  const t = texto.trim();
  const directo = extraerCoordenadas(t);
  if (directo) return directo;

  let url: URL | null = null;
  try {
    url = new URL(t);
  } catch {
    url = null;
  }
  if (url && url.protocol === "https:" && CORTOS.has(url.hostname)) {
    let destino: string | null = null;
    try {
      const r = await fetchFn(url.toString(), { redirect: "manual", signal: AbortSignal.timeout(5000) });
      destino = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
    } catch {
      destino = null;
    }
    if (destino) {
      let d: URL | null = null;
      try {
        d = new URL(destino, url);
      } catch {
        d = null;
      }
      if (d && d.protocol === "https:" && esGoogle(d.hostname)) {
        const c = extraerCoordenadas(decodeURIComponent(d.pathname) + d.search);
        if (c) return c;
      }
    }
  }
  throw new AppError("VALIDACION", [{ path: ["texto"], message: "No se encontro una ubicacion en ese texto" }]);
}

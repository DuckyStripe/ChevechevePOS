// Puro (sin react-native): lo prueba vitest. Reglas de CONTRATOS §4.6.

export type Decision = 'dentro' | 'fuera' | 'bloquear';

/** `datos.ruta` de un push: solo rutas internas simples. Cualquier otra cosa abre `/`. */
const RUTA_SEGURA = /^\/[a-z0-9/_-]*(\?[a-z0-9_=&-]*)?$/;

export function rutaSegura(ruta: unknown): string {
  if (typeof ruta !== 'string' || ruta.startsWith('//') || !RUTA_SEGURA.test(ruta)) return '/';
  return ruta;
}

/**
 * Ruta de un aviso a partir de su `data`. FCM solo manda textos: `datos` llega como JSON en texto con `ruta` dentro
 * (también se acepta `ruta` suelta o `datos` ya como objeto). Cualquier cosa rara abre `/`.
 */
export function rutaDeDatos(data: unknown): string {
  if (typeof data !== 'object' || data === null) return '/';
  const d = data as Record<string, unknown>;
  let datos: unknown = d.datos;
  if (typeof datos === 'string') {
    try {
      datos = JSON.parse(datos);
    } catch {
      return '/';
    }
  }
  if (typeof datos === 'object' && datos !== null) return rutaSegura((datos as Record<string, unknown>).ruta);
  return rutaSegura(d.ruta);
}

/**
 * Origen de `EXPO_PUBLIC_URL_PANEL`: `https://` obligatorio; `http://` solo en desarrollo.
 * Devuelve `null` si no sirve (la app muestra el error de configuración en vez de cargar algo ajeno).
 */
export function origenDelPanel(crudo: string | undefined, desarrollo: boolean): string | null {
  const m = /^(https?):\/\/([a-z0-9.-]+(?::\d{1,5})?)\/*$/i.exec((crudo ?? '').trim());
  if (!m) return null;
  const esquema = m[1].toLowerCase();
  if (esquema === 'http' && !desarrollo) return null;
  return `${esquema}://${m[2].toLowerCase()}`;
}

/** `esquema`, `autoridad` en minúsculas y `ruta` de una URL; no usa `new URL` (incompleto en React Native). */
function partes(url: string): { esquema: string; autoridad: string; ruta: string } | null {
  const m = /^([a-z][a-z0-9+.-]*):(?:\/\/([^/?#]*))?([^?#]*)/i.exec(url.trim());
  if (!m) return null;
  return { esquema: m[1].toLowerCase(), autoridad: (m[2] as string | undefined)?.toLowerCase() ?? '', ruta: m[3] };
}

const ESQUEMAS_FUERA = new Set(['whatsapp', 'tel', 'waze', 'geo']);
const HOSTS_FUERA = new Set(['wa.me', 'waze.com', 'www.waze.com', 'maps.google.com', 'maps.app.goo.gl']);

/**
 * Qué hacer con una URL que el WebView quiere cargar.
 * Mismo origen → dentro; wa.me, whatsapp:, Google Maps, waze, tel: → en su app; todo lo demás → bloqueado.
 */
export function decidirNavegacion(url: string, origen: string): Decision {
  const p = partes(url);
  if (!p) return 'bloquear';
  if (p.esquema === 'about' && url.trim().toLowerCase() === 'about:blank') return 'dentro';
  if (ESQUEMAS_FUERA.has(p.esquema)) return 'fuera';
  if (p.esquema !== 'https' && p.esquema !== 'http') return 'bloquear';
  // `https://panel@otro.com` engaña a un lector rápido: con usuario en la autoridad no se acepta nada.
  if (p.autoridad === '' || p.autoridad.includes('@')) return 'bloquear';
  if (`${p.esquema}://${p.autoridad}` === origen.toLowerCase()) return 'dentro';
  if (p.esquema !== 'https') return 'bloquear';
  if (HOSTS_FUERA.has(p.autoridad)) return 'fuera';
  if ((p.autoridad === 'www.google.com' || p.autoridad === 'google.com') && /^\/maps(\/|$)/.test(p.ruta)) return 'fuera';
  return 'bloquear';
}

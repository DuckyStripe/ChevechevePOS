// Puro (sin react-native ni expo): lo prueba vitest. Reglas de CONTRATOS §4.6.1.
// Adaptado de chachaplancha (features/app-updates/app-updates-logic.ts).

/** Tras «Más tarde» no se vuelve a preguntar por esa versión en este tiempo. */
export const POSPONER_MS = 24 * 60 * 60 * 1000;
/** Revisar OTA como mucho cada tanto (al abrir y al volver al frente). */
export const REVISAR_CADA_MS = 30 * 60 * 1000;
/** Una OTA bajada se aplica al volver al frente tras estar en segundo plano al menos esto. */
export const APLICAR_TRAS_FONDO_MS = 5 * 60 * 1000;
/** Ruta de la API (vía BFF, pública) donde se piden la APK más nueva y su archivo. */
export const RUTA_APK = '/api/movil/actualizaciones/apk';

/** `GET /api/movil/actualizaciones/apk` (ultima.json); `null` mientras no haya APK publicada. */
export interface ApkUltima {
  versionCode: number;
  versionName: string;
  /** Nombre del archivo en el servidor: `chevecheve-<versionCode>.apk`. */
  archivo: string;
  /** Ruta relativa (o URL absoluta) que dio el servidor; `urlDeApk` la resuelve y solo acepta el origen del panel. */
  url: string | null;
  sha256: string;
  tamanoBytes: number;
  notas: string | null;
  obligatoria: boolean;
}

const ES_OBJETO = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Valida la respuesta del servidor. Cualquier cosa rara = `null` (nunca bloquea ni instala nada). */
export function leerApk(crudo: unknown): ApkUltima | null {
  if (!ES_OBJETO(crudo)) return null;
  const { version_code: code, version_name: nombre, archivo, sha256, tamano_bytes: tamano, notas, obligatoria, url } = crudo;
  const delUrl = typeof url === 'string' ? (url.split('?')[0] ?? '').split('/').pop() : undefined;
  const nombreArchivo = typeof archivo === 'string' ? archivo : delUrl;
  if (typeof code !== 'number' || !Number.isInteger(code) || code <= 0) return null;
  if (typeof nombre !== 'string' || nombre === '') return null;
  if (typeof nombreArchivo !== 'string' || !/^chevecheve-[0-9]{1,9}\.apk$/.test(nombreArchivo)) return null;
  if (typeof sha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(sha256)) return null;
  if (typeof tamano !== 'number' || !Number.isInteger(tamano) || tamano < 0) return null;
  return {
    versionCode: code,
    versionName: nombre,
    archivo: nombreArchivo,
    url: typeof url === 'string' ? url : null,
    sha256,
    tamanoBytes: tamano,
    notas: typeof notas === 'string' && notas !== '' ? notas : null,
    obligatoria: obligatoria === true,
  };
}

/**
 * URL de descarga. Si el servidor dio `url` (ruta relativa) se resuelve contra el origen del panel; una URL absoluta
 * solo vale si es de ese mismo origen. Siempre debe quedar en la ruta fija de APK con un nombre validado.
 */
export function urlDeApk(origen: string, apk: Pick<ApkUltima, 'archivo' | 'url'>): string | null {
  const base = origen.replace(/\/+$/, '');
  const dado = apk.url ?? `${RUTA_APK}/${apk.archivo}`;
  const completa = dado.startsWith('/') && !dado.startsWith('//') ? `${base}${dado}` : dado;
  if (!completa.startsWith(`${base}${RUTA_APK}/`)) return null;
  const nombre = completa.slice(base.length + RUTA_APK.length + 1);
  return /^chevecheve-[0-9]{1,9}\.apk$/.test(nombre) ? completa : null;
}

/** `Application.nativeBuildVersion` llega como texto; `null` si no es un entero. */
export function codigoInstalado(crudo: string | null | undefined): number | null {
  if (crudo === null || crudo === undefined || !/^\d{1,9}$/.test(crudo.trim())) return null;
  return Number(crudo.trim());
}

/** Hay APK más nueva solo si su `versionCode` es mayor; con el instalado desconocido no se avisa. */
export function apkMasNueva(ultimoCode: number, instalado: number | null): boolean {
  return instalado !== null && ultimoCode > instalado;
}

/** Pantalla bloqueante solo con APK `obligatoria` más nueva. Sin respuesta (`null`: sin red, error, 5xx) nunca bloquea. */
export function bloqueadaPorObligatoria(ultima: Pick<ApkUltima, 'versionCode' | 'obligatoria'> | null, instalado: number | null): boolean {
  return ultima !== null && ultima.obligatoria && apkMasNueva(ultima.versionCode, instalado);
}

export function debeRevisar(ultimaMs: number | null, ahoraMs: number): boolean {
  return ultimaMs === null || ahoraMs - ultimaMs >= REVISAR_CADA_MS || ahoraMs < ultimaMs;
}

export type Aplicar = 'aplicar' | 'aviso' | 'esperar';

/**
 * Cuándo reiniciar a una OTA ya bajada. `alAbrir`: la app acaba de abrir. Si no, solo al volver al frente tras
 * `ausenteMs` en segundo plano (null = no estuvo en segundo plano). Con trabajo sin guardar NUNCA reinicia: avisa.
 */
export function decidirAplicar(entrada: { pendiente: boolean; sinGuardar: boolean; alAbrir: boolean; ausenteMs: number | null }): Aplicar {
  if (!entrada.pendiente) return 'esperar';
  if (!entrada.alAbrir && (entrada.ausenteMs === null || entrada.ausenteMs < APLICAR_TRAS_FONDO_MS)) return 'esperar';
  return entrada.sinGuardar ? 'aviso' : 'aplicar';
}

export function posponerHasta(ahoraMs: number): number {
  return ahoraMs + POSPONER_MS;
}

/** El diálogo al abrir calla mientras dure el «Más tarde». «Buscar actualización» lo ignora. */
export function estaPospuesta(hasta: number | null, ahoraMs: number): boolean {
  return hasta !== null && Number.isFinite(hasta) && ahoraMs < hasta;
}

export type Resultado = 'al_dia' | 'lista' | 'apk' | 'sin_red';

/** `resultado` de `estado_app`: la APK nueva pesa más que la OTA lista; sin red solo si la última revisión falló. */
export function resultadoDe(entrada: { revisionFallo: boolean; apkNueva: boolean; otaLista: boolean }): Resultado {
  if (entrada.apkNueva) return 'apk';
  if (entrada.otaLista) return 'lista';
  return entrada.revisionFallo ? 'sin_red' : 'al_dia';
}

export function mismoSha256(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function hex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function tamanoTexto(bytes: number): string {
  if (bytes < 1024 * 1024) return `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function porcentaje(hecho: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((hecho / total) * 100)));
}

export interface HashIncremental {
  update: (datos: Uint8Array) => unknown;
  digest: () => Uint8Array;
}

/** Alimenta un hash con bloques de `siguiente` (bloque vacío = fin) y devuelve el digest en hex: la APK nunca entra entera en memoria. */
export async function hashPorBloques(siguiente: () => Promise<Uint8Array>, hash: HashIncremental): Promise<string> {
  for (;;) {
    const bloque = await siguiente();
    if (bloque.length === 0) break;
    hash.update(bloque);
  }
  return hex(hash.digest());
}

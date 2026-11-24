// Puro (sin react-native): lo prueba vitest. Puente página ↔ cascarón, CONTRATOS §4.6.
import { decidirNavegacion } from './navegacion';
import type { Novedad } from './actualizaciones/novedades';
import type { Resultado } from './actualizaciones/logica';

export type MensajeEntrante =
  | { tipo: 'pedir_push' }
  | { tipo: 'pantalla_encendida'; activa: boolean }
  | { tipo: 'sin_guardar'; activo: boolean }
  | { tipo: 'buscar_actualizacion' };

export type MensajeSaliente =
  | { tipo: 'push_token'; token: string | null; motivo?: 'sin_permiso' | 'error'; plataforma: 'android'; version: string }
  | {
      tipo: 'estado_app';
      version: string;
      version_code: number | null;
      ota_id: string | null;
      ota_fecha: string | null;
      resultado: Resultado;
      novedades: readonly Novedad[];
    };

const MAX_BYTES = 2000;

/**
 * Lee un mensaje de la página. `null` (se ignora en silencio) si: la página no es del origen permitido, el texto no es
 * un JSON razonable, el `tipo` es desconocido (un panel nuevo convive con un cascarón viejo) o faltan sus datos.
 * Los datos pueden venir planos (`{tipo, activa}`) o en `datos` (`{tipo, datos:{activa}}`).
 */
export function interpretar(crudo: string, urlPagina: string, origen: string): MensajeEntrante | null {
  if (crudo.length > MAX_BYTES || decidirNavegacion(urlPagina, origen) !== 'dentro' || urlPagina.trim().toLowerCase() === 'about:blank') return null;
  let objeto: unknown;
  try {
    objeto = JSON.parse(crudo);
  } catch {
    return null;
  }
  if (typeof objeto !== 'object' || objeto === null) return null;
  const m = objeto as Record<string, unknown>;
  const d = typeof m.datos === 'object' && m.datos !== null ? (m.datos as Record<string, unknown>) : m;
  switch (m.tipo) {
    case 'pedir_push':
      return { tipo: 'pedir_push' };
    case 'buscar_actualizacion':
      return { tipo: 'buscar_actualizacion' };
    case 'pantalla_encendida':
      return typeof d.activa === 'boolean' ? { tipo: 'pantalla_encendida', activa: d.activa } : null;
    case 'sin_guardar':
      return typeof d.activo === 'boolean' ? { tipo: 'sin_guardar', activo: d.activo } : null;
    default:
      return null;
  }
}

/**
 * JavaScript para `injectJavaScript`: entrega el mensaje a la página como un `message` de `window`
 * (`event.data` = el JSON en texto, igual que lo que la página manda). Termina en `true;` como pide react-native-webview.
 */
export function guionParaPagina(mensaje: MensajeSaliente): string {
  const texto = JSON.stringify(JSON.stringify(mensaje));
  return `window.dispatchEvent(new MessageEvent('message',{data:${texto}}));true;`;
}

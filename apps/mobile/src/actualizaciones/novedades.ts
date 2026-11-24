// Sin imports de react-native: lo prueba vitest.
/**
 * Novedades de cada versión del cascarón, la más nueva primero (en palabras del negocio, nada técnico).
 * Obligatorio en cada publicación (CONTRATOS §4.6.1): una APK nueva abre una entrada con la `version` de `app.json`;
 * una OTA agrega una entrada con la misma versión y su fecha. `--notas` de la APK = resumen de la primera entrada.
 * Se muestran en `/notificaciones` › «Esta app» (mensaje `estado_app`).
 */
export interface Novedad {
  /** `version` de app.json (= runtime) que trae estas novedades. */
  version: string;
  /** Día de publicación, AAAA-MM-DD. */
  fecha: string;
  items: readonly string[];
}

export const NOVEDADES: readonly Novedad[] = [
  {
    version: '0.1.0',
    fecha: '2026-11-23',
    items: ['Primera versión de la app: el panel de Chevecheve con avisos en el teléfono, cámara, ubicación y la pantalla encendida durante la ruta.'],
  },
];

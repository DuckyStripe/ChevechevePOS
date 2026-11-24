import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Completa `app.json` con lo que depende del entorno de compilación (CONTRATOS §4.6.1):
 * - `updates.url` sale de `EXPO_PUBLIC_URL_PANEL` y solo si es `https://`; sin ella `expo-updates` queda apagado (desarrollo).
 * - La firma de manifiestos solo se activa si existe `certs/certificado.pem` (certificado público, va al repo).
 * - `google-services.json` NUNCA está en git: se toma de `GOOGLE_SERVICES_JSON` o de `./google-services.json` si existe.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const panel = (process.env.EXPO_PUBLIC_URL_PANEL ?? '').trim().replace(/\/+$/, '');
  const urlActualizaciones = /^https:\/\//.test(panel) ? `${panel}/api/movil/actualizaciones/manifiesto` : undefined;
  const certificado = './certs/certificado.pem';
  const firma = existsSync(resolve(__dirname, certificado));
  // Nunca se publica una app que acepte manifiestos sin firma: con URL de actualizaciones, el certificado es obligatorio.
  if (urlActualizaciones !== undefined && !firma) {
    throw new Error('EXPO_PUBLIC_URL_PANEL es https pero falta certs/certificado.pem (ver certs/README.md): la app aceptaría actualizaciones sin firma.');
  }
  const servicios = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';
  const hayServicios = existsSync(resolve(__dirname, servicios));
  return {
    ...config,
    name: config.name ?? 'Chevecheve',
    slug: config.slug ?? 'chevechevepos',
    android: { ...config.android, ...(hayServicios ? { googleServicesFile: servicios } : {}) },
    updates: {
      ...config.updates,
      enabled: urlActualizaciones !== undefined,
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
      ...(urlActualizaciones ? { url: urlActualizaciones } : {}),
      ...(firma ? { codeSigningCertificate: certificado, codeSigningMetadata: { keyid: 'main', alg: 'rsa-v1_5-sha256' } } : {}),
    },
  };
};

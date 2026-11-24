import { sha256 } from '@noble/hashes/sha2.js';
import { describe, expect, it } from 'vitest';
import {
  APLICAR_TRAS_FONDO_MS,
  apkMasNueva,
  bloqueadaPorObligatoria,
  codigoInstalado,
  debeRevisar,
  decidirAplicar,
  estaPospuesta,
  hashPorBloques,
  hex,
  leerApk,
  mismoSha256,
  porcentaje,
  posponerHasta,
  POSPONER_MS,
  REVISAR_CADA_MS,
  resultadoDe,
  tamanoTexto,
  urlDeApk,
} from './logica';

const SHA = 'a'.repeat(64);
const buena = { version_code: 3, version_name: '0.2.0', archivo: 'chevecheve-3.apk', sha256: SHA, tamano_bytes: 1000, notas: 'Nuevo', obligatoria: false };

describe('leerApk', () => {
  it('acepta una respuesta válida', () => {
    expect(leerApk(buena)).toEqual({ versionCode: 3, versionName: '0.2.0', archivo: 'chevecheve-3.apk', url: null, sha256: SHA, tamanoBytes: 1000, notas: 'Nuevo', obligatoria: false });
  });
  it('toma el nombre del archivo de `url` si falta `archivo`', () => {
    expect(leerApk({ ...buena, archivo: undefined, url: '/api/movil/actualizaciones/apk/chevecheve-3.apk' })?.archivo).toBe('chevecheve-3.apk');
  });
  it('lo raro es null (nunca bloquea ni instala)', () => {
    for (const mala of [null, 5, 'x', { ...buena, version_code: 0 }, { ...buena, sha256: 'zz' }, { ...buena, archivo: '../x.apk' }, { ...buena, archivo: 'otra.apk' }, { ...buena, tamano_bytes: -1 }]) {
      expect(leerApk(mala)).toBeNull();
    }
  });
  it('obligatoria solo si es exactamente true', () => {
    expect(leerApk({ ...buena, obligatoria: 'true' })?.obligatoria).toBe(false);
    expect(leerApk({ ...buena, obligatoria: true })?.obligatoria).toBe(true);
  });
});

describe('urlDeApk', () => {
  it('arma la URL con el origen del panel', () => {
    expect(urlDeApk('https://p.mx/', { archivo: 'chevecheve-3.apk', url: null })).toBe('https://p.mx/api/movil/actualizaciones/apk/chevecheve-3.apk');
    expect(urlDeApk('https://p.mx', { archivo: '../x', url: null })).toBeNull();
  });
  it('resuelve la ruta relativa del servidor y solo acepta el mismo origen', () => {
    const o = 'https://p.mx';
    const a = 'chevecheve-3.apk';
    expect(urlDeApk(o, { archivo: a, url: '/api/movil/actualizaciones/apk/chevecheve-3.apk' })).toBe(`${o}/api/movil/actualizaciones/apk/${a}`);
    expect(urlDeApk(o, { archivo: a, url: `${o}/api/movil/actualizaciones/apk/${a}` })).toBe(`${o}/api/movil/actualizaciones/apk/${a}`);
    for (const url of [`https://evil.com/api/movil/actualizaciones/apk/${a}`, `//evil.com/api/movil/actualizaciones/apk/${a}`, `https://p.mx.evil.com/api/movil/actualizaciones/apk/${a}`, '/api/otra/chevecheve-3.apk', '/api/movil/actualizaciones/apk/../x.apk', '/api/movil/actualizaciones/apk/otra.apk']) {
      expect(urlDeApk(o, { archivo: a, url })).toBeNull();
    }
  });
});

describe('versión instalada y bloqueo', () => {
  it('codigoInstalado', () => {
    expect(codigoInstalado('12')).toBe(12);
    expect(codigoInstalado(' 7 ')).toBe(7);
    expect(codigoInstalado('1.2')).toBeNull();
    expect(codigoInstalado(null)).toBeNull();
  });
  it('apkMasNueva exige código mayor y conocido', () => {
    expect(apkMasNueva(3, 2)).toBe(true);
    expect(apkMasNueva(2, 2)).toBe(false);
    expect(apkMasNueva(3, null)).toBe(false);
  });
  it('solo bloquea una obligatoria más nueva; sin respuesta nunca', () => {
    expect(bloqueadaPorObligatoria({ versionCode: 3, obligatoria: true }, 2)).toBe(true);
    expect(bloqueadaPorObligatoria({ versionCode: 3, obligatoria: false }, 2)).toBe(false);
    expect(bloqueadaPorObligatoria({ versionCode: 2, obligatoria: true }, 2)).toBe(false);
    expect(bloqueadaPorObligatoria(null, 2)).toBe(false);
    expect(bloqueadaPorObligatoria({ versionCode: 3, obligatoria: true }, null)).toBe(false);
  });
});

describe('cuándo revisar y aplicar la OTA', () => {
  it('revisa como mucho cada 30 min', () => {
    expect(debeRevisar(null, 1000)).toBe(true);
    expect(debeRevisar(1000, 1000 + REVISAR_CADA_MS - 1)).toBe(false);
    expect(debeRevisar(1000, 1000 + REVISAR_CADA_MS)).toBe(true);
    expect(debeRevisar(5000, 1000)).toBe(true);
  });
  it('al abrir aplica; abierta espera ≥ 5 min en segundo plano', () => {
    expect(decidirAplicar({ pendiente: true, sinGuardar: false, alAbrir: true, ausenteMs: null })).toBe('aplicar');
    expect(decidirAplicar({ pendiente: true, sinGuardar: false, alAbrir: false, ausenteMs: null })).toBe('esperar');
    expect(decidirAplicar({ pendiente: true, sinGuardar: false, alAbrir: false, ausenteMs: APLICAR_TRAS_FONDO_MS - 1 })).toBe('esperar');
    expect(decidirAplicar({ pendiente: true, sinGuardar: false, alAbrir: false, ausenteMs: APLICAR_TRAS_FONDO_MS })).toBe('aplicar');
    expect(decidirAplicar({ pendiente: false, sinGuardar: false, alAbrir: true, ausenteMs: null })).toBe('esperar');
  });
  it('nunca reinicia con trabajo sin guardar: avisa', () => {
    expect(decidirAplicar({ pendiente: true, sinGuardar: true, alAbrir: true, ausenteMs: null })).toBe('aviso');
    expect(decidirAplicar({ pendiente: true, sinGuardar: true, alAbrir: false, ausenteMs: APLICAR_TRAS_FONDO_MS })).toBe('aviso');
    expect(decidirAplicar({ pendiente: true, sinGuardar: true, alAbrir: false, ausenteMs: 1 })).toBe('esperar');
  });
});

describe('«Más tarde»', () => {
  it('calla 24 h', () => {
    const hasta = posponerHasta(1000);
    expect(hasta).toBe(1000 + POSPONER_MS);
    expect(estaPospuesta(hasta, 1001)).toBe(true);
    expect(estaPospuesta(hasta, hasta)).toBe(false);
    expect(estaPospuesta(null, 1)).toBe(false);
    expect(estaPospuesta(Number.NaN, 1)).toBe(false);
  });
});

describe('resultadoDe', () => {
  it('prioriza apk, luego lista, luego sin_red', () => {
    expect(resultadoDe({ apkNueva: true, otaLista: true, revisionFallo: true })).toBe('apk');
    expect(resultadoDe({ apkNueva: false, otaLista: true, revisionFallo: true })).toBe('lista');
    expect(resultadoDe({ apkNueva: false, otaLista: false, revisionFallo: true })).toBe('sin_red');
    expect(resultadoDe({ apkNueva: false, otaLista: false, revisionFallo: false })).toBe('al_dia');
  });
});

describe('sha256 de la APK', () => {
  it('compara sin importar mayúsculas ni espacios', () => {
    expect(mismoSha256(' ABC ', 'abc')).toBe(true);
    expect(mismoSha256('abc', 'abd')).toBe(false);
  });
  it('hashPorBloques da el mismo digest que el hash completo', async () => {
    const datos = new Uint8Array(2500).map((_, i) => i % 251);
    let pos = 0;
    const siguiente = () => {
      const bloque = datos.slice(pos, pos + 1000);
      pos += 1000;
      return Promise.resolve(bloque);
    };
    expect(await hashPorBloques(siguiente, sha256.create())).toBe(hex(sha256(datos)));
  });
});

describe('textos', () => {
  it('tamano y porcentaje', () => {
    expect(tamanoTexto(500)).toBe('1 KB');
    expect(tamanoTexto(80 * 1024 * 1024)).toBe('80.0 MB');
    expect(porcentaje(50, 200)).toBe(25);
    expect(porcentaje(5, 0)).toBe(0);
    expect(porcentaje(300, 200)).toBe(100);
  });
});

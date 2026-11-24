import { File, Paths } from 'expo-file-system';
import { estaPospuesta, posponerHasta } from './logica';

function archivo(): File {
  return new File(Paths.document, 'actualizaciones.json');
}

async function leer(): Promise<Record<string, number>> {
  try {
    const f = archivo();
    if (!f.exists) return {};
    const crudo: unknown = JSON.parse(await f.text());
    if (typeof crudo !== 'object' || crudo === null) return {};
    return Object.fromEntries(Object.entries(crudo).filter((e): e is [string, number] => typeof e[1] === 'number'));
  } catch {
    return {};
  }
}

/** «Más tarde» de una versión de APK, solo en el teléfono. Nunca lanza. */
export async function versionPospuesta(versionCode: number, ahoraMs: number): Promise<boolean> {
  return estaPospuesta((await leer())[String(versionCode)] ?? null, ahoraMs);
}

export async function posponerVersion(versionCode: number, ahoraMs: number): Promise<void> {
  try {
    const f = archivo();
    if (f.exists) f.delete();
    f.create();
    await f.write(JSON.stringify({ [String(versionCode)]: posponerHasta(ahoraMs) }));
  } catch {
    // Si no se puede recordar, el aviso vuelve al abrir otra vez.
  }
}

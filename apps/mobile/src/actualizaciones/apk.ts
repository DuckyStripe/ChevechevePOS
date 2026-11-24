import { sha256 } from '@noble/hashes/sha2.js';
import { File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { hashPorBloques, mismoSha256, type ApkUltima } from './logica';

export type FalloInstalacion = 'descarga' | 'corrupta' | 'instalador';

export class ErrorInstalacion extends Error {
  constructor(readonly motivo: FalloInstalacion) {
    super(motivo);
  }
}

const FLAG_GRANT_READ_URI_PERMISSION = 1;
const FLAG_ACTIVITY_NEW_TASK = 0x10000000;
const MIME_APK = 'application/vnd.android.package-archive';
/** Bloques de 1 MB para el hash: la APK (~80 MB) nunca entra entera en memoria. */
const BLOQUE_BYTES = 1024 * 1024;

/** Descarga la APK a la caché (reemplaza una vieja) con progreso. Lanza ErrorInstalacion('descarga'). */
export async function descargarApk(url: string, apk: ApkUltima, alAvanzar: (hecho: number, total: number) => void): Promise<string> {
  const destino = new File(Paths.cache, `chevecheve-${String(apk.versionCode)}.apk`);
  try {
    if (destino.exists) destino.delete();
    const tarea = LegacyFileSystem.createDownloadResumable(url, destino.uri, {}, (d) => {
      alAvanzar(d.totalBytesWritten, d.totalBytesExpectedToWrite > 0 ? d.totalBytesExpectedToWrite : apk.tamanoBytes);
    });
    const resultado = await tarea.downloadAsync();
    if (!resultado || resultado.status !== 200) throw new ErrorInstalacion('descarga');
    return destino.uri;
  } catch (error) {
    borrarEnSilencio(destino);
    throw error instanceof ErrorInstalacion ? error : new ErrorInstalacion('descarga');
  }
}

/** Tamaño y SHA-256 contra lo publicado. Si no coincide borra el archivo y NO se instala. Lanza ErrorInstalacion('corrupta'). */
export async function verificarApk(uri: string, apk: ApkUltima): Promise<void> {
  const archivo = new File(uri);
  try {
    if (archivo.size !== apk.tamanoBytes) throw new ErrorInstalacion('corrupta');
    const asa = archivo.open();
    let digest: string;
    try {
      let leidos = 0;
      digest = await hashPorBloques(async () => {
        // Cada pocos MB se cede un turno al hilo de JS para que «Verificando…» se pinte.
        if (++leidos % 4 === 0) await new Promise<void>((seguir) => setTimeout(seguir, 0));
        return asa.readBytes(BLOQUE_BYTES);
      }, sha256.create());
    } finally {
      asa.close();
    }
    if (!mismoSha256(digest, apk.sha256)) throw new ErrorInstalacion('corrupta');
  } catch (error) {
    borrarEnSilencio(archivo);
    throw error instanceof ErrorInstalacion ? error : new ErrorInstalacion('corrupta');
  }
}

/** Abre el instalador de Android (siempre pide confirmar). Lanza ErrorInstalacion('instalador'). */
export async function abrirInstalador(uri: string): Promise<void> {
  try {
    const contenido = await LegacyFileSystem.getContentUriAsync(uri);
    await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
      data: contenido,
      flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK,
      type: MIME_APK,
    });
  } catch {
    throw new ErrorInstalacion('instalador');
  }
}

function borrarEnSilencio(archivo: File): void {
  try {
    if (archivo.exists) archivo.delete();
  } catch {
    // Un archivo sobrante en la caché no hace daño.
  }
}

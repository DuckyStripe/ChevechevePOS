import { generateKeyPairSync, createPublicKey, type KeyObject } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RAIZ = join(import.meta.dirname, "..");
export const DIST = join(RAIZ, "test/fixtures/ota/dist");
export const EXPO_CONFIG = join(RAIZ, "test/fixtures/ota/expo-config.json");
export const URL_BASE = "https://panel.ejemplo.test";

export const carpeta = (p = "chv-ota-") => mkdtempSync(join(tmpdir(), p));

/** Llave RSA de prueba: archivo PEM privado + clave publica para verificar. */
export function llavePrueba(dir: string): { ruta: string; publica: KeyObject } {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const ruta = join(dir, "llave-privada.pem");
  writeFileSync(ruta, privateKey.export({ type: "pkcs8", format: "pem" }) as string, { mode: 0o600 });
  return { ruta, publica: createPublicKey(privateKey) };
}

/** Corre un script ota-*.mjs como lo haria el dueno (proceso aparte). */
export function correr(script: "ota-publicar" | "ota-publicar-apk" | "ota-regresar", args: string[]) {
  // Sin --certificado explicito se apunta a un archivo que no existe: no depende de apps/mobile/certs/certificado.pem real.
  const con = script !== "ota-publicar-apk" && !args.includes("--certificado") ? [...args, "--certificado", join(tmpdir(), "no-hay-certificado.pem")] : args;
  const r = spawnSync(process.execPath, [join(RAIZ, `scripts/${script}.mjs`), ...con], { encoding: "utf8", cwd: RAIZ });
  return { codigo: r.status, salida: r.stdout, error: r.stderr };
}

export const idDe = (salida: string) => /^id: (\S+)$/m.exec(salida)![1]!;

export function publicar(salida: string, llave: string, runtime = "1.0.0") {
  return correr("ota-publicar", ["--dist", DIST, "--runtime", runtime, "--llave", llave, "--expo-config", EXPO_CONFIG, "--url-base", URL_BASE, "--salida", salida]);
}

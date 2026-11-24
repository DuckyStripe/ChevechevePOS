// Publica una APK nueva del cascarón en --salida (carpeta local; luego docker cp al volumen). Nunca repite un versionCode.
// Uso: node scripts/ota-publicar-apk.mjs --apk <archivo> --version-code <n> --version-name <x.y.z> --runtime <rv> --notas "<texto>" [--obligatoria] --salida <dir>
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { leerApk } from "./ota/apk.mjs";
import { ejecutar, escribirAtomico, existe, leerArgs, runtimeValido } from "./ota/comun.mjs";

export const PAQUETE = "com.chevechevepos.app";

export async function publicarApk({ apk, versionCode, versionName, runtime, notas, obligatoria = false, salida, ahora = () => new Date() }) {
  if (!runtimeValido(runtime)) throw new Error("--runtime no es válido.");
  if (!Number.isInteger(versionCode) || versionCode < 1 || versionCode > 999_999) throw new Error("--version-code debe ser un entero de 1 a 999999.");
  if (!/^[0-9A-Za-z._+-]{1,32}$/.test(versionName)) throw new Error("--version-name tiene caracteres no válidos.");
  if (notas.length > 2000) throw new Error("--notas es demasiado largo (máximo 2000 caracteres).");
  // Lo que se anuncia debe ser lo que trae el APK: si no, los teléfonos instalarían algo distinto de lo que dice el aviso.
  const info = await leerApk(resolve(apk));
  if (info.paquete !== PAQUETE) throw new Error(`El APK es del paquete ${info.paquete}, no de ${PAQUETE}.`);
  if (info.versionCode !== versionCode) throw new Error(`--version-code ${versionCode} no coincide con el del APK (${info.versionCode}).`);
  if (info.versionName !== versionName) throw new Error(`--version-name ${versionName} no coincide con el del APK (${info.versionName}).`);
  if (info.depuracion) throw new Error("El APK está firmado con la llave de depuración de Android. Compílalo con la llave de release.");
  const archivo = `chevecheve-${versionCode}.apk`;
  const out = resolve(salida);
  const destino = join(out, "apk", archivo);
  // Un versionCode ya publicado nunca se pisa (Android no instala dos APK distintas con el mismo código).
  if (await existe(destino)) throw new Error(`El versionCode ${versionCode} ya está publicado. Usa uno mayor.`);
  const previa = await readFile(join(out, "apk", "ultima.json"), "utf8").then((t) => JSON.parse(t), () => null);
  if (previa && Number.isInteger(previa.version_code) && versionCode <= previa.version_code) {
    throw new Error(`El versionCode ${versionCode} no es mayor que el último publicado (${previa.version_code}).`);
  }

  await mkdir(dirname(destino), { recursive: true });
  const tmp = `${destino}.tmp-${process.pid}-${randomUUID()}`;
  const hash = createHash("sha256");
  let tamano = 0;
  try {
    await pipeline(
      createReadStream(resolve(apk)),
      new Transform({ transform(trozo, _c, cb) { hash.update(trozo); tamano += trozo.length; cb(null, trozo); } }),
      createWriteStream(tmp, { mode: 0o644 }),
    );
    if (tamano === 0) throw new Error("La APK está vacía.");
    await rename(tmp, destino);
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
  const sha = hash.digest("hex");
  const ultima = {
    version_code: versionCode, version_name: versionName, runtime, archivo, sha256: sha, tamano_bytes: tamano, notas,
    obligatoria, publicada_en: ahora().toISOString(),
  };
  await escribirAtomico(join(out, "apk", "ultima.json"), `${JSON.stringify(ultima, null, 2)}\n`);
  return { archivo, sha256: sha, tamano_bytes: tamano };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ejecutar(async () => {
    const v = leerArgs(process.argv.slice(2), {
      apk: { type: "string" }, "version-code": { type: "string" }, "version-name": { type: "string" }, runtime: { type: "string" },
      notas: { type: "string" }, obligatoria: { type: "boolean" }, salida: { type: "string" },
    }, ["apk", "version-code", "version-name", "runtime", "notas", "salida"]);
    const r = await publicarApk({
      apk: v.apk, versionCode: Number(v["version-code"]), versionName: v["version-name"], runtime: v.runtime, notas: v.notas,
      obligatoria: v.obligatoria === true, salida: v.salida,
    });
    console.log(`APK publicada: ${r.archivo}`);
    console.log(`sha256: ${r.sha256}  tamaño: ${r.tamano_bytes} bytes`);
  });
}

// Publica una OTA del cascaron: arma el manifiesto Expo Updates v1 desde `expo export`, lo firma y lo deja en --salida.
// Uso: node scripts/ota-publicar.mjs [--certificado <pem>] --dist <carpeta> --runtime <rv> --llave <pem> --expo-config <json> --url-base <https://dominio> --salida <dir>
// Despues se copia al volumen con docker cp (docs/deploy/actualizar-app.md). Imprime el id de la actualizacion.
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  adentro, cargarLlave, ejecutar, escribirAtomico, existe, leerArgs, PREFIJO_API, publicarActualizacion, runtimeValido, sha256,
} from "./ota/comun.mjs";

const TIPOS = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2", json: "application/json",
  mp3: "audio/mpeg", mp4: "video/mp4", wav: "audio/wav", txt: "text/plain",
};
const TIPO_BUNDLE = "application/javascript";

async function leerConfig(ruta) {
  let crudo;
  try {
    crudo = await readFile(resolve(ruta), "utf8");
  } catch {
    throw new Error(`--expo-config: no se puede leer ${ruta}. Genéralo con: npx expo config --json --type public > <archivo>`);
  }
  let json;
  try {
    json = JSON.parse(crudo);
  } catch {
    throw new Error(`--expo-config: ${ruta} no es JSON válido.`);
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) throw new Error(`--expo-config: ${ruta} debe ser un objeto JSON.`);
  return json;
}

export async function publicar({ dist, runtime, llave: rutaLlave, expoConfig, urlBase, salida, certificado, ahora = () => new Date() }) {
  if (!runtimeValido(runtime)) throw new Error("--runtime no es válido (letras, números, . _ -; máximo 64; sin punto al inicio).");
  const base = urlBase.replace(/\/+$/, "");
  if (!/^https:\/\/[^\s/]+$/.test(base)) throw new Error("--url-base debe ser un origen https:// como https://dominio (sin ruta).");
  const raiz = resolve(dist);
  const out = resolve(salida);
  const llave = await cargarLlave(rutaLlave);

  const meta = JSON.parse(await readFile(join(raiz, "metadata.json"), "utf8"));
  const android = meta?.fileMetadata?.android;
  if (!android || typeof android.bundle !== "string" || !Array.isArray(android.assets)) throw new Error("metadata.json no trae fileMetadata.android (¿corriste expo export --platform android?).");

  const guardados = new Set();
  let nuevos = 0;
  const ingerir = async (rel, tipo) => {
    const completa = resolve(raiz, rel);
    if (!adentro(raiz, completa)) throw new Error(`Ruta fuera de dist: ${rel}`);
    const bytes = await readFile(completa);
    const h = sha256(bytes);
    const hex = h.copy().digest("hex");
    const destino = join(out, "recursos", hex);
    if (!(await existe(destino))) {
      await escribirAtomico(destino, bytes);
      nuevos += 1;
    }
    await escribirAtomico(`${destino}.tipo`, `${tipo}\n`);
    guardados.add(hex);
    return { hash: h.digest("base64url"), key: createHash("md5").update(bytes).digest("hex"), contentType: tipo, url: `${base}${PREFIJO_API}/recursos/${hex}` };
  };

  const launchAsset = await ingerir(android.bundle, TIPO_BUNDLE);
  const assets = [];
  const vistos = new Set();
  for (const a of android.assets) {
    if (typeof a.path !== "string" || typeof a.ext !== "string" || !/^[A-Za-z0-9]*$/.test(a.ext)) throw new Error("metadata.json: recurso mal formado.");
    const ext = a.ext.toLowerCase();
    const e = await ingerir(a.path, TIPOS[ext] ?? "application/octet-stream");
    if (vistos.has(e.key)) continue;
    vistos.add(e.key);
    assets.push({ ...e, fileExtension: ext === "" ? "" : `.${ext}` });
  }

  const id = randomUUID();
  const manifiesto = JSON.stringify({
    id, createdAt: ahora().toISOString(), runtimeVersion: runtime, launchAsset, assets, metadata: {}, extra: { expoClient: await leerConfig(expoConfig) },
  });
  await publicarActualizacion(out, runtime, id, manifiesto, llave, certificado);
  return { id, recursos: guardados.size, nuevos };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ejecutar(async () => {
    const v = leerArgs(process.argv.slice(2), {
      dist: { type: "string" }, runtime: { type: "string" }, llave: { type: "string" },
      "expo-config": { type: "string" }, "url-base": { type: "string" }, salida: { type: "string" }, certificado: { type: "string" },
    }, ["dist", "runtime", "llave", "expo-config", "url-base", "salida"]);
    const r = await publicar({ dist: v.dist, runtime: v.runtime, llave: v.llave, expoConfig: v["expo-config"], urlBase: v["url-base"], salida: v.salida, certificado: v.certificado });
    console.log(`OTA publicada en ${v.salida}`);
    console.log(`id: ${r.id}`);
    console.log(`runtime: ${v.runtime}  recursos: ${r.recursos} (${r.nuevos} nuevos)`);
  });
}

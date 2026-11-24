// Utilidades de los scripts ota-* (CONTRATOS §4.6.1). Corren en el servidor, nunca por HTTP. La llave privada se lee
// de --llave y nunca se copia, se imprime ni se escribe. Cada archivo se escribe con nombre temporal y se renombra;
// `actual.json` y `apk/ultima.json` van al final: la API (que solo lee) nunca ve una publicacion a medias.
import { Buffer } from "node:buffer";
import { createHash, createPrivateKey, createPublicKey, randomUUID, sign, verify } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export const RUNTIME_RE = /^[A-Za-z0-9._-]{1,64}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const PREFIJO_API = "/api/movil/actualizaciones";

export const runtimeValido = (rv) => RUNTIME_RE.test(rv) && !rv.startsWith(".");

export function adentro(raiz, destino) {
  const rel = relative(raiz, destino);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/** Valor de la cabecera expo-signature: diccionario SFV con `sig` entre comillas. */
export const cabeceraFirma = (firmaBase64) => `sig="${firmaBase64}", keyid="main", alg="rsa-v1_5-sha256"`;

export async function cargarLlave(ruta) {
  const llave = createPrivateKey(await readFile(ruta, "utf8"));
  if (llave.asymmetricKeyType !== "rsa" || (llave.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) {
    throw new Error("La llave de firma debe ser RSA de al menos 2048 bits.");
  }
  return llave;
}

/** RSASSA-PKCS1-v1_5 / SHA-256 sobre el texto exacto, en base64; se verifica con la mitad publica antes de devolverla. */
export function firmar(texto, llave) {
  const datos = Buffer.from(texto, "utf8");
  const firma = sign("sha256", datos, llave);
  if (!verify("sha256", datos, createPublicKey(llave), firma)) throw new Error("La firma no paso su autoverificacion.");
  return firma.toString("base64");
}

export async function escribirAtomico(ruta, datos) {
  await mkdir(dirname(ruta), { recursive: true });
  const tmp = `${ruta}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(tmp, datos, { mode: 0o644 });
    await rename(tmp, ruta);
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
}

export async function existe(ruta) {
  try {
    return (await stat(ruta)).isFile();
  } catch {
    return false;
  }
}

export const sha256 = (bytes) => createHash("sha256").update(bytes);

const CERTIFICADO_DEFECTO = join(dirname(fileURLToPath(import.meta.url)), "../../../mobile/certs/certificado.pem");

/** Verifica la firma contra el certificado que lleva la APK. Sin certificado avisa y sigue (no hay con qué comparar). */
async function verificarContraCertificado(texto, firmaBase64, ruta) {
  let pem;
  try {
    pem = await readFile(ruta, "utf8");
  } catch {
    console.warn(`AVISO: no se verificó la firma porque no existe ${ruta} (apps/mobile/certs/certificado.pem). Sin ese certificado la APK tampoco verifica OTA.`);
    return;
  }
  if (!verify("sha256", Buffer.from(texto, "utf8"), createPublicKey(pem), Buffer.from(firmaBase64, "base64"))) {
    throw new Error("La llave privada no corresponde al certificado de la APK (certs/certificado.pem). No se movió actual.json.");
  }
}

/** Escribe manifiesto + firma de una actualizacion, la verifica contra el certificado y SOLO entonces mueve `actual.json`. */
export async function publicarActualizacion(salida, runtime, id, textoManifiesto, llave, certificado = CERTIFICADO_DEFECTO) {
  const dir = join(salida, "android", runtime, "updates", id);
  const firma = firmar(textoManifiesto, llave);
  await verificarContraCertificado(textoManifiesto, firma, certificado);
  await escribirAtomico(join(dir, "manifest.json"), textoManifiesto);
  await escribirAtomico(join(dir, "firma"), `${cabeceraFirma(firma)}\n`);
  await escribirAtomico(join(salida, "android", runtime, "actual.json"), `${JSON.stringify({ update_id: id })}\n`);
}

/** Analiza banderas (--x valor), acepta un `--` suelto de `npm run` y exige las obligatorias. */
export function leerArgs(argv, opciones, obligatorias) {
  const { values } = parseArgs({ args: argv.filter((a) => a !== "--"), options: opciones, strict: true, allowPositionals: false });
  for (const n of obligatorias) {
    if (values[n] === undefined || values[n] === "") throw new Error(`Falta --${n}`);
  }
  return values;
}

export function ejecutar(principal) {
  principal().catch((e) => {
    process.stderr.write(`${e instanceof Error ? e.message : "Error inesperado"}\n`);
    process.exitCode = 1;
  });
}

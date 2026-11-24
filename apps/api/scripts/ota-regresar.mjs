// Regresa el cascaron a una OTA buena: la vuelve a emitir con id y fecha nuevos (mismos recursos), firmada y apuntada como actual.
// Así también regresan los teléfonos que ya bajaron la mala (expo-updates ignora manifiestos más viejos).
// Uso: node scripts/ota-regresar.mjs --runtime <rv> --a <uuid bueno> --llave <pem> --salida <dir>
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cargarLlave, ejecutar, existe, leerArgs, publicarActualizacion, runtimeValido, UUID_RE } from "./ota/comun.mjs";

export async function regresar({ runtime, a, llave: rutaLlave, salida, certificado, ahora = () => new Date() }) {
  if (!runtimeValido(runtime)) throw new Error("--runtime no es válido.");
  if (!UUID_RE.test(a)) throw new Error("--a debe ser el id (uuid) de una actualización.");
  const out = resolve(salida);
  const dir = join(out, "android", runtime, "updates", a);
  const original = await readFile(join(dir, "manifest.json"), "utf8").catch(() => null);
  if (original === null || !(await existe(join(dir, "firma")))) throw new Error("Esa actualización no existe para este runtime.");
  const llave = await cargarLlave(rutaLlave);
  const id = randomUUID();
  const manifiesto = JSON.stringify({ ...JSON.parse(original), id, createdAt: ahora().toISOString() });
  await publicarActualizacion(out, runtime, id, manifiesto, llave, certificado);
  return { id };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ejecutar(async () => {
    const v = leerArgs(process.argv.slice(2), { runtime: { type: "string" }, a: { type: "string" }, llave: { type: "string" }, salida: { type: "string" }, certificado: { type: "string" } }, ["runtime", "a", "llave", "salida"]);
    const r = await regresar({ runtime: v.runtime, a: v.a, llave: v.llave, salida: v.salida, certificado: v.certificado });
    console.log(`Regresado a ${v.a} como actualización nueva`);
    console.log(`id: ${r.id}`);
  });
}

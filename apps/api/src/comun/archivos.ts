import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "../config/env.js";
import { AppError } from "./errores.js";

export const LIMITE_BYTES = 1_048_576;

/** Tipo por bytes magicos (CONTRATOS §4.5): nunca por nombre ni Content-Type. */
export function extensionPorBytes(b: Buffer): "jpg" | "png" | "webp" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "webp";
  return null;
}

/** Guarda una imagen en ARCHIVOS_DIR/<sub>/<sha256>.<ext> (escritura atomica) y devuelve el nombre. */
export async function guardarImagen(sub: "imagenes" | "comprobantes", datos: Buffer): Promise<string> {
  if (datos.length > LIMITE_BYTES) throw new AppError("ARCHIVO_GRANDE");
  const ext = extensionPorBytes(datos);
  if (!ext) throw new AppError("IMAGEN_NO_VALIDA");
  const nombre = `${createHash("sha256").update(datos).digest("hex")}.${ext}`;
  const dir = join(env.ARCHIVOS_DIR, sub);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.${randomUUID()}.tmp`);
  await writeFile(tmp, datos);
  await rename(tmp, join(dir, nombre));
  return nombre;
}

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../../config/env.js";

/** Token del enlace del cliente: 32 bytes aleatorios en base64url. Nunca se loguea ni vuelve en una respuesta salvo dentro de un aviso. */
export const nuevoToken = (): string => randomBytes(32).toString("base64url");

/** sha256 hex: lo unico del token que ve SQL para buscar el enlace. */
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

const llave = () => createHash("sha256").update(env.SECRETO_ENLACES).digest(); // 32 bytes para AES-256

/** AES-256-GCM: iv(12) || tag(16) || cifrado. Es lo que se guarda en `cliente_enlace.token_cifrado`. */
export function cifrar(token: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", llave(), iv);
  const cuerpo = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), cuerpo]);
}

/** Lanza si el tag no cuadra (dato alterado). */
export function descifrar(datos: Buffer): string {
  const d = createDecipheriv("aes-256-gcm", llave(), datos.subarray(0, 12));
  d.setAuthTag(datos.subarray(12, 28));
  return Buffer.concat([d.update(datos.subarray(28)), d.final()]).toString("utf8");
}

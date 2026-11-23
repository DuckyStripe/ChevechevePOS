import { createHash } from "node:crypto";

function canonico(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonico);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => [k, canonico(x)]),
    );
  }
  return v;
}

/** sha256 del JSON canonico (llaves ordenadas) del cuerpo, sin `clave_idempotencia` (CONTRATOS §4.2). */
export function hashSolicitud(cuerpo: Record<string, unknown>): string {
  const resto = { ...cuerpo };
  delete resto.clave_idempotencia;
  return createHash("sha256").update(JSON.stringify(canonico(resto))).digest("hex");
}

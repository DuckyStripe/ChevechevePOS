"use client";

export type ErrorApi = { codigo: string; mensaje: string; detalles?: unknown; status: number };
export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: ErrorApi };

/** Llamada del navegador al BFF (`/api/...`). Nunca se muestra `codigo`: solo `mensaje` (P6). */
export async function llamar<T = null>(
  metodo: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  ruta: string,
  cuerpo?: unknown,
): Promise<Resultado<T>> {
  let r: Response;
  try {
    r = await fetch(`/api${ruta}`, {
      method: metodo,
      headers: cuerpo === undefined ? undefined : { "content-type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      error: { status: 0, codigo: "SIN_RED", mensaje: "No hay conexión. No se guardó nada; revisa tu señal e intenta otra vez." },
    };
  }
  const datos = r.status === 204 ? null : await r.json().catch(() => null);
  if (r.ok) return { ok: true, datos: datos as T };
  const e = (datos as { error?: Partial<ErrorApi> } | null)?.error;
  return {
    ok: false,
    error: { status: r.status, codigo: e?.codigo ?? "ERROR_INTERNO", mensaje: e?.mensaje ?? "Algo salió mal. Intenta de nuevo.", detalles: e?.detalles },
  };
}

/** Subida de archivos (multipart) al BFF. Sin `content-type`: el navegador pone el boundary. Tope del BFF: 1 MB. */
export async function subirArchivo<T = null>(ruta: string, formulario: FormData, metodo: "PUT" | "POST" = "PUT"): Promise<Resultado<T>> {
  let r: Response;
  try {
    r = await fetch(`/api${ruta}`, { method: metodo, body: formulario, cache: "no-store" });
  } catch {
    return { ok: false, error: { status: 0, codigo: "SIN_RED", mensaje: "No hay conexión. No se guardó nada; revisa tu señal e intenta otra vez." } };
  }
  const datos = r.status === 204 ? null : await r.json().catch(() => null);
  if (r.ok) return { ok: true, datos: datos as T };
  const e = (datos as { error?: Partial<ErrorApi> } | null)?.error;
  return {
    ok: false,
    error: { status: r.status, codigo: e?.codigo ?? "ERROR_INTERNO", mensaje: e?.mensaje ?? "Algo salió mal. Intenta de nuevo.", detalles: e?.detalles },
  };
}

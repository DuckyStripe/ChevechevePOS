"use client";

import { llamar, type Resultado } from "@/lib/api-cliente";

/** Escritura del enlace por el BFF (`/api/publico/*`). Sesion perdida: manda a la pantalla que explica; nunca muestra codigos. */
export async function llamarPublico<T = null>(metodo: "POST" | "PUT" | "PATCH" | "DELETE", ruta: string, cuerpo?: unknown): Promise<Resultado<T>> {
  const r = await llamar<T>(metodo, `/publico${ruta}`, cuerpo);
  if (!r.ok) irSiSesionPerdida(r.error.codigo);
  return r;
}

export function irSiSesionPerdida(codigo: string) {
  if (codigo === "ENLACE_INVALIDO") window.location.replace("/pedido/invalido");
  else if (codigo === "PIN_REQUERIDO") window.location.replace("/pedido/pin");
}

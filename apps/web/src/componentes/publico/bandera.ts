"use client";

import { useSyncExternalStore } from "react";

/** Banderita por navegador (p. ej. «ya le preguntamos por su ubicacion», C14). Sin almacenamiento cuenta como no puesta en la sesion. */
const EVENTO = "chv-bandera";
const memoria = new Set<string>();

const leer = (k: string) => {
  try {
    return localStorage.getItem(k) === "1" || memoria.has(k);
  } catch {
    return memoria.has(k);
  }
};

export function ponerBandera(k: string) {
  memoria.add(k);
  try {
    localStorage.setItem(k, "1");
  } catch {
    /* queda en memoria */
  }
  window.dispatchEvent(new Event(EVENTO));
}

export function useBandera(k: string): boolean {
  return useSyncExternalStore(
    (a) => {
      window.addEventListener(EVENTO, a);
      return () => window.removeEventListener(EVENTO, a);
    },
    () => leer(k),
    () => true, // en el servidor se oculta: el aviso aparece solo si de verdad no se ha preguntado
  );
}

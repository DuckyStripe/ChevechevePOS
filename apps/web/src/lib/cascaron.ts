"use client";

import { useEffect } from "react";
import type { EstadoApp, PushToken } from "./tipos";

/**
 * Puente página ↔ cascarón Android (CONTRATOS §4.6). Dueño único: las pantallas solo importan estas funciones.
 * Fuera del cascarón todo es no-op. La página manda con `ReactNativeWebView.postMessage(JSON)`; el cascarón responde
 * con un evento `message` de `window` cuyo `data` es el JSON en texto. Un `tipo` desconocido se ignora (versiones mixtas).
 */

type Puente = { postMessage: (texto: string) => void };
const puente = (): Puente | null =>
  typeof window === "undefined" ? null : ((window as unknown as { ReactNativeWebView?: Puente }).ReactNativeWebView ?? null);

export const enCascaron = (): boolean => typeof navigator !== "undefined" && /ChevecheveApp\//.test(navigator.userAgent) && puente() !== null;

export function enviar(tipo: "pedir_push" | "pantalla_encendida" | "sin_guardar" | "buscar_actualizacion", datos: Record<string, unknown> = {}): void {
  puente()?.postMessage(JSON.stringify({ tipo, ...datos }));
}

type Entrantes = { push_token: PushToken; estado_app: EstadoApp };
const ultimo: Partial<Entrantes> = {};

function leer(e: MessageEvent): { tipo: keyof Entrantes; datos: Entrantes[keyof Entrantes] } | null {
  // Solo lo que el cascarón inyecta en esta misma ventana (sin origen ni ventana distinta).
  if (e.source && e.source !== window) return null;
  if (typeof e.data !== "string" || e.data.length > 200_000) return null;
  try {
    const m = JSON.parse(e.data) as { tipo?: unknown } & Record<string, unknown>;
    if (m.tipo !== "push_token" && m.tipo !== "estado_app") return null;
    return { tipo: m.tipo, datos: m as never };
  } catch {
    return null;
  }
}

// El cascarón avisa su estado al cargar la página, a veces antes de que React hidrate: se guarda el último de cada tipo.
if (typeof window !== "undefined") {
  window.addEventListener("message", (e) => {
    const m = leer(e);
    if (m) (ultimo as Record<string, unknown>)[m.tipo] = m.datos;
  });
}

/** Suscripción a un mensaje del cascarón. Devuelve la función que la cancela. */
export function escuchar<T extends keyof Entrantes>(tipo: T, fn: (datos: Entrantes[T]) => void): () => void {
  const alMensaje = (e: MessageEvent) => {
    const m = leer(e);
    if (m?.tipo === tipo) fn(m.datos as Entrantes[T]);
  };
  window.addEventListener("message", alMensaje);
  return () => window.removeEventListener("message", alMensaje);
}

/** Pide permiso de notificaciones y devuelve el token FCM del teléfono (o el motivo por el que no hay). Fuera del cascarón: sin token. */
export function pedirPush(): Promise<PushToken> {
  if (!enCascaron()) return Promise.resolve({ token: null, motivo: "error" });
  return new Promise((resolver) => {
    const cancelar = escuchar("push_token", (d) => {
      clearTimeout(timer);
      cancelar();
      resolver(d);
    });
    const timer = setTimeout(() => {
      cancelar();
      resolver({ token: null, motivo: "error" });
    }, 30_000);
    enviar("pedir_push");
  });
}

export function pantallaEncendida(activa: boolean): void {
  enviar("pantalla_encendida", { activa });
}

export function marcarSinGuardar(activo: boolean): void {
  enviar("sin_guardar", { activo });
}

/** Mientras `sucio` sea true, el cascarón no se reinicia para actualizarse (captura sin guardar). */
export function useSinGuardar(sucio: boolean): void {
  useEffect(() => {
    if (!sucio) return;
    marcarSinGuardar(true);
    return () => marcarSinGuardar(false);
  }, [sucio]);
}

export function buscarActualizacion(): void {
  enviar("buscar_actualizacion");
}

/** Último estado que el cascarón mandó (versión, OTA, resultado y novedades), o null si aún no llega. */
export function estadoApp(): EstadoApp | null {
  return ultimo.estado_app ?? null;
}

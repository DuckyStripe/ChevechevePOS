"use client";

import { useMemo, useSyncExternalStore } from "react";
import { aCentavos, deCentavos, uuid } from "@/componentes/productos/formato";
import type { ArticuloPublico } from "./tipos";

/**
 * Carrito del cliente en el telefono (C8): `localStorage` por cliente, con la `clave_idempotencia` creada al abrir el
 * carrito y conservada hasta un envio con exito. Cada acceso va en try/catch (modo privado, sitio bloqueado): sin
 * almacenamiento el carrito vive en memoria mientras la pestana siga abierta.
 */
export type Carrito = {
  clave: string;
  lineas: Record<string, number>;
  notas: string;
  entrega: "reparto" | "recoge";
  /** Id del pedido `recibido` que se esta cambiando (PATCH); null = pedido nuevo. */
  editando: string | null;
};

const VACIO: Carrito = { clave: "", lineas: {}, notas: "", entrega: "reparto", editando: null };
const EVENTO = "chv-carrito";
const memoria = new Map<string, string>();
const llave = (k: string) => `chv_carrito_${k}`;

function leerCrudo(k: string): string {
  try {
    return localStorage.getItem(llave(k)) ?? memoria.get(k) ?? "";
  } catch {
    return memoria.get(k) ?? "";
  }
}

function escribirCrudo(k: string, valor: string | null) {
  if (valor == null) memoria.delete(k);
  else memoria.set(k, valor);
  try {
    if (valor == null) localStorage.removeItem(llave(k));
    else localStorage.setItem(llave(k), valor);
  } catch {
    /* sin almacenamiento: queda en memoria */
  }
  window.dispatchEvent(new Event(EVENTO));
}

function analizar(crudo: string): Carrito {
  if (!crudo) return VACIO;
  try {
    const o = JSON.parse(crudo) as Partial<Carrito>;
    const lineas: Record<string, number> = {};
    for (const [id, n] of Object.entries(o.lineas ?? {})) if (Number.isInteger(n) && n > 0 && n <= 999) lineas[id] = n;
    return {
      clave: typeof o.clave === "string" ? o.clave : "",
      lineas,
      notas: typeof o.notas === "string" ? o.notas.slice(0, 500) : "",
      entrega: o.entrega === "recoge" ? "recoge" : "reparto",
      editando: typeof o.editando === "string" ? o.editando : null,
    };
  } catch {
    return VACIO;
  }
}

function suscribir(aviso: () => void) {
  window.addEventListener("storage", aviso);
  window.addEventListener(EVENTO, aviso);
  return () => {
    window.removeEventListener("storage", aviso);
    window.removeEventListener(EVENTO, aviso);
  };
}

/** Cambia el carrito de forma atomica; crea la clave de idempotencia al primer cambio. */
export function cambiarCarrito(k: string, f: (c: Carrito) => Carrito) {
  const c = f(analizar(leerCrudo(k)));
  const conClave = { ...c, clave: c.clave || uuid() };
  const vacio = Object.keys(conClave.lineas).length === 0 && !conClave.notas && !conClave.editando;
  escribirCrudo(k, vacio ? null : JSON.stringify(conClave));
}

export const vaciarCarrito = (k: string) => escribirCrudo(k, null);

export function fijarCantidad(k: string, presentacionId: string, cantidad: number) {
  cambiarCarrito(k, (c) => {
    const lineas = { ...c.lineas };
    if (cantidad <= 0) delete lineas[presentacionId];
    else lineas[presentacionId] = Math.min(999, cantidad);
    return { ...c, lineas };
  });
}

/** Reemplaza el carrito con lineas `{presentacion_id, cantidad}` (repetir, lo de siempre, cambiar un pedido). */
export function cargarLineas(k: string, lineas: { presentacion_id: number | string; cantidad: number }[], editando: string | null = null) {
  const mapa: Record<string, number> = {};
  for (const l of lineas) if (l.cantidad > 0) mapa[String(l.presentacion_id)] = Math.min(999, l.cantidad);
  cambiarCarrito(k, (c) => ({ ...c, lineas: mapa, notas: "", editando }));
}

export function useCarrito(k: string): Carrito {
  const crudo = useSyncExternalStore(
    suscribir,
    () => leerCrudo(k),
    () => "",
  );
  return useMemo(() => analizar(crudo), [crudo]);
}

/**
 * Total y piezas del carrito SOLO para mostrarlo (C7) y para el `total_visto` que valida la API:
 * centavos enteros, nunca decimales de JS. La autoridad es SQL (`PRECIOS_CAMBIARON` si no coincide).
 */
export function resumenCarrito(c: Carrito, articulos: ArticuloPublico[]) {
  const porId = new Map(articulos.map((a) => [String(a.presentacion_id), a]));
  let centavos = 0;
  let cantidad = 0;
  const lineas: { articulo: ArticuloPublico; cantidad: number }[] = [];
  const perdidas: string[] = [];
  for (const [id, n] of Object.entries(c.lineas)) {
    const a = porId.get(id);
    const precio = a ? aCentavos(a.precio) : null;
    if (!a || precio == null) {
      perdidas.push(id);
      continue;
    }
    centavos += precio * n;
    cantidad += n;
    lineas.push({ articulo: a, cantidad: n });
  }
  return { total: deCentavos(centavos), cantidad, lineas, perdidas };
}

import { uuid } from "@/componentes/productos/formato";

export type LineaP = { presentacion_id: string; producto: string; presentacion: string; cantidad: number };
export type ClienteP = { id: string; nombre: string; listaId: string | null; lista: string | null };
/** Una venta (pestaña): su `clave_idempotencia` nace al abrirla, no al cobrar, y se conserva al reintentar (C8, P5). */
export type VentaP = { id: string; clave: string; cliente: ClienteP | null; lineas: LineaP[] };
export type Espera = { activa: string; ventas: VentaP[] };

export const MAX_ESPERA = 5;
export const llaveEspera = (usuario: string, caja: string) => `chv:pos-espera:${usuario}:${caja}`;
export const ventaNueva = (): VentaP => ({ id: uuid(), clave: uuid(), cliente: null, lineas: [] });

export function esperaInicial(): Espera {
  const v = ventaNueva();
  return { activa: v.id, ventas: [v] };
}

/** Lee lo guardado en el navegador; cualquier cosa rara se descarta y se empieza limpio. */
export function leerEspera(llave: string): Espera {
  try {
    const o = JSON.parse(localStorage.getItem(llave) ?? "null") as Partial<Espera> | null;
    const ventas = (Array.isArray(o?.ventas) ? o.ventas : [])
      .filter((v): v is VentaP => !!v && typeof v.id === "string" && typeof v.clave === "string" && Array.isArray(v.lineas))
      .slice(0, MAX_ESPERA)
      .map((v) => ({
        ...v,
        lineas: v.lineas.filter((l) => l && typeof l.presentacion_id === "string" && Number.isInteger(l.cantidad) && l.cantidad > 0).map((l) => ({ ...l, cantidad: Math.min(999, l.cantidad) })),
      }));
    if (ventas.length === 0) return esperaInicial();
    return { ventas, activa: ventas.some((v) => v.id === o?.activa) ? (o!.activa as string) : ventas[0].id };
  } catch {
    return esperaInicial();
  }
}

export function guardarEspera(llave: string, e: Espera) {
  try {
    const vacia = e.ventas.length === 1 && e.ventas[0].lineas.length === 0 && !e.ventas[0].cliente;
    if (vacia) localStorage.removeItem(llave);
    else localStorage.setItem(llave, JSON.stringify(e));
  } catch {
    /* sin almacenamiento: la venta sigue en memoria mientras la pestaña esté abierta */
  }
}

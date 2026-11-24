"use client";

import { Minus, Plus } from "lucide-react";
import { T } from "@/lib/textos-publico";

// Presion en 120 ms con escala 0.92: el toque se siente aunque la red tarde (la cantidad cambia al instante, C8).
const BTN = "flex size-12 shrink-0 items-center justify-center rounded-xl border border-borde bg-superficie transition-transform duration-150 ease-salida active:scale-[0.92] active:bg-marca-suave";

/** − / + (C4): agregar es un toque en +. Con cero solo se ve el +. Objetivos de 48 px. */
export function SelectorCantidad({ cantidad, nombre, alCambiar }: { cantidad: number; nombre: string; alCambiar: (n: number) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {cantidad > 0 && (
        <>
          <button type="button" className={BTN} aria-label={`${T.quitarUno}: ${nombre}`} onClick={() => alCambiar(cantidad - 1)}>
            <Minus aria-hidden className="size-6" />
          </button>
          <span aria-live="polite" className="cifra min-w-10 text-center text-xl font-bold">
            {cantidad}
          </span>
        </>
      )}
      <button type="button" className={`${BTN} !border-marca !bg-marca text-white shadow-boton active:!bg-marca-presionado`} aria-label={`${T.sumarUno}: ${nombre}`} onClick={() => alCambiar(cantidad + 1)}>
        <Plus aria-hidden className="size-6" />
      </button>
    </div>
  );
}

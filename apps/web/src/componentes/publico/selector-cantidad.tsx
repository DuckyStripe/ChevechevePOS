"use client";

import { Minus, Plus } from "lucide-react";
import { T } from "@/lib/textos-publico";

const BTN = "flex size-12 items-center justify-center rounded-xl border border-borde bg-superficie active:bg-marca-suave";

/** − / + (C4): agregar es un toque en +. Con cero solo se ve el +. Objetivos de 48 px. */
export function SelectorCantidad({ cantidad, nombre, alCambiar }: { cantidad: number; nombre: string; alCambiar: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {cantidad > 0 && (
        <>
          <button type="button" className={BTN} aria-label={`${T.quitarUno}: ${nombre}`} onClick={() => alCambiar(cantidad - 1)}>
            <Minus aria-hidden className="size-6" />
          </button>
          <span aria-live="polite" className="min-w-10 text-center text-xl font-bold">
            {cantidad}
          </span>
        </>
      )}
      <button type="button" className={`${BTN} !border-marca !bg-marca text-white active:!bg-marca-fuerte`} aria-label={`${T.sumarUno}: ${nombre}`} onClick={() => alCambiar(cantidad + 1)}>
        <Plus aria-hidden className="size-6" />
      </button>
    </div>
  );
}

"use client";

import { clasesBoton } from "@/componentes/ui/boton";
import { T } from "@/lib/textos-publico";

export default function ErrorPublico({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="mt-6 rounded-tarjeta border border-peligro/30 bg-peligro-suave p-4">
      <p className="mb-3 text-base font-semibold text-peligro">
        {T.errorGeneral} {T.sinRed}
      </p>
      <button type="button" onClick={reset} className={clasesBoton("secundario")}>
        {T.reintentar}
      </button>
    </div>
  );
}

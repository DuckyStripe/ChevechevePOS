"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Boton } from "./boton";

/** Modal nativo (`<dialog>`): el navegador atrapa el foco, Escape cierra y el foco vuelve al boton que lo abrio. */
export function Dialogo({ abierto, titulo, alCerrar, children }: { abierto: boolean; titulo: string; alCerrar: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      onClose={alCerrar}
      aria-label={titulo}
      className="m-auto max-h-[92dvh] w-[min(36rem,calc(100vw-1.5rem))] overflow-y-auto rounded-tarjeta bg-superficie p-0 text-texto shadow-xl"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-borde bg-superficie px-4 py-2">
        <h2 className="text-lg font-bold [overflow-wrap:anywhere]">{titulo}</h2>
        <Boton variante="fantasma" aria-label="Cerrar" onClick={alCerrar} className="!px-3">
          <X aria-hidden className="size-6" />
        </Boton>
      </div>
      <div className="p-4">{abierto && children}</div>
    </dialog>
  );
}

/** Confirmacion para lo que no se puede deshacer (no para confirmar un pedido: C3). */
export function DialogoConfirmar({
  abierto,
  titulo,
  texto,
  confirmar,
  peligro = false,
  cargando = false,
  alConfirmar,
  alCerrar,
}: {
  abierto: boolean;
  titulo: string;
  texto: string;
  confirmar: string;
  peligro?: boolean;
  cargando?: boolean;
  alConfirmar: () => void;
  alCerrar: () => void;
}) {
  return (
    <Dialogo abierto={abierto} titulo={titulo} alCerrar={alCerrar}>
      <p className="mb-5 text-base">{texto}</p>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Boton variante="secundario" onClick={alCerrar}>
          Mejor no
        </Boton>
        <Boton variante={peligro ? "peligro" : "primario"} cargando={cargando} onClick={alConfirmar}>
          {confirmar}
        </Boton>
      </div>
    </Dialogo>
  );
}

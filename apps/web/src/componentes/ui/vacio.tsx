import type { ReactNode } from "react";

/** Una frase y la accion para salir. */
export function Vacio({ texto, children }: { texto: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-tarjeta border border-dashed border-borde px-4 py-10 text-center">
      <p className="text-base text-suave">{texto}</p>
      {children}
    </div>
  );
}

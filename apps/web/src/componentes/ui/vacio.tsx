import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

/** Una frase y la accion para salir. */
export function Vacio({ texto, children }: { texto: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-tarjeta border border-dashed border-control/50 bg-superficie/50 px-4 py-10 text-center">
      <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-hundido text-suave">
        <Inbox className="size-6" />
      </span>
      <p className="max-w-sm text-base text-suave">{texto}</p>
      {children}
    </div>
  );
}

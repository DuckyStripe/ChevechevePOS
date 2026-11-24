"use client";

import { Printer } from "lucide-react";
import { Boton } from "@/componentes/ui/boton";

/** Abre el diálogo de impresión del navegador (la impresora térmica predeterminada); solo sale `.hoja-80`. */
export function BotonImprimirTicket({ texto = "Imprimir ticket", variante = "primario", grande = false }: { texto?: string; variante?: "primario" | "secundario"; grande?: boolean }) {
  return (
    <Boton variante={variante} className={grande ? "!min-h-14 !text-lg" : ""} onClick={() => window.print()}>
      <Printer aria-hidden className="size-5" /> {texto}
    </Boton>
  );
}

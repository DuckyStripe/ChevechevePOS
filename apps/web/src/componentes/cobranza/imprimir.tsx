"use client";

import { Printer } from "lucide-react";
import { Boton } from "@/componentes/ui/boton";

/** Imprime solo la hoja de 80 mm (`.hoja-80`, ver `globals.css`). */
export function BotonImprimir() {
  return (
    <Boton variante="secundario" onClick={() => window.print()}>
      <Printer aria-hidden className="size-5" /> Imprimir
    </Boton>
  );
}

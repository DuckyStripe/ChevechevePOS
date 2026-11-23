"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Boton } from "./boton";

/** Error en palabras llanas (P6) con salida: «Reintentar» recarga la pantalla o ejecuta `alReintentar`. */
export function AvisoError({ mensaje, reintentar = true, alReintentar }: { mensaje: string; reintentar?: boolean; alReintentar?: () => void }) {
  const router = useRouter();
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-tarjeta border border-peligro/40 bg-peligro-suave p-4">
      <p className="flex gap-2 text-base font-medium text-peligro">
        <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0" />
        <span>{mensaje}</span>
      </p>
      {reintentar && (
        <Boton variante="secundario" onClick={alReintentar ?? (() => router.refresh())}>
          Reintentar
        </Boton>
      )}
    </div>
  );
}

export function SinPermiso() {
  return (
    <AvisoError reintentar={false} mensaje="Tu usuario no tiene permiso para ver esta pantalla. Pídele al dueño que te lo active." />
  );
}

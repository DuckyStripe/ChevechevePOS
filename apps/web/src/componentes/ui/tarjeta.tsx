import type { ComponentProps } from "react";

/** Superficie elevada un nivel (borde fino + sombra suave). No anidar tarjetas dentro de tarjetas. */
export function Tarjeta({ className = "", ...r }: ComponentProps<"section">) {
  return <section className={`rounded-tarjeta border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5 ${className}`} {...r} />;
}

/** Cabecera de pantalla: un solo h1 por pagina. */
export function Titulo({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold [overflow-wrap:anywhere] sm:text-3xl">{titulo}</h1>
        {ayuda && <p className="mt-1 max-w-prose text-base text-suave">{ayuda}</p>}
      </div>
      {children}
    </header>
  );
}

import type { ComponentProps } from "react";

export function Tarjeta({ className = "", ...r }: ComponentProps<"section">) {
  return <section className={`rounded-tarjeta border border-borde bg-superficie p-4 sm:p-5 ${className}`} {...r} />;
}

/** Cabecera de pantalla: un solo h1 por pagina. */
export function Titulo({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children?: React.ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold [overflow-wrap:anywhere]">{titulo}</h1>
        {ayuda && <p className="mt-1 text-base text-suave">{ayuda}</p>}
      </div>
      {children}
    </header>
  );
}

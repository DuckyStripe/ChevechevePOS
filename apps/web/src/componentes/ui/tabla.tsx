import type { ReactNode } from "react";

export type Columna<T> = { titulo: string; celda: (fila: T) => ReactNode; principal?: boolean; className?: string };

/** Tabla en pantallas anchas; en 360 px cada fila se apila como tarjeta con «titulo: valor». Sin scroll horizontal. */
export function Tabla<T>({ columnas, filas, clave, etiqueta }: { columnas: Columna<T>[]; filas: T[]; clave: (f: T) => string | number; etiqueta: string }) {
  return (
    <table aria-label={etiqueta} className="block w-full border-collapse text-base sm:table">
      <thead className="sr-only sm:not-sr-only sm:table-header-group">
        <tr className="border-b border-borde text-left text-sm text-suave">
          {columnas.map((c) => (
            <th key={c.titulo} scope="col" className="px-3 py-2 font-medium">
              {c.titulo}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="block sm:table-row-group">
        {filas.map((f) => (
          <tr
            key={clave(f)}
            className="mb-3 block rounded-tarjeta border border-borde bg-superficie p-3 sm:mb-0 sm:table-row sm:rounded-none sm:border-0 sm:border-b sm:bg-transparent sm:p-0"
          >
            {columnas.map((c) => (
              <td
                key={c.titulo}
                data-etiqueta={c.titulo}
                className={`flex items-start justify-between gap-3 py-1 [overflow-wrap:anywhere] before:shrink-0 before:text-sm before:text-suave before:content-[attr(data-etiqueta)] sm:table-cell sm:px-3 sm:py-3 sm:before:content-none ${c.principal ? "font-semibold" : ""} ${c.className ?? ""}`}
              >
                <span className="min-w-0 text-right sm:text-left">{c.celda(f)}</span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

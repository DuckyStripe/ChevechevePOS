import { ChevronLeft, ChevronRight } from "lucide-react";
import { BotonEnlace } from "./boton";

/** Anterior / Siguiente con enlaces reales; conserva los filtros del `query`. */
export function Paginacion({ ruta, query, pagina, porPagina, total }: { ruta: string; query: Record<string, string | undefined>; pagina: number; porPagina: number; total: number }) {
  const ultima = Math.max(1, Math.ceil(total / porPagina));
  if (ultima <= 1) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...query, pagina: String(p) })) if (v) q.set(k, v);
    return `${ruta}?${q}`;
  };
  return (
    <nav aria-label="Páginas" className="mt-4 flex items-center justify-between gap-3">
      {pagina > 1 ? (
        <BotonEnlace variante="secundario" href={href(pagina - 1)}>
          <ChevronLeft aria-hidden className="size-5" /> Anterior
        </BotonEnlace>
      ) : (
        <span />
      )}
      <span className="text-sm text-suave">
        Página {pagina} de {ultima}
      </span>
      {pagina < ultima ? (
        <BotonEnlace variante="secundario" href={href(pagina + 1)}>
          Siguiente <ChevronRight aria-hidden className="size-5" />
        </BotonEnlace>
      ) : (
        <span />
      )}
    </nav>
  );
}

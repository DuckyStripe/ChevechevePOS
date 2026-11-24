/** Bloque con el tamano final (sin saltos de layout) y un barrido de luz; nunca un spinner en pantalla vacia. */
export function Esqueleto({ className = "h-16" }: { className?: string }) {
  return <div aria-hidden className={`esqueleto rounded-xl ${className}`} />;
}

/** Forma de una pantalla de lista: titulo, una barra de filtros y filas tipo tarjeta. */
export function EsqueletoLista({ filas = 4 }: { filas?: number }) {
  return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-3">
      <Esqueleto className="mb-3 h-9 w-1/2 max-w-xs" />
      <Esqueleto className="h-tocable w-full max-w-md" />
      {Array.from({ length: filas }, (_, i) => (
        <Esqueleto key={i} className="h-20 rounded-tarjeta" />
      ))}
    </div>
  );
}

/** Bloque gris con el tamano final (sin saltos de layout); nunca un spinner en pantalla vacia. */
export function Esqueleto({ className = "h-16" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-xl bg-borde/70 ${className}`} />;
}

export function EsqueletoLista({ filas = 4 }: { filas?: number }) {
  return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-3">
      <Esqueleto className="h-9 w-1/2" />
      {Array.from({ length: filas }, (_, i) => (
        <Esqueleto key={i} className="h-20" />
      ))}
    </div>
  );
}

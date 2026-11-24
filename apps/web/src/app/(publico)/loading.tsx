import { Esqueleto } from "@/componentes/ui/esqueleto";

/** Forma del catalogo (encabezado, selector, tarjeta de repetir y productos): sin saltos al llegar los datos. */
export default function Cargando() {
  return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-3">
      <Esqueleto className="h-8 w-3/4" />
      <Esqueleto className="h-5 w-1/2" />
      <Esqueleto className="mb-2 mt-1 h-14 rounded-2xl" />
      <Esqueleto className="h-28 rounded-tarjeta" />
      <Esqueleto className="h-36 rounded-tarjeta" />
      <Esqueleto className="h-36 rounded-tarjeta" />
    </div>
  );
}

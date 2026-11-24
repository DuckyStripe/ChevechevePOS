import { Esqueleto } from "@/componentes/ui/esqueleto";

export default function Cargando() {
  return (
    <div role="status" aria-label="Cargando" className="mt-6 flex flex-col gap-3">
      <Esqueleto className="h-10 w-2/3" />
      <Esqueleto className="h-24" />
      <Esqueleto className="h-24" />
    </div>
  );
}

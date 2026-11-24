import { Tarjeta } from "@/componentes/ui/tarjeta";
import { apiServidor } from "@/lib/api-servidor";
import type { CalendarioDemanda } from "@/lib/tipos";
import { CalendarioEditable } from "./calendario-demanda";

/** Seccion «Calendario de demanda» de /configuracion (solo con configuracion.editar; la pagina ya lo exige). Si no se puede leer, no estorba. */
export async function SeccionCalendario() {
  const r = await apiServidor<CalendarioDemanda>("/fechas-demanda");
  if (!r.ok) return null;
  return (
    <Tarjeta className="mb-4">
      <details>
        <summary className="flex min-h-tocable cursor-pointer flex-col justify-center text-lg font-bold">
          Calendario de demanda
          <span className="text-base font-normal text-suave">Quincenas, puentes y partidos: días en que vendes más. La lista de qué comprar los toma en cuenta.</span>
        </summary>
        <div className="pt-4">
          <CalendarioEditable key={r.datos.anio} inicial={r.datos} />
        </div>
      </details>
    </Tarjeta>
  );
}

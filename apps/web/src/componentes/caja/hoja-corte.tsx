import { fechaHora, nombreDe } from "@/componentes/productos/formato";
import type { ResumenTurno, Ref } from "@/lib/tipos";
import { ResumenCaja } from "./resumen";

/**
 * Hoja de corte de 80 mm: el mismo resumen que da `fn_resumen_turno` (la web no suma nada). Solo se ve al imprimir
 * (`hidden print:block`); en pantalla ya está el resumen. Debe haber una sola hoja por pantalla.
 */
export function HojaCorte({ r, usuario, abierto, titulo = "Corte de caja" }: { r: ResumenTurno; usuario?: Ref | string | null; abierto?: string; titulo?: string }) {
  return (
    <div className="hidden print:block">
      <article data-ticket className="hoja-80 flex flex-col gap-2 text-base">
        <header>
          <p className="font-extrabold">{titulo}</p>
          {usuario && <p>{nombreDe(usuario)}</p>}
          {abierto && <p>Abierto: {fechaHora(abierto)}</p>}
          <p>Impreso: {fechaHora(new Date().toISOString())}</p>
        </header>
        <ResumenCaja r={r} plano />
        <p className="pt-6">Firma: ______________________</p>
      </article>
    </div>
  );
}

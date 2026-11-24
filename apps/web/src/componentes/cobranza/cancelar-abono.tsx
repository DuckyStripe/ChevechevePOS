"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { mensajeError } from "@/componentes/productos/formato";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { Dialogo } from "@/componentes/ui/dialogo";
import { llamar } from "@/lib/api-cliente";

/** «Cancelar abono» (solo con `cobranza.cancelar_abono`): motivo y confirmación. Dueña de la acción: `/cobranza` (N1). */
export function CancelarAbono({ id, folio }: { id: string; folio: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setCargando(true);
    setError(null);
    const r = await llamar("POST", `/abonos/${id}/cancelar`, { motivo: motivo.trim() });
    setCargando(false);
    if (!r.ok) return setError(r.error.codigo === "ABONO_YA_CANCELADO" ? "Ese abono ya estaba cancelado." : mensajeError(r.error));
    toast.success("Abono cancelado.");
    setAbierto(false);
    router.refresh();
  }

  return (
    <>
      <Boton variante="fantasma" onClick={() => setAbierto(true)}>Cancelar abono</Boton>
      <Dialogo abierto={abierto} titulo={`Cancelar el abono ${folio}`} alCerrar={() => setAbierto(false)}>
        <div className="flex flex-col gap-4">
          <p className="text-base">El dinero vuelve a su deuda. Si fue en efectivo, se anota como salida en tu turno.</p>
          <Campo etiqueta="¿Por qué se cancela?" value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} />
          {error && <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">{error}</p>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Boton variante="secundario" onClick={() => setAbierto(false)}>Mejor no</Boton>
            <Boton variante="peligro" cargando={cargando} disabled={!motivo.trim()} onClick={() => void confirmar()}>Sí, cancelar abono</Boton>
          </div>
        </div>
      </Dialogo>
    </>
  );
}

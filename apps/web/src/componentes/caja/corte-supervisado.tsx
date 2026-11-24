"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Aviso, mensajeCobro } from "@/componentes/cobro/comunes";
import { fechaHora, nombreDe } from "@/componentes/productos/formato";
import { BotonImprimirTicket } from "@/componentes/ticket/imprimir-ticket";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { llamar } from "@/lib/api-cliente";
import { dinero } from "@/lib/dinero";
import type { ResumenTurno, TurnoCaja } from "@/lib/tipos";
import { HojaCorte } from "./hoja-corte";
import { ResumenCaja } from "./resumen";

/** `/caja?turno=<id>`: ver y cerrar el turno de otra persona con `caja.supervisar` (corte supervisado, F8). El cierre es el mismo `POST /turnos/:id/cerrar`. */
export function CorteSupervisado({ turno, resumen }: { turno: TurnoCaja; resumen: ResumenTurno }) {
  const router = useRouter();
  const [contado, setContado] = useState("");
  const [notas, setNotas] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cierre, setCierre] = useState<ResumenTurno | null>(null);
  const r = cierre ?? resumen;
  const abierto = turno.estado === "abierto" && !cierre && resumen.efectivo_contado == null;

  async function cerrar() {
    setEnviando(true);
    setError(null);
    const x = await llamar<ResumenTurno>("POST", `/turnos/${turno.id}/cerrar`, { efectivo_contado: contado, ...(notas.trim() ? { notas: notas.trim() } : {}) });
    setEnviando(false);
    if (!x.ok) return setError(x.error.codigo === "TURNO_NO_ABIERTO" ? "Ese turno ya estaba cerrado." : `No se cerró. ${mensajeCobro(x.error)}`);
    setCierre(x.datos);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta className="flex flex-col gap-1">
        <p className="text-xl font-bold [overflow-wrap:anywhere]">Turno de {nombreDe(turno.usuario)}</p>
        <p className="text-base text-suave">{turno.tipo === "ruta" ? "Ruta" : "Mostrador"} · abierto desde {fechaHora(turno.abierto_en)} · empezó con {dinero(turno.fondo_inicial)}</p>
        {cierre && <p role="status" className="text-lg font-bold text-exito">Turno cerrado.</p>}
      </Tarjeta>
      <Tarjeta aria-labelledby="corte-res">
        <h2 id="corte-res" className="mb-1 text-xl font-bold">Cómo va el turno</h2>
        <ResumenCaja r={r} />
      </Tarjeta>
      {abierto && turno.tipo === "mostrador" && (
        <Tarjeta className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Cerrar este turno</h2>
          <p className="text-base">Debe haber {dinero(r.efectivo_esperado)} en efectivo. Cuenta el dinero con quien lo tenía.</p>
          <Campo etiqueta="Efectivo que contaron" inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value.replace(",", "."))} />
          <Campo etiqueta="Notas (opcional)" value={notas} maxLength={200} onChange={(e) => setNotas(e.target.value)} />
          {error && <Aviso texto={error} />}
          <Boton variante="peligro" className="!min-h-14" cargando={enviando} disabled={!/^\d{1,10}(\.\d{1,2})?$/.test(contado)} onClick={() => void cerrar()}>
            Cerrar turno
          </Boton>
        </Tarjeta>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <BotonImprimirTicket texto="Imprimir corte" variante="secundario" />
        <BotonEnlace variante="secundario" href="/caja">Volver a Caja</BotonEnlace>
      </div>
      <HojaCorte r={r} usuario={turno.usuario} abierto={turno.abierto_en} />
    </div>
  );
}

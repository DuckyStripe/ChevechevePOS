"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Aviso, textoSemaforo } from "@/componentes/cobro/comunes";
import { conVolver, MONTO } from "@/componentes/cobro/volver";
import { mensajeError } from "@/componentes/productos/formato";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { Dialogo } from "@/componentes/ui/dialogo";
import { Insignia } from "@/componentes/ui/insignia";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { llamar } from "@/lib/api-cliente";
import { dinero } from "@/lib/dinero";
import type { ClienteDetalle } from "@/lib/tipos";

/**
 * `/clientes/[id]`: semáforo de fiado y límite sugerido (solo lectura), «Saldo inicial» (dueña de esa acción, N1) y enlaces a
 * `/cobrar` y a la bandeja. El límite lo cambia quien tiene `clientes.credito` en el formulario del cliente.
 */
export function CreditoCliente({ cliente, puedeCredito, puedeAbonar, puedeAvisar }: { cliente: ClienteDetalle; puedeCredito: boolean; puedeAbonar: boolean; puedeAvisar: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState("");
  const [vence, setVence] = useState("");
  const [concepto, setConcepto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = cliente.semaforo;
  const id = String(cliente.id);
  const valido = MONTO.test(monto) && Number(monto) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(vence) && concepto.trim() !== "";

  async function guardar() {
    setCargando(true);
    setError(null);
    const r = await llamar("POST", `/clientes/${id}/saldo-inicial`, { monto, vence_el: vence, concepto: concepto.trim() });
    setCargando(false);
    if (!r.ok) return setError(mensajeError(r.error));
    toast.success("Saldo inicial guardado.");
    setAbierto(false);
    setMonto("");
    setConcepto("");
    router.refresh();
  }

  return (
    <Tarjeta aria-labelledby="fiado" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="fiado" className="text-lg font-bold">Fiado y saldo</h2>
        {s && <Insignia tono={textoSemaforo(s.color).tono}>{textoSemaforo(s.color).texto}</Insignia>}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-base">
        <dt className="text-suave">Debe</dt><dd className="text-right font-bold tabular-nums">{dinero(cliente.saldo)}</dd>
        <dt className="text-suave">Vencido</dt><dd className="text-right tabular-nums">{dinero(cliente.vencido)}</dd>
        <dt className="text-suave">Su límite</dt><dd className="text-right tabular-nums">{dinero(cliente.limite_credito)}</dd>
        <dt className="text-suave">Le queda</dt><dd className="text-right tabular-nums">{dinero(cliente.disponible)}</dd>
        {s && <><dt className="text-suave">Límite que te conviene</dt><dd className="text-right tabular-nums">{dinero(s.limite_sugerido)}</dd></>}
        {s?.dias_promedio_pago != null && <><dt className="text-suave">Suele pagar en</dt><dd className="text-right">{s.dias_promedio_pago} días</dd></>}
      </dl>
      {s && <p className="text-sm text-suave">El límite sugerido es solo una guía: el límite real lo cambias abajo, en los datos del cliente.</p>}
      <div className="flex flex-wrap gap-2">
        {puedeAbonar && <BotonEnlace href={conVolver(`/cobrar?cliente=${id}`, `/clientes/${id}`)}>Abonar</BotonEnlace>}
        {puedeCredito && <Boton variante="secundario" onClick={() => setAbierto(true)}>Saldo inicial</Boton>}
        {puedeAvisar && <BotonEnlace variante="secundario" href={`/clientes/${id}?nuevo=wa_estado_cuenta&cliente=${id}`}>Mandar estado de cuenta</BotonEnlace>}
        {puedeAvisar && <BotonEnlace variante="secundario" href={`/clientes/${id}?nuevo=wa_recordatorio_saldo&cliente=${id}`}>Recordar saldo</BotonEnlace>}
      </div>
      <Dialogo abierto={abierto} titulo="Saldo inicial" alCerrar={() => setAbierto(false)}>
        <div className="flex flex-col gap-4">
          <p className="text-base">Lo que este cliente ya debía antes de usar el sistema (libreta o Eleventa). No se compara con su límite.</p>
          <Campo etiqueta="Cuánto debe" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value.replace(",", "."))} />
          <Campo etiqueta="Fecha en que debe pagar" type="date" value={vence} onChange={(e) => setVence(e.target.value)} ayuda="Puede ser una fecha pasada si ya está vencido." />
          <Campo etiqueta="Concepto (por ejemplo: libreta de octubre)" value={concepto} maxLength={120} onChange={(e) => setConcepto(e.target.value)} />
          {error && <Aviso texto={error} />}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Boton variante="secundario" onClick={() => setAbierto(false)}>Mejor no</Boton>
            <Boton cargando={cargando} disabled={!valido} onClick={() => void guardar()}>Guardar saldo inicial</Boton>
          </div>
        </div>
      </Dialogo>
    </Tarjeta>
  );
}

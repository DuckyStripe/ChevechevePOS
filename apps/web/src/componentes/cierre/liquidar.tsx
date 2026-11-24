"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Aviso, mensajeCobro } from "@/componentes/cobro/comunes";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { DialogoConfirmar } from "@/componentes/ui/dialogo";
import { llamar } from "@/lib/api-cliente";
import { useSinGuardar } from "@/lib/cascaron";
import { dinero } from "@/lib/dinero";
import type { ResumenTurno } from "@/lib/tipos";

/** `/cierre/ruta/[id]`: dueña de «Liquidar» (N1). El esperado y la diferencia los calcula la API; aquí solo se captura lo contado. */
export function Liquidar({ rutaId }: { rutaId: string }) {
  const router = useRouter();
  const [contado, setContado] = useState("");
  const [notas, setNotas] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<ResumenTurno | null>(null);
  useSinGuardar(!hecho && contado !== "");
  const valido = /^\d{1,10}(\.\d{1,2})?$/.test(contado);

  async function liquidar() {
    setCargando(true);
    setError(null);
    const r = await llamar<ResumenTurno>("POST", `/rutas/${rutaId}/liquidar`, { efectivo_contado: contado, ...(notas.trim() ? { notas: notas.trim() } : {}) });
    setCargando(false);
    setConfirmando(false);
    if (!r.ok) return setError(r.error.codigo === "RUTA_NO_TERMINADA" ? "La ruta todavía no termina. El repartidor debe terminarla primero." : `No se guardó. ${mensajeCobro(r.error)}`);
    setHecho(r.datos);
    router.refresh();
  }

  if (hecho) {
    return (
      <div className="flex flex-col gap-3 rounded-tarjeta border border-borde bg-superficie p-4">
        <p role="status" className="text-2xl font-extrabold">Ruta liquidada</p>
        <p className="text-base">Debía haber {dinero(hecho.efectivo_esperado)} · contaste {dinero(hecho.efectivo_contado)}</p>
        {hecho.diferencia != null && <Aviso tono={Number(hecho.diferencia) === 0 ? "exito" : "aviso"} texto={Number(hecho.diferencia) === 0 ? "Cuadra exacto." : `Diferencia: ${dinero(hecho.diferencia)}`} />}
        <BotonEnlace className="!min-h-14" href="/cierre">Siguiente: volver al cierre</BotonEnlace>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-tarjeta border border-borde bg-superficie p-4">
      <h2 className="text-xl font-bold">Cuenta el efectivo y liquida</h2>
      <Campo etiqueta="Efectivo que entrega el repartidor" inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value.replace(",", "."))} />
      <Campo etiqueta="Notas (opcional)" value={notas} maxLength={200} onChange={(e) => setNotas(e.target.value)} />
      {error && <Aviso texto={error} />}
      <Boton className="!min-h-14" disabled={!valido} onClick={() => setConfirmando(true)}>Liquidar la ruta</Boton>
      <Link href="/cierre" className="text-center text-base font-semibold text-marca-fuerte underline">Volver al cierre</Link>
      <DialogoConfirmar abierto={confirmando} titulo="¿Liquidar la ruta?" texto={`Vas a guardar ${dinero(contado)} como el efectivo entregado. Ya no se podrá cambiar.`} confirmar="Sí, liquidar" cargando={cargando} alConfirmar={() => void liquidar()} alCerrar={() => setConfirmando(false)} />
    </div>
  );
}

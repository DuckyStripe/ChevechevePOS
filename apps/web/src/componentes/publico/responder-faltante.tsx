"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { dinero } from "@/lib/dinero";
import { T } from "@/lib/textos-publico";
import type { OpcionFaltante, Seguimiento } from "@/lib/tipos";
import { hora } from "./formato-publico";
import { llamarPublico } from "./llamar-publico";

type Faltante = Seguimiento["faltantes"][number];

const BASE = "min-h-14 w-full rounded-xl px-4 text-lg font-bold disabled:opacity-60";

/** C12: una pregunta por linea. Si no hay mas de una opcion no aparece «Otra opcion». Contestar es un toque. */
export function ResponderFaltante({ faltante, accionPredeterminada }: { faltante: Faltante; accionPredeterminada?: "quitar" | "reducir" }) {
  const router = useRouter();
  const [otras, setOtras] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const [primera, ...resto] = faltante.opciones;
  const nombreLinea = typeof faltante.linea === "string" ? faltante.linea : `${faltante.linea.producto} ${faltante.linea.presentacion}`;

  async function responder(opcion: OpcionFaltante | null) {
    setEnviando(true);
    setMensaje(null);
    const r = await llamarPublico("POST", `/propuestas/${faltante.propuesta_id}/responder`, { opcion_id: opcion ? opcion.id : null });
    setEnviando(false);
    if (!r.ok) {
      // PROPUESTA_CERRADA: ya venció o ya se contestó; se recarga para mostrar lo vigente.
      if (r.error.codigo === "PROPUESTA_CERRADA") router.refresh();
      return setMensaje(r.error.mensaje);
    }
    setListo(true);
    router.refresh();
  }

  const pregunta = (o: OpcionFaltante) =>
    o.tipo === "reducir" ? T.faltantePreguntaReducir(o.cantidad, dinero(o.precio_unitario)) : T.faltantePreguntaSustituto(o.cantidad, `${o.producto} ${o.presentacion}`, dinero(o.precio_unitario));

  if (listo) return <p role="status" className="rounded-tarjeta bg-exito-suave p-4 text-lg font-bold text-exito">{T.respondido}</p>;

  return (
    <section aria-label={T.faltanteNoHay(nombreLinea)} className="flex flex-col gap-3 rounded-tarjeta border-2 border-marca bg-superficie p-4">
      <p className="text-lg font-bold [overflow-wrap:anywhere]">{T.faltanteNoHay(nombreLinea)}</p>
      {faltante.nota && <p className="text-base [overflow-wrap:anywhere]">{faltante.nota}</p>}
      {primera && <p className="text-lg [overflow-wrap:anywhere]">{pregunta(primera)}</p>}
      <div className="flex flex-col gap-2">
        {primera && (
          <button type="button" disabled={enviando} onClick={() => void responder(primera)} className={`${BASE} bg-marca text-white active:bg-marca-fuerte`}>
            {enviando ? T.respondiendo : primera.tipo === "reducir" ? T.faltanteSiReducir : T.faltanteSi}
          </button>
        )}
        {resto.length > 0 && !otras && (
          <button type="button" disabled={enviando} onClick={() => setOtras(true)} className={`${BASE} border border-borde bg-superficie`}>
            {T.faltanteOtra}
          </button>
        )}
        {otras &&
          resto.map((o) => (
            <button key={o.id} type="button" disabled={enviando} onClick={() => void responder(o)} className={`${BASE} border border-marca bg-marca-suave text-left text-marca-fuerte`}>
              {pregunta(o)}
            </button>
          ))}
        <button type="button" disabled={enviando} onClick={() => void responder(null)} className={`${BASE} border border-borde bg-superficie text-peligro`}>
          {T.faltanteQuitar}
        </button>
      </div>
      <p className="text-base text-suave">
        {T.faltanteLimite(hora(faltante.limite_en))}
        {accionPredeterminada && ` ${T.faltanteSinRespuesta(accionPredeterminada === "reducir" ? T.faltanteAccionReducir : T.faltanteAccionQuitar)}`}
      </p>
      {mensaje && (
        <p role="alert" className="text-base font-medium text-peligro">
          {mensaje}
        </p>
      )}
    </section>
  );
}

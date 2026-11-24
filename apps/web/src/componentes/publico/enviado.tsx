"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Check, MessageCircle } from "lucide-react";
import { clasesBoton } from "@/componentes/ui/boton";
import { dinero } from "@/lib/dinero";
import { T } from "@/lib/textos-publico";
import type { PedidoEnviado } from "@/lib/tipos";

const nada = () => () => {};

function leer(id: string): string {
  try {
    return sessionStorage.getItem(`chv_enviado_${id}`) ?? "";
  } catch {
    return "";
  }
}

/** `/pedido/enviado/[id]`: el texto de confirmacion y el wa.me opcional vienen de la respuesta del envio (guardada en la pestana); sin ella, se usa lo del servidor. */
export function Enviado({ id, folio, total, etiqueta }: { id: string; folio: string | null; total: string; etiqueta: string }) {
  const crudo = useSyncExternalStore(nada, () => leer(id), () => "");
  let enviado: PedidoEnviado | null = null;
  try {
    enviado = crudo ? (JSON.parse(crudo) as PedidoEnviado) : null;
  } catch {
    enviado = null;
  }
  return (
    <div className="flex flex-col gap-4">
      {/* Confirmacion (momento raro: aqui si cabe un detalle). El circulo aparece y la palomita se dibuja una vez. */}
      <div role="status" className="flex flex-col items-center gap-3 px-2 pb-2 pt-4 text-center">
        <span aria-hidden className="aparece flex size-22 items-center justify-center rounded-full bg-exito-suave text-exito">
          <Check className="palomita size-12" strokeWidth={2.5} />
        </span>
        <h1 className="text-3xl font-bold">{T.enviadoTitulo}</h1>
        <p className="text-lg [overflow-wrap:anywhere]">{enviado?.texto_confirmacion ?? etiqueta}</p>
        <p className="inline-flex flex-wrap items-baseline justify-center gap-x-2 rounded-xl border border-borde bg-superficie px-4 py-2 text-lg font-bold shadow-tarjeta">
          {T.pedidoNumero(folio)} <span aria-hidden>·</span> <span className="cifra text-xl">{dinero(total)}</span>
        </p>
      </div>
      <Link href={`/pedido/mis-pedidos/${id}`} className={clasesBoton("primario", true, "grande")}>
        {T.verSeguimiento}
      </Link>
      {enviado?.avisar_negocio?.url?.startsWith("https://wa.me/") && (
        <a href={enviado.avisar_negocio.url} className={clasesBoton("secundario", true)}>
          <MessageCircle aria-hidden className="size-5 text-exito" /> {T.avisarWhatsapp}
        </a>
      )}
      <Link href="/pedido" className={clasesBoton("fantasma", true)}>
        {T.volverAlCatalogo}
      </Link>
    </div>
  );
}

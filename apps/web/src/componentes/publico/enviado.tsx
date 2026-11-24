"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { CircleCheck } from "lucide-react";
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
      <div className="flex items-start gap-3 rounded-tarjeta border border-exito/40 bg-exito-suave p-4">
        <CircleCheck aria-hidden className="mt-1 size-7 shrink-0 text-exito" />
        <div>
          <h1 className="text-2xl font-bold">{T.enviadoTitulo}</h1>
          <p className="mt-1 text-lg">{enviado?.texto_confirmacion ?? etiqueta}</p>
          <p className="mt-2 text-lg font-bold">
            {T.pedidoNumero(folio)} · {dinero(total)}
          </p>
        </div>
      </div>
      {enviado?.avisar_negocio?.url?.startsWith("https://wa.me/") && (
        <a href={enviado.avisar_negocio.url} className="flex min-h-14 items-center justify-center rounded-xl bg-exito text-lg font-bold text-white">
          {T.avisarWhatsapp}
        </a>
      )}
      <Link href={`/pedido/mis-pedidos/${id}`} className="flex min-h-14 items-center justify-center rounded-xl bg-marca text-lg font-bold text-white">
        {T.verSeguimiento}
      </Link>
      <Link href="/pedido" className="flex min-h-tocable items-center justify-center rounded-xl border border-borde bg-superficie text-base font-semibold">
        {T.volverAlCatalogo}
      </Link>
    </div>
  );
}

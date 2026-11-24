"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { fechaHora, mensajeError } from "@/componentes/productos/formato";
import { Boton } from "@/componentes/ui/boton";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { llamar } from "@/lib/api-cliente";
import { dinero } from "@/lib/dinero";
import type { PedidoDetalle } from "@/lib/tipos";

/** Faltantes por responder: el cliente llamo y contesto (responder por el), o ya llego el producto (retirar). Solo vive en `/pedidos/[id]` (N1). */
export function PropuestasPedido({ pedido, puedeGestionar }: { pedido: PedidoDetalle; puedeGestionar: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const pendientes = (pedido.propuestas ?? []).filter((p) => p.estado === "pendiente");
  const lineaDe = (id?: number | string) => pedido.lineas.find((l) => String(l.id) === String(id));

  async function enviar(clave: string, ruta: string, cuerpo: unknown, ok: string) {
    setOcupado(clave);
    const r = await llamar("POST", ruta, cuerpo);
    setOcupado(null);
    if (!r.ok) {
      if (r.error.codigo === "PROPUESTA_CERRADA") router.refresh();
      return void toast.error(r.error.codigo === "PROPUESTA_CERRADA" ? "Esa pregunta ya se cerró (el cliente contestó o venció el plazo)." : mensajeError(r.error));
    }
    toast.success(ok);
    router.refresh();
  }

  if (pendientes.length === 0) {
    const sin = pedido.lineas.some((l) => l.estado === "faltante");
    return sin ? <p className="rounded-xl bg-marca-suave p-3 text-base font-medium">Hay productos esperando respuesta del cliente.</p> : null;
  }

  return (
    <Tarjeta aria-labelledby="faltantes" className="flex flex-col gap-3 border-marca">
      <h2 id="faltantes" className="text-lg font-bold">
        Esperando al cliente
      </h2>
      {pendientes.map((p) => {
        const l = lineaDe(p.pedido_linea_id);
        return (
          <article key={p.id} className="flex flex-col gap-2 rounded-xl border border-borde p-3">
            <p className="text-base font-bold [overflow-wrap:anywhere]">{l ? `${l.producto} · ${l.presentacion}` : "Producto"}</p>
            <p className="text-sm text-suave">Tiene hasta {fechaHora(p.limite_en)} para contestar. Si no contesta, se aplica la regla de Configuración.</p>
            {puedeGestionar && (
              <div className="flex flex-col gap-2">
                {p.opciones.map((o) => (
                  <Boton key={o.id} variante="secundario" cargando={ocupado === `o${o.id}`} onClick={() => void enviar(`o${o.id}`, `/propuestas/${p.id}/responder`, { opcion_id: o.id }, "Anotado: el cliente aceptó.")}>
                    Aceptó: {o.tipo === "reducir" ? `solo ${o.cantidad}` : `${o.cantidad} de ${o.producto} ${o.presentacion}`} ({dinero(o.precio_unitario)})
                  </Boton>
                ))}
                <Boton variante="secundario" cargando={ocupado === `q${p.id}`} onClick={() => void enviar(`q${p.id}`, `/propuestas/${p.id}/responder`, { opcion_id: null }, "Anotado: se quita del pedido.")}>
                  Dijo que lo quitemos
                </Boton>
                <Boton variante="fantasma" cargando={ocupado === `c${p.id}`} onClick={() => void enviar(`c${p.id}`, `/propuestas/${p.id}/cancelar`, undefined, "Listo: el producto vuelve al pedido.")}>
                  Ya llegó el producto: retirar pregunta
                </Boton>
              </div>
            )}
          </article>
        );
      })}
    </Tarjeta>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { clasesBoton } from "@/componentes/ui/boton";
import { cargarLineas } from "@/lib/carrito";
import { T } from "@/lib/textos-publico";
import { llamarPublico } from "./llamar-publico";

type Linea = { presentacion_id: number | string; cantidad: number };
const PRIMARIO = clasesBoton("primario", true, "grande");
const SECUNDARIO = clasesBoton("secundario", true, "grande");

/** Acciones de un pedido en curso: cambiar o cancelar mientras `editable` (P32), y pedir lo mismo. */
export function AccionesPedido({ claveCarrito, id, editable, lineas, propuesto, totalVisto }: { claveCarrito: string; id: string; editable: boolean; lineas: Linea[]; propuesto: boolean; totalVisto: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function llamar(ruta: string, cuerpo: unknown) {
    setOcupado(true);
    setMensaje(null);
    const r = await llamarPublico("POST", ruta, cuerpo);
    setOcupado(false);
    if (r.ok) {
      router.refresh();
      return true;
    }
    if (r.error.codigo === "PRECIOS_CAMBIARON") {
      router.refresh(); // el servidor trae la vista con los precios de hoy
      setMensaje(T.preciosCambiaronConfirma);
    } else if (r.error.codigo === "PEDIDO_VENCIDO") {
      router.refresh();
      setMensaje(T.propuestoVencido);
    } else setMensaje(r.error.mensaje);
    return false;
  }

  const aCarrito = (editando: string | null) => {
    cargarLineas(claveCarrito, lineas, editando);
    router.push("/pedido/carrito");
  };

  if (propuesto) {
    return (
      <div className="flex flex-col gap-2">
        <button type="button" disabled={ocupado} onClick={() => void llamar(`/pedidos/${id}/aceptar`, { total_visto: totalVisto })} className={PRIMARIO}>
          {T.aceptarPropuesto}
        </button>
        <button type="button" disabled={ocupado} onClick={() => aCarrito(null)} className={SECUNDARIO}>
          {T.cambiarAlgo}
        </button>
        <button type="button" disabled={ocupado} onClick={() => void llamar(`/pedidos/${id}/cancelar`, {})} className={`${SECUNDARIO} !text-suave`}>
          {T.noGracias}
        </button>
        {mensaje && <p role="alert" className="text-base font-medium text-peligro">{mensaje}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {editable && lineas.length > 0 && (
        <button type="button" disabled={ocupado} onClick={() => aCarrito(id)} className={PRIMARIO}>
          {T.cambiarPedido}
        </button>
      )}
      {lineas.length > 0 && (
        <button type="button" disabled={ocupado} onClick={() => aCarrito(null)} className={SECUNDARIO}>
          {T.repetirPedido}
        </button>
      )}
      {editable &&
        (confirmando ? (
          <div role="alertdialog" aria-label={T.seguroCancelar} className="flex flex-col gap-2 rounded-tarjeta border border-peligro/30 bg-peligro-suave p-3">
            <p className="text-lg font-bold text-peligro">{T.seguroCancelar}</p>
            <button type="button" disabled={ocupado} onClick={() => void llamar(`/pedidos/${id}/cancelar`, {})} className={clasesBoton("peligro", true, "grande")}>
              {ocupado ? T.cancelando : T.siCancelar}
            </button>
            <button type="button" disabled={ocupado} onClick={() => setConfirmando(false)} className={SECUNDARIO}>
              {T.noCancelar}
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmando(true)} className="min-h-tocable w-full rounded-xl px-4 text-base font-semibold text-peligro transition-transform duration-150 ease-salida active:scale-[0.97] active:bg-peligro-suave">
            {T.cancelarPedido}
          </button>
        ))}
      {mensaje && <p role="alert" className="text-base font-medium text-peligro">{mensaje}</p>}
    </div>
  );
}

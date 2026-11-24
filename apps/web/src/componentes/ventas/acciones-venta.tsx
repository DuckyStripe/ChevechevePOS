"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Aviso, mensajeCobro, useClave } from "@/componentes/cobro/comunes";
import { mensajeError } from "@/componentes/productos/formato";
import { Boton } from "@/componentes/ui/boton";
import { Campo, Casilla } from "@/componentes/ui/campo";
import { Dialogo } from "@/componentes/ui/dialogo";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { llamar } from "@/lib/api-cliente";
import { dinero } from "@/lib/dinero";
import type { VentaDetalle } from "@/lib/tipos";

const MENSAJES: Record<string, string> = {
  VENTA_YA_CANCELADA: "Esa venta ya estaba cancelada.",
  VENTA_CON_DEVOLUCIONES: "Esa venta ya tiene devoluciones, no se puede cancelar completa.",
  VENTA_CON_ABONOS: "El cliente ya abonó a esa venta. Cancela primero sus abonos.",
  DEVOLUCION_EXCEDE_VENDIDO: "Estás devolviendo más piezas de las que se vendieron.",
  TURNO_NO_ABIERTO: "Abre tu turno en Caja para poder regresar efectivo.",
};

/** `/ventas/[id]`: dueña de cancelar (solo con `ventas.cancelar`) y de devolver (con `ventas.devolver`) (N1). */
export function AccionesVenta({ venta, puedeCancelar, puedeDevolver }: { venta: VentaDetalle; puedeCancelar: boolean; puedeDevolver: boolean }) {
  const router = useRouter();
  const [modo, setModo] = useState<"cancelar" | "devolver" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [piezas, setPiezas] = useState<Record<string, string>>({});
  const [regresa, setRegresa] = useState<Record<string, boolean>>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [claveDev, renovarDev] = useClave(`chv:devolucion:${venta.id}`);

  const cerrar = () => { setModo(null); setError(null); };
  const texto = (e: Parameters<typeof mensajeCobro>[0]) => MENSAJES[e.codigo] ?? (e.codigo === "SIN_RED" ? mensajeCobro(e) : mensajeError(e));

  async function cancelar() {
    setCargando(true);
    setError(null);
    const r = await llamar<{ reembolso_efectivo: string; reembolso_otros: string }>("POST", `/ventas/${venta.id}/cancelar`, { motivo: motivo.trim() });
    setCargando(false);
    if (!r.ok) return setError(texto(r.error));
    setAviso(`Venta cancelada. Hay que regresar ${dinero(r.datos.reembolso_efectivo)} en efectivo${Number(r.datos.reembolso_otros) > 0 ? ` y ${dinero(r.datos.reembolso_otros)} por otros medios` : ""}.`);
    cerrar();
    router.refresh();
  }

  async function devolver() {
    const lineas = venta.lineas.filter((l) => Number(piezas[l.id]) > 0).map((l) => ({ venta_linea_id: l.id, piezas: Number(piezas[l.id]), regresa_a_inventario: regresa[l.id] ?? true }));
    setCargando(true);
    setError(null);
    const r = await llamar("POST", `/ventas/${venta.id}/devoluciones`, { clave_idempotencia: claveDev, motivo: motivo.trim(), lineas });
    setCargando(false);
    if (!r.ok) return setError(`No se guardó. ${texto(r.error)}`);
    renovarDev();
    setPiezas({});
    setMotivo("");
    setAviso("Devolución guardada.");
    cerrar();
    toast.success("Devolución guardada.");
    router.refresh();
  }

  if (venta.estado === "cancelada" && !aviso) return null;
  const hayPiezas = venta.lineas.some((l) => Number(piezas[l.id]) > 0);

  return (
    <Tarjeta className="flex flex-col gap-3">
      {aviso && <Aviso tono="exito" texto={aviso} />}
      {venta.estado === "completada" && (
        <div className="flex flex-wrap gap-2">
          {puedeDevolver && <Boton variante="secundario" className="!min-h-14" onClick={() => setModo("devolver")}>Devolución</Boton>}
          {puedeCancelar && <Boton variante="peligro" className="!min-h-14" onClick={() => setModo("cancelar")}>Cancelar venta</Boton>}
        </div>
      )}

      <Dialogo abierto={modo === "cancelar"} titulo="¿Cancelar la venta?" alCerrar={cerrar}>
        <div className="flex flex-col gap-4">
          <p className="text-base">El producto vuelve al inventario, lo que debía el cliente se quita y se regresa lo pagado. Esto no se puede deshacer.</p>
          <Campo etiqueta="¿Por qué se cancela?" value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} />
          {error && <Aviso texto={error} />}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Boton variante="secundario" onClick={cerrar}>Mejor no</Boton>
            <Boton variante="peligro" cargando={cargando} disabled={!motivo.trim()} onClick={() => void cancelar()}>Sí, cancelar la venta</Boton>
          </div>
        </div>
      </Dialogo>

      <Dialogo abierto={modo === "devolver"} titulo="Devolución" alCerrar={cerrar}>
        <div className="flex flex-col gap-4">
          <p className="text-base">Escribe cuántas piezas regresan de cada producto.</p>
          <ul className="flex flex-col divide-y divide-borde">
            {venta.lineas.map((l) => {
              const quedan = (l.piezas ?? l.cantidad) - (l.piezas_devueltas ?? 0);
              return (
                <li key={l.id} className="flex flex-col gap-1 py-2">
                  <Campo etiqueta={`${l.producto} · ${l.presentacion} (puedes devolver hasta ${quedan})`} inputMode="numeric" disabled={quedan <= 0} value={piezas[l.id] ?? ""} onChange={(e) => setPiezas((p) => ({ ...p, [l.id]: e.target.value.replace(/\D/g, "").slice(0, 5) }))} />
                  {Number(piezas[l.id]) > 0 && <Casilla etiqueta="¿Regresa al inventario?" ayuda="Quita la marca si llegó dañado." checked={regresa[l.id] ?? true} onChange={(e) => setRegresa((r) => ({ ...r, [l.id]: e.target.checked }))} />}
                </li>
              );
            })}
          </ul>
          <Campo etiqueta="Motivo" value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} />
          {error && <Aviso texto={error} />}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Boton variante="secundario" onClick={cerrar}>Mejor no</Boton>
            <Boton cargando={cargando} disabled={!hayPiezas || !motivo.trim()} onClick={() => void devolver()}>Guardar devolución</Boton>
          </div>
        </div>
      </Dialogo>
    </Tarjeta>
  );
}

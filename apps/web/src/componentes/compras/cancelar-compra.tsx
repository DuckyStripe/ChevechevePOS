"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { mensajeError } from "@/componentes/productos/formato";
import { Boton } from "@/componentes/ui/boton";
import { AreaTexto } from "@/componentes/ui/campo";
import { Dialogo } from "@/componentes/ui/dialogo";
import { llamar } from "@/lib/api-cliente";

/** Cancelar una compra: pide motivo y confirma; devuelve la mercancia (solo si aun hay existencia). */
export function CancelarCompra({ id, folio, productos }: { id: string; folio: string; productos: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [conSalidas, setConSalidas] = useState(false);
  const [cargando, setCargando] = useState(false);

  async function cancelar() {
    if (!motivo.trim()) return setError("Cuéntanos por qué la cancelas.");
    setError(null);
    setConSalidas(false);
    setCargando(true);
    const r = await llamar("POST", `/compras/${id}/cancelar`, { motivo: motivo.trim() });
    setCargando(false);
    if (!r.ok) {
      if (r.error.codigo === "COMPRA_CON_SALIDAS" || r.error.codigo === "STOCK_INSUFICIENTE") {
        setConSalidas(true);
        return setError("Ya vendiste parte de esta compra; no se puede cancelar. Si el costo estaba mal, corrígelo en Inventario › Corregir costo.");
      }
      return setError(mensajeError(r.error));
    }
    toast.success("Compra cancelada.");
    setAbierto(false);
    router.refresh();
  }

  return (
    <>
      <Boton variante="peligro" onClick={() => { setError(null); setAbierto(true); }}>
        Cancelar compra
      </Boton>
      <Dialogo abierto={abierto} titulo={`Cancelar la compra ${folio}`} alCerrar={() => setAbierto(false)}>
        <div className="flex flex-col gap-4">
          <p className="text-base">La mercancía de esta compra se resta del inventario. No se puede deshacer.</p>
          <AreaTexto etiqueta="¿Por qué la cancelas?" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="!min-h-20" error={error ?? undefined} />
          {conSalidas && (
            <ul className="flex flex-col gap-2">
              {productos.map((p) => (
                <li key={p.id}>
                  <Link className="inline-flex min-h-tocable items-center text-base font-semibold text-marca-fuerte underline" href={`/inventario/ajustes?modo=costo&producto_id=${p.id}&volver=${encodeURIComponent(`/compras/${id}`)}`}>
                    Corregir costo de {p.nombre}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Mejor no
            </Boton>
            <Boton variante="peligro" cargando={cargando} onClick={cancelar}>
              Sí, cancelar compra
            </Boton>
          </div>
        </div>
      </Dialogo>
    </>
  );
}

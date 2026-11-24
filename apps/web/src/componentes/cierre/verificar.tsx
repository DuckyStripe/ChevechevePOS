"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { mensajeError } from "@/componentes/productos/formato";
import { Boton } from "@/componentes/ui/boton";
import { llamar } from "@/lib/api-cliente";

/** «Ya la vi en el banco» = un toque. Solo informativo: no cambia saldos. Dueña de la acción: `/cierre/transferencias` (N1). */
export function Verificar({ tabla, id }: { tabla: "venta_pago" | "abono"; id: string }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  async function verificar() {
    setCargando(true);
    const r = await llamar("POST", "/transferencias/verificar", { tabla, id });
    setCargando(false);
    if (!r.ok) return void toast.error(mensajeError(r.error));
    toast.success("Listo, verificada.");
    router.refresh();
  }
  return <Boton className="!min-h-14" cargando={cargando} onClick={() => void verificar()}>Ya la vi en el banco</Boton>;
}

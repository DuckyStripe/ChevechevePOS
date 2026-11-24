"use client";

import { useState } from "react";
import { Megaphone, Printer, Send } from "lucide-react";
import { toast } from "sonner";
import { Boton } from "@/componentes/ui/boton";
import { llamar } from "@/lib/api-cliente";
import type { MensajeSurtido } from "@/lib/tipos";

/** Avisa a quien compra que la lista de esa fecha esta lista. Publicar lo mismo dos veces no duplica el aviso. */
export function PublicarLista({ fecha }: { fecha: string }) {
  const [cargando, setCargando] = useState(false);
  async function publicar() {
    setCargando(true);
    const r = await llamar<{ notificados: number }>("POST", "/surtido/publicar", { fecha });
    setCargando(false);
    if (!r.ok) return void toast.error(r.error.mensaje);
    toast.success(r.datos.notificados > 0 ? "Listo: ya se le avisó a quien compra." : "Esta lista ya se había avisado. Si cambia algo, vuelve a avisar.");
  }
  return (
    <Boton variante="secundario" cargando={cargando} onClick={publicar}>
      <Megaphone aria-hidden className="size-5" /> Avisar a compras
    </Boton>
  );
}

export function ImprimirLista() {
  return (
    <Boton variante="secundario" onClick={() => window.print()}>
      <Printer aria-hidden className="size-5" /> Imprimir
    </Boton>
  );
}

/** Arma el mensaje en la API (plantilla, sin precios) y abre WhatsApp. No es un aviso a un cliente: al volver no se marca nada (P2). */
export function MandarWhatsApp({ fecha, proveedorId, proveedor }: { fecha: string; proveedorId: string; proveedor: string }) {
  const [cargando, setCargando] = useState(false);
  async function mandar() {
    setCargando(true);
    const r = await llamar<MensajeSurtido>("GET", `/surtido/mensaje?fecha=${fecha}&proveedor_id=${proveedorId}`);
    setCargando(false);
    if (!r.ok) return void toast.error(r.error.mensaje);
    if (!r.datos.telefono) {
      return void toast.error(r.datos.telefono_invalido ? `El teléfono de ${proveedor} no es válido. Corrígelo en Proveedores.` : `Falta el teléfono de ${proveedor}. Agrégalo en Proveedores y vuelve a intentar.`);
    }
    // El telefono ya viene normalizado de la API. Enlace con noopener: la pagina abierta no puede tocar esta.
    const a = document.createElement("a");
    a.href = `https://wa.me/${r.datos.telefono}?text=${encodeURIComponent(r.datos.texto)}`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  }
  return (
    <Boton variante="secundario" cargando={cargando} onClick={mandar}>
      <Send aria-hidden className="size-5" /> Mandar por WhatsApp
    </Boton>
  );
}

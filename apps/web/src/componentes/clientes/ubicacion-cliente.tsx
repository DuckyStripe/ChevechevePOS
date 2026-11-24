"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink, MapPin } from "lucide-react";
import { toast } from "sonner";
import { mensajeError } from "@/componentes/productos/formato";
import { Boton } from "@/componentes/ui/boton";
import { AreaTexto } from "@/componentes/ui/campo";
import { Insignia } from "@/componentes/ui/insignia";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { llamar } from "@/lib/api-cliente";
import type { ClienteDetalle } from "@/lib/tipos";
import { mapaDe } from "./formato-clientes";

/** Ubicacion del cliente: pegar enlace de Maps, guardar «aqui» (GPS del telefono) o aceptar la que mando el cliente. Solo vive en `/clientes/[id]` (N1). */
export function UbicacionCliente({ cliente, puedeEditar }: { cliente: ClienteDetalle; puedeEditar: boolean }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function enviar(clave: string, cuerpo: unknown, ok: string) {
    setOcupado(clave);
    setError(null);
    const r = await llamar("PUT", `/clientes/${cliente.id}/ubicacion`, cuerpo);
    setOcupado(null);
    if (!r.ok) return setError(r.error.status === 400 ? "No pudimos leer una ubicación de ahí. Pega el enlace completo de Google Maps o las coordenadas (19.4326, -99.1332)." : mensajeError(r.error));
    toast.success(ok);
    setTexto("");
    router.refresh();
  }

  function aqui() {
    if (!("geolocation" in navigator)) return setError("Este teléfono no puede dar su ubicación.");
    setOcupado("aqui");
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setOcupado(null);
        void enviar("aqui", { lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6), fuente: "app" }, "Ubicación guardada.");
      },
      () => {
        setOcupado(null);
        setError("No pudimos tomar tu ubicación. Revisa que el GPS esté prendido y que diste permiso.");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function aceptar() {
    setOcupado("aceptar");
    const r = await llamar("POST", `/clientes/${cliente.id}/ubicacion/aceptar`);
    setOcupado(null);
    if (!r.ok) return setError(mensajeError(r.error));
    toast.success("Ubicación aceptada.");
    router.refresh();
  }

  return (
    <Tarjeta className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">Ubicación</h2>
      <p className="flex flex-wrap items-center gap-2 text-base">
        {cliente.tiene_ubicacion ? <Insignia tono="exito">Tiene ubicación</Insignia> : <Insignia tono="aviso">Sin ubicación</Insignia>}
        {cliente.lat && cliente.lng && (
          <a href={mapaDe(cliente.lat, cliente.lng)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-tocable items-center gap-1 font-semibold text-marca-fuerte underline">
            Ver en el mapa <ExternalLink aria-hidden className="size-4" />
          </a>
        )}
      </p>

      {cliente.tiene_propuesta && (
        <div className="flex flex-col gap-2 rounded-xl border border-marca bg-marca-suave p-3">
          <p className="text-base font-medium">El cliente mandó su ubicación desde su link.</p>
          {cliente.lat_propuesta && cliente.lng_propuesta && (
            <a href={mapaDe(cliente.lat_propuesta, cliente.lng_propuesta)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-tocable items-center gap-1 font-semibold text-marca-fuerte underline">
              Ver la que mandó <ExternalLink aria-hidden className="size-4" />
            </a>
          )}
          {puedeEditar && (
            <Boton cargando={ocupado === "aceptar"} onClick={() => void aceptar()}>
              Aceptar esta ubicación
            </Boton>
          )}
        </div>
      )}

      {puedeEditar && (
        <>
          <AreaTexto etiqueta="Pegar enlace de Google Maps" value={texto} onChange={(e) => setTexto(e.target.value)} ayuda="Abre la tienda en Google Maps, toca Compartir, copia el enlace y pégalo aquí." className="min-h-20" />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Boton cargando={ocupado === "texto"} disabled={!texto.trim()} onClick={() => void enviar("texto", { texto: texto.trim() }, "Ubicación guardada.")}>
              Guardar enlace
            </Boton>
            <Boton variante="secundario" cargando={ocupado === "aqui"} onClick={aqui}>
              <MapPin aria-hidden className="size-5" /> Guardar mi ubicación de ahorita
            </Boton>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
          {error}
        </p>
      )}
    </Tarjeta>
  );
}

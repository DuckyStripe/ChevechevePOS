"use client";

import Link from "next/link";
import { useState } from "react";
import { MapPin } from "lucide-react";
import { T } from "@/lib/textos-publico";
import { ponerBandera } from "./bandera";
import { llamarPublico } from "./llamar-publico";

/** C14: se pide una vez, explicando para que, y nunca bloquea el pedido. `precision_m` va con la lectura (la API rechaza > 100). */
export function Ubicacion() {
  const [estado, setEstado] = useState<"quieto" | "buscando" | "listo" | "falla" | "imprecisa">("quieto");

  function pedir() {
    ponerBandera("chv_ubicacion_preguntada");
    if (!("geolocation" in navigator)) return setEstado("falla");
    setEstado("buscando");
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const r = await llamarPublico("POST", "/ubicacion", {
          lat: p.coords.latitude.toFixed(6),
          lng: p.coords.longitude.toFixed(6),
          precision_m: Math.round(p.coords.accuracy),
        });
        setEstado(r.ok ? "listo" : r.error.status === 400 ? "imprecisa" : "falla");
      },
      () => setEstado("falla"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {estado !== "listo" && (
        <button type="button" onClick={pedir} disabled={estado === "buscando"} className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-marca text-lg font-bold text-white disabled:opacity-60">
          <MapPin aria-hidden className="size-6" /> {estado === "buscando" ? T.ubicacionCompartiendo : T.ubicacionSi}
        </button>
      )}
      <p role="status" className="text-base font-medium">
        {estado === "listo" && T.ubicacionListo}
        {estado === "falla" && T.ubicacionFalla}
        {estado === "imprecisa" && T.ubicacionImprecisa}
      </p>
      <Link href="/pedido" onClick={() => ponerBandera("chv_ubicacion_preguntada")} className="flex min-h-14 items-center justify-center rounded-xl border border-borde bg-superficie text-base font-semibold">
        {estado === "listo" ? T.ubicacionVolver : T.ubicacionNo}
      </Link>
    </div>
  );
}

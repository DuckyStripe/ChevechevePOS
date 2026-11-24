"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";
import { Boton } from "@/componentes/ui/boton";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { buscarActualizacion, enCascaron, escuchar, estadoApp } from "@/lib/cascaron";
import type { EstadoApp } from "@/lib/tipos";

const RESULTADO: Record<EstadoApp["resultado"], string> = {
  al_dia: "Tu app está al día.",
  lista: "Hay una actualización lista. Se aplica sola al volver a abrir la app.",
  apk: "Hay una versión nueva de la app para instalar.",
  sin_red: "No pudimos revisar si hay actualizaciones. Revisa tu señal.",
};

const fecha = (iso: string) => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Mexico_City" }).format(new Date(iso));

/** Solo dentro de la app Android; solo lectura, sin ruta de API: todo viene del cascarón por el puente. */
export function EstaApp() {
  const visible = useSyncExternalStore(() => () => {}, enCascaron, () => false);
  const [estado, setEstado] = useState<EstadoApp | null>(() => estadoApp());
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const cancelar = escuchar("estado_app", (d) => {
      setEstado(d);
      setBuscando(false);
    });
    // Si el aviso del cascarón llegó antes de abrir esta pantalla y no quedó guardado, se pide una revisión.
    const timer = setTimeout(() => {
      if (!estadoApp()) buscarActualizacion();
    }, 2000);
    return () => {
      cancelar();
      clearTimeout(timer);
    };
  }, [visible]);

  if (!visible) return null;

  function buscar() {
    setBuscando(true);
    buscarActualizacion();
    setTimeout(() => setBuscando(false), 30_000);
  }

  return (
    <Tarjeta className="mt-8">
      <h2 className="mb-1 text-xl font-bold">Esta app</h2>
      {estado ? (
        <>
          <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
            <dt className="text-suave">Versión</dt>
            <dd>{estado.version}{estado.version_code ? ` (${estado.version_code})` : ""}</dd>
            {estado.ota_fecha && (
              <>
                <dt className="text-suave">Actualizada</dt>
                <dd>{fecha(estado.ota_fecha)}</dd>
              </>
            )}
          </dl>
          <p className="mb-3 text-base font-semibold">{RESULTADO[estado.resultado]}</p>
        </>
      ) : (
        <p className="mb-3 text-base text-suave">Revisando la versión de la app…</p>
      )}
      <Boton variante="secundario" cargando={buscando} onClick={buscar}>
        <RefreshCw aria-hidden className="size-5" /> Buscar actualización
      </Boton>
      {estado && estado.novedades.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-lg font-bold">Qué hay de nuevo</h3>
          <ul className="flex flex-col gap-3">
            {estado.novedades.slice(0, 5).map((n) => (
              <li key={n.version} className="text-base">
                <p className="font-semibold">Versión {n.version} · {fecha(n.fecha)}</p>
                <ul className="ml-5 list-disc">
                  {n.items.map((i) => (
                    <li key={i} className="[overflow-wrap:anywhere]">{i}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Tarjeta>
  );
}

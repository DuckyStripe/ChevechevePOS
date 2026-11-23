"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { Boton } from "@/componentes/ui/boton";
import { Casilla } from "@/componentes/ui/campo";
import { llamar } from "@/lib/api-cliente";
import type { Notificacion, Preferencia } from "@/lib/tipos";
import { EVENTOS } from "./eventos";

const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso));

export function ListaNotificaciones({ items, hayNoLeidas }: { items: Notificacion[]; hayNoLeidas: boolean }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);

  async function marcar(ids?: (number | string)[]) {
    setCargando(true);
    const r = await llamar("POST", "/notificaciones/leer", ids ? { ids } : {});
    setCargando(false);
    if (!r.ok) return toast.error(r.error.mensaje);
    router.refresh();
  }

  return (
    <>
      {hayNoLeidas && (
        <Boton variante="secundario" cargando={cargando} onClick={() => marcar()} className="mb-4">
          <CheckCheck aria-hidden className="size-5" /> Marcar todo como leído
        </Boton>
      )}
      <ul className="flex flex-col gap-3">
        {items.map((n) => {
          const nueva = !n.leida_en;
          const ruta = typeof n.datos?.ruta === "string" && n.datos.ruta.startsWith("/") ? n.datos.ruta : null;
          const cuerpo = (
            <>
              <span className="flex items-center gap-2 text-sm text-suave">
                {nueva && <span className="rounded-full bg-marca px-2 py-0.5 text-xs font-bold text-white">Nuevo</span>}
                {EVENTOS[n.evento] ?? "Aviso"} · {fecha(n.creado_en)}
              </span>
              <span className="block text-base font-bold [overflow-wrap:anywhere]">{n.titulo}</span>
              <span className="block text-base [overflow-wrap:anywhere]">{n.cuerpo}</span>
            </>
          );
          return (
            <li key={n.id} className={`rounded-tarjeta border p-4 ${nueva ? "border-marca bg-marca-suave" : "border-borde bg-superficie"}`}>
              {ruta ? (
                <Link href={ruta} onClick={() => nueva && marcar([n.id])} className="flex flex-col gap-1">
                  {cuerpo}
                </Link>
              ) : (
                <div className="flex flex-col gap-1">{cuerpo}</div>
              )}
              {nueva && !ruta && (
                <Boton variante="fantasma" className="mt-2" onClick={() => marcar([n.id])}>
                  Marcar como leído
                </Boton>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function PreferenciasAvisos({ preferencias }: { preferencias: Preferencia[] }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setCargando(true);
    const r = await llamar("PUT", "/notificaciones/preferencias", { preferencias: preferencias.map((p) => ({ evento: p.evento, push: f.get(p.evento) === "on" })) });
    setCargando(false);
    if (!r.ok) return toast.error(r.error.mensaje);
    toast.success("Listo, guardamos tus avisos.");
    router.refresh();
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-1">
      {preferencias.map((p) => (
        <Casilla key={p.evento} etiqueta={EVENTOS[p.evento] ?? p.evento.replaceAll("_", " ")} name={p.evento} defaultChecked={p.push} />
      ))}
      <Boton type="submit" cargando={cargando} className="mt-3">
        Guardar mis avisos
      </Boton>
    </form>
  );
}

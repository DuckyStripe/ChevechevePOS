"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { mensajeError } from "@/componentes/productos/formato";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { llamar } from "@/lib/api-cliente";
import type { CalendarioDemanda } from "@/lib/tipos";

type Fila = { clave: number; fecha: string; nombre: string; factor: string };

let contador = 0;
const aFilas = (c: CalendarioDemanda): Fila[] => c.items.map((x) => ({ clave: ++contador, fecha: x.fecha, nombre: x.nombre, factor: String(Number(x.factor)) }));

/** Calendario de demanda: dias en que se vende mas (o menos). La lista de surtido multiplica lo que vendes normalmente por el factor. Dueña de `PUT /fechas-demanda`. */
export function CalendarioEditable({ inicial }: { inicial: CalendarioDemanda }) {
  const router = useRouter();
  const [anio, setAnio] = useState(inicial.anio);
  const [filas, setFilas] = useState<Fila[]>(() => aFilas(inicial));
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [sucio, setSucio] = useState(false);

  async function irAlAnio(nuevo: number) {
    if (sucio && !window.confirm("Hay cambios sin guardar en este año. ¿Los descartas?")) return;
    setCargando(true);
    const r = await llamar<CalendarioDemanda>("GET", `/fechas-demanda?anio=${nuevo}`);
    setCargando(false);
    if (!r.ok) return void toast.error(r.error.mensaje);
    setAnio(nuevo);
    setFilas(aFilas(r.datos));
    setSucio(false);
    setError(null);
  }

  const cambiar = (clave: number, parcial: Partial<Fila>) => {
    setFilas((x) => x.map((f) => (f.clave === clave ? { ...f, ...parcial } : f)));
    setSucio(true);
  };

  async function guardar() {
    setError(null);
    for (const f of filas) {
      if (!f.fecha.startsWith(`${anio}-`)) return setError(`Cada fecha debe ser de ${anio}. Revisa «${f.nombre || "sin nombre"}».`);
      if (!f.nombre.trim()) return setError("Ponle nombre a cada fecha (por ejemplo «Puente» o «Final de futbol»).");
      const n = Number(f.factor);
      if (!Number.isFinite(n) || n < 0.1 || n > 5) return setError(`El factor de «${f.nombre}» debe estar entre 0.1 y 5. Por ejemplo 1.3 vende 30% más.`);
    }
    if (new Set(filas.map((f) => f.fecha)).size !== filas.length) return setError("Hay una fecha repetida. Deja una sola por día.");
    setCargando(true);
    const r = await llamar<CalendarioDemanda>("PUT", "/fechas-demanda", { anio, fechas: filas.map((f) => ({ fecha: f.fecha, nombre: f.nombre.trim(), factor: Number(f.factor) })) });
    setCargando(false);
    if (!r.ok) return setError(mensajeError(r.error));
    setFilas(aFilas(r.datos));
    setSucio(false);
    toast.success("Calendario guardado.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Boton variante="secundario" aria-label={`Año ${anio - 1}`} onClick={() => irAlAnio(anio - 1)} disabled={cargando}>
          <ChevronLeft aria-hidden className="size-5" />
        </Boton>
        <p className="text-xl font-bold tabular-nums">{anio}</p>
        <Boton variante="secundario" aria-label={`Año ${anio + 1}`} onClick={() => irAlAnio(anio + 1)} disabled={cargando}>
          <ChevronRight aria-hidden className="size-5" />
        </Boton>
      </div>

      {filas.length === 0 && <p className="rounded-xl border border-dashed border-borde p-4 text-center text-base text-suave">No hay fechas en {anio}. Agrega una.</p>}
      <ul className="flex flex-col gap-3">
        {filas.map((f) => (
          <li key={f.clave} className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-xl border border-borde p-3 sm:grid-cols-[10rem_1fr_6rem_auto]">
            <Campo etiqueta="Día" type="date" value={f.fecha} onChange={(e) => cambiar(f.clave, { fecha: e.target.value })} />
            <button type="button" aria-label={`Quitar ${f.nombre || "esta fecha"}`} onClick={() => { setFilas((x) => x.filter((y) => y.clave !== f.clave)); setSucio(true); }} className="inline-flex size-12 items-center justify-center rounded-xl text-peligro hover:bg-peligro-suave sm:order-last">
              <Trash2 aria-hidden className="size-5" />
            </button>
            <Campo etiqueta="Qué es" value={f.nombre} onChange={(e) => cambiar(f.clave, { nombre: e.target.value })} autoComplete="off" />
            <Campo etiqueta="Vende ×" inputMode="decimal" value={f.factor} onChange={(e) => cambiar(f.clave, { factor: e.target.value })} autoComplete="off" />
          </li>
        ))}
      </ul>

      <Boton variante="secundario" className="self-start" onClick={() => { setFilas((x) => [...x, { clave: ++contador, fecha: `${anio}-01-01`, nombre: "", factor: "1.3" }]); setSucio(true); }}>
        <Plus aria-hidden className="size-5" /> Agregar una fecha
      </Boton>

      {error && (
        <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
          {error}
        </p>
      )}
      <Boton cargando={cargando} onClick={guardar} ancho>
        Guardar calendario
      </Boton>
    </div>
  );
}

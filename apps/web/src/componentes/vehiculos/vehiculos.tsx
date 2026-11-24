"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { mensajeError } from "@/componentes/productos/formato";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { Insignia } from "@/componentes/ui/insignia";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { llamar } from "@/lib/api-cliente";
import type { Vehiculo } from "@/lib/tipos";

type Borrador = { id: string | null; nombre: string; placas: string; capacidad: string };
const VACIO: Borrador = { id: null, nombre: "", placas: "", capacidad: "" };

/** Camionetas: se dan de alta, se editan y se desactivan, nunca se borran. Solo viven en `/configuracion` (N1). */
export function Vehiculos({ vehiculos }: { vehiculos: Vehiculo[] }) {
  const router = useRouter();
  const [b, setB] = useState<Borrador | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function correr(accion: ReturnType<typeof llamar>, ok: string) {
    setOcupado(true);
    setError(null);
    const r = await accion;
    setOcupado(false);
    if (!r.ok) return setError(r.error.codigo === "DUPLICADO" ? "Ya tienes una camioneta con ese nombre." : mensajeError(r.error));
    toast.success(ok);
    setB(null);
    router.refresh();
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!b?.nombre.trim()) return;
    const cuerpo = { nombre: b.nombre.trim(), placas: b.placas.trim() || null, capacidad_cajas: b.capacidad.trim() ? Number(b.capacidad) : null };
    void correr(b.id ? llamar("PATCH", `/vehiculos/${b.id}`, cuerpo) : llamar("POST", "/vehiculos", cuerpo), b.id ? "Camioneta guardada." : "Camioneta agregada.");
  }

  return (
    <Tarjeta aria-labelledby="vehiculos" className="mb-4 flex flex-col gap-3">
      <h2 id="vehiculos" className="text-xl font-bold">
        Vehículos
      </h2>
      <p className="text-base text-suave">Las camionetas de reparto. Si pones cuántas cajas aguantan, la ruta te avisa cuando la carga se pase (solo es un aviso).</p>
      {vehiculos.length === 0 && <p className="text-base text-suave">Todavía no hay camionetas. Agrega la primera para poder armar rutas.</p>}
      <ul className="flex flex-col gap-2">
        {vehiculos.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-borde p-2">
            <span className="min-w-0 flex-1 text-base [overflow-wrap:anywhere]">
              <span className="font-medium">{v.nombre}</span> {!v.activo && <Insignia>Desactivada</Insignia>}
              <span className="block text-sm text-suave">
                {v.placas ?? "Sin placas"} · {v.capacidad_cajas ? `${v.capacidad_cajas} cajas` : "Sin límite de cajas"}
              </span>
            </span>
            <Boton variante="secundario" onClick={() => setB({ id: v.id, nombre: v.nombre, placas: v.placas ?? "", capacidad: v.capacidad_cajas ? String(v.capacidad_cajas) : "" })}>
              Cambiar
            </Boton>
            <Boton variante="fantasma" disabled={ocupado} onClick={() => void correr(llamar("PATCH", `/vehiculos/${v.id}`, { activo: !v.activo }), v.activo ? "Camioneta desactivada." : "Camioneta activada.")}>
              {v.activo ? "Desactivar" : "Activar"}
            </Boton>
          </li>
        ))}
      </ul>
      {b ? (
        <form onSubmit={guardar} className="flex flex-col gap-3 rounded-xl border border-borde p-3">
          <Campo etiqueta="Nombre" required maxLength={100} value={b.nombre} onChange={(e) => setB({ ...b, nombre: e.target.value })} />
          <Campo etiqueta="Placas (opcional)" maxLength={20} value={b.placas} onChange={(e) => setB({ ...b, placas: e.target.value })} />
          <Campo etiqueta="Cajas que aguanta (opcional)" inputMode="numeric" pattern="[0-9]*" maxLength={5} value={b.capacidad} onChange={(e) => setB({ ...b, capacidad: e.target.value.replace(/\D/g, "") })} />
          <div className="flex flex-wrap gap-2">
            <Boton type="submit" cargando={ocupado} disabled={!b.nombre.trim() || b.capacidad === "0"}>
              Guardar
            </Boton>
            <Boton variante="secundario" onClick={() => setB(null)}>
              Mejor no
            </Boton>
          </div>
        </form>
      ) : (
        <Boton variante="secundario" onClick={() => setB(VACIO)}>
          Agregar camioneta
        </Boton>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
          {error}
        </p>
      )}
    </Tarjeta>
  );
}

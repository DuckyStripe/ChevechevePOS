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
import type { Zona } from "@/lib/tipos";

/** Zonas de reparto (colonias o sectores). Solo viven en `/configuracion` (N1); se crean, se renombran y se desactivan, nunca se borran. */
export function Zonas({ zonas, puedeEditar }: { zonas: Zona[]; puedeEditar: boolean }) {
  const router = useRouter();
  const [nueva, setNueva] = useState("");
  const [edicion, setEdicion] = useState<{ id: string; nombre: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function correr(accion: Promise<Awaited<ReturnType<typeof llamar>>>, ok: string) {
    setOcupado(true);
    setError(null);
    const r = await accion;
    setOcupado(false);
    if (!r.ok) return setError(r.error.codigo === "DUPLICADO" ? "Ya existe una zona con ese nombre." : mensajeError(r.error));
    toast.success(ok);
    setNueva("");
    setEdicion(null);
    router.refresh();
  }

  return (
    <Tarjeta aria-labelledby="zonas" className="mb-4 flex flex-col gap-3">
      <h2 id="zonas" className="text-xl font-bold">
        Zonas de reparto
      </h2>
      <p className="text-base text-suave">Con las zonas agrupas a tus clientes por colonia o sector para armar las rutas.</p>
      {zonas.length === 0 && <p className="text-base text-suave">Todavía no hay zonas.</p>}
      <ul className="flex flex-col gap-2">
        {zonas.map((z) => {
          const id = String(z.id);
          const editando = edicion?.id === id;
          return (
            <li key={id} className="flex flex-wrap items-center gap-2 rounded-xl border border-borde p-2">
              {editando ? (
                <>
                  <div className="min-w-0 flex-1">
                    <Campo etiqueta="Nombre de la zona" value={edicion.nombre} onChange={(e) => setEdicion({ id, nombre: e.target.value })} maxLength={80} />
                  </div>
                  <Boton cargando={ocupado} disabled={!edicion.nombre.trim()} onClick={() => void correr(llamar("PATCH", `/zonas/${id}`, { nombre: edicion.nombre.trim() }), "Zona guardada.")}>
                    Guardar
                  </Boton>
                  <Boton variante="secundario" onClick={() => setEdicion(null)}>
                    Mejor no
                  </Boton>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 text-base font-medium [overflow-wrap:anywhere]">
                    {z.nombre} {!z.activa && <Insignia>Desactivada</Insignia>}
                  </span>
                  {puedeEditar && (
                    <>
                      <Boton variante="secundario" onClick={() => setEdicion({ id, nombre: z.nombre })}>
                        Cambiar nombre
                      </Boton>
                      <Boton variante="fantasma" disabled={ocupado} onClick={() => void correr(llamar("PATCH", `/zonas/${id}`, { activa: !z.activa }), z.activa ? "Zona desactivada." : "Zona activada.")}>
                        {z.activa ? "Desactivar" : "Activar"}
                      </Boton>
                    </>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {puedeEditar && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (nueva.trim()) void correr(llamar("POST", "/zonas", { nombre: nueva.trim() }), "Zona creada.");
          }}
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <Campo etiqueta="Nueva zona" value={nueva} onChange={(e) => setNueva(e.target.value)} maxLength={80} />
          </div>
          <Boton type="submit" cargando={ocupado} disabled={!nueva.trim()}>
            Agregar zona
          </Boton>
        </form>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
          {error}
        </p>
      )}
    </Tarjeta>
  );
}

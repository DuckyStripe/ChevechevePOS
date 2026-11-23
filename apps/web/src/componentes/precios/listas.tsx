"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { mensajeError } from "@/componentes/productos/formato";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { Dialogo } from "@/componentes/ui/dialogo";
import { Insignia } from "@/componentes/ui/insignia";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { llamar } from "@/lib/api-cliente";
import type { ListaPrecio } from "@/lib/tipos";

/** Listas de precio: alta, renombrar, predeterminada y desactivar (se editan solo aqui, N1). */
export function ListasPrecio({ listas }: { listas: ListaPrecio[] }) {
  const router = useRouter();
  const [edicion, setEdicion] = useState<ListaPrecio | "nueva" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState<string | null>(null);

  async function patch(l: ListaPrecio, cuerpo: Record<string, unknown>, ok: string) {
    setCargando(String(l.id));
    const r = await llamar("PATCH", `/listas-precio/${l.id}`, cuerpo);
    setCargando(null);
    if (!r.ok) return void toast.error(mensajeError(r.error));
    toast.success(ok);
    router.refresh();
  }

  async function guardarNombre(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const nombre = String(new FormData(ev.currentTarget).get("nombre") ?? "").trim();
    if (!nombre) return setError("Escribe el nombre de la lista.");
    setError(null);
    setCargando("form");
    const r = edicion === "nueva" ? await llamar("POST", "/listas-precio", { nombre }) : await llamar("PATCH", `/listas-precio/${(edicion as ListaPrecio).id}`, { nombre });
    setCargando(null);
    if (!r.ok) return setError(mensajeError(r.error));
    toast.success("Lista guardada.");
    setEdicion(null);
    router.refresh();
  }

  return (
    <Tarjeta>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Listas de precio</h2>
        <Boton variante="secundario" onClick={() => { setError(null); setEdicion("nueva"); }}>
          <Plus aria-hidden className="size-5" /> Nueva lista
        </Boton>
      </div>
      <ul className="flex flex-col gap-2">
        {listas.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-borde p-3">
            <p className="min-w-0 text-base font-semibold [overflow-wrap:anywhere]">
              {l.nombre} {l.es_predeterminada && <Insignia tono="aviso">La de siempre</Insignia>} {!l.activa && <Insignia tono="peligro">Desactivada</Insignia>}
            </p>
            <div className="flex flex-wrap gap-2">
              <Boton variante="secundario" onClick={() => { setError(null); setEdicion(l); }}>
                Cambiar nombre
              </Boton>
              {!l.es_predeterminada && l.activa && (
                <Boton variante="secundario" cargando={cargando === String(l.id)} onClick={() => patch(l, { es_predeterminada: true }, `${l.nombre} es ahora la lista de siempre.`)}>
                  Hacerla la de siempre
                </Boton>
              )}
              {!l.es_predeterminada && (
                <Boton variante="fantasma" cargando={cargando === String(l.id)} onClick={() => patch(l, { activa: !l.activa }, l.activa ? "Lista desactivada." : "Lista activada.")}>
                  {l.activa ? "Desactivar" : "Activar"}
                </Boton>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Dialogo abierto={edicion !== null} titulo={edicion === "nueva" ? "Nueva lista de precio" : "Cambiar nombre"} alCerrar={() => setEdicion(null)}>
        <form onSubmit={guardarNombre} noValidate className="flex flex-col gap-4">
          <Campo etiqueta="Nombre" name="nombre" defaultValue={edicion && edicion !== "nueva" ? edicion.nombre : ""} placeholder="Menudeo, Mayoreo…" autoComplete="off" error={error ?? undefined} required />
          <Boton type="submit" cargando={cargando === "form"} ancho>
            Guardar
          </Boton>
        </form>
      </Dialogo>
    </Tarjeta>
  );
}

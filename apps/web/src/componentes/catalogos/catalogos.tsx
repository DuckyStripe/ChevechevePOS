"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { fraccion, mensajeError, porcentaje } from "@/componentes/productos/formato";
import { Boton } from "@/componentes/ui/boton";
import { Campo, Casilla } from "@/componentes/ui/campo";
import { Dialogo } from "@/componentes/ui/dialogo";
import { Insignia } from "@/componentes/ui/insignia";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { Vacio } from "@/componentes/ui/vacio";
import { llamar } from "@/lib/api-cliente";
import type { Categoria, Marca } from "@/lib/tipos";

type Edicion = { tipo: "categoria"; item: Categoria | null } | { tipo: "marca"; item: Marca | null } | null;

function Formulario({ edicion, alTerminar }: { edicion: NonNullable<Edicion>; alTerminar: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const esCat = edicion.tipo === "categoria";
  const cat = esCat ? (edicion.item as Categoria | null) : null;
  const item = edicion.item;

  async function enviar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const nombre = String(f.get("nombre") ?? "").trim();
    if (!nombre) return setError("Escribe el nombre.");
    let cuerpo: Record<string, unknown>;
    if (esCat) {
      const margen = fraccion(String(f.get("margen_objetivo") ?? ""));
      const orden = Number(f.get("orden") || "0");
      if (margen === undefined) return setError("El margen va entre 0 y 90 por ciento.");
      if (!Number.isInteger(orden)) return setError("El orden es un número entero.");
      cuerpo = { nombre, orden, margen_objetivo: margen, activa: f.get("activa") === "on" };
    } else cuerpo = { nombre, activa: f.get("activa") === "on" };
    setError(null);
    setCargando(true);
    const ruta = `/${esCat ? "categorias" : "marcas"}`;
    const r = item ? await llamar("PATCH", `${ruta}/${item.id}`, cuerpo) : await llamar("POST", ruta, cuerpo);
    setCargando(false);
    if (!r.ok) return setError(mensajeError(r.error));
    toast.success("Guardado.");
    alTerminar();
    router.refresh();
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
      <Campo etiqueta="Nombre" name="nombre" defaultValue={item?.nombre} autoComplete="off" required />
      {esCat && (
        <>
          <Campo etiqueta="Lugar en el catálogo" name="orden" type="number" inputMode="numeric" defaultValue={cat?.orden ?? 0} ayuda="El 0 sale primero." />
          <Campo etiqueta="Margen que quieres ganar (%)" name="margen_objetivo" inputMode="decimal" defaultValue={cat?.margen_objetivo ? porcentaje(cat.margen_objetivo).replace("%", "") : ""} ayuda="Vacío = el margen general del negocio." />
        </>
      )}
      <Casilla etiqueta={esCat ? "Categoría activa" : "Marca activa"} name="activa" defaultChecked={item ? (esCat ? cat!.activa : (item as Marca).activa) : true} />
      {error && (
        <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
          {error}
        </p>
      )}
      <Boton type="submit" cargando={cargando} ancho>
        Guardar
      </Boton>
    </form>
  );
}

export function Catalogos({ categorias, marcas, puedeEditar }: { categorias: Categoria[]; marcas: Marca[]; puedeEditar: boolean }) {
  const [edicion, setEdicion] = useState<Edicion>(null);
  const titulo = !edicion ? "" : `${edicion.item ? "Editar" : "Nueva"} ${edicion.tipo === "categoria" ? "categoría" : "marca"}`;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Tarjeta>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Categorías</h2>
          {puedeEditar && (
            <Boton variante="secundario" onClick={() => setEdicion({ tipo: "categoria", item: null })}>
              <Plus aria-hidden className="size-5" /> Nueva
            </Boton>
          )}
        </div>
        {categorias.length === 0 ? (
          <Vacio texto="Aún no hay categorías: cerveza, refresco, botana…" />
        ) : (
          <ul className="flex flex-col gap-2">
            {categorias.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-borde p-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold [overflow-wrap:anywhere]">{c.nombre}</p>
                  <p className="text-sm text-suave">Margen: {c.margen_objetivo ? porcentaje(c.margen_objetivo) : "el general"}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!c.activa && <Insignia tono="peligro">Desactivada</Insignia>}
                  {puedeEditar && (
                    <Boton variante="secundario" onClick={() => setEdicion({ tipo: "categoria", item: c })}>
                      Editar
                    </Boton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Marcas</h2>
          {puedeEditar && (
            <Boton variante="secundario" onClick={() => setEdicion({ tipo: "marca", item: null })}>
              <Plus aria-hidden className="size-5" /> Nueva
            </Boton>
          )}
        </div>
        {marcas.length === 0 ? (
          <Vacio texto="Aún no hay marcas." />
        ) : (
          <ul className="flex flex-col gap-2">
            {marcas.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-borde p-3">
                <p className="min-w-0 text-base font-semibold [overflow-wrap:anywhere]">{m.nombre}</p>
                <div className="flex items-center gap-2">
                  {!m.activa && <Insignia tono="peligro">Desactivada</Insignia>}
                  {puedeEditar && (
                    <Boton variante="secundario" onClick={() => setEdicion({ tipo: "marca", item: m })}>
                      Editar
                    </Boton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Dialogo abierto={edicion !== null} titulo={titulo} alCerrar={() => setEdicion(null)}>
        {edicion && <Formulario edicion={edicion} alTerminar={() => setEdicion(null)} />}
      </Dialogo>
    </div>
  );
}

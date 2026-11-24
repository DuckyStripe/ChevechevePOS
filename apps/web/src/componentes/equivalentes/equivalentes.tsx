"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { toast } from "sonner";
import { BuscadorProductos } from "@/componentes/productos/buscador-productos";
import { itemsDe, mensajeError } from "@/componentes/productos/formato";
import { Boton } from "@/componentes/ui/boton";
import { Esqueleto } from "@/componentes/ui/esqueleto";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { llamar } from "@/lib/api-cliente";
import type { Equivalente } from "@/lib/tipos";

type Fila = { producto_id: string; producto: string };

/** Productos que se ofrecen cuando este falta (`GET/PUT /productos/:id/equivalentes`). Se sugieren, nunca se aplican solos. Solo vive en `/productos/[id]` (N1). */
export function Equivalentes({ productoId, puedeEditar }: { productoId: string; puedeEditar: boolean }) {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sucio, setSucio] = useState(false);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const r = await llamar<Equivalente[]>("GET", `/productos/${productoId}/equivalentes`);
      if (!vivo) return;
      if (!r.ok) return setError(r.error.mensaje);
      setFilas(itemsDe(r.datos).sort((a, b) => a.orden - b.orden).map((e) => ({ producto_id: String(e.producto_id), producto: e.producto })));
    })();
    return () => {
      vivo = false;
    };
  }, [productoId]);

  const poner = (f: Fila[]) => {
    setFilas(f);
    setSucio(true);
  };
  const mover = (i: number, d: -1 | 1) => {
    if (!filas) return;
    const n = [...filas];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    poner(n);
  };

  async function guardar() {
    if (!filas) return;
    setCargando(true);
    const r = await llamar("PUT", `/productos/${productoId}/equivalentes`, { equivalentes: filas.map((f, i) => ({ producto_id: f.producto_id, orden: i + 1 })) });
    setCargando(false);
    if (!r.ok) return setError(mensajeError(r.error));
    setError(null);
    setSucio(false);
    toast.success("Equivalentes guardados.");
  }

  return (
    <Tarjeta aria-labelledby="equivalentes" className="flex flex-col gap-3">
      <h2 id="equivalentes" className="text-lg font-bold">
        Si se acaba, ofrecer
      </h2>
      <p className="text-sm text-suave">Cuando este producto falte en un pedido, estos son los que se te sugieren primero. Tú eliges cuál ofrecer.</p>
      {!filas && !error && <Esqueleto className="h-12" />}
      {filas?.length === 0 && <p className="text-base text-suave">Todavía no hay ninguno.</p>}
      {filas && (
        <ol className="flex flex-col gap-2">
          {filas.map((f, i) => (
            <li key={f.producto_id} className="flex items-center gap-1 rounded-xl border border-borde px-2 py-1">
              <span className="min-w-0 flex-1 text-base [overflow-wrap:anywhere]">
                {i + 1}. {f.producto}
              </span>
              {puedeEditar && (
                <>
                  <Boton variante="fantasma" aria-label={`Subir ${f.producto}`} disabled={i === 0} onClick={() => mover(i, -1)} className="!px-3">
                    <ArrowUp aria-hidden className="size-5" />
                  </Boton>
                  <Boton variante="fantasma" aria-label={`Bajar ${f.producto}`} disabled={i === filas.length - 1} onClick={() => mover(i, 1)} className="!px-3">
                    <ArrowDown aria-hidden className="size-5" />
                  </Boton>
                  <Boton variante="fantasma" aria-label={`Quitar ${f.producto}`} onClick={() => poner(filas.filter((x) => x !== f))} className="!px-3 !text-peligro">
                    <X aria-hidden className="size-5" />
                  </Boton>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
      {puedeEditar && filas && (
        <>
          <BuscadorProductos
            etiqueta="Agregar un producto parecido"
            resultado={(p, limpiar) =>
              String(p.id) === productoId || filas.some((f) => f.producto_id === String(p.id)) ? null : (
                <button
                  type="button"
                  onClick={() => {
                    poner([...filas, { producto_id: String(p.id), producto: p.nombre }]);
                    limpiar();
                  }}
                  className="flex min-h-tocable w-full items-center rounded-xl border border-borde px-3 text-left text-base active:bg-marca-suave"
                >
                  {p.nombre}
                </button>
              )
            }
          />
          {sucio && (
            <Boton cargando={cargando} onClick={() => void guardar()}>
              Guardar equivalentes
            </Boton>
          )}
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

"use client";

import { useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { llamar } from "@/lib/api-cliente";
import type { ArticuloPos, Lista, Producto } from "@/lib/tipos";
import { itemsDe } from "./formato";

/**
 * Buscador tolerante del panel (C10): escribe y salen resultados («caguama», «kerona»).
 * Con `alCodigo`, un Enter con puros numeros (escaner) consulta el codigo de barras.
 */
export function BuscadorProductos({
  etiqueta = "Buscar producto",
  ayuda,
  alCodigo,
  resultado,
}: {
  etiqueta?: string;
  ayuda?: string;
  alCodigo?: (a: ArticuloPos) => void;
  resultado: (p: Producto, limpiar: () => void) => ReactNode;
}) {
  const [texto, setTexto] = useState("");
  const [lista, setLista] = useState<Producto[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turno = useRef(0);

  const limpiar = () => {
    setTexto("");
    setLista(null);
    setAviso(null);
  };

  async function buscar(t: string) {
    const mio = ++turno.current;
    setBuscando(true);
    const r = await llamar<Lista<Producto> | Producto[]>("GET", `/productos?buscar=${encodeURIComponent(t)}&activo=true&por_pagina=20`);
    if (mio !== turno.current) return;
    setBuscando(false);
    if (!r.ok) return setAviso(r.error.mensaje);
    setAviso(null);
    setLista(itemsDe(r.datos));
  }

  function alCambiar(v: string) {
    setTexto(v);
    if (reloj.current) clearTimeout(reloj.current);
    if (v.trim().length < 2) {
      turno.current++;
      setLista(null);
      setBuscando(false);
      return;
    }
    reloj.current = setTimeout(() => void buscar(v.trim()), 300);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (reloj.current) clearTimeout(reloj.current);
    if (t.length < 2) return;
    if (alCodigo && /^\d{6,}$/.test(t)) {
      setBuscando(true);
      const r = await llamar<ArticuloPos>("GET", `/presentaciones/codigo/${encodeURIComponent(t)}`);
      setBuscando(false);
      if (r.ok) {
        limpiar();
        return alCodigo(r.datos);
      }
      return setAviso(r.error.status === 404 ? "No encontramos ese código. Búscalo por nombre." : r.error.mensaje);
    }
    void buscar(t);
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={enviar} className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Campo
            etiqueta={etiqueta}
            ayuda={ayuda}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="none"
            value={texto}
            onChange={(e) => alCambiar(e.target.value)}
          />
        </div>
        <Boton type="submit" variante="secundario" aria-label="Buscar" cargando={buscando}>
          <Search aria-hidden className="size-5" />
        </Boton>
      </form>
      {aviso && (
        <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
          {aviso}
        </p>
      )}
      {lista && lista.length === 0 && !buscando && <p className="text-base text-suave">No encontramos nada con «{texto.trim()}». Prueba con otra palabra.</p>}
      {lista && lista.length > 0 && (
        <ul className="flex flex-col gap-2">
          {lista.map((p) => (
            <li key={p.id} className="rounded-tarjeta border border-borde bg-superficie p-3">
              {resultado(p, limpiar)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

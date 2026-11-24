"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { mensajeError } from "@/componentes/productos/formato";
import { Boton } from "@/componentes/ui/boton";
import { Campo, Selector } from "@/componentes/ui/campo";
import { Dialogo } from "@/componentes/ui/dialogo";
import { Insignia } from "@/componentes/ui/insignia";
import { llamar } from "@/lib/api-cliente";
import type { ClienteFila } from "@/lib/tipos";
import { ALERTAS, diasTexto, ENLACE, MOTIVOS_BAJA } from "./formato-clientes";

/**
 * Lista de clientes con seleccion multiple y «Dar de baja link» (unica pantalla que lo hace, N1). Siempre lo decide una
 * persona (C21): nada se da de baja solo. `revocarInicial` abre la confirmacion ya con ese cliente (`?revocar=<id>`).
 */
export function ListaClientes({ clientes, puedeBaja, revocarInicial }: { clientes: ClienteFila[]; puedeBaja: boolean; revocarInicial?: string }) {
  const router = useRouter();
  const inicial = revocarInicial && clientes.some((c) => String(c.id) === revocarInicial) ? [revocarInicial] : [];
  const [seleccion, setSeleccion] = useState<string[]>(inicial);
  const [abierto, setAbierto] = useState(inicial.length > 0);
  const [motivo, setMotivo] = useState("ya_no_es_cliente");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const alternar = (id: string) => setSeleccion((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const nombres = clientes.filter((c) => seleccion.includes(String(c.id))).map((c) => c.nombre);

  function abrir(ids: string[]) {
    setSeleccion(ids);
    setMotivo("ya_no_es_cliente");
    setNota("");
    setError(null);
    setAbierto(true);
  }

  async function confirmar() {
    if (motivo === "otro" && !nota.trim()) return setError("Escribe cuál es el motivo.");
    setCargando(true);
    setError(null);
    const r = await llamar<{ dados_de_baja: number }>("POST", "/clientes/enlaces/revocar", { cliente_ids: seleccion, motivo, ...(nota.trim() ? { nota: nota.trim() } : {}) });
    setCargando(false);
    if (!r.ok) return setError(mensajeError(r.error));
    toast.success(r.datos.dados_de_baja === 1 ? "Link dado de baja." : `${r.datos.dados_de_baja} links dados de baja.`);
    setAbierto(false);
    setSeleccion([]);
    router.replace("/clientes");
    router.refresh();
  }

  return (
    <>
      {puedeBaja && seleccion.length > 0 && (
        <div className="sticky top-14 z-10 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-tarjeta border border-marca bg-marca-suave p-3">
          <p className="text-base font-semibold">
            {seleccion.length} {seleccion.length === 1 ? "cliente elegido" : "clientes elegidos"}
          </p>
          <div className="flex gap-2">
            <Boton variante="secundario" onClick={() => setSeleccion([])}>
              Quitar elección
            </Boton>
            <Boton variante="peligro" onClick={() => abrir(seleccion)}>
              Dar de baja link
            </Boton>
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {clientes.map((c) => {
          const id = String(c.id);
          const enlace = c.enlace ? ENLACE[c.enlace.estado] : null;
          const alertas = c.alertas ?? [];
          const puedeQuitar = puedeBaja && (c.enlace ? c.enlace.estado === "activo" || c.enlace.estado === "sin_activar" : c.tiene_enlace);
          return (
            <li key={id} className="rounded-tarjeta border border-borde bg-superficie p-3">
              <div className="flex items-start gap-2">
                {puedeBaja && puedeQuitar && (
                  <input type="checkbox" aria-label={`Elegir a ${c.nombre}`} checked={seleccion.includes(id)} onChange={() => alternar(id)} className="mt-2 size-6 shrink-0 accent-marca" />
                )}
                <div className="min-w-0 flex-1">
                  <Link href={`/clientes/${id}`} className="text-lg font-bold [overflow-wrap:anywhere] hover:underline">
                    {c.nombre}
                  </Link>
                  <p className="text-base text-suave">
                    {c.zona?.nombre ?? "Sin zona"} · {diasTexto(c.dias_visita)}
                    {!c.activo && " · Desactivado"}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {enlace && <Insignia tono={enlace.tono}>{enlace.texto}</Insignia>}
                    {!c.tiene_ubicacion && <Insignia tono="aviso">Sin ubicación</Insignia>}
                    {c.tiene_propuesta && <Insignia tono="aviso">Mandó su ubicación</Insignia>}
                    {alertas.map((a) => (
                      <Insignia key={a} tono="aviso">
                        {ALERTAS[a] ?? a}
                      </Insignia>
                    ))}
                  </div>
                </div>
              </div>
              {alertas.length > 0 && puedeQuitar && (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-marca-suave p-2">
                  <p className="flex items-center gap-1 text-sm font-medium text-marca-fuerte">
                    <TriangleAlert aria-hidden className="size-4 shrink-0" /> Tú decides si le quitas el link.
                  </p>
                  <Boton variante="secundario" onClick={() => abrir([id])}>
                    Dar de baja link
                  </Boton>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <Dialogo abierto={abierto} titulo="Dar de baja link" alCerrar={() => setAbierto(false)}>
        <div className="flex flex-col gap-4">
          <p className="text-base [overflow-wrap:anywhere]">
            {nombres.length === 1 ? nombres[0] : `${nombres.length} clientes`} ya no podrá entrar con su link actual. Si después quieres darle acceso, genera un link nuevo desde su ficha.
          </p>
          <Selector etiqueta="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            {MOTIVOS_BAJA.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.texto}
              </option>
            ))}
          </Selector>
          <Campo etiqueta={motivo === "otro" ? "¿Cuál es el motivo?" : "Nota (opcional)"} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} />
          {error && (
            <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Mejor no
            </Boton>
            <Boton variante="peligro" cargando={cargando} onClick={() => void confirmar()}>
              Dar de baja link
            </Boton>
          </div>
        </div>
      </Dialogo>
    </>
  );
}

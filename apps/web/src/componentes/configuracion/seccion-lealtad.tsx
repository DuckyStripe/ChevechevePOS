"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { BuscadorProductos } from "@/componentes/productos/buscador-productos";
import { mensajeError } from "@/componentes/productos/formato";
import { Boton } from "@/componentes/ui/boton";
import { Campo, Casilla } from "@/componentes/ui/campo";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { llamar } from "@/lib/api-cliente";
import type { ConfigLealtad } from "@/lib/tipos";

/**
 * Sección «Lealtad» de /configuracion (F11, B14): única dueña de prender el programa y elegir el regalo (N1). La página solo la
 * monta con `precios.editar`. Las 3 llaves se guardan juntas; la API valida (regalo obligatorio al prender) y aquí solo se muestra su mensaje.
 */
export function SeccionLealtad({ config: cfg }: { config: Record<string, unknown> }) {
  const config = cfg as ConfigLealtad;
  const router = useRouter();
  const [activa, setActiva] = useState(config.lealtad_activa === true);
  const [cada, setCada] = useState(String(config.lealtad_cada ?? 10));
  const [regaloId, setRegaloId] = useState<string | null>(config.lealtad_presentacion_regalo_id == null ? null : String(config.lealtad_presentacion_regalo_id));
  const [regaloNombre, setRegaloNombre] = useState<string | null>(config.lealtad_regalo ? `${config.lealtad_regalo.presentacion} · ${config.lealtad_regalo.producto}` : null);
  const [cambiando, setCambiando] = useState(regaloId === null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(cada);
    if (!/^\d+$/.test(cada) || n < 1 || n > 1000) return setError("Escribe cada cuántas cajas se regala una (de 1 a 1000).");
    if (activa && !regaloId) return setError("Elige qué se regala antes de prender el programa.");
    setCargando(true);
    const r = await llamar("PATCH", "/configuracion", { lealtad_activa: activa, lealtad_cada: n, lealtad_presentacion_regalo_id: regaloId });
    setCargando(false);
    if (!r.ok) return setError(mensajeError(r.error));
    toast.success("Cambios guardados.");
    router.refresh();
  }

  return (
    <Tarjeta aria-labelledby="lealtad" className="mb-4 flex flex-col gap-3">
      <h2 id="lealtad" className="text-xl font-bold">
        Lealtad
      </h2>
      <p className="text-base text-suave">Cada cierto número de cajas que compra un cliente, la siguiente venta lleva una gratis.</p>
      <form onSubmit={guardar} noValidate className="flex flex-col gap-3">
        <Casilla etiqueta="Programa de lealtad" ayuda="Apagado, nada cambia para nadie." checked={activa} onChange={(e) => setActiva(e.target.checked)} />
        <Campo etiqueta="Cada cuántas cajas" inputMode="numeric" pattern="[0-9]*" maxLength={4} value={cada} onChange={(e) => setCada(e.target.value.replace(/\D/g, ""))} />
        <div className="flex flex-col gap-2">
          <p className="text-base font-medium">Qué se regala</p>
          {regaloId && !cambiando ? (
            <>
              <p className="text-base">{regaloNombre ?? "Ya hay un regalo elegido."}</p>
              <Boton variante="secundario" onClick={() => setCambiando(true)}>
                Cambiar el regalo
              </Boton>
            </>
          ) : (
            <BuscadorProductos
              etiqueta="Buscar el producto que se regala"
              resultado={(p, limpiar) => (
                <div className="flex flex-col gap-1 rounded-xl border border-borde p-2">
                  <p className="text-base font-semibold [overflow-wrap:anywhere]">{p.nombre}</p>
                  {p.presentaciones
                    .filter((x) => x.activa && x.se_vende)
                    .map((x) => (
                      <button
                        key={x.id}
                        type="button"
                        onClick={() => {
                          setRegaloId(String(x.id));
                          setRegaloNombre(`${x.nombre} · ${p.nombre}`);
                          setCambiando(false);
                          limpiar();
                        }}
                        className="min-h-tocable rounded-xl border border-borde px-3 text-left text-base active:bg-marca-suave"
                      >
                        {x.nombre}
                      </button>
                    ))}
                </div>
              )}
            />
          )}
        </div>
        <p className="text-sm text-suave">
          La frase que ve el cliente se cambia en <Link href="/configuracion/plantillas" className="font-semibold text-marca-fuerte underline">Textos de mensajes</Link>. Las presentaciones que cuentan se marcan en la ficha de cada producto.
        </p>
        {error && (
          <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
            {error}
          </p>
        )}
        <Boton type="submit" cargando={cargando}>
          Guardar
        </Boton>
      </form>
    </Tarjeta>
  );
}

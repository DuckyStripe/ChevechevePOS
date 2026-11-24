"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { mensajeError, uuid } from "@/componentes/productos/formato";
import { Boton } from "@/componentes/ui/boton";
import { Dialogo } from "@/componentes/ui/dialogo";
import { Esqueleto } from "@/componentes/ui/esqueleto";
import { llamar } from "@/lib/api-cliente";
import type { Aviso, Lista } from "@/lib/tipos";
import { nombrePlantilla, PLANTILLAS_MANUALES } from "./etiquetas";

function traer(clienteId: string | null) {
  const q = new URLSearchParams({ estado: "pendiente", por_pagina: "50" });
  if (clienteId) q.set("cliente_id", clienteId);
  return llamar<Lista<Aviso>>("GET", `/avisos?${q}`);
}

const nombreCliente = (a: Aviso) => (a.cliente == null ? "Sin cliente" : typeof a.cliente === "string" ? a.cliente : a.cliente.nombre);

/**
 * N5/P2: bandeja global «Avisos por enviar» (la unica que crea avisos manuales, P9). Un toque abre WhatsApp con el texto
 * listo y al volver otro toque en «Enviado». Contador con sondeo de 30 s. Se abre con `?bandeja=1` o `?nuevo=<plantilla>&cliente=`.
 */
export function BandejaAvisos({ puedeMarcar }: { puedeMarcar: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const nuevo = sp.get("nuevo");
  const clienteParam = sp.get("cliente");
  const pedidoParam = sp.get("pedido");
  const pedirla = sp.get("bandeja") === "1" || !!nuevo;
  const alDueno = nuevo === "wa_resumen_dia";

  const [cerradaPorUsuario, setCerrada] = useState(false);
  const [manual, setManual] = useState(false);
  const abierto = (pedirla && !cerradaPorUsuario) || manual;

  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<Aviso[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abiertos, setAbiertos] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [claveNuevo, setClaveNuevo] = useState(() => uuid());

  const filtroCliente = clienteParam && sp.get("bandeja") === "1" ? clienteParam : null;
  const aplicar = useCallback((r: Awaited<ReturnType<typeof traer>>) => {
    if (!r.ok) return setError(r.error.mensaje);
    setError(null);
    setTotal(r.datos.total);
    setItems(r.datos.items);
  }, []);
  const cargar = useCallback(async () => aplicar(await traer(filtroCliente)), [aplicar, filtroCliente]);

  useEffect(() => {
    let vivo = true;
    const buscar = async () => {
      const r = await traer(filtroCliente);
      if (vivo) aplicar(r);
    };
    void buscar();
    const id = setInterval(() => {
      if (!document.hidden) void buscar();
    }, 30_000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [filtroCliente, aplicar]);

  // Quita solo lo de la bandeja: la pantalla de abajo (p. ej. /cobrar?pedido=) conserva sus parámetros.
  const sinBandeja = (extra?: Record<string, string>) => {
    const q = new URLSearchParams(sp.toString());
    for (const k of ["nuevo", "bandeja", "fecha"]) q.delete(k);
    for (const [k, v] of Object.entries(extra ?? {})) q.set(k, v);
    return q.size ? `${pathname}?${q}` : pathname;
  };

  function cerrar() {
    setManual(false);
    setCerrada(true);
    if (pedirla) router.replace(sinBandeja());
  }

  async function marcar(a: Aviso, accion: "enviado" | "descartar") {
    setOcupado(String(a.id));
    const r = await llamar("POST", `/avisos/${a.id}/${accion}`);
    setOcupado(null);
    if (!r.ok && r.error.codigo !== "AVISO_NO_PENDIENTE") return void toast.error(mensajeError(r.error));
    await cargar();
  }

  async function crear() {
    if (!nuevo || (!clienteParam && !alDueno)) return;
    setOcupado("nuevo");
    // `wa_resumen_dia` va al dueño, no a un cliente: sin `cliente_id` y con la fecha del resumen (la API resuelve al dueño).
    const r = await llamar<Aviso>("POST", "/avisos", {
      clave_idempotencia: claveNuevo,
      plantilla: nuevo,
      ...(alDueno ? { fecha: sp.get("fecha") ?? undefined } : { cliente_id: clienteParam }),
      ...(pedidoParam ? { pedido_id: pedidoParam } : {}),
    });
    setOcupado(null);
    if (!r.ok) return void toast.error(mensajeError(r.error));
    setClaveNuevo(uuid()); // el siguiente aviso manual es otro
    toast.success("Mensaje listo. Tócalo para abrir WhatsApp.");
    setCerrada(false);
    setManual(true);
    router.replace(sinBandeja(clienteParam ? { bandeja: "1", cliente: clienteParam } : { bandeja: "1" }));
    await cargar();
  }

  const puedeCrear = !!nuevo && (!!clienteParam || alDueno) && PLANTILLAS_MANUALES.includes(nuevo);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setCerrada(false);
          setManual(true);
        }}
        aria-label={total > 0 ? `Avisos por enviar: ${total}` : "Avisos por enviar"}
        className="relative flex size-12 items-center justify-center rounded-xl hover:bg-marca-suave"
      >
        <MessageCircle aria-hidden className="size-6" />
        {total > 0 && <span className="absolute right-1 top-1 min-w-5 rounded-full bg-marca px-1 text-center text-xs font-bold leading-5 text-white">{total > 99 ? "99+" : total}</span>}
      </button>

      <Dialogo abierto={abierto} titulo="Avisos por enviar" alCerrar={cerrar}>
        <div className="flex flex-col gap-3">
          {puedeCrear && (
            <div className="flex flex-col gap-2 rounded-xl border border-marca bg-marca-suave p-3">
              <p className="text-base font-medium">
                Preparar «{nombrePlantilla(nuevo!)}» {alDueno ? "para el dueño" : `para el cliente #${clienteParam}`}.
              </p>
              <Boton cargando={ocupado === "nuevo"} onClick={() => void crear()}>
                Preparar mensaje
              </Boton>
            </div>
          )}
          {error && (
            <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
              {error}
            </p>
          )}
          {!items && !error && <Esqueleto className="h-24" />}
          {items && items.length === 0 && <p className="rounded-xl border border-dashed border-borde p-6 text-center text-base text-suave">No hay mensajes por enviar.</p>}
          {items?.map((a) => {
            const id = String(a.id);
            const yaAbierto = abiertos.includes(id);
            return (
              <article key={id} className="flex flex-col gap-2 rounded-xl border border-borde p-3">
                <header>
                  <p className="text-base font-bold [overflow-wrap:anywhere]">{nombreCliente(a)}</p>
                  <p className="text-sm text-suave">
                    {nombrePlantilla(a.plantilla)}
                    {a.pedido_folio ? ` · Pedido ${a.pedido_folio}` : ""}
                  </p>
                </header>
                <p className="line-clamp-3 text-base [overflow-wrap:anywhere]">{a.texto}</p>
                {a.url && a.telefono_completo ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setAbiertos((x) => (x.includes(id) ? x : [...x, id]))}
                    className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-exito text-base font-bold text-white"
                  >
                    <MessageCircle aria-hidden className="size-5" /> Abrir WhatsApp
                  </a>
                ) : (
                  <p className="rounded-xl bg-marca-suave p-2 text-base font-medium">Este cliente no tiene WhatsApp. Agrégalo en su ficha.</p>
                )}
                {puedeMarcar && (
                <div className="flex gap-2">
                  <Boton variante={yaAbierto ? "primario" : "secundario"} className="flex-1" cargando={ocupado === id} onClick={() => void marcar(a, "enviado")}>
                    Enviado
                  </Boton>
                  <Boton variante="fantasma" disabled={ocupado === id} onClick={() => void marcar(a, "descartar")}>
                    Descartar
                  </Boton>
                </div>
                )}
              </article>
            );
          })}
        </div>
      </Dialogo>
    </>
  );
}

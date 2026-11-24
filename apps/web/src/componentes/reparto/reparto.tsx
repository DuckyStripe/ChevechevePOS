"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Map, MapPin, Navigation, Phone } from "lucide-react";
import { toast } from "sonner";
import { conVolver } from "@/componentes/cobro/volver";
import { mensajeError } from "@/componentes/productos/formato";
import { cajasTexto, telefonoLlamada } from "@/componentes/rutas/formato";
import { Boton, BotonEnlace, clasesBoton } from "@/componentes/ui/boton";
import { AreaTexto, Campo } from "@/componentes/ui/campo";
import { Dialogo } from "@/componentes/ui/dialogo";
import { Insignia } from "@/componentes/ui/insignia";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { llamar } from "@/lib/api-cliente";
import { pantallaEncendida } from "@/lib/cascaron";
import { dinero } from "@/lib/dinero";
import type { ParadaRuta, RutaDetalle } from "@/lib/tipos";

// P4 y P5: una mano, una parada por pantalla, acciones abajo (≥ 56 px), y siempre claro si se guardó o no.
const GRANDE = "!min-h-14 !text-lg";
const FONDO = /^\d{1,10}(\.\d{1,2})?$/;
// La clave viaja a la API; su texto para el cliente sale de la plantilla `motivo_<clave>`.
const MOTIVOS = [{ clave: "cerrado", texto: "Estaba cerrado" }, { clave: "no_estaba", texto: "No estaba" }, { clave: "no_quiso", texto: "No quiso el pedido" }] as const;

const siguientePendiente = (paradas: ParadaRuta[], desde: number): number => {
  const i = paradas.findIndex((p, k) => k > desde && p.estado === "pendiente");
  return i >= 0 ? i : paradas.findIndex((p) => p.estado === "pendiente");
};

/**
 * `/reparto`: dueña de iniciar (con fondo), no entregado y terminar (N1). Entregar, cobrar un abono y anotar un gasto son
 * enlaces a `/cobrar` y `/caja` (sus dueñas) con `?volver=` a esta ruta.
 */
export function Reparto({ ruta, puedeLiquidar }: { ruta: RutaDetalle; puedeLiquidar: boolean }) {
  const router = useRouter();
  const [indice, setIndice] = useState(() => Math.max(0, ruta.paradas.findIndex((p) => p.estado === "pendiente")));
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noEntregando, setNoEntregando] = useState(false);
  const [otro, setOtro] = useState(false);
  const [nota, setNota] = useState("");
  const [terminando, setTerminando] = useState(false);
  const [fondo, setFondo] = useState("");

  const enCurso = ruta.estado === "en_curso";
  useEffect(() => {
    if (!enCurso) return;
    pantallaEncendida(true);
    return () => pantallaEncendida(false);
  }, [enCurso]);

  const p = ruta.paradas[Math.min(indice, ruta.paradas.length - 1)];
  const pendientes = ruta.paradas.filter((x) => x.estado === "pendiente");

  async function correr<T>(clave: string, accion: ReturnType<typeof llamar<T>>, ok: string): Promise<boolean> {
    setOcupado(clave);
    setError(null);
    const r = await accion;
    setOcupado(null);
    if (!r.ok) {
      // P5: aquí queda claro que NO se guardó y que se puede volver a tocar sin duplicar.
      setError(r.error.status === 0 ? "No se guardó: no hay señal. Toca otra vez cuando tengas." : `No se guardó. ${mensajeError(r.error)}`);
      return false;
    }
    toast.success(ok);
    router.refresh();
    return true;
  }

  async function marcarNoEntregado(motivo: string, nota?: string) {
    if (!p) return;
    if (await correr("no", llamar("POST", `/rutas/paradas/${p.id}/no-entregado`, { motivo, ...(nota ? { nota } : {}) }), "Guardado: no se entregó.")) {
      setNoEntregando(false);
      setOtro(false);
      setNota("");
      const s = siguientePendiente(ruta.paradas.map((x) => (x.id === p.id ? { ...x, estado: "fallida" as const } : x)), indice);
      if (s >= 0) setIndice(s);
    }
  }

  if (ruta.estado === "planeada") {
    return (
      <Tarjeta className="flex flex-col gap-2">
        <p className="text-lg font-bold">Tu ruta todavía no está cargada.</p>
        <p className="text-base text-suave">Cuando la carguen en la bodega, aparece aquí lista para salir.</p>
      </Tarjeta>
    );
  }

  if (ruta.estado === "cargada") {
    return (
      <Tarjeta className="flex flex-col gap-3">
        <p className="text-lg font-bold">Tu ruta está lista.</p>
        <p className="text-base">
          {ruta.paradas.length} {ruta.paradas.length === 1 ? "parada" : "paradas"} · {cajasTexto(ruta.cajas_totales)}
        </p>
        {error && (
          <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
            {error}
          </p>
        )}
        <Campo etiqueta="¿Con cuánto cambio sales? (opcional)" inputMode="decimal" value={fondo} onChange={(e) => setFondo(e.target.value.replace(",", "."))} error={fondo !== "" && !FONDO.test(fondo) ? "Escribe solo el monto, por ejemplo 500." : undefined} />
        <Boton className={GRANDE} ancho cargando={ocupado === "iniciar"} disabled={fondo !== "" && !FONDO.test(fondo)} onClick={() => void correr("iniciar", llamar("POST", `/rutas/${ruta.id}/iniciar`, fondo ? { fondo_inicial: fondo } : {}), "Ruta iniciada.")}>
          Iniciar ruta
        </Boton>
        <BotonEnlace variante="secundario" className={GRANDE} href={`/rutas/${ruta.id}/carga`}>
          Ver la hoja de carga
        </BotonEnlace>
      </Tarjeta>
    );
  }

  if (ruta.estado !== "en_curso" || !p) {
    return (
      <Tarjeta className="flex flex-col gap-2">
        <p className="text-lg font-bold">{ruta.estado === "terminada" || ruta.estado === "liquidada" ? "Ruta terminada." : "Esta ruta ya no está activa."}</p>
        <p className="text-base text-suave">
          {ruta.paradas.filter((x) => x.estado === "visitada").length} entregadas · {ruta.paradas.filter((x) => x.estado !== "visitada").length} sin entregar.
        </p>
        {ruta.estado === "terminada" && puedeLiquidar && (
          <BotonEnlace className={GRANDE} href={`/cierre/ruta/${ruta.id}`}>
            Siguiente: liquidar la ruta
          </BotonEnlace>
        )}
      </Tarjeta>
    );
  }

  const tel = telefonoLlamada(p.cliente.telefono_whatsapp);
  const marcada = p.estado !== "pendiente";
  const volverAqui = `/reparto?ruta=${ruta.id}`;
  const cobrarHref = p.pedido ? conVolver(`/cobrar?pedido=${p.pedido.id}&parada=${p.id}`, volverAqui) : conVolver(`/cobrar?cliente=${p.cliente.id}&parada=${p.id}`, volverAqui);

  return (
    <div className="flex flex-col gap-4 pb-64">
      <p className="text-base font-semibold text-suave" aria-live="polite">
        Parada {p.orden} de {ruta.paradas.length} · quedan {pendientes.length}
      </p>

      <Tarjeta className="flex flex-col gap-3">
        <h2 className="text-2xl font-extrabold [overflow-wrap:anywhere]">{p.cliente.nombre}</h2>
        <p className="flex items-start gap-2 text-lg [overflow-wrap:anywhere]">
          <MapPin aria-hidden className="mt-1 size-5 shrink-0 text-marca-fuerte" />
          <span>{p.cliente.direccion ?? "Sin dirección. Usa «Navegar» o llámale."}</span>
        </p>
        {p.cliente.referencias && <p className="rounded-xl bg-fondo p-3 text-base [overflow-wrap:anywhere]">Referencias: {p.cliente.referencias}</p>}
        {p.cliente.lat === null && <Insignia tono="aviso">Sin ubicación en el mapa</Insignia>}
        {marcada && (
          <p role="status" className="rounded-xl bg-peligro-suave p-3 text-base font-bold text-peligro">
            {p.estado === "fallida" ? `No se entregó${p.nota ? `: ${p.nota}` : ""}.` : p.estado === "visitada" ? "Ya se entregó." : "No se visitó."}
          </p>
        )}
        {p.pedido ? (
          <div className="flex flex-col gap-1">
            <p className="text-base font-bold">Pedido {p.pedido.folio}</p>
            <ul className="flex flex-col divide-y divide-borde">
              {p.pedido.lineas.map((l, i) => (
                <li key={i} className="py-1.5 text-xl font-bold [overflow-wrap:anywhere]">
                  {l.cantidad} × {l.presentacion} <span className="text-base font-normal text-suave">{l.producto}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-base text-suave">Parada de cobro: no lleva producto.</p>
        )}
        {p.cliente.saldo != null && Number(p.cliente.saldo) > 0 && (
          <p className="rounded-xl bg-marca-suave p-3 text-base font-semibold text-marca-fuerte">
            Antes ya debía {dinero(p.cliente.saldo)}
            {p.cliente.vencido != null && Number(p.cliente.vencido) > 0 ? ` (vencido ${dinero(p.cliente.vencido)})` : ""}.
            {p.pedido && !marcada && (
              <>
                {" "}
                <Link href={conVolver(`/cobrar?cliente=${p.cliente.id}`, volverAqui)} className="underline">
                  Cobrar saldo anterior
                </Link>
              </>
            )}
          </p>
        )}
        {tel && (
          <a href={`tel:${tel}`} className={`${clasesBoton("secundario", true)} ${GRANDE}`}>
            <Phone aria-hidden className="size-6" /> Llamar
          </a>
        )}
      </Tarjeta>

      {ruta.navegar_ruta.length > 0 && (
        <details className="rounded-tarjeta border border-borde bg-superficie px-4 py-2">
          <summary className="flex min-h-14 cursor-pointer items-center gap-2 text-base font-semibold">
            <Map aria-hidden className="size-5" /> Ruta completa en Maps
          </summary>
          <div className="flex flex-col gap-2 pb-2">
            {ruta.navegar_ruta.map((u, i) => (
              <a key={u} href={u} target="_blank" rel="noopener noreferrer" className={`${clasesBoton("secundario", true)} ${GRANDE}`}>
                {ruta.navegar_ruta.length === 1 ? "Abrir toda la ruta" : `Abrir tramo ${i + 1} de ${ruta.navegar_ruta.length}`}
              </a>
            ))}
          </div>
        </details>
      )}

      <Boton variante="secundario" className={GRANDE} onClick={() => setTerminando(true)}>
        Terminar ruta
      </Boton>
      <Link href={conVolver("/caja", volverAqui)} className="inline-flex min-h-tocable items-center justify-center text-base font-semibold text-marca-fuerte underline">
        Anotar un gasto
      </Link>
      <Link href={`/rutas/${ruta.id}/carga`} className="text-center text-base font-semibold text-marca-fuerte underline">
        Ver la hoja de carga
      </Link>

      {/* Acciones al alcance del pulgar (P4): abajo, fijas, ≥ 56 px. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-borde bg-superficie px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-xl flex-col gap-2">
          {error && (
            <p role="alert" className="rounded-xl bg-peligro-suave p-2 text-base font-bold text-peligro">
              {error}
            </p>
          )}
          {!marcada && (
            <BotonEnlace className={GRANDE} href={cobrarHref}>
              {p.pedido ? "Entregar y cobrar" : "Cobrar"}
            </BotonEnlace>
          )}
          <div className="grid grid-cols-2 gap-2">
            {p.navegar ? (
              <>
                <a href={p.navegar.google} target="_blank" rel="noopener noreferrer" className={`${clasesBoton("primario", true)} ${GRANDE}`}>
                  <Navigation aria-hidden className="size-6" /> Navegar
                </a>
                <a href={p.navegar.waze} target="_blank" rel="noopener noreferrer" className={`${clasesBoton("secundario", true)} ${GRANDE}`}>
                  Waze
                </a>
              </>
            ) : (
              <p className="col-span-2 text-center text-base text-suave">Este cliente no tiene ubicación: llámale para llegar.</p>
            )}
          </div>
          <div className="grid grid-cols-[3.5rem_1fr_3.5rem] gap-2">
            <Boton variante="secundario" className="!min-h-14 !px-0" aria-label="Parada anterior" disabled={indice === 0} onClick={() => setIndice(indice - 1)}>
              <ChevronLeft aria-hidden className="size-7" />
            </Boton>
            <Boton variante="peligro" className={GRANDE} disabled={marcada || ocupado !== null} onClick={() => setNoEntregando(true)}>
              No entregado
            </Boton>
            <Boton variante="secundario" className="!min-h-14 !px-0" aria-label="Parada siguiente" disabled={indice >= ruta.paradas.length - 1} onClick={() => setIndice(indice + 1)}>
              <ChevronRight aria-hidden className="size-7" />
            </Boton>
          </div>
        </div>
      </div>

      <Dialogo abierto={noEntregando} titulo={`¿Por qué no se entregó a ${p.cliente.nombre}?`} alCerrar={() => { setNoEntregando(false); setOtro(false); }}>
        <div className="flex flex-col gap-3">
          {MOTIVOS.map((m) => (
            <Boton key={m.clave} variante="secundario" className={GRANDE} cargando={ocupado === "no"} onClick={() => void marcarNoEntregado(m.clave)}>
              {m.texto}
            </Boton>
          ))}
          {!otro ? (
            <Boton variante="secundario" className={GRANDE} onClick={() => setOtro(true)}>
              Otro motivo
            </Boton>
          ) : (
            <>
              <AreaTexto etiqueta="¿Qué pasó?" maxLength={180} value={nota} onChange={(e) => setNota(e.target.value)} />
              <Boton variante="peligro" className={GRANDE} cargando={ocupado === "no"} disabled={!nota.trim()} onClick={() => void marcarNoEntregado("otro", nota.trim())}>
                Guardar: no se entregó
              </Boton>
            </>
          )}
          {error && (
            <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-bold text-peligro">
              {error}
            </p>
          )}
        </div>
      </Dialogo>

      <Dialogo abierto={terminando} titulo="¿Terminar la ruta?" alCerrar={() => setTerminando(false)}>
        <div className="flex flex-col gap-3">
          {pendientes.length > 0 ? (
            <>
              <p className="text-base font-medium">
                {pendientes.length === 1 ? "Queda 1 parada sin visitar." : `Quedan ${pendientes.length} paradas sin visitar.`} Se van a marcar como «no entregado, no se visitó»:
              </p>
              <ul className="list-disc pl-5 text-base">
                {pendientes.map((x) => (
                  <li key={x.id} className="[overflow-wrap:anywhere]">
                    {x.orden}. {x.cliente.nombre}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-base">Ya pasaste por todas las paradas.</p>
          )}
          {error && (
            <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-bold text-peligro">
              {error}
            </p>
          )}
          <Boton variante="peligro" className={GRANDE} cargando={ocupado === "terminar"} onClick={() => void correr("terminar", llamar("POST", `/rutas/${ruta.id}/terminar`), "Ruta terminada.").then((x) => x && setTerminando(false))}>
            Sí, terminar la ruta
          </Boton>
          <Boton variante="secundario" className={GRANDE} onClick={() => setTerminando(false)}>
            Mejor no
          </Boton>
        </div>
      </Dialogo>
    </div>
  );
}

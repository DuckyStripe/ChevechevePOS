"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { mensajeError } from "@/componentes/productos/formato";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { Campo, Casilla, Selector } from "@/componentes/ui/campo";
import { Dialogo } from "@/componentes/ui/dialogo";
import { llamar } from "@/lib/api-cliente";
import type { Lista, PedidoDetalle, PedidoFila, Sugerencia } from "@/lib/tipos";
import { CAUSAS_FALTANTE, hoy } from "./estados";

type Dialogo_ = "confirmar" | "ajustar" | "faltante" | "cancelar" | "reprogramar" | null;
type EstadoFaltante = { causa: string; nota: string; sugerencias: Sugerencia[] | null; elegidas: string[]; reducir: string };

const ERROR = "rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro";

/**
 * Acciones de `/pedidos/[id]` (unica pantalla que confirma, ajusta, marca faltantes, cancela y reprograma: N1).
 * `PEDIDO_CAMBIO` = el cliente lo edito mientras se miraba: se recarga y se explica.
 */
export function AccionesPedido({ pedido, diaSugerido, puedeGestionar, accionInicial }: { pedido: PedidoDetalle; diaSugerido: string; puedeGestionar: boolean; accionInicial?: string }) {
  const router = useRouter();
  const inicial: Dialogo_ = puedeGestionar && accionInicial === "confirmar" && pedido.estado === "recibido" ? "confirmar" : puedeGestionar && accionInicial === "faltante" && ["recibido", "confirmado"].includes(pedido.estado) ? "faltante" : null;
  const [abierto, setAbierto] = useState<Dialogo_>(inicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [siguiente, setSiguiente] = useState<{ id: string | null; advertencias: string[] } | null>(null);

  const [fechaEntrega, setFechaEntrega] = useState(pedido.fecha_solicitada ?? diaSugerido);
  const [entrega, setEntrega] = useState(pedido.entrega_tipo);
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState("");
  const [faltantes, setFaltantes] = useState<Record<string, EstadoFaltante>>({});

  const activas = pedido.lineas.filter((l) => l.estado === "activa" && l.cantidad > 0);
  const cantidadDe = (id: string, base: number) => cantidades[id] ?? String(base);
  const cambiadas = activas.filter((l) => Number(cantidadDe(String(l.id), l.cantidad)) !== l.cantidad);

  /** Abrir siempre con los campos limpios: el pedido pudo cambiar (version nueva) desde la ultima vez. */
  function abrir(d: Dialogo_, fecha?: string) {
    setCantidades({});
    setMotivo("");
    setError(null);
    if (fecha) setFechaEntrega(fecha);
    setAbierto(d);
  }

  function cerrar() {
    setAbierto(null);
    setError(null);
  }

  /** Corre una accion del pedido; `PEDIDO_CAMBIO` recarga y avisa. Devuelve los datos o null. */
  async function ejecutar<T>(ruta: string, cuerpo: unknown): Promise<T | null> {
    setCargando(true);
    setError(null);
    const r = await llamar<T>("POST", `/pedidos/${pedido.id}/${ruta}`, cuerpo);
    setCargando(false);
    if (r.ok) return r.datos;
    if (r.error.codigo === "PEDIDO_CAMBIO") {
      cerrar();
      toast.error("El cliente cambió su pedido mientras lo mirabas. Ya está actualizado: revísalo y vuelve a intentar.");
      router.refresh();
    } else setError(mensajeError(r.error));
    return null;
  }

  const lineasCambiadas = () => cambiadas.map((l) => ({ pedido_linea_id: l.id, cantidad: Number(cantidadDe(String(l.id), l.cantidad)), motivo_ajuste: motivo.trim() }));
  const validarCambios = () => {
    for (const l of cambiadas) {
      const n = Number(cantidadDe(String(l.id), l.cantidad));
      if (!Number.isInteger(n) || n < 0) return `Escribe una cantidad válida para ${l.producto}.`;
      if (pedido.estado === "cargado" && n > l.cantidad) return "Ya cargado solo se puede bajar la cantidad.";
    }
    if (cambiadas.length > 0 && !motivo.trim()) return "Escribe por qué cambias la cantidad.";
    return null;
  };

  async function confirmar() {
    const e = validarCambios() ?? (fechaEntrega ? null : "Elige el día de entrega.");
    if (e) return setError(e);
    const r = await ejecutar<{ advertencias?: { producto: string; requeridas: number; disponibles: number }[] }>("confirmar", {
      version: pedido.version,
      fecha_entrega: fechaEntrega,
      entrega_tipo: entrega,
      ...(cambiadas.length ? { lineas: lineasCambiadas() } : {}),
    });
    if (!r) return;
    cerrar();
    // N3: al confirmar, «Siguiente» = el pedido que sigue por confirmar.
    const otros = await llamar<Lista<PedidoFila>>("GET", "/pedidos?estado=recibido&por_pagina=5");
    const sig = otros.ok ? otros.datos.items.find((p) => String(p.id) !== String(pedido.id)) : undefined;
    setSiguiente({
      id: sig ? String(sig.id) : null,
      advertencias: (r.advertencias ?? []).map((a) => `De ${a.producto} piden ${a.requeridas} y hay ${a.disponibles}: va a la lista de compras.`),
    });
    toast.success("Pedido confirmado.");
    router.refresh();
  }

  async function ajustar() {
    const e = validarCambios() ?? (cambiadas.length === 0 ? "Cambia al menos una cantidad." : null);
    if (e) return setError(e);
    if (!(await ejecutar("ajustar", { version: pedido.version, lineas: lineasCambiadas() }))) return;
    cerrar();
    toast.success("Pedido ajustado. Avísale al cliente desde WhatsApp.");
    router.refresh();
  }

  async function cancelar() {
    if (!motivo.trim()) return setError("Escribe por qué se cancela.");
    if (!(await ejecutar("cancelar", { motivo: motivo.trim() }))) return;
    cerrar();
    toast.success("Pedido cancelado.");
    router.refresh();
  }

  async function reprogramar() {
    if (!fechaEntrega) return setError("Elige la nueva fecha.");
    if (!(await ejecutar("reprogramar", { fecha_entrega: fechaEntrega }))) return;
    cerrar();
    toast.success("Pedido reprogramado.");
    router.refresh();
  }

  async function alternarLinea(id: string) {
    if (faltantes[id]) {
      return setFaltantes((f) => {
        const n = { ...f };
        delete n[id];
        return n;
      });
    }
    setFaltantes((f) => ({ ...f, [id]: { causa: "sin_existencia", nota: "", sugerencias: null, elegidas: [], reducir: "" } }));
    const r = await llamar<Sugerencia[]>("GET", `/pedidos/${pedido.id}/sugerencias?pedido_linea_id=${id}`);
    setFaltantes((f) => (f[id] ? { ...f, [id]: { ...f[id], sugerencias: r.ok ? (Array.isArray(r.datos) ? r.datos : []) : [] } } : f));
  }
  const cambiarFaltante = (id: string, parcial: Partial<EstadoFaltante>) => setFaltantes((f) => ({ ...f, [id]: { ...f[id], ...parcial } }));

  async function mandarFaltantes() {
    const ids = Object.keys(faltantes);
    if (ids.length === 0) return setError("Elige qué producto falta.");
    if (pedido.estado === "recibido" && !fechaEntrega) return setError("Elige el día de entrega del resto del pedido.");
    const lineas = [];
    for (const id of ids) {
      const l = activas.find((x) => String(x.id) === id)!;
      const f = faltantes[id];
      const opciones: { tipo: "sustituto" | "reducir"; presentacion_id: number | string; cantidad: number }[] = f.elegidas.map((pid) => ({ tipo: "sustituto", presentacion_id: pid, cantidad: l.cantidad }));
      if (f.reducir.trim()) {
        const n = Number(f.reducir);
        if (!Number.isInteger(n) || n < 1 || n >= l.cantidad) return setError(`«Mandar solo» de ${l.producto} debe ser menos de ${l.cantidad}.`);
        opciones.push({ tipo: "reducir", presentacion_id: l.presentacion_id, cantidad: n });
      }
      lineas.push({ pedido_linea_id: l.id, causa: f.causa, ...(f.nota.trim() ? { nota: f.nota.trim() } : {}), opciones });
    }
    if (!(await ejecutar("faltantes", { version: pedido.version, ...(pedido.estado === "recibido" ? { fecha_entrega: fechaEntrega } : {}), lineas }))) return;
    cerrar();
    setFaltantes({});
    toast.success("Listo. Se le va a preguntar al cliente; el mensaje está en Avisos por enviar.");
    router.refresh();
  }

  const bandeja = `/pedidos/${pedido.id}?bandeja=1&cliente=${pedido.cliente.id}`;
  const e = pedido.estado;
  const cierra = <Boton variante="secundario" onClick={cerrar}>Mejor no</Boton>;

  return (
    <div className="flex flex-col gap-3">
      {siguiente && (
        <div role="status" className="flex flex-col gap-2 rounded-tarjeta border border-exito/40 bg-exito-suave p-3">
          <p className="text-base font-bold text-exito">Pedido confirmado. Ya le puedes avisar al cliente.</p>
          {siguiente.advertencias.map((a) => (
            <p key={a} className="text-base">{a}</p>
          ))}
          <div className="flex flex-wrap gap-2">
            <BotonEnlace href={bandeja}>Mandar por WhatsApp</BotonEnlace>
            {siguiente.id ? <BotonEnlace variante="secundario" href={`/pedidos/${siguiente.id}`}>Siguiente: pedido por confirmar</BotonEnlace> : <BotonEnlace variante="secundario" href="/pedidos">Volver a pedidos</BotonEnlace>}
          </div>
        </div>
      )}

      {puedeGestionar && (
        <div className="flex flex-wrap gap-2">
          {e === "recibido" && <Boton onClick={() => abrir("confirmar")}>Confirmar</Boton>}
          {(e === "confirmado" || e === "cargado") && <Boton onClick={() => abrir("ajustar")}>Ajustar cantidades</Boton>}
          {(e === "recibido" || e === "confirmado") && <Boton variante="secundario" onClick={() => abrir("faltante")}>Marcar faltante</Boton>}
          {e === "no_entregado" && <Boton onClick={() => abrir("reprogramar", diaSugerido)}>Reprogramar</Boton>}
          <BotonEnlace variante="secundario" href={bandeja}>WhatsApp</BotonEnlace>
          {["recibido", "esperando_cliente", "confirmado", "no_entregado"].includes(e) && (
            <details>
              <summary className="flex min-h-tocable cursor-pointer items-center px-3 text-base font-medium text-suave">Más</summary>
              <Boton variante="fantasma" className="!text-peligro" onClick={() => abrir("cancelar")}>Cancelar pedido</Boton>
            </details>
          )}
        </div>
      )}

      <Dialogo abierto={abierto === "confirmar" || abierto === "ajustar"} titulo={abierto === "ajustar" ? "Ajustar cantidades" : "Confirmar pedido"} alCerrar={cerrar}>
        <div className="flex flex-col gap-4">
          {abierto === "confirmar" && (
            <>
              <Campo etiqueta="Día de entrega" type="date" min={hoy()} value={fechaEntrega} onChange={(ev) => setFechaEntrega(ev.target.value)} ayuda={pedido.fecha_solicitada ? "El cliente pidió este día." : "Su próximo día de visita."} />
              <Selector etiqueta="Cómo se entrega" value={entrega} onChange={(ev) => setEntrega(ev.target.value as "reparto" | "recoge")}>
                <option value="reparto">Lo llevamos</option>
                <option value="recoge">Pasa a recogerlo</option>
              </Selector>
            </>
          )}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-base font-medium">{abierto === "ajustar" ? "Cantidades" : "Cantidades (cámbialas solo si hace falta)"}</legend>
            {activas.map((l) => (
              <label key={l.id} className="flex items-center justify-between gap-3 text-base">
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {l.producto} <span className="text-suave">{l.presentacion}</span>
                </span>
                <input type="number" inputMode="numeric" min={0} step={1} value={cantidadDe(String(l.id), l.cantidad)} onChange={(ev) => setCantidades((c) => ({ ...c, [String(l.id)]: ev.target.value }))} className="min-h-tocable w-24 shrink-0 rounded-xl border border-borde bg-superficie px-3 text-center text-base" />
              </label>
            ))}
          </fieldset>
          {cambiadas.length > 0 && <Campo etiqueta="¿Por qué cambias la cantidad?" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} maxLength={120} />}
          {error && <p role="alert" className={ERROR}>{error}</p>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {cierra}
            <Boton cargando={cargando} onClick={() => void (abierto === "ajustar" ? ajustar() : confirmar())}>{abierto === "ajustar" ? "Guardar ajuste" : "Confirmar pedido"}</Boton>
          </div>
        </div>
      </Dialogo>

      <Dialogo abierto={abierto === "faltante"} titulo="Marcar faltante" alCerrar={cerrar}>
        <div className="flex flex-col gap-4">
          <p className="text-base">Elige lo que no tienes. Al cliente se le pregunta una cosa por producto; tú decides qué opciones le ofreces.</p>
          {e === "recibido" && <Campo etiqueta="Día de entrega del resto del pedido" type="date" min={hoy()} value={fechaEntrega} onChange={(ev) => setFechaEntrega(ev.target.value)} />}
          {activas.map((l) => {
            const id = String(l.id);
            const f = faltantes[id];
            return (
              <div key={id} className="rounded-xl border border-borde p-2">
                <Casilla etiqueta={`${l.producto} · ${l.presentacion} (pidió ${l.cantidad})`} checked={!!f} onChange={() => void alternarLinea(id)} />
                {f && (
                  <div className="flex flex-col gap-3 px-2 pb-2">
                    <Selector etiqueta="Qué pasó" value={f.causa} onChange={(ev) => cambiarFaltante(id, { causa: ev.target.value })}>
                      {CAUSAS_FALTANTE.map((c) => <option key={c.valor} value={c.valor}>{c.texto}</option>)}
                    </Selector>
                    <Campo etiqueta="Nota para el cliente (opcional)" value={f.nota} onChange={(ev) => cambiarFaltante(id, { nota: ev.target.value })} maxLength={140} />
                    <div>
                      <p className="mb-1 text-base font-medium">Ofrecerle en su lugar</p>
                      {f.sugerencias === null && <p className="text-base text-suave">Buscando opciones…</p>}
                      {f.sugerencias?.length === 0 && <p className="text-base text-suave">No hay productos parecidos. Se los puedes dar de alta en la ficha del producto.</p>}
                      {f.sugerencias?.map((s) => (
                        <Casilla key={s.presentacion_id} etiqueta={`${s.producto} · ${s.presentacion}`} ayuda={`Hay ${s.disponible_piezas} piezas`} checked={f.elegidas.includes(String(s.presentacion_id))} onChange={() => cambiarFaltante(id, { elegidas: f.elegidas.includes(String(s.presentacion_id)) ? f.elegidas.filter((x) => x !== String(s.presentacion_id)) : [...f.elegidas, String(s.presentacion_id)] })} />
                      ))}
                    </div>
                    {l.cantidad > 1 && <Campo etiqueta="O mandarle solo (cantidad)" type="number" inputMode="numeric" min={1} max={l.cantidad - 1} value={f.reducir} onChange={(ev) => cambiarFaltante(id, { reducir: ev.target.value })} />}
                  </div>
                )}
              </div>
            );
          })}
          {error && <p role="alert" className={ERROR}>{error}</p>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {cierra}
            <Boton cargando={cargando} onClick={() => void mandarFaltantes()}>Preguntarle al cliente</Boton>
          </div>
        </div>
      </Dialogo>

      <Dialogo abierto={abierto === "cancelar"} titulo="Cancelar pedido" alCerrar={cerrar}>
        <div className="flex flex-col gap-4">
          <p className="text-base">Esto no se puede deshacer. Si el cliente lo vuelve a querer, hay que capturar otro.</p>
          <Campo etiqueta="¿Por qué se cancela?" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} maxLength={200} />
          {error && <p role="alert" className={ERROR}>{error}</p>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {cierra}
            <Boton variante="peligro" cargando={cargando} onClick={() => void cancelar()}>Cancelar pedido</Boton>
          </div>
        </div>
      </Dialogo>

      <Dialogo abierto={abierto === "reprogramar"} titulo="Reprogramar entrega" alCerrar={cerrar}>
        <div className="flex flex-col gap-4">
          <Campo etiqueta="Nueva fecha de entrega" type="date" min={hoy()} value={fechaEntrega} onChange={(ev) => setFechaEntrega(ev.target.value)} />
          {error && <p role="alert" className={ERROR}>{error}</p>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {cierra}
            <Boton cargando={cargando} onClick={() => void reprogramar()}>Reprogramar</Boton>
          </div>
        </div>
      </Dialogo>
    </div>
  );
}

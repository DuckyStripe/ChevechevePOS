"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { clasesBoton } from "@/componentes/ui/boton";
import { Esqueleto } from "@/componentes/ui/esqueleto";
import { fecha } from "@/componentes/productos/formato";
import { cambiarCarrito, fijarCantidad, resumenCarrito, useCarrito, vaciarCarrito } from "@/lib/carrito";
import { claveCliente } from "@/lib/clave-cliente";
import { dinero } from "@/lib/dinero";
import { T } from "@/lib/textos-publico";
import type { ClientePublico, PedidoEnviado } from "@/lib/tipos";
import { FotoArticulo } from "./foto-articulo";
import { llamarPublico } from "./llamar-publico";
import { SelectorCantidad } from "./selector-cantidad";
import { useCatalogo } from "./use-catalogo";

/** `/pedido/carrito`: enviar = un toque (C3), sin «¿seguro?». Reintentar no duplica: misma `clave_idempotencia` (C8). */
export function CarritoPantalla({ cliente }: { cliente: ClientePublico }) {
  const router = useRouter();
  const k = claveCliente(cliente);
  const { datos, error, recargar } = useCatalogo();
  const carrito = useCarrito(k);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const articulos = datos?.articulos;
  const resumen = useMemo(() => resumenCarrito(carrito, articulos ?? []), [carrito, articulos]);

  if (error && !datos) {
    return (
      <div role="alert" className="rounded-tarjeta border border-peligro/30 bg-peligro-suave p-4">
        <p className="mb-3 text-base font-semibold text-peligro">{T.sinRed}</p>
        <button type="button" onClick={() => void recargar()} className={clasesBoton("secundario")}>
          {T.reintentar}
        </button>
      </div>
    );
  }
  if (!datos) {
    return (
      <div role="status" aria-label={T.cargando} className="flex flex-col gap-3">
        <Esqueleto className="h-36 rounded-tarjeta" />
        <Esqueleto className="h-36 rounded-tarjeta" />
      </div>
    );
  }

  if (Object.keys(carrito.lineas).length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-tarjeta border border-dashed border-control/50 p-8 text-center">
        <p className="text-lg">{T.carritoVacio}</p>
        <Link href="/pedido" className={clasesBoton("primario")}>
          {T.carritoVacioBoton}
        </Link>
      </div>
    );
  }

  const vista = datos.ultimo_pedido?.vista;
  const cambios = new Map((vista?.lineas ?? []).filter((l) => l.cambio).map((l) => [String(l.presentacion_id), l]));
  const hayCambios = resumen.lineas.some((l) => cambios.has(String(l.articulo.presentacion_id)));
  const editando = carrito.editando;

  async function enviar() {
    if (resumen.lineas.length === 0) return setMensaje(T.pedidoVacio);
    setEnviando(true);
    setMensaje(null);
    const lineas = resumen.lineas.map((l) => ({ presentacion_id: l.articulo.presentacion_id, cantidad: l.cantidad }));
    const notas = carrito.notas.trim() || undefined;

    if (editando) {
      const r = await llamarPublico("PATCH", `/pedidos/${editando}`, { lineas, total_visto: resumen.total, notas, entrega_tipo: carrito.entrega });
      setEnviando(false);
      if (!r.ok) return setMensaje(r.error.mensaje);
      vaciarCarrito(k);
      return router.push(`/pedido/mis-pedidos/${editando}`);
    }

    const r = await llamarPublico<PedidoEnviado>("POST", "/pedidos", {
      clave_idempotencia: carrito.clave,
      lineas,
      total_visto: resumen.total,
      notas,
      entrega_tipo: carrito.entrega,
      fecha_solicitada: cliente.proxima_visita ?? undefined,
    });
    setEnviando(false);
    if (!r.ok) {
      const d = r.error.detalles as { minimo?: string; faltante?: string } | undefined;
      if (r.error.codigo === "PRECIOS_CAMBIARON") {
        await recargar();
        return setMensaje(T.preciosNuevos);
      }
      if (r.error.codigo === "PEDIDO_MINIMO" && d?.minimo && d?.faltante) return setMensaje(T.faltaMinimo(dinero(d.minimo), dinero(d.faltante)));
      return setMensaje(r.error.mensaje);
    }
    try {
      sessionStorage.setItem(`chv_enviado_${r.datos.id}`, JSON.stringify(r.datos));
    } catch {
      /* la pantalla de enviado se arma con el seguimiento */
    }
    vaciarCarrito(k);
    router.push(`/pedido/enviado/${r.datos.id}`);
  }

  return (
    <div className="pb-40">
      {editando && (
        <p className="mb-4 rounded-tarjeta border border-marca bg-marca-suave p-3 text-base font-medium text-marca-fuerte">{T.editando}</p>
      )}
      {hayCambios && (
        <p role="status" className="mb-4 rounded-tarjeta bg-marca-suave p-3 text-lg font-bold text-marca-fuerte">
          {T.preciosCambiaron}
        </p>
      )}
      {vista?.quitadas.map((q) => (
        <p key={q.producto} className="mb-2 text-base font-medium text-peligro">
          {T.productoNoDisponible(q.producto)}
        </p>
      ))}
      {resumen.perdidas.length > 0 && <p className="mb-2 text-base font-medium text-peligro">{T.productosQuitados}</p>}

      <ul className="flex flex-col gap-3">
        {resumen.lineas.map(({ articulo: a, cantidad }) => {
          const c = cambios.get(String(a.presentacion_id));
          return (
            <li key={a.presentacion_id} className="flex flex-col gap-2 rounded-tarjeta border border-borde bg-superficie p-3 shadow-tarjeta">
              <div className="flex items-start gap-3">
                <FotoArticulo miniatura={a.miniatura} />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold [overflow-wrap:anywhere]">{a.producto}</p>
                  <p className="text-base text-suave [overflow-wrap:anywhere]">{a.presentacion}</p>
                  <p className="cifra text-xl font-bold">{dinero(a.precio)}</p>
                  {c && (
                    <p className={`text-base font-semibold ${c.cambio === "sube" ? "text-peligro" : "text-exito"}`}>{T.antesAhora(dinero(c.precio_anterior), dinero(c.precio_actual))}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => fijarCantidad(k, String(a.presentacion_id), 0)} className="flex min-h-tocable shrink-0 items-center gap-1 rounded-xl px-3 text-base font-semibold text-peligro transition-transform duration-150 ease-salida active:scale-95 active:bg-peligro-suave">
                  <Trash2 aria-hidden className="size-5" /> {T.quitarLinea}
                </button>
                <SelectorCantidad cantidad={cantidad} nombre={`${a.producto} ${a.presentacion}`} alCambiar={(n) => fijarCantidad(k, String(a.presentacion_id), n)} />
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-base">
        {cliente.proxima_visita ? `${T.entrega} ${fecha(cliente.proxima_visita)}.` : `${T.entregaSinFecha}.`} {T.minimo(dinero(cliente.pedido_minimo))}.
      </p>

      <details className="group mt-3 rounded-tarjeta border border-borde bg-superficie shadow-tarjeta">
        <summary className="flex min-h-tocable cursor-pointer items-center justify-between gap-2 px-4 text-base font-semibold">
          {T.masOpciones}
          <ChevronDown aria-hidden className="size-5 shrink-0 text-suave transition-transform duration-200 ease-salida group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-3 px-4 pb-4">
          <label className="flex flex-col gap-1 text-base font-medium">
            {T.notasEtiqueta}
            <textarea
              value={carrito.notas}
              maxLength={500}
              onChange={(e) => cambiarCarrito(k, (c) => ({ ...c, notas: e.target.value }))}
              className="min-h-24 rounded-xl border border-control bg-superficie px-3 py-2 text-base font-normal focus:border-marca"
            />
          </label>
          <label className="flex min-h-tocable items-center gap-3 text-base">
            <input type="checkbox" className="size-6 accent-marca" checked={carrito.entrega === "recoge"} onChange={(e) => cambiarCarrito(k, (c) => ({ ...c, entrega: e.target.checked ? "recoge" : "reparto" }))} />
            {T.recogerEnBodega}
          </label>
        </div>
      </details>

      {mensaje && (
        <p role="alert" className="mt-4 rounded-tarjeta border border-peligro/30 bg-peligro-suave p-3 text-base font-semibold text-peligro">
          {mensaje}
        </p>
      )}
      {editando && (
        <button
          type="button"
          onClick={() => {
            vaciarCarrito(k);
            router.push(`/pedido/mis-pedidos/${editando}`);
          }}
          className={`mt-4 ${clasesBoton("secundario", true)}`}
        >
          {T.cancelarEdicion}
        </button>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-borde bg-superficie p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-flotante">
        <div className="mx-auto flex max-w-xl flex-col gap-2">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-lg font-bold">
            <span>{T.total}</span>
            <span className="cifra text-3xl">{dinero(resumen.total)}</span>
          </p>
          <button
            type="button"
            onClick={() => void enviar()}
            disabled={enviando}
            aria-busy={enviando}
            className={clasesBoton("primario", true, "grande")}
          >
            {enviando ? T.enviando : editando ? T.guardarCambios : T.enviar}
          </button>
        </div>
      </div>
    </div>
  );
}

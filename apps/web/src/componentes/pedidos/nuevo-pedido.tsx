"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { coincide, normalizar } from "@/componentes/publico/busqueda";
import { itemsDe, mensajeError, uuid } from "@/componentes/productos/formato";
import { Boton } from "@/componentes/ui/boton";
import { AreaTexto, Campo, Selector } from "@/componentes/ui/campo";
import { Esqueleto } from "@/componentes/ui/esqueleto";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { useSinGuardar } from "@/lib/cascaron";
import { llamar } from "@/lib/api-cliente";
import { dinero } from "@/lib/dinero";
import type { ArticuloPos, ArticuloVenta, ClienteDetalle, ClienteFila, Lista, LineaInterpretada } from "@/lib/tipos";
import { hoy } from "./estados";

type LineaB = { presentacion_id: string; producto: string; presentacion: string; precio: string | null; cantidad: number };
type ClienteB = { id: string; nombre: string; listaId: string | null; ultimo: { presentacion_id: string; cantidad: number }[] };
type Borrador = {
  clave: string;
  cliente: ClienteB | null;
  lineas: LineaB[];
  notas: string;
  entrega: "reparto" | "recoge";
  fecha: string;
  correcciones: { texto: string; presentacion_id: string }[];
};

const llave = (usuario: string) => `chv:pedido-borrador:${usuario}`;
/** La clave de idempotencia nace al abrir la pantalla: reintentar no duplica el pedido (C8/P5). */
const vacio = (): Borrador => ({ clave: uuid(), cliente: null, lineas: [], notas: "", entrega: "reparto", fecha: "", correcciones: [] });

function aClienteB(c: ClienteDetalle): ClienteB {
  return {
    id: String(c.id),
    nombre: c.nombre,
    listaId: c.lista_precio && typeof c.lista_precio === "object" ? String(c.lista_precio.id) : null,
    ultimo: (c.ultimo_pedido?.lineas ?? []).map((l) => ({ presentacion_id: String(l.presentacion_id), cantidad: l.cantidad })),
  };
}

function leerBorrador(usuario: string, inicial: ClienteDetalle | null): Borrador {
  try {
    const raw = localStorage.getItem(llave(usuario));
    if (raw) {
      const b = JSON.parse(raw) as Partial<Borrador>;
      if (typeof b.clave === "string" && Array.isArray(b.lineas) && (!inicial || b.cliente?.id === String(inicial.id))) return { ...vacio(), ...b } as Borrador;
    }
  } catch {
    /* sin almacenamiento: se trabaja en memoria */
  }
  return { ...vacio(), cliente: inicial ? aClienteB(inicial) : null };
}

const CLASES_COLOR = { verde: "border-exito bg-exito-suave", amarillo: "border-marca bg-marca-suave", rojo: "border-peligro bg-peligro-suave" } as const;
const TEXTO_COLOR = { verde: "Lo encontré", amarillo: "Elige cuál es", rojo: "No lo encontré" } as const;

/** `/pedidos/nuevo`: captura por llamada (P3, meta ≤ 1 min) y «Pegar mensaje de WhatsApp» (P7). Un borrador local por usuario. */
export function NuevoPedido({ usuarioId, inicial }: { usuarioId: string; inicial: ClienteDetalle | null }) {
  const router = useRouter();
  const [b, setB] = useState<Borrador>(() => leerBorrador(usuarioId, inicial));
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  useSinGuardar(b.lineas.length > 0 && !guardado);

  // Borrador local: sobrevive recargar o quedarse sin senal.
  useEffect(() => {
    if (guardado) return;
    try {
      localStorage.setItem(llave(usuarioId), JSON.stringify(b));
    } catch {
      /* cuota o modo privado: la pantalla sigue funcionando */
    }
  }, [b, guardado, usuarioId]);

  /* ---- cliente ---- */
  const [buscaCliente, setBuscaCliente] = useState("");
  const [clientes, setClientes] = useState<ClienteFila[] | null>(null);
  const turnoCliente = useRef(0);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  function alBuscarCliente(v: string) {
    setBuscaCliente(v);
    if (reloj.current) clearTimeout(reloj.current);
    if (v.trim().length < 2) {
      turnoCliente.current++;
      setClientes(null);
      return;
    }
    reloj.current = setTimeout(async () => {
      const mio = ++turnoCliente.current;
      const r = await llamar<Lista<ClienteFila>>("GET", `/clientes?buscar=${encodeURIComponent(v.trim())}&activo=true&por_pagina=8`);
      if (mio === turnoCliente.current) setClientes(r.ok ? r.datos.items : []);
    }, 300);
  }

  async function elegirCliente(id: string) {
    const r = await llamar<ClienteDetalle>("GET", `/clientes/${id}`);
    if (!r.ok) return void toast.error(mensajeError(r.error));
    setB((x) => ({ ...x, cliente: aClienteB(r.datos), lineas: [] , correcciones: [] }));
    setClientes(null);
    setBuscaCliente("");
  }

  /* ---- catalogo de venta del cliente (precios de su lista) ---- */
  const clienteId = b.cliente?.id;
  const listaId = b.cliente?.listaId;
  const [cat, setCat] = useState<{ clienteId: string; items: ArticuloVenta[] } | null>(null);
  useEffect(() => {
    if (!clienteId) return;
    let vivo = true;
    void (async () => {
      const r = await llamar<ArticuloVenta[] | Lista<ArticuloVenta>>("GET", `/catalogo-venta${listaId ? `?lista_precio_id=${listaId}` : ""}`);
      if (vivo && r.ok) setCat({ clienteId, items: itemsDe(r.datos) });
    })();
    return () => {
      vivo = false;
    };
  }, [clienteId, listaId]);
  const articulos = cat && cat.clienteId === clienteId ? cat.items : null;

  /* ---- lineas ---- */
  function agregar(nueva: Omit<LineaB, "cantidad">, cantidad = 1) {
    setB((x) =>
      x.lineas.some((l) => l.presentacion_id === nueva.presentacion_id)
        ? { ...x, lineas: x.lineas.map((l) => (l.presentacion_id === nueva.presentacion_id ? { ...l, cantidad: l.cantidad + cantidad } : l)) }
        : { ...x, lineas: [...x.lineas, { ...nueva, cantidad }] },
    );
  }
  const cambiarCantidad = (id: string, n: number) => setB((x) => ({ ...x, lineas: n <= 0 ? x.lineas.filter((l) => l.presentacion_id !== id) : x.lineas.map((l) => (l.presentacion_id === id ? { ...l, cantidad: Math.min(999, n) } : l)) }));
  const deArticulo = (a: ArticuloVenta): Omit<LineaB, "cantidad"> => ({ presentacion_id: String(a.presentacion_id), producto: a.producto, presentacion: a.presentacion, precio: a.precio });

  const [q, setQ] = useState("");
  const [sinCodigo, setSinCodigo] = useState<string | null>(null);
  const resultados = articulos && q.trim().length >= 2 ? articulos.filter((a) => coincide(normalizar(`${a.producto} ${a.presentacion}`), q)).slice(0, 20) : [];

  async function porCodigo() {
    const codigo = q.trim();
    if (!/^\d{6,14}$/.test(codigo)) return;
    const r = await llamar<ArticuloPos>("GET", `/presentaciones/codigo/${encodeURIComponent(codigo)}`);
    if (!r.ok) return setSinCodigo("Ese código no está en el catálogo.");
    const a = articulos?.find((x) => String(x.presentacion_id) === String(r.datos.presentacion_id));
    agregar(a ? deArticulo(a) : { presentacion_id: String(r.datos.presentacion_id), producto: r.datos.producto, presentacion: r.datos.presentacion, precio: null });
    setQ("");
    setSinCodigo(null);
  }

  const [notaUltimo, setNotaUltimo] = useState<string | null>(null);
  function repetirUltimo() {
    if (!b.cliente || !articulos) return;
    let perdidos = 0;
    for (const l of b.cliente.ultimo) {
      const a = articulos.find((x) => String(x.presentacion_id) === l.presentacion_id);
      if (a) agregar(deArticulo(a), l.cantidad);
      else perdidos++;
    }
    setNotaUltimo(perdidos ? `${perdidos} ${perdidos === 1 ? "producto ya no se vende y no se agregó" : "productos ya no se venden y no se agregaron"}.` : null);
  }

  /* ---- pegar mensaje de WhatsApp (P7) ---- */
  const [mensaje, setMensaje] = useState("");
  const [interpretadas, setInterpretadas] = useState<(LineaInterpretada & { resuelta?: boolean })[] | null>(null);
  const [interpretando, setInterpretando] = useState(false);

  async function interpretar() {
    if (!b.cliente || !mensaje.trim()) return;
    setInterpretando(true);
    setError(null);
    const r = await llamar<{ lineas: LineaInterpretada[] }>("POST", "/pedidos/interpretar", { cliente_id: b.cliente.id, texto: mensaje.trim().slice(0, 2000) });
    setInterpretando(false);
    if (!r.ok) return setError(mensajeError(r.error));
    const lineas: (LineaInterpretada & { resuelta?: boolean })[] = r.datos.lineas.map((l) => ({ ...l }));
    for (const l of lineas) {
      if (l.color === "verde" && l.presentacion_id != null) {
        const c = l.candidatos.find((x) => String(x.presentacion_id) === String(l.presentacion_id)) ?? l.candidatos[0];
        if (c) {
          agregar({ presentacion_id: String(c.presentacion_id), producto: c.producto, presentacion: c.presentacion, precio: c.precio }, Math.max(1, Math.round(l.cantidad)));
          l.resuelta = true;
        }
      }
    }
    setB((x) => ({ ...x, notas: x.notas || mensaje.trim().slice(0, 500) }));
    setInterpretadas(lineas);
  }

  function elegirCandidato(i: number, c: LineaInterpretada["candidatos"][number]) {
    const l = interpretadas?.[i];
    if (!l) return;
    agregar({ presentacion_id: String(c.presentacion_id), producto: c.producto, presentacion: c.presentacion, precio: c.precio }, Math.max(1, Math.round(l.cantidad)));
    // Corregir una vez ensena al sistema para este cliente.
    setB((x) => ({ ...x, correcciones: [...x.correcciones.filter((k) => k.texto !== l.texto), { texto: l.texto, presentacion_id: String(c.presentacion_id) }] }));
    setInterpretadas((x) => x && x.map((y, j) => (j === i ? { ...y, resuelta: true } : y)));
  }

  /* ---- guardar ---- */
  async function guardar() {
    setError(null);
    if (!b.cliente) return setError("Elige para quién es el pedido.");
    if (b.lineas.length === 0) return setError("Agrega al menos un producto.");
    setCargando(true);
    const r = await llamar<{ id: number | string }>("POST", "/pedidos", {
      clave_idempotencia: b.clave,
      cliente_id: b.cliente.id,
      lineas: b.lineas.map((l) => ({ presentacion_id: l.presentacion_id, cantidad: l.cantidad })),
      ...(b.notas.trim() ? { notas: b.notas.trim() } : {}),
      entrega_tipo: b.entrega,
      ...(b.fecha ? { fecha_solicitada: b.fecha } : {}),
      ...(b.correcciones.length ? { correcciones: b.correcciones } : {}),
    });
    setCargando(false);
    if (!r.ok) {
      const d = r.error.detalles as { faltante?: string; minimo?: string } | undefined;
      if (r.error.codigo === "PEDIDO_MINIMO" && d?.faltante) return setError(`Al pedido le faltan ${dinero(d.faltante)} para llegar al mínimo de ${dinero(d.minimo)}.`);
      if (r.error.codigo === "IDEMPOTENCIA_CONFLICTO") return setError("Este pedido ya se guardó antes con otros datos. Revisa Pedidos; si no está, empieza otro.");
      return setError(mensajeError(r.error));
    }
    setGuardado(true);
    try {
      localStorage.removeItem(llave(usuarioId));
    } catch {
      /* nada que limpiar */
    }
    router.push(`/pedidos/${r.datos.id}`);
  }

  function empezarDeNuevo() {
    setB(vacio());
    setInterpretadas(null);
    setMensaje("");
    setError(null);
  }

  /* ---- vista ---- */
  if (!b.cliente) {
    return (
      <Tarjeta className="flex flex-col gap-3">
        <Campo etiqueta="¿Para qué cliente es?" type="search" value={buscaCliente} onChange={(e) => alBuscarCliente(e.target.value)} placeholder="Nombre o teléfono" autoFocus />
        {clientes?.length === 0 && <p className="text-base text-suave">No encontramos a nadie con eso.</p>}
        <ul className="flex flex-col gap-2">
          {clientes?.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => void elegirCliente(String(c.id))} className="flex min-h-tocable w-full flex-col items-start rounded-xl border border-borde px-3 py-2 text-left active:bg-marca-suave">
                <span className="text-base font-semibold [overflow-wrap:anywhere]">{c.nombre}</span>
                <span className="text-sm text-suave">{c.zona?.nombre ?? "Sin zona"}{c.telefono_whatsapp ? ` · ${c.telefono_whatsapp}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      </Tarjeta>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <Tarjeta className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-lg font-bold [overflow-wrap:anywhere]">{b.cliente.nombre}</p>
        <Boton variante="secundario" onClick={() => setB((x) => ({ ...x, cliente: null, lineas: [], correcciones: [] }))}>
          Cambiar
        </Boton>
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Productos</h2>
        {!articulos && <Esqueleto className="h-12" />}
        {articulos && (
          <>
            {b.cliente.ultimo.length > 0 && b.lineas.length === 0 && (
              <Boton onClick={repetirUltimo}>Repetir su último pedido</Boton>
            )}
            {notaUltimo && <p className="text-base font-medium text-peligro">{notaUltimo}</p>}
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-suave" />
              <input
                type="search"
                inputMode="search"
                aria-label="Buscar producto o escanear código"
                placeholder="Buscar producto o escanear código"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setSinCodigo(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void porCodigo();
                  }
                }}
                className="min-h-tocable w-full rounded-xl border border-borde bg-superficie pl-10 pr-4 text-base"
              />
            </div>
            {sinCodigo && <p className="text-base font-medium text-peligro">{sinCodigo}</p>}
            {resultados.length > 0 && (
              <ul className="flex flex-col gap-2">
                {resultados.map((a) => (
                  <li key={a.presentacion_id}>
                    <button
                      type="button"
                      onClick={() => {
                        agregar(deArticulo(a));
                        setQ("");
                      }}
                      className="flex min-h-tocable w-full items-center justify-between gap-3 rounded-xl border border-borde px-3 py-2 text-left active:bg-marca-suave"
                    >
                      <span className="min-w-0 text-base [overflow-wrap:anywhere]">
                        {a.producto} <span className="text-suave">{a.presentacion}</span>
                      </span>
                      <span className="shrink-0 text-base font-bold">{dinero(a.precio)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {b.lineas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-borde p-4 text-center text-base text-suave">Todavía no hay productos. Búscalos o pega su mensaje de WhatsApp.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-borde">
            {b.lineas.map((l) => (
              <li key={l.presentacion_id} className="flex flex-col gap-1 py-2">
                <p className="text-base [overflow-wrap:anywhere]">
                  {l.producto} <span className="text-suave">{l.presentacion}</span>
                  {l.precio && <span className="ml-2 font-semibold">{dinero(l.precio)}</span>}
                </p>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label={`Quitar uno: ${l.producto}`} onClick={() => cambiarCantidad(l.presentacion_id, l.cantidad - 1)} className="flex size-12 items-center justify-center rounded-xl border border-borde">
                    <Minus aria-hidden className="size-5" />
                  </button>
                  <input aria-label={`Cantidad de ${l.producto}`} inputMode="numeric" value={l.cantidad} onChange={(e) => cambiarCantidad(l.presentacion_id, Number(e.target.value.replace(/\D/g, "")))} className="min-h-tocable w-16 rounded-xl border border-borde bg-superficie text-center text-lg font-bold" />
                  <button type="button" aria-label={`Agregar uno: ${l.producto}`} onClick={() => cambiarCantidad(l.presentacion_id, l.cantidad + 1)} className="flex size-12 items-center justify-center rounded-xl border border-borde">
                    <Plus aria-hidden className="size-5" />
                  </button>
                  <button type="button" aria-label={`Quitar ${l.producto}`} onClick={() => cambiarCantidad(l.presentacion_id, 0)} className="ml-auto flex size-12 items-center justify-center rounded-xl text-peligro">
                    <Trash2 aria-hidden className="size-5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Pegar mensaje de WhatsApp</h2>
        <AreaTexto etiqueta="Mensaje del cliente" value={mensaje} onChange={(e) => setMensaje(e.target.value)} maxLength={2000} ayuda="Pega lo que escribió y yo armo la lista." />
        <Boton variante="secundario" cargando={interpretando} disabled={!mensaje.trim()} onClick={() => void interpretar()}>
          Armar lista del mensaje
        </Boton>
        {interpretadas && (
          <ul className="flex flex-col gap-2">
            {interpretadas.map((l, i) => (
              <li key={i} className={`rounded-xl border-l-4 p-3 ${CLASES_COLOR[l.color]}`}>
                <p className="text-base font-semibold [overflow-wrap:anywhere]">
                  «{l.texto}» <span className="font-normal text-suave">· {TEXTO_COLOR[l.color]}{l.resuelta ? " y agregado" : ""}</span>
                </p>
                {l.color === "amarillo" && !l.resuelta && (
                  <div className="mt-2 flex flex-col gap-2">
                    {l.candidatos.slice(0, 3).map((c) => (
                      <Boton key={c.presentacion_id} variante="secundario" onClick={() => elegirCandidato(i, c)} className="justify-between text-left">
                        <span className="[overflow-wrap:anywhere]">{c.producto} · {c.presentacion}</span>
                        <span>{dinero(c.precio)}</span>
                      </Boton>
                    ))}
                  </div>
                )}
                {l.color === "rojo" && <p className="mt-1 text-base">No encontré ese producto. Búscalo arriba.</p>}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Entrega</h2>
        <Campo etiqueta="Día que pide (opcional)" type="date" min={hoy()} value={b.fecha} onChange={(e) => setB((x) => ({ ...x, fecha: e.target.value }))} ayuda="Si lo dejas vacío, se usa su próximo día de visita." />
        <Selector etiqueta="Cómo se entrega" value={b.entrega} onChange={(e) => setB((x) => ({ ...x, entrega: e.target.value as "reparto" | "recoge" }))}>
          <option value="reparto">Lo llevamos</option>
          <option value="recoge">Pasa a recogerlo</option>
        </Selector>
        <AreaTexto etiqueta="Notas" value={b.notas} onChange={(e) => setB((x) => ({ ...x, notas: e.target.value.slice(0, 500) }))} />
      </Tarjeta>

      {error && (
        <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
          {error}
        </p>
      )}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-borde bg-superficie/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:pl-[19rem]">
        <div className="mx-auto flex max-w-5xl gap-2">
          <Boton variante="secundario" onClick={empezarDeNuevo}>
            Empezar de nuevo
          </Boton>
          <Boton cargando={cargando} className="flex-1" onClick={() => void guardar()}>
            Guardar pedido
          </Boton>
        </div>
      </div>
    </div>
  );

}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Minus, Plus, Search, Trash2, UserRound, X } from "lucide-react";
import { Aviso, mensajeCobro } from "@/componentes/cobro/comunes";
import { itemsDe, nombreDe } from "@/componentes/productos/formato";
import { Foto } from "@/componentes/productos/foto";
import { coincide, normalizar } from "@/componentes/publico/busqueda";
import { BotonImprimirTicket } from "@/componentes/ticket/imprimir-ticket";
import { Ticket80mm } from "@/componentes/ticket/ticket-80mm";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { Dialogo, DialogoConfirmar } from "@/componentes/ui/dialogo";
import { Esqueleto } from "@/componentes/ui/esqueleto";
import { Insignia } from "@/componentes/ui/insignia";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { llamar } from "@/lib/api-cliente";
import { useSinGuardar } from "@/lib/cascaron";
import { dinero } from "@/lib/dinero";
import type { ArticuloPos, ArticuloVenta, Categoria, ClienteDetalle, ClienteFila, Lista, Ticket, VistaCobro } from "@/lib/tipos";
import { CobroPos, type CreditoCliente, type CuerpoPago } from "./cobro-pos";
import { esperaInicial, leerEspera, guardarEspera, llaveEspera, MAX_ESPERA, ventaNueva, type ClienteP, type Espera, type VentaP } from "./estado";

const TILES_POR_PAGINA = 48;
const LLAVE_IMPRIMIR = "chv:pos-autoimprimir";
const marcaDe = (a: ArticuloVenta) => (a.marca ? nombreDe(a.marca) : "");
const fino = () => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;

type Fase = "armar" | "cobrar" | "listo";
type Props = { usuarioId: string; cajaId: string; catalogoInicial: ArticuloVenta[]; categorias: Categoria[]; puedeFiado: boolean; puedeClientes: boolean };

/**
 * `/pos`: venta de mostrador (F8). Escáner en modo teclado siempre con el foco, buscador tolerante, mosaicos por categoría,
 * hasta 5 ventas en espera en este navegador y cobro con el ticket de 80 mm. Aquí solo se muestran importes (centavos
 * enteros); el total, el cambio y el ticket los devuelve la API al guardar (`POST /ventas`).
 */
export function Pos({ usuarioId, cajaId, catalogoInicial, categorias, puedeFiado, puedeClientes }: Props) {
  const llave = llaveEspera(usuarioId, cajaId);
  const [espera, setEspera] = useState<Espera>(esperaInicial);
  const [cargado, setCargado] = useState(false);
  const [cats, setCats] = useState<Record<string, ArticuloVenta[]>>({ "": catalogoInicial });
  const [falloCat, setFalloCat] = useState(false);
  const [creditos, setCreditos] = useState<Record<string, CreditoCliente>>({});
  const [fase, setFase] = useState<Fase>("armar");
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState<string>("");
  const [limite, setLimite] = useState(TILES_POR_PAGINA);
  const [eleccion, setEleccion] = useState<ArticuloVenta[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<{ texto: string; sinTurno: boolean } | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [descartar, setDescartar] = useState(false);
  const [autoImprimir, setAutoImprimir] = useState(false);
  const buscador = useRef<HTMLInputElement>(null);

  // Lo guardado en el navegador se lee al montar (no en el render: evita diferencias con el servidor).
  useEffect(() => {
    setEspera(leerEspera(llave));
    try {
      setAutoImprimir(localStorage.getItem(LLAVE_IMPRIMIR) === "1");
    } catch {
      /* sin almacenamiento */
    }
    setCargado(true);
  }, [llave]);
  useEffect(() => {
    if (cargado) guardarEspera(llave, espera);
  }, [cargado, espera, llave]);
  useSinGuardar(espera.ventas.some((v) => v.lineas.length > 0));

  const venta = espera.ventas.find((v) => v.id === espera.activa) ?? espera.ventas[0];
  const cambiarVenta = useCallback((f: (v: VentaP) => VentaP) => setEspera((e) => ({ ...e, ventas: e.ventas.map((v) => (v.id === e.activa ? f(v) : v)) })), []);

  /* ---- catálogo de la lista de precios del cliente (mostrador = la predeterminada) ---- */
  const listaKey = venta.cliente?.listaId ?? "";
  const articulos = cats[listaKey] ?? null;
  useEffect(() => {
    if (cats[listaKey]) return;
    let vivo = true;
    void (async () => {
      const r = await llamar<ArticuloVenta[] | Lista<ArticuloVenta>>("GET", `/catalogo-venta${listaKey ? `?lista_precio_id=${listaKey}` : ""}`);
      if (!vivo) return;
      if (r.ok) setCats((c) => ({ ...c, [listaKey]: itemsDe(r.datos) }));
      else setFalloCat(true);
    })();
    return () => {
      vivo = false;
    };
  }, [cats, listaKey]);

  const porId = useMemo(() => new Map((articulos ?? []).map((a) => [String(a.presentacion_id), a])), [articulos]);
  const sinPrecio = venta.lineas.filter((l) => !porId.get(l.presentacion_id)?.precio).map((l) => l.presentacion_id);
  // Vista previa: el total sale de SQL (`POST /cobrar/vista`), nunca de JS. `datosVista` también la usa el cobro.
  const datosVista = useMemo(() => JSON.stringify({ ...(venta.cliente ? { cliente_id: venta.cliente.id } : {}), lineas: venta.lineas.map((l) => ({ presentacion_id: l.presentacion_id, cantidad: l.cantidad })) }), [venta.cliente, venta.lineas]);
  const [vista, setVista] = useState<{ k: string; v: VistaCobro } | null>(null);
  const [errorVista, setErrorVista] = useState<string | null>(null);
  useEffect(() => {
    const d = JSON.parse(datosVista) as { lineas: unknown[] };
    if (d.lineas.length === 0 || !articulos) return;
    let vivo = true;
    const t = setTimeout(async () => {
      const r = await llamar<VistaCobro>("POST", "/cobrar/vista", { ...d, pagos: [] });
      if (!vivo) return;
      if (r.ok) {
        setVista({ k: datosVista, v: r.datos });
        setErrorVista(null);
      } else setErrorVista(mensajeCobro(r.error));
    }, 200);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [datosVista, articulos]);
  const vistaAlDia = vista?.k === datosVista;
  const total = venta.lineas.length > 0 ? (vista?.v.total ?? null) : "0.00";
  const piezas = venta.lineas.reduce((s, l) => s + l.cantidad, 0);

  /* ---- crédito del cliente de la venta activa ---- */
  const clienteId = venta.cliente?.id;
  useEffect(() => {
    if (!clienteId || creditos[clienteId]) return;
    let vivo = true;
    void (async () => {
      const r = await llamar<ClienteDetalle>("GET", `/clientes/${clienteId}`);
      if (vivo && r.ok) setCreditos((c) => ({ ...c, [clienteId]: { nombre: r.datos.nombre, saldo: r.datos.saldo ?? null, disponible: r.datos.disponible ?? null, semaforo: r.datos.semaforo ?? null } }));
    })();
    return () => {
      vivo = false;
    };
  }, [clienteId, creditos]);

  /* ---- agregar y cambiar líneas ---- */
  const enfocar = useCallback(() => {
    if (fino()) buscador.current?.focus();
  }, []);

  function agregar(a: ArticuloVenta, cantidad = 1) {
    const id = String(a.presentacion_id);
    if (!a.precio) {
      setAviso(`${a.producto} ${a.presentacion} no tiene precio en esta lista. Pídele al dueño que lo ponga en Precios.`);
      return;
    }
    cambiarVenta((v) =>
      v.lineas.some((l) => l.presentacion_id === id)
        ? { ...v, lineas: v.lineas.map((l) => (l.presentacion_id === id ? { ...l, cantidad: Math.min(999, l.cantidad + cantidad) } : l)) }
        : { ...v, lineas: [{ presentacion_id: id, producto: a.producto, presentacion: a.presentacion, cantidad }, ...v.lineas] },
    );
    const ya = venta.lineas.find((l) => l.presentacion_id === id)?.cantidad ?? 0;
    setAviso(`Agregado: ${a.producto} ${a.presentacion} (${Math.min(999, ya + cantidad)})`);
    setUltimo(id);
    setQ("");
    setEleccion(null);
    enfocar();
  }
  const fijar = (id: string, n: number) => cambiarVenta((v) => ({ ...v, lineas: n <= 0 ? v.lineas.filter((l) => l.presentacion_id !== id) : v.lineas.map((l) => (l.presentacion_id === id ? { ...l, cantidad: Math.min(999, n) } : l)) }));

  /** Un solo campo: Enter con un código exacto agrega; el texto filtra. */
  async function alEnter() {
    const t = q.trim();
    if (!t || !articulos) return;
    const exacto = articulos.find((a) => a.codigo_barras === t);
    if (exacto) return agregar(exacto);
    if (/^\d{6,14}$/.test(t)) {
      const r = await llamar<ArticuloPos>("GET", `/presentaciones/codigo/${encodeURIComponent(t)}${listaKey ? `?lista_precio_id=${listaKey}` : ""}`);
      setQ("");
      if (!r.ok) return setAviso("Ese código no está en el catálogo.");
      const a = porId.get(String(r.datos.presentacion_id));
      if (a) return agregar(a);
      setCats((c) => {
        const { [listaKey]: _quitada, ...resto } = c;
        void _quitada;
        return resto;
      });
      return setAviso("Actualicé el catálogo. Escanéalo otra vez.");
    }
    if (resultados.length === 1) agregar(resultados[0]);
  }

  const busca = q.trim().length >= 2;
  const resultados = useMemo(() => (articulos && busca ? articulos.filter((a) => coincide(normalizar(`${a.producto} ${a.presentacion} ${marcaDe(a)}`), q)).slice(0, 30) : []), [articulos, busca, q]);

  const productos = useMemo(() => {
    const m = new Map<string, ArticuloVenta[]>();
    for (const a of articulos ?? []) {
      if (categoria && String(a.categoria_id ?? "") !== categoria) continue;
      const k = String(a.producto_id);
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return [...m.values()];
  }, [articulos, categoria]);

  /* ---- ventas en espera ---- */
  function ponerEnEspera() {
    if (espera.ventas.length >= MAX_ESPERA) return;
    const v = ventaNueva();
    setEspera((e) => ({ activa: v.id, ventas: [...e.ventas, v] }));
    setQ("");
    enfocar();
  }
  function retirarActiva() {
    setEspera((e) => {
      const resto = e.ventas.filter((v) => v.id !== e.activa);
      return resto.length ? { activa: resto[0].id, ventas: resto } : esperaInicial();
    });
  }

  function cambiarEspera(id: string) {
    setEspera((e) => ({ ...e, activa: id }));
    setQ("");
    setError(null);
    enfocar();
  }

  /* ---- cliente ---- */
  const [buscaCliente, setBuscaCliente] = useState<string | null>(null);
  const [clientes, setClientes] = useState<ClienteFila[] | null>(null);
  const turnoBusqueda = useRef(0);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  function alBuscarCliente(v: string) {
    setBuscaCliente(v);
    if (reloj.current) clearTimeout(reloj.current);
    if (v.trim().length < 2) {
      turnoBusqueda.current++;
      return setClientes(null);
    }
    reloj.current = setTimeout(async () => {
      const mio = ++turnoBusqueda.current;
      const r = await llamar<Lista<ClienteFila>>("GET", `/clientes?buscar=${encodeURIComponent(v.trim())}&activo=true&por_pagina=8`);
      if (mio === turnoBusqueda.current) setClientes(r.ok ? r.datos.items : []);
    }, 300);
  }
  async function elegirCliente(id: string) {
    const r = await llamar<ClienteDetalle>("GET", `/clientes/${id}`);
    if (!r.ok) return setAviso(r.error.mensaje);
    const l = r.datos.lista_precio;
    const c: ClienteP = { id, nombre: r.datos.nombre, listaId: l && typeof l === "object" ? String(l.id) : r.datos.lista_precio_id != null ? String(r.datos.lista_precio_id) : null, lista: l && typeof l === "object" ? l.nombre : typeof l === "string" ? l : null };
    setCreditos((x) => ({ ...x, [id]: { nombre: r.datos.nombre, saldo: r.datos.saldo ?? null, disponible: r.datos.disponible ?? null, semaforo: r.datos.semaforo ?? null } }));
    cambiarVenta((v) => ({ ...v, cliente: c }));
    setBuscaCliente(null);
    setClientes(null);
    enfocar();
  }

  /* ---- cobrar ---- */
  async function cobrar(c: CuerpoPago) {
    setEnviando(true);
    setError(null);
    const r = await llamar<Ticket>("POST", "/ventas", {
      clave_idempotencia: venta.clave,
      ...(venta.cliente ? { cliente_id: venta.cliente.id } : {}),
      lineas: venta.lineas.map((l) => ({ presentacion_id: l.presentacion_id, cantidad: l.cantidad })),
      pagos: c.pagos,
      ...(c.efectivo_recibido ? { efectivo_recibido: c.efectivo_recibido } : {}),
    });
    setEnviando(false);
    if (!r.ok) {
      const nombreDeLinea = r.error.codigo === "STOCK_INSUFICIENTE" ? "Revisa las cantidades: alguna no alcanza en el inventario. " : "";
      return setError({ texto: `No se guardó. ${nombreDeLinea}${mensajeCobro(r.error)}`, sinTurno: r.error.codigo === "TURNO_NO_ABIERTO" || r.error.codigo === "TURNO_NO_VALIDO" });
    }
    retirarActiva();
    setTicket(r.datos);
    setFase("listo");
  }
  function nuevaVenta() {
    setTicket(null);
    setError(null);
    setFase("armar");
    setTimeout(enfocar, 0);
  }
  useEffect(() => {
    if (fase === "listo" && ticket && autoImprimir) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [fase, ticket, autoImprimir]);
  function cambiarAutoImprimir(v: boolean) {
    setAutoImprimir(v);
    try {
      localStorage.setItem(LLAVE_IMPRIMIR, v ? "1" : "0");
    } catch {
      /* sin almacenamiento */
    }
  }

  const puedeCobrar = venta.lineas.length > 0 && sinPrecio.length === 0 && articulos != null && vistaAlDia && !errorVista;
  const irACobrar = () => {
    setError(null);
    setFase("cobrar");
  };

  /* ---- teclado de escritorio: F2 buscar, F4 cobrar, Esc cancelar ---- */
  const teclas = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    teclas.current = (e) => {
      if (fase !== "armar" || eleccion || descartar) return;
      if (e.key === "F2") {
        e.preventDefault();
        buscador.current?.focus();
        buscador.current?.select();
      } else if (e.key === "F4") {
        e.preventDefault();
        if (puedeCobrar) irACobrar();
      } else if (e.key === "Escape") {
        if (q) setQ("");
        else buscador.current?.focus();
      }
    };
  });
  useEffect(() => {
    const t = (e: KeyboardEvent) => teclas.current(e);
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, []);
  useEffect(() => {
    if (fase === "armar") enfocar();
  }, [fase, enfocar]);

  if (fase === "listo" && ticket) {
    const hayCambio = ticket.cambio != null && Number(ticket.cambio) > 0;
    return (
      <div className="flex flex-col gap-4">
        <Tarjeta className="flex flex-col items-center gap-2 text-center">
          <Check aria-hidden className="size-14 rounded-full bg-exito-suave p-3 text-exito" />
          <p role="status" className="text-2xl font-extrabold">Venta guardada · {ticket.folio}</p>
          <p className="text-4xl font-extrabold tabular-nums">{dinero(ticket.total)}</p>
          {hayCambio && <p className="rounded-xl bg-marca-suave px-4 py-2 text-3xl font-extrabold text-marca-fuerte">Dale de cambio {dinero(ticket.cambio)}</p>}
        </Tarjeta>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <BotonImprimirTicket grande />
          <Boton autoFocus className="!min-h-14 !text-lg" onClick={nuevaVenta}>Nueva venta</Boton>
        </div>
        <label className="mx-auto flex min-h-tocable cursor-pointer items-center gap-3 text-base">
          <input type="checkbox" className="size-6 accent-marca" checked={autoImprimir} onChange={(e) => cambiarAutoImprimir(e.target.checked)} />
          Imprimir el ticket solo al cobrar
        </label>
        <Ticket80mm t={ticket} />
        <p className="text-center text-base">
          <BotonEnlace variante="fantasma" href={`/ventas/${ticket.venta_id}`}>Ver la venta</BotonEnlace>
        </p>
      </div>
    );
  }

  if (fase === "cobrar") {
    const credito = venta.cliente ? (creditos[venta.cliente.id] ?? { nombre: venta.cliente.nombre, saldo: null, disponible: null, semaforo: null }) : null;
    return (
      <>
        <CobroPos total={total ?? "0.00"} datos={datosVista} credito={credito} puedeFiado={puedeFiado} enviando={enviando} error={error?.texto ?? null} alVolver={() => !enviando && setFase("armar")} alCobrar={(c) => void cobrar(c)} />
        {error?.sinTurno && (
          <div className="fixed inset-x-0 bottom-24 z-40 mx-auto max-w-xl px-3"><BotonEnlace ancho className="!min-h-14" href="/caja?volver=%2Fpos">Abre tu turno</BotonEnlace></div>
        )}
      </>
    );
  }

  const tiles = productos.slice(0, limite);
  return (
    <div className="grid gap-4 pb-32 lg:grid-cols-[minmax(0,1fr)_26rem]">
      {/* A: ventas en espera y buscador */}
      <div className="flex min-w-0 flex-col gap-3 lg:col-start-1">
        <nav aria-label="Ventas en espera" className="flex flex-wrap items-center gap-2">
          {espera.ventas.map((v, i) => {
            const activa = v.id === venta.id;
            const n = v.lineas.reduce((s, l) => s + l.cantidad, 0);
            return (
              <Boton key={v.id} variante={activa ? "primario" : "secundario"} aria-pressed={activa} aria-label={`${activa ? "Venta" : "Retomar venta"} ${i + 1}${n ? `, ${n} productos` : ", vacía"}${v.cliente ? `, de ${v.cliente.nombre}` : ""}`} className="!min-h-12 !px-4" onClick={() => { cambiarEspera(v.id); }}>
                Venta {i + 1}{n > 0 && <Insignia tono={activa ? "neutro" : "aviso"}>{n}</Insignia>}
              </Boton>
            );
          })}
          <Boton variante="fantasma" className="!min-h-12" disabled={espera.ventas.length >= MAX_ESPERA || venta.lineas.length === 0} onClick={ponerEnEspera}>
            <Plus aria-hidden className="size-5" /> Poner en espera y empezar otra
          </Boton>
        </nav>

        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-6 -translate-y-1/2 text-suave" />
          <input
            ref={buscador}
            type="search"
            autoComplete="off"
            autoCapitalize="none"
            enterKeyHint="search"
            aria-label="Escanear código o buscar producto"
            placeholder="Escanea o busca un producto (F2)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void alEnter();
              }
            }}
            onBlur={() => setTimeout(() => { if (fino() && !eleccion && !descartar && (document.activeElement === document.body || document.activeElement === null)) buscador.current?.focus(); }, 60)}
            className="min-h-16 w-full rounded-xl border-2 border-marca bg-superficie pl-14 pr-4 text-xl"
          />
        </div>
        <p role="status" className={`min-h-6 text-base font-semibold ${aviso?.startsWith("Agregado") ? "text-exito" : "text-peligro"}`}>{aviso}</p>
        {falloCat && !articulos && <Aviso texto="No se pudo cargar los precios de esa lista. Revisa tu señal e intenta otra vez." />}
      </div>

      {/* B: venta actual */}
      <section aria-labelledby="pos-venta" className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
        <h2 id="pos-venta" className="sr-only">Venta {espera.ventas.indexOf(venta) + 1}</h2>
        <Tarjeta className="flex flex-col gap-2">
          {venta.cliente ? (
            <div className="flex items-center justify-between gap-2">
              <p className="flex min-w-0 flex-col text-base">
                <strong className="text-lg [overflow-wrap:anywhere]">{venta.cliente.nombre}</strong>
                <span className="text-suave">Lista: {venta.cliente.lista ?? "Menudeo"}{creditos[venta.cliente.id]?.disponible != null ? ` · crédito disponible ${dinero(creditos[venta.cliente.id].disponible)}` : ""}</span>
              </p>
              <Boton variante="secundario" aria-label="Quitar cliente" onClick={() => cambiarVenta((v) => ({ ...v, cliente: null }))}><X aria-hidden className="size-5" /></Boton>
            </div>
          ) : buscaCliente == null ? (
            puedeClientes ? (
              <Boton variante="secundario" className="!min-h-14" onClick={() => setBuscaCliente("")}><UserRound aria-hidden className="size-5" /> Poner cliente (mayoreo o fiado)</Boton>
            ) : (
              <p className="text-base text-suave">Venta de mostrador, sin cliente.</p>
            )
          ) : (
            <div className="flex flex-col gap-2">
              <Campo etiqueta="Nombre o teléfono del cliente" type="search" autoFocus value={buscaCliente} onChange={(e) => alBuscarCliente(e.target.value)} />
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
              <Boton variante="fantasma" onClick={() => { setBuscaCliente(null); setClientes(null); }}>No poner cliente</Boton>
            </div>
          )}
        </Tarjeta>

        <Tarjeta className="flex flex-col gap-2 !p-3">
          {venta.lineas.length === 0 ? (
            <p className="px-2 py-6 text-center text-base text-suave">Escanea o toca un producto para empezar la venta.</p>
          ) : (
            <ul className="flex max-h-[45dvh] flex-col divide-y divide-borde overflow-y-auto overscroll-contain lg:max-h-[calc(100dvh-26rem)]">
              {venta.lineas.map((l) => {
                const a = porId.get(l.presentacion_id);
                const corto = a != null && l.cantidad * a.factor > a.disponible_piezas;
                return (
                  <li key={l.presentacion_id} className={`flex flex-col gap-1 py-2 ${ultimo === l.presentacion_id ? "bg-marca-suave/60" : ""}`}>
                    <p className="flex items-baseline justify-between gap-2 text-base">
                      <span className="min-w-0 [overflow-wrap:anywhere]">{l.producto} <span className="text-suave">{l.presentacion}</span></span>
                      <strong className="shrink-0 text-lg tabular-nums">{a?.precio ? `${l.cantidad} × ${dinero(a.precio)}` : "Sin precio"}</strong>
                    </p>
                    {corto && <p className="text-sm font-semibold text-peligro">Solo quedan {a.disponible_piezas} piezas.</p>}
                    <div className="flex items-center gap-1.5">
                      <Boton variante="secundario" className="!min-h-12 !w-12 !px-0" aria-label={`Quitar uno de ${l.producto} ${l.presentacion}`} onClick={() => fijar(l.presentacion_id, l.cantidad - 1)}><Minus aria-hidden className="size-5" /></Boton>
                      <input
                        inputMode="numeric"
                        aria-label={`Cantidad de ${l.producto} ${l.presentacion}`}
                        value={l.cantidad}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => { const n = Number.parseInt(e.target.value, 10); if (Number.isFinite(n) && n >= 1) fijar(l.presentacion_id, n); }}
                        className="min-h-12 w-16 rounded-xl border border-borde bg-superficie text-center text-xl font-bold tabular-nums"
                      />
                      <Boton variante="secundario" className="!min-h-12 !w-12 !px-0" aria-label={`Agregar uno de ${l.producto} ${l.presentacion}`} onClick={() => fijar(l.presentacion_id, l.cantidad + 1)}><Plus aria-hidden className="size-5" /></Boton>
                      <Boton variante="fantasma" className="ml-auto !min-h-12 !px-3" aria-label={`Quitar ${l.producto} ${l.presentacion} de la venta`} onClick={() => fijar(l.presentacion_id, 0)}><Trash2 aria-hidden className="size-5" /></Boton>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {errorVista && <Aviso texto={errorVista} />}
          {sinPrecio.length > 0 && <Aviso texto={`Hay productos sin precio en la lista de este cliente. Quítalos para poder cobrar.`} />}
          {venta.lineas.length > 0 && (
            <Boton variante="fantasma" className="self-start" onClick={() => setDescartar(true)}>Vaciar esta venta</Boton>
          )}
        </Tarjeta>
      </section>

      {/* C: mosaicos por categoría y resultados */}
      <div className="flex min-w-0 flex-col gap-3 lg:col-start-1 lg:row-start-2">
        {busca ? (
          resultados.length === 0 ? (
            <p className="rounded-xl border border-dashed border-borde p-4 text-center text-base text-suave">No encontramos «{q.trim()}». Prueba con otra palabra.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {resultados.map((a) => (
                <li key={a.presentacion_id}>
                  <button type="button" onClick={() => agregar(a)} className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-borde bg-superficie px-3 py-2 text-left active:bg-marca-suave">
                    <Foto imagen={a.imagen} tam={48} />
                    <span className="min-w-0 flex-1 text-lg [overflow-wrap:anywhere]">{a.producto} <span className="text-suave">{a.presentacion}</span></span>
                    <strong className="shrink-0 text-xl tabular-nums">{a.precio ? dinero(a.precio) : "Sin precio"}</strong>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <>
            {categorias.length > 0 && (
              <div role="group" aria-label="Departamentos" className="flex gap-2 overflow-x-auto pb-1">
                {[{ id: "", nombre: "Todos" }, ...categorias.map((c) => ({ id: String(c.id), nombre: c.nombre }))].map((c) => (
                  <Boton key={c.id} variante={categoria === c.id ? "primario" : "secundario"} aria-pressed={categoria === c.id} className="!min-h-12 shrink-0" onClick={() => { setCategoria(c.id); setLimite(TILES_POR_PAGINA); }}>{c.nombre}</Boton>
                ))}
              </div>
            )}
            {!articulos ? (
              <div role="status" aria-label="Cargando" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Esqueleto key={i} className="h-36" />)}</div>
            ) : productos.length === 0 ? (
              <p className="rounded-xl border border-dashed border-borde p-4 text-center text-base text-suave">No hay productos para vender aquí todavía.</p>
            ) : (
              <>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {tiles.map((ps) => {
                    const p = ps[0];
                    const unico = ps.length === 1;
                    return (
                      <li key={p.producto_id}>
                        <button type="button" onClick={() => (unico ? agregar(p) : setEleccion(ps))} className="flex min-h-36 w-full flex-col items-center gap-1 rounded-xl border border-borde bg-superficie p-2 text-center active:bg-marca-suave">
                          <Foto imagen={p.imagen} tam={64} />
                          <span className="text-base font-semibold [overflow-wrap:anywhere]">{p.producto}</span>
                          <span className="text-sm text-suave">{unico ? p.presentacion : `${ps.length} presentaciones`}</span>
                          {unico && <strong className="text-lg tabular-nums">{p.precio ? dinero(p.precio) : "Sin precio"}</strong>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {productos.length > limite && <Boton variante="secundario" className="!min-h-14" onClick={() => setLimite((n) => n + TILES_POR_PAGINA)}>Ver más productos</Boton>}
              </>
            )}
          </>
        )}
      </div>

      {/* Barra fija: total y cobrar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-borde bg-superficie px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <p className="flex min-w-0 flex-col leading-tight">
            <span className="text-sm text-suave">{piezas} {piezas === 1 ? "pieza" : "piezas"}</span>
            <strong aria-busy={!vistaAlDia} className={`text-3xl font-extrabold tabular-nums ${vistaAlDia ? "" : "opacity-50"}`}>{dinero(total)}</strong>
          </p>
          <Boton className="!min-h-16 flex-1 !text-xl" disabled={!puedeCobrar} onClick={irACobrar}>
            Cobrar <kbd className="hidden rounded border border-white/60 px-1.5 text-sm font-normal lg:inline">F4</kbd>
          </Boton>
        </div>
      </div>

      <Dialogo abierto={eleccion != null} titulo={eleccion ? `¿Cuál de ${eleccion[0].producto}?` : ""} alCerrar={() => setEleccion(null)}>
        <ul className="flex flex-col gap-3">
          {eleccion?.map((a) => (
            <li key={a.presentacion_id}>
              <Boton ancho className="!min-h-16 !justify-between !text-xl" onClick={() => agregar(a)}>
                <span>{a.presentacion}</span>
                <span className="tabular-nums">{a.precio ? dinero(a.precio) : "Sin precio"}</span>
              </Boton>
            </li>
          ))}
        </ul>
      </Dialogo>
      <DialogoConfirmar abierto={descartar} titulo="¿Vaciar esta venta?" texto="Se quitan todos los productos de esta venta. No se cobra nada." confirmar="Sí, vaciar" peligro alCerrar={() => setDescartar(false)} alConfirmar={() => { cambiarVenta((v) => ({ ...v, lineas: [], cliente: null, clave: ventaNueva().clave })); setDescartar(false); }} />
    </div>
  );
}

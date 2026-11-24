"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MapPin, RotateCcw, Search, Star } from "lucide-react";
import { clasesBoton } from "@/componentes/ui/boton";
import { Esqueleto } from "@/componentes/ui/esqueleto";
import { fecha } from "@/componentes/productos/formato";
import { cargarLineas, fijarCantidad, resumenCarrito, useCarrito } from "@/lib/carrito";
import { claveCliente } from "@/lib/clave-cliente";
import { dinero } from "@/lib/dinero";
import { T } from "@/lib/textos-publico";
import type { ArticuloPublico, ClientePublico } from "@/lib/tipos";
import { ponerBandera, useBandera } from "./bandera";
import { coincide } from "./busqueda";
import { FotoArticulo } from "./foto-articulo";
import { llamarPublico } from "./llamar-publico";
import { SelectorCantidad } from "./selector-cantidad";
import { useCatalogo } from "./use-catalogo";

const POR_PAGINA = 40;
const BANDERA_UBICACION = "chv_ubicacion_preguntada";

function Tarjeta({ a, cantidad, favorito, alCantidad, alFavorito }: { a: ArticuloPublico; cantidad: number; favorito: boolean; alCantidad: (n: number) => void; alFavorito: () => void }) {
  const nombre = `${a.producto} ${a.presentacion}`;
  return (
    <li className="flex flex-col gap-2.5 rounded-tarjeta border border-borde bg-superficie p-3 shadow-tarjeta">
      <div className="flex items-start gap-3">
        <FotoArticulo miniatura={a.miniatura} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold [overflow-wrap:anywhere]">{a.producto}</p>
          <p className="text-base text-suave [overflow-wrap:anywhere]">{a.presentacion}</p>
        </div>
        <button type="button" onClick={alFavorito} aria-pressed={favorito} aria-label={`${favorito ? T.noFavorito : T.favorito}: ${nombre}`} className="flex size-12 shrink-0 items-center justify-center rounded-xl transition-transform duration-150 ease-salida active:scale-90 active:bg-marca-suave">
          <Star aria-hidden className={`size-6 ${favorito ? "fill-marca text-marca" : "text-suave"}`} />
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="cifra text-xl font-bold">
            {dinero(a.precio)}
            {a.oferta && <s className="ml-2 font-sans text-base font-normal text-suave">{dinero(a.oferta.precio_normal)}</s>}
          </p>
          {a.oferta && <p className="text-sm font-medium text-exito">{T.ofertaHasta(fecha(a.oferta.hasta))}</p>}
        </div>
        <SelectorCantidad cantidad={cantidad} nombre={nombre} alCambiar={alCantidad} />
      </div>
    </li>
  );
}

/** `/pedido`: unica isla pesada del enlace (catalogo + buscador + carrito). El resto de la pagina es del servidor. */
export function Catalogo({ cliente }: { cliente: ClientePublico }) {
  const router = useRouter();
  const k = claveCliente(cliente);
  const { datos, error, recargar } = useCatalogo();
  const carrito = useCarrito(k);
  const yaPreguntoUbicacion = useBandera(BANDERA_UBICACION);
  const [consulta, setConsulta] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [limite, setLimite] = useState(POR_PAGINA);
  const [favoritos, setFavoritos] = useState<Record<string, boolean>>({});

  const articulos = datos?.articulos;
  const resumen = useMemo(() => resumenCarrito(carrito, articulos ?? []), [carrito, articulos]);
  const filtrando = consulta.trim() !== "" || categoria !== null;

  const lista = useMemo(() => {
    return (articulos ?? []).filter((a) => (categoria === null || String(a.categoria_id) === categoria) && coincide(a.buscar, consulta));
  }, [articulos, categoria, consulta]);

  if (error && !datos) {
    return (
      <div role="alert" className="rounded-tarjeta border border-peligro/30 bg-peligro-suave p-4">
        <p className="mb-3 text-base font-semibold text-peligro">{T.errorCatalogo} {T.sinRed}</p>
        <button type="button" onClick={() => void recargar()} className={clasesBoton("secundario")}>
          {T.reintentar}
        </button>
      </div>
    );
  }
  if (!datos) {
    return (
      <div role="status" aria-label={T.cargandoCatalogo} className="flex flex-col gap-3">
        <Esqueleto className="h-28 rounded-tarjeta" />
        <Esqueleto className="mt-2 h-tocable" />
        <Esqueleto className="h-36 rounded-tarjeta" />
        <Esqueleto className="h-36 rounded-tarjeta" />
        <Esqueleto className="h-36 rounded-tarjeta" />
      </div>
    );
  }

  const porId = new Map(datos.articulos.map((a) => [String(a.presentacion_id), a]));
  const ofertas = datos.articulos.filter((a) => a.oferta);
  const frecuentes = datos.frecuentes.map((f) => porId.get(String(f.presentacion_id))).filter((a): a is ArticuloPublico => !!a).slice(0, 8);
  const zona = (datos.sugerencias_zona ?? []).map((z) => porId.get(String(z.presentacion_id))).filter((a): a is ArticuloPublico => !!a).slice(0, 3);
  const vista = datos.ultimo_pedido?.vista;
  const esFavorito = (a: ArticuloPublico) => favoritos[String(a.presentacion_id)] ?? a.favorito;

  async function alternarFavorito(a: ArticuloPublico) {
    const id = String(a.presentacion_id);
    const nuevo = !esFavorito(a);
    setFavoritos((f) => ({ ...f, [id]: nuevo }));
    const r = await llamarPublico(nuevo ? "PUT" : "DELETE", `/favoritos/${id}`);
    if (!r.ok) setFavoritos((f) => ({ ...f, [id]: !nuevo }));
  }

  function repetir() {
    if (!vista) return;
    cargarLineas(k, vista.lineas.filter((l) => porId.has(String(l.presentacion_id))));
    router.push("/pedido/carrito");
  }

  const tarjeta = (a: ArticuloPublico) => (
    <Tarjeta key={a.presentacion_id} a={a} cantidad={carrito.lineas[String(a.presentacion_id)] ?? 0} favorito={esFavorito(a)} alCantidad={(n) => fijarCantidad(k, String(a.presentacion_id), n)} alFavorito={() => void alternarFavorito(a)} />
  );

  return (
    <div className={resumen.cantidad > 0 ? "pb-28" : "pb-6"}>
      {cliente.pedido_propuesto && (
        <Link href={`/pedido/mis-pedidos/${cliente.pedido_propuesto.id}`} className="mb-4 flex min-h-tocable flex-wrap items-center justify-between gap-3 rounded-tarjeta border-2 border-marca bg-marca-suave p-4 text-lg font-bold text-marca-fuerte transition-transform duration-150 ease-salida active:scale-[0.98]">
          <span className="min-w-0 [overflow-wrap:anywhere]">{T.loDeSiempreTitulo}</span>
          <span className="shrink-0 rounded-xl bg-marca px-4 py-2 text-base text-white shadow-boton">{T.loDeSiempreVer}</span>
        </Link>
      )}

      {vista && vista.lineas.length > 0 && !filtrando && (
        <section aria-label={T.repetirUltimo} className="mb-5">
          {/* El unico bloque de color fuerte de la pantalla (C2): lo primero que se ve y se toca. */}
          <button
            type="button"
            onClick={repetir}
            className="relative isolate flex w-full flex-col items-start gap-1 overflow-hidden rounded-tarjeta bg-marca p-4 text-left text-white shadow-boton transition-transform duration-150 ease-salida active:scale-[0.98] active:bg-marca-presionado"
          >
            <span aria-hidden className="absolute -right-10 -top-10 -z-10 size-40 rounded-full border-[22px] border-white/10" />
            <span className="flex items-center gap-2 font-titulo text-xl font-bold leading-tight">
              <RotateCcw aria-hidden className="size-5 shrink-0" /> {T.repetirUltimo}
            </span>
            <span className="cifra text-2xl font-bold [overflow-wrap:anywhere]">{T.repetirTotal(dinero(vista.total_actual))}</span>
            {vista.hay_cambios && <span className="mt-1 rounded-full bg-white/20 px-3 py-1 text-base font-semibold">{T.preciosCambiaron}</span>}
          </button>
          {vista.hay_cambios && (
            <ul className="mt-2 flex flex-col gap-1 text-base">
              {vista.lineas.filter((l) => l.cambio).map((l) => (
                <li key={l.presentacion_id} className="[overflow-wrap:anywhere]">
                  {l.producto} {l.presentacion}: <strong className={l.cambio === "sube" ? "text-peligro" : "text-exito"}>{T.antesAhora(dinero(l.precio_anterior), dinero(l.precio_actual))}</strong>
                </li>
              ))}
            </ul>
          )}
          {vista.quitadas.map((q) => (
            <p key={q.producto} className="mt-1 text-base font-medium text-peligro">
              {T.quitadoHoy(q.producto)}
            </p>
          ))}
        </section>
      )}

      {!cliente.tiene_ubicacion && !yaPreguntoUbicacion && !filtrando && (
        <section className="mb-5 flex flex-col gap-3 rounded-tarjeta border border-borde bg-superficie p-4 shadow-tarjeta">
          <p className="flex items-center gap-2 text-lg font-bold">
            <MapPin aria-hidden className="size-5 text-marca" /> {T.ubicacionPregunta}
          </p>
          <p className="text-base">{cliente.textos.aviso_ubicacion}</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/pedido/ubicacion" className={clasesBoton("primario")}>
              {T.ubicacionSi}
            </Link>
            <button type="button" onClick={() => ponerBandera(BANDERA_UBICACION)} className={clasesBoton("secundario")}>
              {T.ubicacionNo}
            </button>
          </div>
        </section>
      )}

      <div className="sticky top-0 z-10 -mx-4 mb-5 border-b border-borde bg-fondo px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <label htmlFor="buscar" className="sr-only">
          {T.buscar}
        </label>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-suave" />
          <input
            id="buscar"
            type="search"
            inputMode="search"
            autoComplete="off"
            value={consulta}
            onChange={(e) => {
              setConsulta(e.target.value);
              setLimite(POR_PAGINA);
            }}
            placeholder={T.buscar}
            className="min-h-tocable w-full rounded-xl border border-control bg-superficie pl-10 pr-4 text-base transition-[border-color] duration-150 placeholder:text-suave focus:border-marca"
          />
        </div>
        {datos.categorias.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Categorías">
            {[{ id: "", nombre: T.todo }, ...datos.categorias.map((c) => ({ id: String(c.id), nombre: c.nombre }))].map((c) => {
              const activa = (categoria ?? "") === c.id;
              return (
                <button key={c.id} type="button" aria-pressed={activa} onClick={() => { setCategoria(c.id || null); setLimite(POR_PAGINA); }} className={`min-h-tocable rounded-full border px-4 text-base font-semibold transition-[transform,background-color] duration-150 ease-salida active:scale-95 ${activa ? "border-texto bg-texto text-fondo" : "border-borde bg-superficie"}`}>
                  {c.nombre}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!filtrando && ofertas.length > 0 && (
        <section aria-labelledby="ofertas" className="mb-6">
          <h2 id="ofertas" className="mb-3 text-xl font-bold">
            {T.ofertas}
          </h2>
          <ul className="flex flex-col gap-3">{ofertas.map(tarjeta)}</ul>
        </section>
      )}

      {!filtrando && frecuentes.length > 0 && (
        <section aria-labelledby="frecuentes" className="mb-6">
          <h2 id="frecuentes" className="mb-3 text-xl font-bold">
            {T.frecuentes}
          </h2>
          <ul className="flex flex-col gap-3">{frecuentes.map(tarjeta)}</ul>
        </section>
      )}

      {!filtrando && zona.length > 0 && (
        <section aria-labelledby="zona" className="mb-6">
          <h2 id="zona" className="mb-3 text-xl font-bold">
            {T.enTuZona}
          </h2>
          <ul className="flex flex-col gap-3">{zona.map(tarjeta)}</ul>
        </section>
      )}

      <section aria-labelledby="todos">
        <h2 id="todos" className="mb-3 text-xl font-bold">
          {T.catalogo}
        </h2>
        {lista.length === 0 ? (
          <p className="rounded-tarjeta border border-dashed border-control/50 p-6 text-center text-base text-suave">{T.sinResultados}</p>
        ) : (
          <ul className="flex flex-col gap-3">{lista.slice(0, limite).map(tarjeta)}</ul>
        )}
        {lista.length > limite && (
          <button type="button" onClick={() => setLimite((l) => l + POR_PAGINA)} className={`mt-3 ${clasesBoton("secundario", true)}`}>
            {T.verMas}
          </button>
        )}
      </section>

      {resumen.cantidad > 0 && (
        // entra-abajo: la barra sube desde su alto la primera vez que aparece (al agregar el primer producto).
        <div className="entra-abajo fixed inset-x-0 bottom-0 z-20 border-t border-borde bg-superficie p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-flotante">
          <Link
            href="/pedido/carrito"
            className="mx-auto flex min-h-tocable-grande max-w-xl items-center justify-between gap-3 rounded-xl bg-marca px-4 text-white shadow-boton transition-transform duration-150 ease-salida active:scale-[0.98] active:bg-marca-presionado"
          >
            <span className="flex min-w-0 items-center gap-2 text-lg font-bold">
              {T.verMiPedido} <span className="cifra rounded-full bg-white/20 px-2 text-base">({resumen.cantidad})</span>
            </span>
            <span className="cifra shrink-0 text-xl font-bold">{dinero(resumen.total)}</span>
          </Link>
        </div>
      )}
    </div>
  );
}

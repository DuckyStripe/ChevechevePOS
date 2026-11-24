"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { fecha as fechaLarga, mensajeError } from "@/componentes/productos/formato";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { Casilla } from "@/componentes/ui/campo";
import { DialogoConfirmar } from "@/componentes/ui/dialogo";
import { Insignia } from "@/componentes/ui/insignia";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { llamar, type ErrorApi } from "@/lib/api-cliente";
import { dinero } from "@/lib/dinero";
import type { CandidatosRuta, RutaDetalle } from "@/lib/tipos";
import { ESTADO_RUTA, cajasTexto, kmTexto, piezasTexto } from "./formato";

type Optimizacion = { distancia_km: string | null; distancia_anterior_km: string | null; sin_ubicacion: string[] };

/** Texto llano de lo que falla al cargar; `FALTA_SURTIR` trae la lista de lo que falta. */
function textoCargar(e: ErrorApi): { texto: string; faltan: { producto: string; faltan: number }[] } {
  if (e.codigo === "FALTA_SURTIR" && Array.isArray(e.detalles)) {
    return { texto: "Todavía no alcanza el producto para cargar esta ruta. Falta:", faltan: e.detalles as { producto: string; faltan: number }[] };
  }
  if (e.codigo === "RUTA_VACIA") return { texto: "La ruta no tiene paradas. Agrega pedidos primero.", faltan: [] };
  if (e.codigo === "PEDIDO_ESPERANDO_CLIENTE") return { texto: "Hay un pedido esperando respuesta del cliente. Quítalo de la ruta o espera su respuesta.", faltan: [] };
  return { texto: mensajeError(e), faltan: [] };
}

/**
 * `/rutas/[id]`: dueña de asignar, ordenar, optimizar, quitar, cargar y cancelar (N1). Cada acción termina en `router.refresh()`:
 * la pantalla siempre muestra lo que dice el servidor.
 */
export function PanelRuta({ ruta, candidatos, puedePlanear }: { ruta: RutaDetalle; candidatos: CandidatosRuta | null; puedePlanear: boolean }) {
  const router = useRouter();
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [faltan, setFaltan] = useState<{ producto: string; faltan: number }[]>([]);
  const [optimizacion, setOptimizacion] = useState<Optimizacion | null>(null);
  const [cancelando, setCancelando] = useState(false);

  const editable = ruta.estado === "planeada" && puedePlanear;
  const estado = ESTADO_RUTA[ruta.estado];
  const sinUbicacion = ruta.paradas.filter((p) => p.cliente.lat === null);
  const esperando = ruta.paradas.filter((p) => p.pedido?.estado === "esperando_cliente");
  const pasaCapacidad = ruta.capacidad_cajas != null && ruta.cajas_totales > ruta.capacidad_cajas;

  async function correr<T>(clave: string, accion: Promise<Awaited<ReturnType<typeof llamar<T>>>>, ok?: string): Promise<T | null> {
    setOcupado(clave);
    setError(null);
    setFaltan([]);
    const r = await accion;
    setOcupado(null);
    if (!r.ok) {
      if (clave === "cargar") {
        const t = textoCargar(r.error);
        setError(t.texto);
        setFaltan(t.faltan);
      } else {
        setError(r.error.codigo === "PEDIDO_EN_OTRA_RUTA" ? "Alguno de esos pedidos ya está en otra ruta." : r.error.codigo === "RUTA_NO_EDITABLE" ? "Esta ruta ya no se puede cambiar." : mensajeError(r.error));
      }
      return null;
    }
    if (ok) toast.success(ok);
    router.refresh();
    return r.datos;
  }

  const agregar = (ids: string[]) => {
    if (ids.length === 0) return;
    void correr("agregar", llamar("POST", `/rutas/${ruta.id}/pedidos`, { pedido_ids: ids }), ids.length === 1 ? "Pedido agregado." : "Pedidos agregados.").then((x) => x && setSeleccion(new Set()));
  };

  function mover(i: number, delta: -1 | 1) {
    const ids = ruta.paradas.map((p) => p.id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    setOptimizacion(null);
    void correr("orden", llamar("PUT", `/rutas/${ruta.id}/orden`, { paradas: ids }));
  }

  async function optimizar() {
    const r = await correr<Optimizacion>("optimizar", llamar("POST", `/rutas/${ruta.id}/optimizar`));
    if (r) setOptimizacion(r);
  }

  function alternar(id: string) {
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const hayCandidatos = candidatos?.zonas.some((z) => z.pedidos.length > 0) ?? false;

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Insignia tono={estado.tono}>{estado.texto}</Insignia>
          <span className="text-base text-suave">
            {ruta.folio} · {fechaLarga(ruta.fecha)}
          </span>
        </div>
        <p className="text-base">
          {ruta.vehiculo.nombre} · reparte {ruta.repartidor.nombre}
        </p>
        <p className="text-base">
          {ruta.paradas.length} {ruta.paradas.length === 1 ? "parada" : "paradas"} · {cajasTexto(ruta.cajas_totales)} · {kmTexto(ruta.distancia_km)}
        </p>
        {optimizacion && (
          <p role="status" className="rounded-xl bg-exito-suave p-3 text-base font-medium text-exito">
            {optimizacion.distancia_anterior_km ? `Antes ${kmTexto(optimizacion.distancia_anterior_km)} → ahora ${kmTexto(optimizacion.distancia_km)}.` : `Ruta ordenada: ${kmTexto(optimizacion.distancia_km)} en total.`}
          </p>
        )}
        {pasaCapacidad && (
          <p role="status" className="rounded-xl bg-marca-suave p-3 text-base font-medium text-marca-fuerte">
            Llevas {cajasTexto(ruta.cajas_totales)} y la camioneta aguanta {cajasTexto(ruta.capacidad_cajas!)}. Puedes cargar igual, solo es un aviso.
          </p>
        )}
        {sinUbicacion.length > 0 && (
          <p role="status" className="rounded-xl bg-marca-suave p-3 text-base text-marca-fuerte">
            {sinUbicacion.length === 1 ? "Un cliente no tiene ubicación y va al final:" : `${sinUbicacion.length} clientes no tienen ubicación y van al final:`}{" "}
            {sinUbicacion.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ", "}
                <Link href={`/clientes/${p.cliente.id}`} className="font-semibold underline">
                  {p.cliente.nombre}
                </Link>
              </span>
            ))}
            .
          </p>
        )}
        {esperando.length > 0 && ruta.estado === "planeada" && (
          <p role="status" className="rounded-xl bg-marca-suave p-3 text-base text-marca-fuerte">
            {esperando.length === 1 ? "Un pedido espera respuesta del cliente." : `${esperando.length} pedidos esperan respuesta del cliente.`} No se puede cargar hasta que contesten o los quites de la ruta.
          </p>
        )}
      </Tarjeta>

      {error && (
        <div role="alert" className="flex flex-col gap-2 rounded-tarjeta border border-peligro/40 bg-peligro-suave p-4 text-base text-peligro">
          <p className="font-medium">{error}</p>
          {faltan.length > 0 && (
            <ul className="list-disc pl-5">
              {faltan.map((f) => (
                <li key={f.producto}>
                  {f.producto}: faltan {piezasTexto(f.faltan)}
                </li>
              ))}
            </ul>
          )}
          {faltan.length > 0 && (
            <div>
              <BotonEnlace variante="secundario" href={`/surtido?fecha=${ruta.fecha}`}>
                Ver qué hay que comprar
              </BotonEnlace>
            </div>
          )}
        </div>
      )}

      <Tarjeta aria-labelledby="paradas" className="flex flex-col gap-3">
        <h2 id="paradas" className="text-xl font-bold">
          Paradas, en el orden de entrega
        </h2>
        {ruta.paradas.length === 0 ? (
          <p className="text-base text-suave">Todavía no hay paradas.{editable && " Agrega pedidos abajo."}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {ruta.paradas.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2 rounded-xl border border-borde p-2">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-marca-suave text-lg font-bold text-marca-fuerte" aria-label={`Parada ${p.orden}`}>
                  {p.orden}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold [overflow-wrap:anywhere]">{p.cliente.nombre}</p>
                  <p className="text-sm text-suave [overflow-wrap:anywhere]">
                    {p.pedido ? `Pedido ${p.pedido.folio} · ${dinero(p.pedido.total)}` : "Cobro"}
                    {p.cliente.zona ? ` · ${p.cliente.zona.nombre}` : ""}
                    {p.km_desde_anterior ? ` · ${kmTexto(p.km_desde_anterior)}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {p.cliente.lat === null && <Insignia tono="aviso">Sin ubicación</Insignia>}
                    {p.pedido?.estado === "esperando_cliente" && (
                      <Link href={`/pedidos/${p.pedido.id}?volver=/rutas/${ruta.id}`}>
                        <Insignia tono="aviso">Esperando al cliente</Insignia>
                      </Link>
                    )}
                    {p.estado !== "pendiente" && <Insignia tono={p.estado === "visitada" ? "exito" : "peligro"}>{p.estado === "visitada" ? "Entregada" : p.estado === "fallida" ? "No se entregó" : "No se visitó"}</Insignia>}
                  </div>
                </div>
                {editable && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Boton variante="secundario" className="!px-3" aria-label={`Subir a ${p.cliente.nombre}`} disabled={i === 0 || ocupado !== null} onClick={() => mover(i, -1)}>
                      <ArrowUp aria-hidden className="size-5" />
                    </Boton>
                    <Boton variante="secundario" className="!px-3" aria-label={`Bajar a ${p.cliente.nombre}`} disabled={i === ruta.paradas.length - 1 || ocupado !== null} onClick={() => mover(i, 1)}>
                      <ArrowDown aria-hidden className="size-5" />
                    </Boton>
                    <Boton variante="fantasma" aria-label={`Quitar a ${p.cliente.nombre}`} disabled={ocupado !== null} onClick={() => void correr("quitar", llamar("DELETE", `/rutas/paradas/${p.id}`), "Parada quitada.")}>
                      Quitar
                    </Boton>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
        {editable && ruta.paradas.length > 1 && (
          <Boton variante="secundario" cargando={ocupado === "optimizar"} disabled={ocupado !== null} onClick={() => void optimizar()}>
            Ordenar para recorrer menos camino
          </Boton>
        )}
      </Tarjeta>

      {editable && (
        <Tarjeta aria-labelledby="candidatos" className="flex flex-col gap-3">
          <h2 id="candidatos" className="text-xl font-bold">
            Pedidos para el {fechaLarga(ruta.fecha)} sin ruta
          </h2>
          {!hayCandidatos ? (
            <p className="text-base text-suave">
              No hay pedidos confirmados sin ruta para ese día.{" "}
              <Link href="/pedidos?vista=por-confirmar" className="font-semibold underline">
                Ver pedidos
              </Link>
            </p>
          ) : (
            candidatos?.zonas.map((z) => (
              <div key={z.zona?.id ?? "sin"} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-bold">{z.zona?.nombre ?? "Sin zona"}</h3>
                  <Boton variante="secundario" disabled={ocupado !== null} onClick={() => agregar(z.pedidos.map((p) => p.id))}>
                    Agregar {z.pedidos.length === 1 ? "el pedido" : `los ${z.pedidos.length}`} de {z.zona?.nombre ?? "sin zona"}
                  </Boton>
                </div>
                {z.pedidos.map((p) => (
                  <Casilla
                    key={p.id}
                    etiqueta={`${p.cliente.nombre} · ${dinero(p.total)}`}
                    ayuda={`${p.folio}${p.tiene_ubicacion ? "" : " · sin ubicación"}${p.estado === "esperando_cliente" ? " · espera respuesta del cliente" : ""}`}
                    checked={seleccion.has(p.id)}
                    onChange={() => alternar(p.id)}
                  />
                ))}
              </div>
            ))
          )}
          {seleccion.size > 0 && (
            <div className="sticky bottom-0 -mx-4 border-t border-borde bg-superficie p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Boton ancho cargando={ocupado === "agregar"} onClick={() => agregar([...seleccion])}>
                Agregar a la ruta ({seleccion.size})
              </Boton>
            </div>
          )}
        </Tarjeta>
      )}

      {ruta.estado === "planeada" && puedePlanear && (
        <div className="flex flex-col gap-3">
          <Boton ancho cargando={ocupado === "cargar"} disabled={ruta.paradas.length === 0 || esperando.length > 0 || ocupado !== null} onClick={() => void correr("cargar", llamar("POST", `/rutas/${ruta.id}/cargar`), "Ruta cargada.")}>
            Cargar la ruta
          </Boton>
          <Boton variante="fantasma" disabled={ocupado !== null} onClick={() => setCancelando(true)}>
            Cancelar la ruta
          </Boton>
        </div>
      )}

      {ruta.estado === "cargada" && (
        <div className="flex flex-col gap-3">
          <BotonEnlace href={`/rutas/${ruta.id}/carga`}>Siguiente: hoja de carga</BotonEnlace>
          {puedePlanear && (
            <Boton variante="fantasma" disabled={ocupado !== null} onClick={() => setCancelando(true)}>
              Cancelar la ruta
            </Boton>
          )}
        </div>
      )}
      {(ruta.estado === "en_curso" || ruta.estado === "terminada") && (
        <BotonEnlace variante="secundario" href={`/rutas/${ruta.id}/carga`}>
          Ver la hoja de carga
        </BotonEnlace>
      )}

      <DialogoConfirmar
        abierto={cancelando}
        titulo="¿Cancelar la ruta?"
        texto="Los pedidos vuelven a quedar confirmados y sin ruta, listos para ponerlos en otra."
        confirmar="Sí, cancelar la ruta"
        peligro
        cargando={ocupado === "cancelar"}
        alConfirmar={() => {
          void correr("cancelar", llamar("POST", `/rutas/${ruta.id}/cancelar`), "Ruta cancelada.").then((x) => {
            setCancelando(false);
            if (x) router.push(`/rutas?fecha=${ruta.fecha}`);
          });
        }}
        alCerrar={() => setCancelando(false)}
      />
    </div>
  );
}

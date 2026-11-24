import { Ban, Check, CircleCheck, Clock, PackageCheck, Truck, type LucideIcon } from "lucide-react";
import { AccionesPedido } from "@/componentes/publico/acciones-pedido";
import { Encabezado, ErrorPublico } from "@/componentes/publico/encabezado";
import { hora } from "@/componentes/publico/formato-publico";
import { ResponderFaltante } from "@/componentes/publico/responder-faltante";
import { fechaHora, fecha } from "@/componentes/productos/formato";
import { apiPublico } from "@/lib/api-publico";
import { claveCliente } from "@/lib/clave-cliente";
import { dinero } from "@/lib/dinero";
import { T } from "@/lib/textos-publico";
import type { ClientePublico, Seguimiento } from "@/lib/tipos";

export const metadata = { title: "Mi pedido" };

const ICONOS: Record<string, LucideIcon> = { entregado: CircleCheck, en_ruta: Truck, cargado: Truck, surtiendo: PackageCheck, cancelado: Ban, no_entregado: Ban };

/** C11: seguimiento con palabras simples e icono por etapa; C12 faltantes; C16/C20 «lo de siempre»; P32 editar/cancelar solo en `recibido`. */
export default async function PedidoDetalle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return <ErrorPublico mensaje="No encontramos ese pedido." />;
  const [c, r] = await Promise.all([apiPublico<ClientePublico>("/cliente"), apiPublico<Seguimiento>(`/pedidos/${id}`)]);
  if (!c.ok) return <ErrorPublico mensaje={c.error.mensaje} />;
  if (!r.ok) return <ErrorPublico mensaje={r.error.status === 404 ? "No encontramos ese pedido." : r.error.mensaje} />;
  const p = r.datos;
  const propuesto = p.etapa === "propuesto";
  const Icono = ICONOS[p.etapa] ?? Clock;
  const vista = p.borrador;
  const cambios = new Map((vista?.lineas ?? []).filter((l) => l.cambio).map((l) => [String(l.presentacion_id), l]));

  const lineasPedido = propuesto && vista
    ? vista.lineas.map((l) => ({ presentacion_id: l.presentacion_id, cantidad: l.cantidad }))
    : p.lineas.filter((l) => l.cantidad > 0).map((l) => ({ presentacion_id: l.presentacion_id, cantidad: l.cantidad }));

  return (
    <main className="flex flex-col gap-5">
      <Encabezado negocio={c.datos.negocio.nombre} actual="pedidos" />
      <header>
        <h1 className="text-3xl font-bold">{T.pedidoNumero(p.folio)}</h1>
        <p className="mt-3 flex items-center gap-3 rounded-tarjeta bg-marca-suave p-4 font-titulo text-2xl font-bold leading-tight text-marca-fuerte">
          <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-marca text-white shadow-boton">
            <Icono className="size-7" />
          </span>
          <span className="min-w-0 [overflow-wrap:anywhere]">{p.etiqueta}</span>
        </p>
        {p.etapa === "entregado" && p.recibio && <p className="mt-2 text-lg">{T.recibio(p.recibio)}</p>}
        {p.reparto && (
          <div className="mt-3 rounded-tarjeta border border-borde bg-superficie p-4 text-lg shadow-tarjeta">
            <p className="font-bold">{T.paradaDe(p.reparto.parada, p.reparto.paradas)}</p>
            <p>{T.llegaEntre(hora(p.reparto.llegada_estimada_desde), hora(p.reparto.llegada_estimada_hasta))}</p>
            <p className="text-base text-suave">{T.antesDeTi(p.reparto.antes_que_tu)}</p>
          </div>
        )}
        {p.fecha_entrega && !p.reparto && p.etapa !== "entregado" && p.etapa !== "cancelado" && (
          <p className="mt-2 text-lg">
            {T.entregaFecha}: {fecha(p.fecha_entrega)}
          </p>
        )}
      </header>

      {p.faltantes.map((f) => (
        <ResponderFaltante key={f.propuesta_id} faltante={f} accionPredeterminada={c.datos.faltante_accion_predeterminada} />
      ))}

      {propuesto && vista?.hay_cambios && <p role="status" className="rounded-tarjeta bg-marca-suave p-3 text-lg font-bold text-marca-fuerte">{T.preciosCambiaron}</p>}
      {propuesto && vista?.quitadas.map((q) => <p key={q.producto} className="text-base font-medium text-peligro">{T.quitadoHoy(q.producto)}</p>)}

      <section aria-labelledby="lineas">
        <h2 id="lineas" className="mb-2 text-xl font-bold">
          {T.productos}
        </h2>
        <ul className="flex flex-col divide-y divide-borde rounded-tarjeta border border-borde bg-superficie shadow-tarjeta">
          {(propuesto && vista
            ? vista.lineas.map((l) => ({ k: String(l.presentacion_id), nombre: `${l.producto} ${l.presentacion}`, cantidad: l.cantidad, importe: null as string | null, precio: l.precio_actual, quitada: false, nota: null as string | null }))
            : p.lineas.map((l, i) => ({ k: `${i}`, nombre: `${l.producto} ${l.presentacion}`, cantidad: l.cantidad || l.cantidad_pedida, importe: l.importe, precio: l.precio_unitario ?? "", quitada: l.cantidad === 0, nota: l.motivo_ajuste }))
          ).map((l) => {
            const c = cambios.get(l.k);
            return (
              <li key={l.k} className="flex flex-col gap-0.5 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={`text-base [overflow-wrap:anywhere] ${l.quitada ? "text-suave line-through" : ""}`}>{T.linea(l.cantidad, l.nombre)}</span>
                  {l.importe != null && !l.quitada && <span className="cifra shrink-0 text-lg font-bold">{dinero(l.importe)}</span>}
                </div>
                {l.quitada && <span className="text-sm text-suave">{T.quitadoDelPedido}</span>}
                {l.nota && <span className="text-sm text-suave [overflow-wrap:anywhere]">{l.nota}</span>}
                {c && <span className={`text-base font-semibold ${c.cambio === "sube" ? "text-peligro" : "text-exito"}`}>{T.antesAhora(dinero(c.precio_anterior), dinero(c.precio_actual))}</span>}
                {propuesto && l.precio && <span className="text-base">{dinero(l.precio)}</span>}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 text-lg font-bold">
          <span>{T.total}</span>
          <span className="cifra text-3xl">{dinero(propuesto && vista ? vista.total_actual : p.total)}</span>
        </p>
      </section>

      {p.linea_tiempo.length > 0 && (
        <ol aria-label="Cómo va tu pedido" className="flex flex-col">
          {p.linea_tiempo.map((t, i) => {
            const ultima = i === p.linea_tiempo.length - 1;
            return (
              // Punto + linea: las etapas pasadas con palomita, la mas reciente con anillo (no solo color: tambien la palomita).
              <li key={`${t.etapa}-${t.en}`} style={{ "--i": i } as React.CSSProperties} className="etapa-entra relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0">
                {!ultima && <span aria-hidden className="absolute bottom-0 left-[0.8125rem] top-7 w-0.5 bg-marca" />}
                <span aria-hidden className={`flex size-7 items-center justify-center rounded-full ${ultima ? "border-[3px] border-marca bg-superficie" : "bg-marca text-white"}`}>
                  {!ultima && <Check className="size-4" strokeWidth={3} />}
                </span>
                <span className="min-w-0 pt-0.5 text-base">
                  <span className={`font-semibold [overflow-wrap:anywhere] ${ultima ? "text-marca-fuerte" : ""}`}>{t.etiqueta || T.etapaDesconocida}</span>{" "}
                  <span className="text-suave">{fechaHora(t.en)}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <AccionesPedido
        claveCarrito={claveCliente(c.datos)}
        id={id}
        editable={p.editable}
        lineas={lineasPedido}
        propuesto={propuesto}
        totalVisto={propuesto && vista ? vista.total_actual : (p.total ?? "")}
      />
    </main>
  );
}

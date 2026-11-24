import Link from "next/link";
import { conVolver } from "@/componentes/cobro/volver";
import { AccionesPedido } from "@/componentes/pedidos/acciones-pedido";
import { PropuestasPedido } from "@/componentes/pedidos/propuestas-pedido";
import { EVENTO_PEDIDO, ESTADO_PEDIDO, ORIGEN_PEDIDO } from "@/componentes/pedidos/estados";
import { fecha, fechaHora } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { BotonEnlace } from "@/componentes/ui/boton";
import { Insignia } from "@/componentes/ui/insignia";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import { dinero } from "@/lib/dinero";
import type { ClienteDetalle, PedidoDetalle } from "@/lib/tipos";

export const metadata = { title: "Pedido · ChevechevePOS" };

export default async function Pedido({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ accion?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "pedidos.ver")) return <SinPermiso />;
  if (!/^\d{1,18}$/.test(id)) return <AvisoError reintentar={false} mensaje="No encontramos ese pedido." />;

  const r = await apiServidor<PedidoDetalle>(`/pedidos/${id}`);
  if (!r.ok) return <AvisoError mensaje={r.error.status === 404 ? "No encontramos ese pedido." : r.error.mensaje} reintentar={r.error.status !== 404 && r.error.status !== 403} />;
  const p = r.datos;
  // Dia sugerido para confirmar = su proximo dia de visita (solo si se puede leer al cliente).
  const c = tiene(yo.datos, "clientes.ver") ? await apiServidor<ClienteDetalle>(`/clientes/${p.cliente.id}`) : null;
  const diaSugerido = (c?.ok && c.datos.proxima_visita) || "";
  const estado = ESTADO_PEDIDO[p.estado] ?? { texto: p.estado, tono: "neutro" as const };

  return (
    <main className="flex flex-col gap-4">
      <Titulo titulo={`Pedido ${p.folio}`}>
        <div className="flex flex-wrap gap-2">
          {p.entrega_tipo === "recoge" && p.estado === "confirmado" && tiene(yo.datos, "ventas.crear") && (
            <BotonEnlace href={conVolver(`/cobrar?pedido=${p.id}`, `/pedidos/${p.id}`)}>Entregar y cobrar</BotonEnlace>
          )}
          <BotonEnlace variante="secundario" href="/pedidos">
            Volver a pedidos
          </BotonEnlace>
        </div>
      </Titulo>

      <Tarjeta className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Insignia tono={estado.tono}>{estado.texto}</Insignia>
          <span className="text-base text-suave">{ORIGEN_PEDIDO[p.origen]}</span>
        </div>
        <p className="text-lg font-bold [overflow-wrap:anywhere]">
          {tiene(yo.datos, "clientes.ver") ? (
            <Link href={`/clientes/${p.cliente.id}`} className="underline-offset-2 hover:underline">
              {p.cliente.nombre}
            </Link>
          ) : (
            p.cliente.nombre
          )}
        </p>
        {p.cliente.telefono_whatsapp && <p className="text-base text-suave">WhatsApp {p.cliente.telefono_whatsapp}</p>}
        {p.cliente.saldo && p.cliente.saldo !== "0.00" && <p className="text-base">Debe {dinero(p.cliente.saldo)}</p>}
        <p className="text-base">
          {p.fecha_entrega ? `Entrega ${fecha(p.fecha_entrega)}` : p.fecha_solicitada ? `Pidió para ${fecha(p.fecha_solicitada)}` : "Sin día de entrega"} ·{" "}
          {p.entrega_tipo === "recoge" ? "Pasa a recogerlo" : "Se lo llevamos"}
        </p>
        {p.notas && <p className="mt-1 rounded-xl bg-fondo p-2 text-base [overflow-wrap:anywhere]">Nota del cliente: {p.notas}</p>}
      </Tarjeta>

      <AccionesPedido pedido={p} diaSugerido={diaSugerido} puedeGestionar={tiene(yo.datos, "pedidos.gestionar")} accionInicial={sp.accion} />
      <PropuestasPedido pedido={p} puedeGestionar={tiene(yo.datos, "pedidos.gestionar")} />

      <Tarjeta aria-labelledby="lineas">
        <h2 id="lineas" className="mb-2 text-lg font-bold">
          Productos
        </h2>
        <ul className="flex flex-col divide-y divide-borde">
          {p.lineas.map((l) => {
            const faltaStock = l.estado === "activa" && l.disponible_piezas != null && l.factor != null && l.disponible_piezas < l.cantidad * l.factor;
            return (
              <li key={l.id} className="flex flex-col gap-0.5 py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={`text-base [overflow-wrap:anywhere] ${l.cantidad === 0 ? "text-suave line-through" : ""}`}>
                    {l.cantidad || l.cantidad_pedida} × {l.producto} · {l.presentacion}
                  </span>
                  <span className="shrink-0 text-lg font-bold">{dinero(l.importe)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-suave">
                  <span>{dinero(l.precio_unitario)} c/u</span>
                  {l.cantidad !== l.cantidad_pedida && <span>Pidió {l.cantidad_pedida}</span>}
                  {l.estado === "faltante" && <Insignia tono="aviso">Esperando al cliente</Insignia>}
                  {l.estado === "quitada" && <Insignia tono="peligro">Quitado</Insignia>}
                  {l.estado === "sustituida" && <Insignia>Cambiado por otro</Insignia>}
                  {faltaStock && <Insignia tono="peligro">Hay {l.disponible_piezas} piezas: falta</Insignia>}
                  {l.motivo_ajuste && <span className="[overflow-wrap:anywhere]">{l.motivo_ajuste}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 flex items-baseline justify-between text-lg font-bold">
          <span>Total</span>
          <span className="text-2xl">{dinero(p.total)}</span>
        </p>
      </Tarjeta>

      <Tarjeta aria-labelledby="historial">
        <h2 id="historial" className="mb-2 text-lg font-bold">
          Historial
        </h2>
        <ol className="flex flex-col gap-1 border-l-2 border-borde pl-4">
          {p.eventos.map((ev, i) => (
            <li key={ev.id ?? i} className="text-base">
              <span className="font-semibold">{EVENTO_PEDIDO[ev.tipo] ?? ev.tipo}</span> <span className="text-suave">{fechaHora(ev.creado_en)}</span>
            </li>
          ))}
        </ol>
      </Tarjeta>
    </main>
  );
}

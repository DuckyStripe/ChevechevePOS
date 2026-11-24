import Link from "next/link";
import { BotonImprimirTicket } from "@/componentes/ticket/imprimir-ticket";
import { Ticket80mm } from "@/componentes/ticket/ticket-80mm";
import { AccionesVenta } from "@/componentes/ventas/acciones-venta";
import { fechaHora } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { BotonEnlace } from "@/componentes/ui/boton";
import { Insignia } from "@/componentes/ui/insignia";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import { dinero } from "@/lib/dinero";
import type { Ticket, VentaDetalle } from "@/lib/tipos";

export const metadata = { title: "Venta · ChevechevePOS" };

const METODO: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", credito: "Fiado" };
const nombre = (c: VentaDetalle["cliente"]) => (c == null ? "Sin cliente" : typeof c === "string" ? c : c.nombre);

export default async function Venta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "ventas.ver")) return <SinPermiso />;
  if (!/^\d{1,18}$/.test(id)) return <AvisoError reintentar={false} mensaje="No encontramos esa venta." />;
  const r = await apiServidor<VentaDetalle>(`/ventas/${id}`);
  if (!r.ok) return <AvisoError mensaje={r.error.status === 404 ? "No encontramos esa venta." : r.error.mensaje} reintentar={r.error.status !== 404 && r.error.status !== 403} />;
  const v = r.datos;
  const tk = v.estado === "completada" ? await apiServidor<Ticket>(`/ventas/${id}/ticket`) : null;
  const clienteId = typeof v.cliente === "object" && v.cliente ? String(v.cliente.id) : null;

  return (
    <main className="flex flex-col gap-4">
      <Titulo titulo={`Venta ${v.folio}`}>
        <BotonEnlace variante="secundario" href="/ventas">Volver a ventas</BotonEnlace>
      </Titulo>
      <Tarjeta className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          {v.estado === "cancelada" ? <Insignia tono="peligro">Cancelada</Insignia> : <Insignia tono="exito">Completada</Insignia>}
          <span className="text-base text-suave">{fechaHora(v.creado_en)}</span>
        </div>
        <p className="text-lg font-bold [overflow-wrap:anywhere]">
          {clienteId && tiene(yo.datos, "clientes.ver") ? <Link href={`/clientes/${clienteId}`} className="hover:underline">{nombre(v.cliente)}</Link> : nombre(v.cliente)}
        </p>
        <p className="text-3xl font-extrabold tabular-nums">{dinero(v.total)}</p>
        {v.motivo_cancelacion && <p className="text-base">Motivo de la cancelación: {v.motivo_cancelacion}</p>}
        {v.utilidad != null && <p className="text-base text-suave">Ganancia: {dinero(v.utilidad)}</p>}
      </Tarjeta>
      <AccionesVenta venta={v} puedeCancelar={tiene(yo.datos, "ventas.cancelar")} puedeDevolver={tiene(yo.datos, "ventas.devolver")} />
      <Tarjeta aria-labelledby="lineas">
        <h2 id="lineas" className="mb-2 text-lg font-bold">Productos</h2>
        <ul className="flex flex-col divide-y divide-borde">
          {v.lineas.map((l) => (
            <li key={l.id} className="flex items-baseline justify-between gap-3 py-2 text-base">
              <span className="[overflow-wrap:anywhere]">{l.cantidad} × {l.producto} · {l.presentacion}{l.piezas_devueltas ? ` (devueltas ${l.piezas_devueltas})` : ""}</span>
              <strong className="shrink-0 tabular-nums">{dinero(l.importe)}</strong>
            </li>
          ))}
        </ul>
      </Tarjeta>
      <Tarjeta aria-labelledby="pagos">
        <h2 id="pagos" className="mb-2 text-lg font-bold">Cómo pagó</h2>
        <ul className="flex flex-col divide-y divide-borde">
          {v.pagos.map((p, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 py-2 text-base">
              <span>{METODO[p.metodo] ?? p.metodo}{p.referencia ? ` · ${p.referencia}` : ""}</span>
              <strong className="tabular-nums">{dinero(p.monto)}</strong>
            </li>
          ))}
        </ul>
      </Tarjeta>
      {tk?.ok && (
        <Tarjeta aria-labelledby="ticket" className="flex flex-col gap-3">
          <h2 id="ticket" className="text-lg font-bold">Ticket</h2>
          <Ticket80mm t={tk.datos} />
          <div className="flex justify-center"><BotonImprimirTicket texto="Reimprimir ticket" /></div>
        </Tarjeta>
      )}
    </main>
  );
}

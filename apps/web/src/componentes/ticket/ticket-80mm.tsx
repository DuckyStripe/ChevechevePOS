import { fechaHora, nombreDe } from "@/componentes/productos/formato";
import { dinero } from "@/lib/dinero";
import type { Ticket } from "@/lib/tipos";

const METODO: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", credito: "Fiado" };

/**
 * Ticket de mostrador: pinta la forma `Ticket` tal cual (importes string de la API, sin sumar y sin impuestos).
 * En pantalla es una tarjeta angosta; al imprimir (`.hoja-80[data-ticket]`, `globals.css`) sale solo a 80 mm.
 * Encabezado y pie los manda la API desde la configuración del negocio.
 */
export function Ticket80mm({ t }: { t: Ticket }) {
  const n = t.negocio;
  const pie = n.pie;
  const cliente = t.cliente ? nombreDe(t.cliente) : null;
  const cobro = t.pagos.find((p) => p.metodo === "efectivo");
  return (
    <article data-ticket className="hoja-80 mx-auto flex w-full max-w-[22rem] flex-col gap-2 rounded-tarjeta border border-borde bg-superficie p-4 text-base">
      <header className="flex flex-col items-center gap-0.5 text-center">
        {n.nombre && <p className="text-lg font-extrabold [overflow-wrap:anywhere]">{n.nombre}</p>}
        {n.direccion && <p className="[overflow-wrap:anywhere]">{n.direccion}</p>}
        {n.telefono && <p>Tel. {n.telefono}</p>}
      </header>
      <div className="border-y border-dashed border-borde py-1.5">
        <p className="flex justify-between gap-2"><span>Venta</span><strong>{t.folio}</strong></p>
        <p>{fechaHora(t.fecha)}</p>
        {t.usuario && <p>Atendió: {nombreDe(t.usuario)}</p>}
        {cliente && <p className="[overflow-wrap:anywhere]">Cliente: {cliente}</p>}
      </div>
      <ul className="flex flex-col gap-1.5">
        {t.lineas.map((l, i) => (
          <li key={i} className="flex flex-col">
            <span className="[overflow-wrap:anywhere]">{l.producto} · {l.presentacion}</span>
            <span className="flex justify-between gap-2 tabular-nums">
              <span>{l.cantidad} × {dinero(l.precio_unitario)}</span>
              <span>{dinero(l.importe)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="flex justify-between gap-2 border-t border-dashed border-borde pt-1.5 text-xl font-extrabold tabular-nums"><span>Total</span><span>{dinero(t.total)}</span></p>
      <ul className="flex flex-col gap-0.5">
        {t.pagos.map((p, i) => (
          <li key={i} className="flex justify-between gap-2 tabular-nums">
            <span>{METODO[p.metodo] ?? p.metodo}{p.referencia ? ` · ${p.referencia}` : ""}</span>
            <span>{dinero(p.monto)}</span>
          </li>
        ))}
        {cobro && t.efectivo_recibido != null && <li className="flex justify-between gap-2 tabular-nums"><span>Recibido</span><span>{dinero(t.efectivo_recibido)}</span></li>}
        {t.cambio != null && Number(t.cambio) > 0 && <li className="flex justify-between gap-2 font-bold tabular-nums"><span>Cambio</span><span>{dinero(t.cambio)}</span></li>}
        {t.saldo_credito != null && <li className="flex justify-between gap-2 tabular-nums"><span>Su saldo a crédito</span><span>{dinero(t.saldo_credito)}</span></li>}
      </ul>
      {pie && <p className="border-t border-dashed border-borde pt-1.5 text-center [overflow-wrap:anywhere]">{pie}</p>}
    </article>
  );
}

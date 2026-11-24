import { fecha } from "@/componentes/productos/formato";
import { dinero } from "@/lib/dinero";
import type { EstadoCuenta } from "@/lib/tipos";

/** Hoja de estado de cuenta (la misma `fn_estado_cuenta` que ve el cliente). En pantalla es una lista; al imprimir, 80 mm. */
export function HojaEstadoCuenta({ e }: { e: EstadoCuenta }) {
  return (
    <article className="hoja-80 flex flex-col gap-2 text-base">
      <header>
        {e.negocio?.nombre && <p className="font-bold">{e.negocio.nombre}</p>}
        <p className="font-semibold [overflow-wrap:anywhere]">Estado de cuenta de {e.cliente.nombre}</p>
        <p className="text-suave">Últimos 90 días</p>
      </header>
      <p className="flex justify-between gap-3"><span>Saldo al inicio</span><strong className="tabular-nums">{dinero(e.saldo_inicial)}</strong></p>
      {e.movimientos.length === 0 ? (
        <p className="text-suave">Sin movimientos en este tiempo.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-borde border-y border-borde">
          {e.movimientos.map((m, i) => (
            <li key={i} className="flex flex-col gap-0.5 py-1.5">
              <span className="flex justify-between gap-3">
                <span className="[overflow-wrap:anywhere]">{fecha(m.fecha)} · {m.concepto ?? m.tipo}{m.folio ? ` (${m.folio})` : ""}</span>
                <span className="shrink-0 tabular-nums">{m.cargo ? `+${dinero(m.cargo)}` : m.abono ? `-${dinero(m.abono)}` : ""}</span>
              </span>
              <span className="text-right text-sm text-suave tabular-nums">Saldo {dinero(m.saldo)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="flex justify-between gap-3 text-lg"><span>Debe</span><strong className="tabular-nums">{dinero(e.saldo_final)}</strong></p>
      {Number(e.vencido) > 0 && <p className="flex justify-between gap-3"><span>De eso, vencido</span><strong className="tabular-nums">{dinero(e.vencido)}</strong></p>}
    </article>
  );
}

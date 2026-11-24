import { dinero } from "@/lib/dinero";
import type { ResumenTurno } from "@/lib/tipos";

const Fila = ({ texto, valor, fuerte = false }: { texto: string; valor: string | null | undefined; fuerte?: boolean }) => (
  <div className={`flex items-baseline justify-between gap-3 py-1.5 ${fuerte ? "text-lg font-bold" : "text-base"}`}>
    <dt>{texto}</dt>
    <dd className="tabular-nums">{dinero(valor)}</dd>
  </div>
);

/** Lo que dice la API del turno (esperado, ventas por método, abonos y movimientos); la web no suma nada. */
export function ResumenCaja({ r }: { r: ResumenTurno }) {
  return (
    <dl className="flex flex-col divide-y divide-borde">
      <Fila texto="Con cuánto empezó" valor={r.fondo_inicial} />
      <Fila texto={`Ventas en efectivo (${r.ventas.num} ${Number(r.ventas.num) === 1 ? "venta" : "ventas"})`} valor={r.ventas.efectivo} />
      <Fila texto="Ventas por transferencia" valor={r.ventas.transferencia} />
      <Fila texto="Ventas con tarjeta" valor={r.ventas.tarjeta} />
      <Fila texto="Ventas a fiado" valor={r.ventas.credito} />
      <Fila texto="Abonos en efectivo" valor={r.abonos.efectivo} />
      <Fila texto="Abonos por transferencia" valor={r.abonos.transferencia} />
      <Fila texto="Abonos con tarjeta" valor={r.abonos.tarjeta} />
      <Fila texto="Entradas de dinero" valor={r.entradas} />
      <Fila texto="Gastos" valor={r.salidas} />
      <Fila texto="Retiros" valor={r.retiros} />
      <Fila texto="Devoluciones en efectivo" valor={r.reembolsos} />
      <Fila texto="Efectivo que debe haber" valor={r.efectivo_esperado} fuerte />
      {r.efectivo_contado != null && <Fila texto="Efectivo contado" valor={r.efectivo_contado} fuerte />}
      {r.diferencia != null && <Fila texto="Diferencia (contado menos lo que debía haber)" valor={r.diferencia} fuerte />}
    </dl>
  );
}

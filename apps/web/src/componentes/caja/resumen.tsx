import { dinero } from "@/lib/dinero";
import type { ResumenTurno } from "@/lib/tipos";

const Fila = ({ texto, valor, fuerte = false }: { texto: string; valor: string | null | undefined; fuerte?: boolean }) => (
  <div className={`flex items-baseline justify-between gap-3 py-1.5 ${fuerte ? "text-lg font-bold" : "text-base"}`}>
    <dt className="min-w-0 [overflow-wrap:anywhere]">{texto}</dt>
    <dd className="cifra shrink-0 [overflow-wrap:anywhere]">{dinero(valor)}</dd>
  </div>
);

const Grupo = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <div>
    <h3 className="pb-1 text-sm font-bold uppercase tracking-wide text-suave">{titulo}</h3>
    <dl className="flex flex-col divide-y divide-borde">{children}</dl>
  </div>
);

/**
 * Lo que dice la API del turno (esperado, ventas por método, abonos y movimientos); la web no suma nada.
 * Patrón de chacha: la cifra que importa (efectivo esperado) arriba y grande; el detalle agrupado debajo.
 * `plano` = lista simple sin bloque destacado, para la hoja de 80 mm.
 */
export function ResumenCaja({ r, plano = false }: { r: ResumenTurno; plano?: boolean }) {
  const ventas = Number(r.ventas.num);
  const filas = (
    <>
      <Grupo titulo="Inicio">
        <Fila texto="Con cuánto empezó" valor={r.fondo_inicial} />
      </Grupo>
      <Grupo titulo="Ventas">
        <Fila texto={`En efectivo (${r.ventas.num} ${ventas === 1 ? "venta" : "ventas"})`} valor={r.ventas.efectivo} />
        <Fila texto="Por transferencia" valor={r.ventas.transferencia} />
        <Fila texto="Con tarjeta" valor={r.ventas.tarjeta} />
        <Fila texto="A fiado" valor={r.ventas.credito} />
      </Grupo>
      <Grupo titulo="Abonos">
        <Fila texto="En efectivo" valor={r.abonos.efectivo} />
        <Fila texto="Por transferencia" valor={r.abonos.transferencia} />
        <Fila texto="Con tarjeta" valor={r.abonos.tarjeta} />
      </Grupo>
      <Grupo titulo="Movimientos de caja">
        <Fila texto="Entradas de dinero" valor={r.entradas} />
        <Fila texto="Gastos" valor={r.salidas} />
        <Fila texto="Retiros" valor={r.retiros} />
        <Fila texto="Devoluciones en efectivo" valor={r.reembolsos} />
      </Grupo>
    </>
  );

  if (plano) {
    return (
      <div className="flex flex-col gap-3">
        {filas}
        <dl className="flex flex-col divide-y divide-borde">
          <Fila texto="Efectivo que debe haber" valor={r.efectivo_esperado} fuerte />
          {r.efectivo_contado != null && <Fila texto="Efectivo contado" valor={r.efectivo_contado} fuerte />}
          {r.diferencia != null && <Fila texto="Diferencia (contado menos lo que debía haber)" valor={r.diferencia} fuerte />}
        </dl>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-tarjeta bg-marca-suave p-4">
        <p className="text-base font-semibold">Efectivo que debe haber</p>
        <p className="cifra text-4xl font-extrabold leading-tight [overflow-wrap:anywhere]">{dinero(r.efectivo_esperado)}</p>
        {r.efectivo_contado != null && (
          <dl className="mt-2 flex flex-col divide-y divide-borde border-t border-borde">
            <Fila texto="Efectivo contado" valor={r.efectivo_contado} fuerte />
            {r.diferencia != null && <Fila texto="Diferencia (contado menos lo que debía haber)" valor={r.diferencia} fuerte />}
          </dl>
        )}
      </div>
      {filas}
    </div>
  );
}

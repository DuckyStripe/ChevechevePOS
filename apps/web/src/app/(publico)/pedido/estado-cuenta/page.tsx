import Link from "next/link";
import { Encabezado, ErrorPublico } from "@/componentes/publico/encabezado";
import { fecha } from "@/componentes/productos/formato";
import { apiPublico } from "@/lib/api-publico";
import { dinero } from "@/lib/dinero";
import { T } from "@/lib/textos-publico";
import type { ClientePublico, EstadoCuenta } from "@/lib/tipos";

export const metadata = { title: "Mi cuenta" };

/** Nombre llano de cada movimiento: nunca el tipo ni el folio a secas (C6). */
function etiqueta(m: EstadoCuenta["movimientos"][number]): string {
  if (m.tipo === "saldo_inicial") return m.concepto ?? T.cuentaAnterior;
  if (m.tipo === "venta") return T.cuentaCompra;
  if (m.tipo === "devolucion" || m.folio?.startsWith("D")) return T.cuentaDevolucion;
  if (m.tipo === "abono") return T.cuentaPago;
  return T.cuentaMovimiento;
}

/** C15: «Mi cuenta». Server Component sin JS de cliente (C9): cargos, abonos y saldo corrido de 90 días. */
export default async function MiCuenta() {
  const [c, r] = await Promise.all([apiPublico<ClientePublico>("/cliente"), apiPublico<EstadoCuenta>("/estado-cuenta")]);
  if (!c.ok) return <ErrorPublico mensaje={c.error.mensaje} />;
  if (!r.ok) return <ErrorPublico mensaje={r.error.mensaje} />;
  const e = r.datos;
  const debe = Number(e.saldo_final) > 0;

  return (
    <main className="flex flex-col gap-4">
      <Encabezado negocio={c.datos.negocio.nombre} />
      <h1 className="text-2xl font-bold">{T.cuentaTitulo}</h1>
      <section className="rounded-tarjeta border border-borde bg-superficie p-4" aria-live="polite">
        <p className="text-lg">{debe ? T.cuentaDebes : T.cuentaNoDebes}</p>
        {debe && <p className="text-4xl font-extrabold tabular-nums">{dinero(e.saldo_final)}</p>}
        {Number(e.vencido) > 0 && <p className="text-lg font-semibold text-peligro">{T.cuentaVencido(dinero(e.vencido))}</p>}
      </section>
      <section aria-labelledby="mov">
        <h2 id="mov" className="mb-2 text-lg font-bold">{T.cuentaDesde}</h2>
        {e.movimientos.length === 0 ? (
          <p className="rounded-tarjeta border border-dashed border-borde p-6 text-center text-base text-suave">{T.cuentaVacia}</p>
        ) : (
          <>
            <p className="mb-1 text-base text-suave">{T.cuentaInicio} {dinero(e.saldo_inicial)}</p>
            <ul className="flex flex-col divide-y divide-borde rounded-tarjeta border border-borde bg-superficie">
              {e.movimientos.map((m, i) => (
                <li key={i} className="flex items-start justify-between gap-3 p-3">
                  <span className="min-w-0 text-base [overflow-wrap:anywhere]">
                    <span className="font-semibold">{etiqueta(m)}</span>
                    <span className="block text-suave">{fecha(m.fecha)}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`block text-lg font-bold tabular-nums ${m.abono ? "text-exito" : ""}`}>{m.abono ? `-${dinero(m.abono)}` : `+${dinero(m.cargo)}`}</span>
                    <span className="block text-sm text-suave tabular-nums">{T.cuentaSaldo(dinero(m.saldo))}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <Link href="/pedido/mis-pedidos" className="inline-flex min-h-tocable items-center justify-center rounded-xl border border-borde bg-superficie text-base font-semibold">
        {T.misPedidos}
      </Link>
    </main>
  );
}

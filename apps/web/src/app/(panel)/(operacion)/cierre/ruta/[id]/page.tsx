import { ResumenCaja } from "@/componentes/caja/resumen";
import { Liquidar } from "@/componentes/cierre/liquidar";
import { fechaHora } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { BotonEnlace } from "@/componentes/ui/boton";
import { Insignia } from "@/componentes/ui/insignia";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import { dinero } from "@/lib/dinero";
import type { ResumenTurno, RutaDetalle } from "@/lib/tipos";

export const metadata = { title: "Liquidar ruta · ChevechevePOS" };

const MOV: Record<string, string> = { entrada: "Entró dinero", salida: "Gasto", retiro: "Retiro", reembolso: "Devolución" };

/** Esperado (lo da la API) contra contado, ventas por método, abonos, gastos, transferencias con foto y producto que regresa. */
export default async function LiquidarRuta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "rutas.liquidar")) return <SinPermiso />;
  if (!/^\d{1,18}$/.test(id)) return <AvisoError reintentar={false} mensaje="No encontramos esa ruta." />;
  const [ruta, liq] = await Promise.all([apiServidor<RutaDetalle>(`/rutas/${id}`), apiServidor<ResumenTurno>(`/rutas/${id}/liquidacion`)]);
  if (!ruta.ok) return <AvisoError mensaje={ruta.error.status === 404 ? "No encontramos esa ruta." : ruta.error.mensaje} reintentar={ruta.error.status !== 404} />;
  if (!liq.ok) return <AvisoError mensaje={liq.error.status === 404 ? "Esa ruta todavía no tiene turno: nunca salió." : liq.error.mensaje} reintentar={liq.error.status !== 404} />;
  const r = ruta.datos;
  const l = liq.datos;

  return (
    <main className="flex flex-col gap-4">
      <Titulo titulo={`Liquidar ${r.nombre ?? `ruta ${r.folio}`}`} ayuda={`Reparte ${r.repartidor.nombre} · ${r.entregadas} de ${r.paradas} entregadas`}>
        <BotonEnlace variante="secundario" href="/cierre">Volver al cierre</BotonEnlace>
      </Titulo>

      <Tarjeta aria-labelledby="cuentas" className="flex flex-col gap-2">
        <h2 id="cuentas" className="text-xl font-bold">Las cuentas de la ruta</h2>
        <ResumenCaja r={l} />
      </Tarjeta>

      {l.transferencias && l.transferencias.length > 0 && (
        <Tarjeta aria-labelledby="transf" className="flex flex-col gap-2">
          <h2 id="transf" className="text-xl font-bold">Transferencias</h2>
          <ul className="flex flex-col divide-y divide-borde">
            {l.transferencias.map((t) => (
              <li key={`${t.folio}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-base">
                <span className="[overflow-wrap:anywhere]">{t.cliente} · {t.folio}{t.referencia ? ` · ${t.referencia}` : ""}</span>
                <span className="flex items-center gap-2">
                  {t.comprobante ? <a href={`/api/comprobantes/${t.comprobante}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-marca-fuerte underline">Ver foto</a> : <span className="text-suave">Sin foto</span>}
                  <Insignia tono={t.verificado ? "exito" : "neutro"}>{t.verificado ? "Verificada" : "Sin verificar"}</Insignia>
                  <strong className="tabular-nums">{dinero(t.monto)}</strong>
                </span>
              </li>
            ))}
          </ul>
          {tiene(yo.datos, "cobranza.verificar") && <BotonEnlace variante="secundario" href="/cierre/transferencias">Verificarlas en el banco</BotonEnlace>}
        </Tarjeta>
      )}

      {l.movimientos && l.movimientos.length > 0 && (
        <Tarjeta aria-labelledby="gastos" className="flex flex-col gap-2">
          <h2 id="gastos" className="text-xl font-bold">Gastos y movimientos</h2>
          <ul className="flex flex-col divide-y divide-borde">
            {l.movimientos.map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-base">
                <span className="[overflow-wrap:anywhere]">{MOV[m.tipo] ?? m.tipo}{m.motivo ? `: ${m.motivo}` : ""} · {fechaHora(m.creado_en)}</span>
                <strong className="tabular-nums">{dinero(m.monto)}</strong>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {l.devoluciones_producto && l.devoluciones_producto.length > 0 && (
        <Tarjeta aria-labelledby="regresa" className="flex flex-col gap-2">
          <h2 id="regresa" className="text-xl font-bold">Producto que regresa a la bodega</h2>
          <ul className="flex flex-col divide-y divide-borde">
            {l.devoluciones_producto.map((p) => <li key={p.producto} className="flex justify-between gap-3 py-2 text-base"><span className="[overflow-wrap:anywhere]">{p.producto}</span><strong>{p.piezas} {p.piezas === 1 ? "pieza" : "piezas"}</strong></li>)}
          </ul>
        </Tarjeta>
      )}

      {r.estado === "terminada" ? (
        <Liquidar rutaId={String(r.id)} />
      ) : r.estado === "liquidada" ? (
        <Tarjeta className="flex flex-col gap-2"><p role="status" className="text-lg font-bold">Esta ruta ya está liquidada.</p><BotonEnlace href="/cierre">Siguiente: volver al cierre</BotonEnlace></Tarjeta>
      ) : (
        <AvisoError reintentar={false} mensaje="Esta ruta todavía no termina. Cuando el repartidor la termine, aquí la liquidas." />
      )}
    </main>
  );
}

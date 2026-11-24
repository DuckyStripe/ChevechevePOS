import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { fecha as fechaLarga, hoyMX } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import { dinero } from "@/lib/dinero";
import type { Despacho, ResumenDia } from "@/lib/tipos";

export const metadata = { title: "Cierre del día · ChevechevePOS" };

const Fila = ({ texto, valor }: { texto: string; valor: string | null | undefined }) => (
  <div className="flex items-baseline justify-between gap-3 py-1.5 text-base">
    <dt>{texto}</dt>
    <dd className="font-semibold tabular-nums">{dinero(valor)}</dd>
  </div>
);

function Pendiente({ n, texto, href }: { n: number; texto: string; href: string }) {
  return (
    <Link href={href} className="flex min-h-tocable items-center justify-between gap-3 rounded-xl border border-borde px-3 py-2 hover:bg-marca-suave">
      <span className="text-base">{texto}</span>
      <span className="flex items-center gap-1">
        <span className={`rounded-full px-2.5 py-0.5 text-base font-bold ${n > 0 ? "bg-marca-suave text-marca-fuerte" : "bg-borde/60 text-suave"}`}>{n}</span>
        <ChevronRight aria-hidden className="size-5 text-suave" />
      </span>
    </Link>
  );
}

/** Paso 5: lo que falta cerrar y el resumen del día. No tiene acciones propias: liquida en `/cierre/ruta/[id]`, verifica en `/cierre/transferencias` (N1). */
export default async function Cierre({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const sp = await searchParams;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  const y = yo.datos;
  if (!["rutas.liquidar", "cobranza.verificar", "caja.supervisar", "reportes.ver"].some((p) => tiene(y, p))) return <SinPermiso />;
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha ?? "") ? sp.fecha! : hoyMX();
  const [d, r] = await Promise.all([
    apiServidor<Despacho>("/despacho", { fecha: dia }),
    tiene(y, "reportes.ver") ? apiServidor<ResumenDia>("/cierre/resumen", { fecha: dia }) : null,
  ]);
  if (!d.ok) return d.error.status === 403 ? <SinPermiso /> : <AvisoError mensaje={d.error.mensaje} />;
  const porLiquidar = (d.datos.rutas?.lista ?? []).filter((x) => x.estado === "terminada");
  const cierre = d.datos.cierre;
  const resumen = r?.ok ? r.datos : null;

  return (
    <main className="flex flex-col gap-4">
      <Titulo titulo="Cierre del día" ayuda={`Lo que falta cerrar el ${fechaLarga(dia)}.`} />
      <form method="get" className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Día" type="date" name="fecha" defaultValue={dia} required />
        <Boton type="submit" variante="secundario">Ver ese día</Boton>
      </form>

      <Tarjeta aria-labelledby="falta" className="flex flex-col gap-2">
        <h2 id="falta" className="text-xl font-bold">Falta cerrar</h2>
        {d.datos.rutas && (
          <>
            {porLiquidar.length === 0 ? <p className="text-base text-suave">No hay rutas por liquidar.</p> : (
              <ul className="flex flex-col gap-2">
                {porLiquidar.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-borde p-3">
                    <span className="text-base [overflow-wrap:anywhere]">{x.nombre ?? `Ruta ${x.folio}`} · reparte {x.repartidor} · {x.entregadas} de {x.paradas} entregadas</span>
                    {tiene(y, "rutas.liquidar") && <BotonEnlace href={`/cierre/ruta/${x.id}`}>Liquidar</BotonEnlace>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {cierre && (
          <>
            <Pendiente n={cierre.transferencias_por_verificar} texto="Transferencias por verificar en el banco" href="/cierre/transferencias" />
            <Pendiente n={cierre.turnos_mostrador_abiertos} texto="Turnos de mostrador sin cerrar" href="/caja" />
          </>
        )}
        {d.datos.avisos_pendientes != null && <Pendiente n={d.datos.avisos_pendientes} texto="Mensajes de WhatsApp por enviar" href="/cierre?bandeja=1" />}
        {tiene(y, "ventas.ver") && <Link href="/ventas" className="inline-flex min-h-tocable items-center font-semibold text-marca-fuerte underline">Ver las ventas del día</Link>}
      </Tarjeta>

      {r && !r.ok && <AvisoError mensaje={r.error.mensaje} />}
      {resumen && (
        <Tarjeta aria-labelledby="resumen" className="flex flex-col gap-2">
          <h2 id="resumen" className="text-xl font-bold">Resumen del día</h2>
          <dl className="flex flex-col divide-y divide-borde">
            <Fila texto="Vendido" valor={resumen.vendido} />
            {resumen.ganancia != null && <Fila texto="Ganancia" valor={resumen.ganancia} />}
            <Fila texto="Cobrado en efectivo" valor={resumen.cobrado.efectivo} />
            <Fila texto="Cobrado por transferencia" valor={resumen.cobrado.transferencia} />
            <Fila texto="Dejado a fiado hoy" valor={resumen.fiado_nuevo} />
            <Fila texto="Por cobrar en total" valor={resumen.por_cobrar} />
            <div className="flex items-baseline justify-between gap-3 py-1.5 text-base">
              <dt>Por comprar para mañana</dt>
              <dd className="font-semibold">{resumen.por_comprar.productos} productos{resumen.por_comprar.costo_estimado != null ? ` · ${dinero(resumen.por_comprar.costo_estimado)}` : ""}</dd>
            </div>
          </dl>
          {tiene(y, "avisos.enviar") && tiene(y, "pedidos.ver") && (
            <BotonEnlace className="!min-h-14" href={`/cierre?fecha=${dia}&nuevo=wa_resumen_dia`}>Mandar al dueño</BotonEnlace>
          )}
        </Tarjeta>
      )}
    </main>
  );
}

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { fechaHora, hoyMX, itemsDe } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { Boton } from "@/componentes/ui/boton";
import { Campo, Selector } from "@/componentes/ui/campo";
import { Insignia } from "@/componentes/ui/insignia";
import { Paginacion } from "@/componentes/ui/paginacion";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { Vacio } from "@/componentes/ui/vacio";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import { dinero } from "@/lib/dinero";
import type { Lista, VentaFila } from "@/lib/tipos";

export const metadata = { title: "Ventas · ChevechevePOS" };

type SP = Promise<{ desde?: string; hasta?: string; estado?: string; folio?: string; pagina?: string }>;
const ORIGEN_VENTA: Record<string, string> = { mostrador: "Mostrador", pedido: "Pedido", entrega: "Entrega", ruta: "Ruta" };
const nombre = (c: VentaFila["cliente"]) => (c == null ? "Sin cliente" : typeof c === "string" ? c : c.nombre);

/** Revisar ventas. Cancelar y devolver viven en `/ventas/[id]` (N1). */
export default async function Ventas({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "ventas.ver")) return <SinPermiso />;
  const hoy = hoyMX();
  const filtros = { desde: sp.desde ?? hoy, hasta: sp.hasta ?? hoy, estado: sp.estado, folio: sp.folio };
  const r = await apiServidor<Lista<VentaFila>>("/ventas", { ...filtros, pagina: sp.pagina, por_pagina: "30" });
  if (!r.ok) return <AvisoError mensaje={r.error.mensaje} reintentar={r.error.status !== 403} />;
  const filas = itemsDe(r.datos);

  return (
    <main className="flex flex-col gap-4">
      <Titulo titulo="Ventas" ayuda={tiene(yo.datos, "ventas.ver_todas") ? "Todas las ventas del negocio." : "Tus ventas."} />
      <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo etiqueta="Desde" type="date" name="desde" defaultValue={filtros.desde} />
        <Campo etiqueta="Hasta" type="date" name="hasta" defaultValue={filtros.hasta} />
        <Selector etiqueta="Estado" name="estado" defaultValue={sp.estado ?? ""}>
          <option value="">Todas</option>
          <option value="completada">Completadas</option>
          <option value="cancelada">Canceladas</option>
        </Selector>
        <Campo etiqueta="Número de venta" name="folio" defaultValue={sp.folio} autoComplete="off" />
        <Boton type="submit" className="sm:col-span-2 lg:col-span-4">Buscar</Boton>
      </form>
      {filas.length === 0 ? (
        <Vacio texto="No hay ventas con esos datos." />
      ) : (
        <ul className="flex flex-col gap-3">
          {filas.map((v) => (
            <li key={v.id}>
              <Link href={`/ventas/${v.id}`} className="block rounded-tarjeta">
                <Tarjeta className="flex items-center gap-3 hover:bg-marca-suave">
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-bold [overflow-wrap:anywhere]">{nombre(v.cliente)}</p>
                    <p className="text-base text-suave">{v.folio} · {ORIGEN_VENTA[v.origen] ?? v.origen} · {fechaHora(v.creado_en)}</p>
                    {v.estado === "cancelada" && <Insignia tono="peligro">Cancelada</Insignia>}
                  </div>
                  <strong className="shrink-0 text-xl tabular-nums">{dinero(v.total)}</strong>
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-suave" />
                </Tarjeta>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Paginacion ruta="/ventas" query={{ ...filtros, pagina: undefined }} pagina={r.datos.pagina} porPagina={r.datos.por_pagina} total={r.datos.total} />
    </main>
  );
}

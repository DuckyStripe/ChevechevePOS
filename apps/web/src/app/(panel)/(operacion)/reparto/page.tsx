import Link from "next/link";
import { Reparto } from "@/componentes/reparto/reparto";
import { ESTADO_RUTA } from "@/componentes/rutas/formato";
import { fecha as fechaLarga, hoyMX, itemsDe } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { Insignia } from "@/componentes/ui/insignia";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { Vacio } from "@/componentes/ui/vacio";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import type { Lista, RutaDetalle, RutaResumen } from "@/lib/tipos";

export const metadata = { title: "Mi ruta · ChevechevePOS" };

/** Vista del repartidor (P4, P5): su ruta de hoy, una parada por pantalla. Con varias rutas hoy, primero se elige. */
export default async function MiRuta({ searchParams }: { searchParams: Promise<{ ruta?: string }> }) {
  const sp = await searchParams;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "rutas.operar")) return <SinPermiso />;

  const hoy = hoyMX();
  const r = await apiServidor<Lista<RutaResumen>>("/rutas", { fecha: hoy, repartidor_id: String(yo.datos.id), por_pagina: "50" });
  if (!r.ok) return <AvisoError mensaje={r.error.mensaje} />;
  const rutas = itemsDe(r.datos).filter((x) => x.estado !== "cancelada");

  if (rutas.length === 0) {
    return (
      <main>
        <Titulo titulo="Mi ruta" />
        <Vacio texto="Hoy no tienes ruta. Cuando te asignen una, aparece aquí." />
      </main>
    );
  }

  const elegida = rutas.find((x) => x.id === sp.ruta) ?? (rutas.length === 1 ? rutas[0] : undefined);
  if (!elegida) {
    return (
      <main>
        <Titulo titulo="Mi ruta" ayuda={`Tienes ${rutas.length} rutas el ${fechaLarga(hoy)}. Elige una.`} />
        <ul className="flex flex-col gap-3">
          {rutas.map((x) => (
            <li key={x.id}>
              <Link href={`/reparto?ruta=${x.id}`} className="block rounded-tarjeta">
                <Tarjeta className="flex min-h-14 flex-col gap-1 hover:bg-marca-suave">
                  <p className="text-lg font-bold [overflow-wrap:anywhere]">{x.nombre ?? `Ruta ${x.folio}`}</p>
                  <div className="flex flex-wrap items-center gap-2 text-base">
                    <Insignia tono={ESTADO_RUTA[x.estado].tono}>{ESTADO_RUTA[x.estado].texto}</Insignia>
                    <span>{x.paradas} paradas</span>
                  </div>
                </Tarjeta>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  const d = await apiServidor<RutaDetalle>(`/rutas/${elegida.id}`);
  if (!d.ok) return <AvisoError mensaje={d.error.status === 404 ? "No encontramos tu ruta." : d.error.mensaje} reintentar={d.error.status !== 404} />;

  return (
    <main>
      <Titulo titulo={d.datos.nombre ?? "Mi ruta"} ayuda={`${fechaLarga(d.datos.fecha)} · ${d.datos.vehiculo.nombre}`} />
      <Reparto ruta={d.datos} />
    </main>
  );
}

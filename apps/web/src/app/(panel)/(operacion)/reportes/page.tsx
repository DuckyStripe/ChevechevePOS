import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { REPORTES, puedeVer } from "@/componentes/reportes/definiciones";
import { hoyMX } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { apiServidor, obtenerYo } from "@/lib/api-servidor";
import { dinero } from "@/lib/dinero";
import type { Tablero } from "@/lib/tipos";

export const metadata = { title: "Reportes · ChevechevePOS" };

type Kpi = { clave: keyof Tablero; titulo: string; dinero: boolean; href: (hoy: string) => string };

/** Cada KPI enlaza a su reporte o a la pantalla que ya es dueña de esa acción (N1). */
const KPIS: Kpi[] = [
  { clave: "ventas_hoy", titulo: "Vendido hoy", dinero: true, href: (h) => `/reportes/ventas?desde=${h}&hasta=${h}&agrupar=dia` },
  { clave: "utilidad_mes", titulo: "Utilidad del mes", dinero: true, href: (h) => `/reportes/utilidad?desde=${h.slice(0, 8)}01&hasta=${h}&agrupar=dia` },
  { clave: "cxc_total", titulo: "Te deben en total", dinero: true, href: () => "/cobranza" },
  { clave: "cxc_vencido", titulo: "Te deben vencido", dinero: true, href: () => "/cobranza" },
  { clave: "bajo_minimo", titulo: "Productos por surtir", dinero: false, href: () => "/reportes/bajo-minimo" },
  { clave: "por_caducar", titulo: "Productos por caducar", dinero: false, href: () => "/inventario" },
  { clave: "precios_bajo_costo", titulo: "Precios por debajo del costo", dinero: false, href: () => "/precios" },
];

/** Solo lectura (N1): tarjetas del tablero y lista de reportes que este usuario puede abrir. */
export default async function Reportes() {
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  const disponibles = REPORTES.filter((r) => puedeVer(r, yo.datos.permisos));
  if (disponibles.length === 0) return <SinPermiso />;
  const t = await apiServidor<Tablero>("/tablero");
  const hoy = hoyMX();

  return (
    <main className="flex flex-col gap-6">
      <Titulo titulo="Reportes" ayuda="Cómo va el negocio. Aquí solo se mira; nada se cambia." />
      {!t.ok ? (
        <AvisoError mensaje={t.error.mensaje} reintentar={t.error.status !== 403} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {KPIS.filter((k) => t.datos[k.clave] != null).map((k) => {
            const v = t.datos[k.clave];
            return (
              <li key={k.clave}>
                <Link href={k.href(hoy)} className="block rounded-tarjeta">
                  <Tarjeta className="flex items-center gap-3 hover:bg-marca-suave">
                    <div className="min-w-0 flex-1">
                      <p className="text-base text-suave">{k.titulo}</p>
                      <p className="text-2xl font-bold tabular-nums">{k.dinero ? dinero(String(v)) : String(v)}</p>
                    </div>
                    <ChevronRight aria-hidden className="size-5 shrink-0 text-suave" />
                  </Tarjeta>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <section aria-labelledby="lista-reportes" className="flex flex-col gap-3">
        <h2 id="lista-reportes" className="text-xl font-bold">Todos los reportes</h2>
        <ul className="flex flex-col gap-3">
          {disponibles.map((r) => (
            <li key={r.slug}>
              <Link href={`/reportes/${r.slug}`} className="block rounded-tarjeta">
                <Tarjeta className="flex items-center gap-3 hover:bg-marca-suave">
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-bold">{r.titulo}</p>
                    <p className="text-base text-suave">{r.ayuda}</p>
                  </div>
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-suave" />
                </Tarjeta>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

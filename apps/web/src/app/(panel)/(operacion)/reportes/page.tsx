import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { REPORTES, puedeVer } from "@/componentes/reportes/definiciones";
import { BarraAntiguedad, BarrasDiarias, serieDiaria } from "@/componentes/reportes/graficas";
import { hoyMX } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { apiServidor, obtenerYo } from "@/lib/api-servidor";
import { dinero } from "@/lib/dinero";
import type { FilaReporte, RespuestaReporte, Tablero } from "@/lib/tipos";

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

  // Mini graficas de apoyo: solo si la tarjeta existe (= el usuario tiene ese permiso). Si una lectura falla, la tarjeta queda sin grafica.
  const hace13 = new Date(Date.parse(`${hoy}T12:00:00Z`) - 13 * 86_400_000).toISOString().slice(0, 10);
  const mes1 = `${hoy.slice(0, 8)}01`;
  const filasDe = (r: Awaited<ReturnType<typeof apiServidor<RespuestaReporte>>> | null): FilaReporte[] => (r?.ok ? (r.datos.filas ?? []) : []);
  const d = t.ok ? t.datos : {};
  const [ventas14, utilidadMes, cxc] = await Promise.all([
    d.ventas_hoy != null ? apiServidor<RespuestaReporte>("/reportes/ventas", { desde: hace13, hasta: hoy, agrupar: "dia" }) : null,
    d.utilidad_mes != null ? apiServidor<RespuestaReporte>("/reportes/utilidad", { desde: mes1, hasta: hoy, agrupar: "dia" }) : null,
    d.cxc_total != null ? apiServidor<RespuestaReporte>("/reportes/cuentas-por-cobrar", { al: hoy }) : null,
  ]);
  const mini: Partial<Record<keyof Tablero, React.ReactNode>> = {
    ventas_hoy: <BarrasDiarias mini titulo="Ventas de los últimos 14 días" puntos={serieDiaria(filasDe(ventas14), "importe", hace13, hoy)} />,
    utilidad_mes: <BarrasDiarias mini titulo="Utilidad por día de este mes" puntos={serieDiaria(filasDe(utilidadMes), "utilidad", mes1, hoy)} />,
    cxc_total: cxc?.ok && cxc.datos.totales ? <BarraAntiguedad mini totales={cxc.datos.totales} /> : null,
  };

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
                <Link href={k.href(hoy)} className="block h-full rounded-tarjeta">
                  <Tarjeta className="flex h-full items-center gap-3 transition-[background-color,transform] duration-150 ease-salida hover:bg-hundido/50 active:scale-[0.98]">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="text-base text-suave">{k.titulo}</p>
                      <p className="cifra text-2xl font-bold [overflow-wrap:anywhere]">{k.dinero ? dinero(String(v)) : String(v)}</p>
                      {mini[k.clave]}
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
                <Tarjeta className="flex items-center gap-3 transition-[background-color,transform] duration-150 ease-salida hover:bg-hundido/50 active:scale-[0.98]">
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

import { ImprimirLista } from "@/componentes/surtido/acciones-surtido";
import { cajasTexto } from "@/componentes/rutas/formato";
import { fecha as fechaLarga } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { BotonEnlace } from "@/componentes/ui/boton";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import type { OrdenCarga, RutaDetalle } from "@/lib/tipos";

export const metadata = { title: "Hoja de carga · ChevechevePOS" };

// Al imprimir solo sale la hoja (80 mm o carta): sin menú, sin barra de arriba y sin sangría del panel.
const CSS_IMPRESION = `@media print {
  nav, header.sticky { display: none !important; }
  .lg\\:pl-72 { padding-left: 0 !important; }
  body { background: #fff; }
  @page { margin: 6mm; }
}`;

/** Hoja de carga LIFO: «Sube primero» es la última parada (va al fondo); la primera entrega se sube al final y queda en la puerta. */
export default async function HojaCarga({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "rutas.ver") && !tiene(yo.datos, "rutas.operar")) return <SinPermiso />;
  if (!/^\d{1,18}$/.test(id)) return <AvisoError reintentar={false} mensaje="No encontramos esa ruta." />;

  const [ruta, carga] = await Promise.all([apiServidor<RutaDetalle>(`/rutas/${id}`), apiServidor<OrdenCarga>(`/rutas/${id}/carga`)]);
  if (!ruta.ok) return <AvisoError mensaje={ruta.error.status === 404 ? "No encontramos esa ruta." : ruta.error.mensaje} reintentar={ruta.error.status !== 404 && ruta.error.status !== 403} />;
  if (!carga.ok) return <AvisoError mensaje={carga.error.mensaje} />;
  const r = ruta.datos;
  const c = carga.datos;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-3 print:max-w-none print:gap-2">
      <style>{CSS_IMPRESION}</style>
      <Titulo titulo={`Hoja de carga · ${r.nombre ?? r.folio}`} ayuda={`${fechaLarga(r.fecha)} · ${r.vehiculo.nombre} · reparte ${r.repartidor.nombre}`}>
        <div className="flex flex-wrap gap-2 print:hidden">
          <ImprimirLista />
        </div>
      </Titulo>

      {c.paradas.length === 0 ? (
        <p className="text-base text-suave">Esta ruta no tiene paradas.</p>
      ) : (
        <ol className="flex flex-col gap-3 print:gap-2">
          {c.paradas.map((p) => (
            <li key={p.orden} className="break-inside-avoid">
              <Tarjeta className="flex flex-col gap-2 print:border-2 print:border-black print:p-2">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 text-center" aria-label={p.carga_n === 1 ? "Sube primero" : `Sube en el lugar ${p.carga_n}`}>
                    <p className="text-sm font-bold uppercase text-suave print:text-black">{p.carga_n === 1 ? "Sube primero" : "Sube"}</p>
                    <p className="text-5xl font-extrabold leading-none text-marca-fuerte print:text-black">{p.carga_n}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold [overflow-wrap:anywhere]">{p.cliente}</p>
                    <p className="text-base text-suave print:text-black">
                      Entrega número {p.orden}
                      {p.zona ? ` · ${p.zona}` : ""}
                      {p.pedido_folio ? ` · ${p.pedido_folio}` : ""}
                    </p>
                  </div>
                </div>
                {p.lineas.length > 0 ? (
                  <ul className="flex flex-col">
                    {p.lineas.map((l, i) => (
                      <li key={i} className="flex items-baseline gap-2 border-t border-borde py-1 text-xl font-bold print:border-black">
                        <span className="min-w-12 text-right tabular-nums">{l.cantidad}</span>
                        <span className="[overflow-wrap:anywhere]">
                          {l.presentacion} <span className="font-normal text-suave print:text-black">· {l.producto}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-base text-suave">Solo cobro: no lleva producto.</p>
                )}
              </Tarjeta>
            </li>
          ))}
        </ol>
      )}

      <Tarjeta aria-labelledby="totales" className="flex flex-col gap-1 break-inside-avoid print:border-2 print:border-black print:p-2">
        <h2 id="totales" className="text-xl font-bold">
          En total
        </h2>
        <ul className="flex flex-col">
          {c.totales.map((t) => (
            <li key={`${t.producto}-${t.presentacion}`} className="flex items-baseline gap-2 border-t border-borde py-1 text-xl font-bold print:border-black">
              <span className="min-w-12 text-right tabular-nums">{t.cantidad}</span>
              <span className="[overflow-wrap:anywhere]">
                {t.presentacion} <span className="font-normal text-suave print:text-black">· {t.producto}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-lg font-bold">{cajasTexto(c.cajas_totales)} en la camioneta</p>
      </Tarjeta>

      <div className="mt-2 print:hidden">
        <BotonEnlace href={`/rutas?fecha=${r.fecha}`}>Siguiente: volver a rutas</BotonEnlace>
      </div>
    </main>
  );
}

import { PanelRuta } from "@/componentes/rutas/panel-ruta";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { BotonEnlace } from "@/componentes/ui/boton";
import { Titulo } from "@/componentes/ui/tarjeta";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import type { CandidatosRuta, RutaDetalle } from "@/lib/tipos";

export const metadata = { title: "Ruta · ChevechevePOS" };

export default async function Ruta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "rutas.ver")) return <SinPermiso />;
  if (!/^\d{1,18}$/.test(id)) return <AvisoError reintentar={false} mensaje="No encontramos esa ruta." />;

  const r = await apiServidor<RutaDetalle>(`/rutas/${id}`);
  if (!r.ok) return <AvisoError mensaje={r.error.status === 404 ? "No encontramos esa ruta." : r.error.mensaje} reintentar={r.error.status !== 404 && r.error.status !== 403} />;
  const puedePlanear = tiene(yo.datos, "rutas.planear");
  const cand = puedePlanear && r.datos.estado === "planeada" ? await apiServidor<CandidatosRuta>(`/rutas/${id}/candidatos`) : null;

  return (
    <main>
      <Titulo titulo={r.datos.nombre ?? `Ruta ${r.datos.folio}`}>
        <BotonEnlace variante="secundario" href={`/rutas?fecha=${r.datos.fecha}`}>
          Volver a rutas
        </BotonEnlace>
      </Titulo>
      {cand && !cand.ok && <AvisoError mensaje={cand.error.mensaje} />}
      <PanelRuta ruta={r.datos} candidatos={cand?.ok ? cand.datos : null} puedePlanear={puedePlanear} />
    </main>
  );
}

import { EditarPlantilla } from "@/componentes/configuracion/editar-plantilla";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { BotonEnlace } from "@/componentes/ui/boton";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { Vacio } from "@/componentes/ui/vacio";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import type { Plantilla } from "@/lib/tipos";

export const metadata = { title: "Textos de mensajes · ChevechevePOS" };

const CANALES = [
  { canal: "whatsapp", titulo: "WhatsApp" },
  { canal: "push", titulo: "Avisos al celular" },
  { canal: "pantalla", titulo: "Pantallas del cliente" },
] as const;

/** `wa_pedido_recibido` -> «pedido recibido» (sin el prefijo del canal). */
const nombreLlano = (clave: string) => clave.replace(/^(wa|push|pantalla|estado)_/, "").replaceAll("_", " ");

export default async function Plantillas({ searchParams }: { searchParams: Promise<{ canal?: string }> }) {
  const { canal } = await searchParams;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "configuracion.editar")) return <SinPermiso />;

  const elegido = CANALES.find((c) => c.canal === canal)?.canal ?? "whatsapp";
  const r = await apiServidor<Plantilla[]>("/plantillas", { canal: elegido });
  if (!r.ok) return <AvisoError mensaje={r.error.mensaje} reintentar={r.error.status !== 403} />;

  return (
    <main>
      <Titulo titulo="Textos de mensajes" ayuda="Cambia lo que dicen los mensajes. Los datos entre {{llaves}} se llenan solos." />
      <nav aria-label="Tipo de mensaje" className="mb-4 flex flex-wrap gap-2">
        {CANALES.map((c) => (
          <BotonEnlace key={c.canal} href={`/configuracion/plantillas?canal=${c.canal}`} variante={c.canal === elegido ? "primario" : "secundario"} aria-current={c.canal === elegido ? "page" : undefined}>
            {c.titulo}
          </BotonEnlace>
        ))}
      </nav>
      {r.datos.length === 0 ? (
        <Vacio texto="No hay textos en esta lista." />
      ) : (
        <ul className="flex flex-col gap-3">
          {r.datos.map((p) => (
            <li key={p.clave}>
              <Tarjeta className="flex flex-col gap-3">
                <h2 className="text-lg font-bold capitalize [overflow-wrap:anywhere]">{p.titulo || nombreLlano(p.clave)}</h2>
                <p className="line-clamp-3 whitespace-pre-wrap text-base text-suave [overflow-wrap:anywhere]">{p.texto}</p>
                <div>
                  <EditarPlantilla plantilla={p} nombre={p.titulo || nombreLlano(p.clave)} />
                </div>
              </Tarjeta>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

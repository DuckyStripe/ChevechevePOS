import Link from "next/link";
import { NuevaRuta } from "@/componentes/rutas/nueva-ruta";
import { ESTADO_RUTA, kmTexto } from "@/componentes/rutas/formato";
import { fecha as fechaLarga, hoyMX, itemsDe } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { Insignia } from "@/componentes/ui/insignia";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { Vacio } from "@/componentes/ui/vacio";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import type { Lista, Repartidor, RutaResumen, Vehiculo } from "@/lib/tipos";

export const metadata = { title: "Rutas · ChevechevePOS" };

/** Paso 3: las rutas de un día (por omisión, hoy). «Nueva ruta» se crea aquí; asignar, ordenar y cargar, en `/rutas/[id]` (N1). */
export default async function Rutas({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const sp = await searchParams;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "rutas.ver")) return <SinPermiso />;
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha ?? "") ? sp.fecha! : hoyMX();
  const puedePlanear = tiene(yo.datos, "rutas.planear");

  const [r, veh, reps] = await Promise.all([
    apiServidor<Lista<RutaResumen>>("/rutas", { fecha: dia, por_pagina: "200" }),
    puedePlanear ? apiServidor<Lista<Vehiculo>>("/vehiculos", { activo: "true", por_pagina: "200" }) : null,
    puedePlanear ? apiServidor<Repartidor[]>("/rutas/repartidores") : null,
  ]);
  if (!r.ok) return <AvisoError mensaje={r.error.mensaje} />;
  const rutas = itemsDe(r.datos);

  return (
    <main>
      <Titulo titulo="Rutas" ayuda="Arma la ruta de cada día, cárgala y mándala a repartir." />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <Campo etiqueta="Día" type="date" name="fecha" defaultValue={dia} required />
        <Boton type="submit" variante="secundario">
          Ver ese día
        </Boton>
      </form>

      {puedePlanear && veh && reps && (
        <NuevaRuta key={dia} fecha={dia} vehiculos={veh.ok ? itemsDe(veh.datos) : []} repartidores={reps.ok ? reps.datos : []} />
      )}

      {rutas.length === 0 ? (
        <Vacio texto={`Todavía no hay rutas para el ${fechaLarga(dia)}.${puedePlanear ? " Crea la primera arriba." : ""}`} />
      ) : (
        <ul className="flex flex-col gap-3">
          {rutas.map((ruta) => {
            const estado = ESTADO_RUTA[ruta.estado];
            return (
              <li key={ruta.id}>
                <Link href={`/rutas/${ruta.id}`} className="block rounded-tarjeta focus-visible:outline-offset-4">
                  <Tarjeta className="flex flex-col gap-1 hover:bg-marca-suave">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-lg font-bold [overflow-wrap:anywhere]">{ruta.nombre ?? `Ruta ${ruta.folio}`}</p>
                      <Insignia tono={estado.tono}>{estado.texto}</Insignia>
                    </div>
                    <p className="text-base text-suave">
                      {ruta.folio} · {ruta.vehiculo.nombre} · reparte {ruta.repartidor.nombre}
                    </p>
                    <p className="text-base">
                      {ruta.paradas} {ruta.paradas === 1 ? "parada" : "paradas"}
                      {ruta.estado === "en_curso" || ruta.estado === "terminada" ? ` · ${ruta.entregadas} entregadas` : ""} · {kmTexto(ruta.distancia_km)}
                    </p>
                  </Tarjeta>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

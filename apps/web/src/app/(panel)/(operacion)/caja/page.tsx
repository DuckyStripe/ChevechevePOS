import { CorteSupervisado } from "@/componentes/caja/corte-supervisado";
import { PanelCaja } from "@/componentes/caja/panel-caja";
import { rutaVolver } from "@/componentes/cobro/volver";
import { itemsDe } from "@/componentes/productos/formato";
import { fechaHora, nombreDe } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { BotonEnlace } from "@/componentes/ui/boton";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import type { Caja, Lista, ResumenTurno, TurnoCaja } from "@/lib/tipos";

export const metadata = { title: "Caja · ChevechevePOS" };

/** `/caja`: mi turno (mostrador o ruta), movimientos y gastos, corte y cierre del mostrador (único dueño, N1). */
export default async function PaginaCaja({ searchParams }: { searchParams: Promise<{ volver?: string; turno?: string }> }) {
  const sp = await searchParams;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  const puedeAbrir = tiene(yo.datos, "caja.operar");
  const supervisa = tiene(yo.datos, "caja.supervisar");
  if (!puedeAbrir && !supervisa && !tiene(yo.datos, "rutas.operar")) return <SinPermiso />;

  // Corte supervisado (F8): turno de otra persona. Se cierra aquí mismo, en la pantalla dueña del corte (N1).
  if (supervisa && sp.turno) {
    if (!/^\d{1,18}$/.test(sp.turno)) return <AvisoError reintentar={false} mensaje="No encontramos ese turno." />;
    const [ajeno, res] = await Promise.all([apiServidor<Lista<TurnoCaja> | TurnoCaja[]>("/turnos", { estado: "abierto" }), apiServidor<ResumenTurno>(`/turnos/${sp.turno}/resumen`)]);
    if (!res.ok) return <AvisoError mensaje={res.error.status === 404 ? "No encontramos ese turno." : res.error.mensaje} reintentar={res.error.status !== 404 && res.error.status !== 403} />;
    const fila = itemsDe(ajeno.ok ? ajeno.datos : []).find((x) => String(x.id) === sp.turno);
    const turnoAjeno: TurnoCaja = fila ?? { id: sp.turno, tipo: res.datos.tipo, caja_id: null, ruta_id: null, estado: res.datos.efectivo_contado == null ? "abierto" : "cerrado", fondo_inicial: res.datos.fondo_inicial, abierto_en: "" };
    return (
      <main>
        <Titulo titulo="Corte del turno" ayuda="Revisa lo que debe haber en la caja y ciérralo con lo que contaron." />
        <CorteSupervisado turno={turnoAjeno} resumen={res.datos} />
      </main>
    );
  }

  const t = await apiServidor<TurnoCaja | null>("/turnos/actual");
  if (!t.ok) return <AvisoError mensaje={t.error.mensaje} />;
  const turno = t.datos;
  const [res, cajas] = await Promise.all([
    turno ? apiServidor<ResumenTurno>(`/turnos/${turno.id}/resumen`) : null,
    !turno && puedeAbrir ? apiServidor<Lista<Caja> | Caja[]>("/cajas") : null,
  ]);
  const abiertos = supervisa ? await apiServidor<Lista<TurnoCaja> | TurnoCaja[]>("/turnos", { estado: "abierto" }) : null;
  const ajenos = itemsDe(abiertos?.ok ? abiertos.datos : []).filter((x) => String(x.id) !== String(turno?.id ?? ""));
  const volver = sp.volver ? rutaVolver(sp.volver, "") || null : null;

  return (
    <main>
      <Titulo titulo="Caja" ayuda="Tu turno, los gastos y el dinero que entra o sale." />
      {res && !res.ok && <AvisoError mensaje={res.error.mensaje} />}
      {cajas && !cajas.ok && <AvisoError mensaje={cajas.error.mensaje} />}
      <PanelCaja turno={turno} resumen={res?.ok ? res.datos : null} cajas={itemsDe(cajas?.ok ? cajas.datos : [])} volver={volver} puedeAbrir={puedeAbrir} puedeVender={tiene(yo.datos, "ventas.crear")} />
      {ajenos.length > 0 && (
        <Tarjeta aria-labelledby="otros" className="mt-4 flex flex-col gap-2">
          <h2 id="otros" className="text-xl font-bold">Turnos abiertos de otros</h2>
          <ul className="flex flex-col divide-y divide-borde">
            {ajenos.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0 text-base [overflow-wrap:anywhere]"><strong>{nombreDe(x.usuario)}</strong> · {x.tipo === "ruta" ? "ruta" : (x.caja?.nombre ?? "mostrador")} · desde {fechaHora(x.abierto_en)}</span>
                <BotonEnlace variante="secundario" href={`/caja?turno=${x.id}`}>Ver corte</BotonEnlace>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
    </main>
  );
}

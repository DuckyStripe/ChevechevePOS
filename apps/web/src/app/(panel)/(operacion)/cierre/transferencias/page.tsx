import { Verificar } from "@/componentes/cierre/verificar";
import { fechaHora, itemsDe } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { BotonEnlace } from "@/componentes/ui/boton";
import { Insignia } from "@/componentes/ui/insignia";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { Vacio } from "@/componentes/ui/vacio";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import { dinero } from "@/lib/dinero";
import type { Lista, Transferencia } from "@/lib/tipos";

export const metadata = { title: "Transferencias · ChevechevePOS" };

/** Verificar transferencias en el banco (única pantalla que lo hace, N1). */
export default async function Transferencias({ searchParams }: { searchParams: Promise<{ verificado?: string }> }) {
  const sp = await searchParams;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "cobranza.verificar")) return <SinPermiso />;
  const hechas = sp.verificado === "true";
  const r = await apiServidor<Lista<Transferencia> | Transferencia[]>("/transferencias", { verificado: hechas ? "true" : "false" });
  if (!r.ok) return <AvisoError mensaje={r.error.mensaje} />;
  const filas = itemsDe(r.datos);

  return (
    <main className="flex flex-col gap-4">
      <Titulo titulo="Transferencias" ayuda={hechas ? "Las que ya viste en el banco." : "Revisa en el banco que cada una haya llegado."}>
        <BotonEnlace variante="secundario" href="/cierre">Volver al cierre</BotonEnlace>
      </Titulo>
      <BotonEnlace variante="fantasma" className="self-start" href={hechas ? "/cierre/transferencias" : "/cierre/transferencias?verificado=true"}>{hechas ? "Ver las que faltan" : "Ver las ya verificadas"}</BotonEnlace>
      {filas.length === 0 ? (
        <Vacio texto={hechas ? "Todavía no hay transferencias verificadas." : "No hay transferencias por verificar. Todo al día."} />
      ) : (
        <ul className="flex flex-col gap-3">
          {filas.map((t) => (
            <li key={`${t.tabla}-${t.id}`}>
              <Tarjeta className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-lg font-bold [overflow-wrap:anywhere]">{t.cliente}</p>
                  <p className="text-2xl font-extrabold tabular-nums">{dinero(t.monto)}</p>
                </div>
                <p className="text-base text-suave [overflow-wrap:anywhere]">{t.tabla === "abono" ? "Abono" : "Venta"} {t.folio}{t.ruta ? ` · ruta ${t.ruta}` : ""}{t.referencia ? ` · referencia ${t.referencia}` : " · sin referencia"}</p>
                <div className="flex flex-wrap items-center gap-3">
                  {t.comprobante ? <a href={`/api/comprobantes/${t.comprobante}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-tocable items-center font-semibold text-marca-fuerte underline">Ver la foto</a> : <Insignia>Sin foto</Insignia>}
                  {t.verificado_en ? <Insignia tono="exito">Verificada {fechaHora(t.verificado_en)}</Insignia> : <Verificar tabla={t.tabla} id={String(t.id)} />}
                </div>
              </Tarjeta>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

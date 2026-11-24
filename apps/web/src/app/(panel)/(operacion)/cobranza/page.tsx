import Link from "next/link";
import { CancelarAbono } from "@/componentes/cobranza/cancelar-abono";
import { conVolver } from "@/componentes/cobro/volver";
import { fecha, fechaHora, itemsDe } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { Selector } from "@/componentes/ui/campo";
import { Insignia } from "@/componentes/ui/insignia";
import { Paginacion } from "@/componentes/ui/paginacion";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { Vacio } from "@/componentes/ui/vacio";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import { dinero } from "@/lib/dinero";
import type { AbonoFila, CuentaPorCobrar, Lista, Zona } from "@/lib/tipos";

export const metadata = { title: "Cobranza · ChevechevePOS" };

const METODO: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta" };
const nombre = (c: CuentaPorCobrar["cliente"] | AbonoFila["cliente"]) => (typeof c === "string" ? c : c.nombre);
const idCliente = (c: CuentaPorCobrar) => (typeof c.cliente === "string" ? (c.cliente_id ?? c.cliente) : String(c.cliente.id));

/** Paso 4: quién debe y cuánto. Cobrar es en `/cobrar`; aquí solo se cancela un abono (N1). */
export default async function Cobranza({ searchParams }: { searchParams: Promise<{ zona_id?: string; vencidas?: string; pagina?: string }> }) {
  const sp = await searchParams;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "cobranza.ver")) return <SinPermiso />;
  const [cxc, abonos, zonas] = await Promise.all([
    apiServidor<Lista<CuentaPorCobrar>>("/cuentas-por-cobrar", { zona_id: sp.zona_id, vencidas: sp.vencidas, pagina: sp.pagina, por_pagina: "50" }),
    apiServidor<Lista<AbonoFila>>("/abonos", { por_pagina: "10" }),
    apiServidor<Lista<Zona> | Zona[]>("/zonas", { por_pagina: "200" }),
  ]);
  if (!cxc.ok) return <AvisoError mensaje={cxc.error.mensaje} />;
  const puedeAbonar = tiene(yo.datos, "cobranza.abonar");
  const puedeAvisar = tiene(yo.datos, "avisos.enviar") && tiene(yo.datos, "pedidos.ver");
  const puedeCancelar = tiene(yo.datos, "cobranza.cancelar_abono");

  // Se agrupa por cliente sin sumar: cada fila trae su saldo.
  const grupos = new Map<string, { nombre: string; filas: CuentaPorCobrar[] }>();
  for (const f of itemsDe(cxc.datos)) {
    const k = idCliente(f);
    if (!grupos.has(k)) grupos.set(k, { nombre: nombre(f.cliente), filas: [] });
    grupos.get(k)!.filas.push(f);
  }
  const filtrado = !!(sp.zona_id || sp.vencidas);

  return (
    <main className="flex flex-col gap-4">
      <Titulo titulo="Cobranza" ayuda="Quién te debe, desde cuándo y cuánto." />
      <form method="get" className="grid gap-3 sm:grid-cols-3">
        <Selector etiqueta="Zona" name="zona_id" defaultValue={sp.zona_id ?? ""}>
          <option value="">Todas</option>
          {itemsDe(zonas.ok ? zonas.datos : []).map((z) => <option key={z.id} value={String(z.id)}>{z.nombre}</option>)}
        </Selector>
        <Selector etiqueta="Qué ver" name="vencidas" defaultValue={sp.vencidas ?? ""}>
          <option value="">Todo lo que deben</option>
          <option value="true">Solo lo vencido</option>
        </Selector>
        <Boton type="submit" className="self-end">Filtrar</Boton>
      </form>

      {grupos.size === 0 ? (
        <Vacio texto={filtrado ? "Nadie debe con ese filtro." : "Nadie te debe nada por ahora."} />
      ) : (
        <ul className="flex flex-col gap-3">
          {[...grupos.entries()].map(([id, g]) => (
            <li key={id}>
              <Tarjeta className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/clientes/${id}`} className="text-lg font-bold [overflow-wrap:anywhere] hover:underline">{g.nombre}</Link>
                  <div className="flex flex-wrap gap-2">
                    {puedeAbonar && <BotonEnlace href={conVolver(`/cobrar?cliente=${id}`, "/cobranza")}>Cobrar</BotonEnlace>}
                    {puedeAvisar && <BotonEnlace variante="secundario" href={`/cobranza?nuevo=wa_recordatorio_saldo&cliente=${id}`}>Recordar saldo</BotonEnlace>}
                  </div>
                </div>
                <ul className="flex flex-col divide-y divide-borde">
                  {g.filas.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-base">
                      <span className="[overflow-wrap:anywhere]">{f.venta_folio ? `Venta ${f.venta_folio}` : (f.concepto ?? "Saldo anterior")} · vence {fecha(f.vence_el)}</span>
                      <span className="flex items-center gap-2">
                        {Number(f.dias_vencida) > 0 && <Insignia tono={Number(f.dias_vencida) > 15 ? "peligro" : "aviso"}>Vencida hace {f.dias_vencida} días</Insignia>}
                        <strong className="tabular-nums">{dinero(f.saldo)}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              </Tarjeta>
            </li>
          ))}
        </ul>
      )}
      <Paginacion ruta="/cobranza" query={{ zona_id: sp.zona_id, vencidas: sp.vencidas }} pagina={cxc.datos.pagina} porPagina={cxc.datos.por_pagina} total={cxc.datos.total} />

      <Tarjeta aria-labelledby="abonos" className="flex flex-col gap-2">
        <h2 id="abonos" className="text-xl font-bold">Abonos recientes</h2>
        {!abonos.ok ? (
          <p className="text-base text-suave">{abonos.error.mensaje}</p>
        ) : itemsDe(abonos.datos).length === 0 ? (
          <p className="text-base text-suave">Todavía no hay abonos.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-borde">
            {itemsDe(abonos.datos).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-base">
                <span className="[overflow-wrap:anywhere]">{nombre(a.cliente)} · {METODO[a.metodo] ?? a.metodo} · {fechaHora(a.creado_en)}</span>
                <span className="flex items-center gap-2">
                  {a.estado === "cancelado" ? <Insignia tono="peligro">Cancelado</Insignia> : puedeCancelar && <CancelarAbono id={String(a.id)} folio={a.folio} />}
                  <strong className="tabular-nums">{dinero(a.monto)}</strong>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </main>
  );
}

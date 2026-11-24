import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonCsv } from "@/componentes/reportes/boton-csv";
import { BarraAntiguedad, BarrasDiarias, serieDiaria } from "@/componentes/reportes/graficas";
import { crudo, mostrar, puedeVer, reportePorSlug, type ColumnaReporte } from "@/componentes/reportes/definiciones";
import { hoyMX, itemsDe } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { Boton, clasesBoton } from "@/componentes/ui/boton";
import { Campo, Selector } from "@/componentes/ui/campo";
import { Tabla } from "@/componentes/ui/tabla";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { Vacio } from "@/componentes/ui/vacio";
import { apiServidor, obtenerYo } from "@/lib/api-servidor";
import { dinero } from "@/lib/dinero";
import type { FilaReporte, Lista, Ref, RespuestaReporte } from "@/lib/tipos";

type SP = Promise<Record<string, string | undefined>>;

const sumarDias = (iso: string, dias: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);

export async function generateMetadata({ params }: { params: Promise<{ nombre: string }> }) {
  const d = reportePorSlug((await params).nombre);
  return { title: `${d?.titulo ?? "Reporte"} · ChevechevePOS` };
}

/** Un reporte de solo lectura: filtros en la URL, tabla con totales y CSV (N1: ninguna escritura). */
export default async function Reporte({ params, searchParams }: { params: Promise<{ nombre: string }>; searchParams: SP }) {
  const def = reportePorSlug((await params).nombre);
  if (!def) notFound();
  const sp = await searchParams;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!puedeVer(def, yo.datos.permisos)) return <SinPermiso />;

  const hoy = hoyMX();
  const agrupar = def.agrupar?.find((a) => a.valor === sp.agrupar)?.valor ?? def.agrupar?.[0]?.valor;
  const desde = sp.desde || `${hoy.slice(0, 8)}01`;
  const hasta = sp.hasta || hoy;
  const al = sp.al || hoy;
  const extra = sp.extra || undefined;

  const query: Record<string, string | undefined> = { agrupar };
  if (def.fechas === "rango") Object.assign(query, { desde, hasta });
  if (def.fechas === "al") query.al = al;
  if (def.extra === "categoria") query.categoria_id = extra;
  if (def.extra === "zona") query.zona_id = extra;
  if (def.extra === "tipo_turno") query.tipo = extra;

  const [r, opciones] = await Promise.all([
    apiServidor<RespuestaReporte | FilaReporte[]>(`/reportes/${def.api}`, query),
    def.extra === "categoria" || def.extra === "zona"
      ? apiServidor<Lista<Ref> | Ref[]>(def.extra === "categoria" ? "/categorias" : "/zonas")
      : Promise.resolve(null),
  ]);

  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
    return `/reportes/${def.slug}?${p}`;
  };
  const dow = (new Date(`${hoy}T12:00:00Z`).getUTCDay() + 6) % 7;
  const atajos = [
    { nombre: "Hoy", desde: hoy, hasta: hoy },
    { nombre: "Esta semana", desde: sumarDias(hoy, -dow), hasta: hoy },
    { nombre: "Este mes", desde: `${hoy.slice(0, 8)}01`, hasta: hoy },
  ];

  const cuerpo: RespuestaReporte = r.ok ? (Array.isArray(r.datos) ? { filas: r.datos } : r.datos) : {};
  const filas = itemsDe<FilaReporte>(cuerpo.filas ? { filas: cuerpo.filas } : null);
  const columnas: ColumnaReporte[] = def.columnas
    .filter((c) => !c.soloAgrupar || c.soloAgrupar === agrupar)
    .map((c) => (c.clave === "etiqueta" ? { ...c, titulo: def.agrupar?.find((a) => a.valor === agrupar)?.nombre.replace(/^Por /, "") ?? c.titulo } : c));
  const sufijo = def.fechas === "rango" ? `${desde}-${hasta}` : def.fechas === "al" ? al : hoy;
  const mermas = Object.entries(cuerpo.ajustes?.mermas_por_causa ?? {});
  // CSV: las filas, una fila «Total» con las mismas columnas y, donde existan, valor total, mermas y utilidad neta (dos celdas: nombre y monto).
  const totalCsv: FilaReporte | null = cuerpo.totales || cuerpo.valor_total != null ? { ...cuerpo.totales, ...(cuerpo.valor_total != null ? { valor: cuerpo.valor_total } : {}) } : null;
  const filasCsv: string[][] = filas.map((f) => columnas.map((c) => crudo(f, c)));
  if (totalCsv) filasCsv.push(columnas.map((c, i) => (i === 0 ? "Total" : crudo(totalCsv, c))));
  if (cuerpo.utilidad_neta != null) {
    for (const [causa, monto] of mermas) filasCsv.push([`Merma: ${causa.replace(/_/g, " ")}`, monto]);
    if (cuerpo.ajustes?.ajustes_netos != null) filasCsv.push(["Ajustes de inventario", cuerpo.ajustes.ajustes_netos]);
    filasCsv.push(["Utilidad neta", cuerpo.utilidad_neta]);
  }
  const opcionesExtra = opciones?.ok ? itemsDe<Ref>(opciones.datos) : [];
  // Graficas (encima de la tabla, que sigue siendo la fuente de los numeros): ventas y utilidad por dia; antiguedad de CxC.
  const porDia = agrupar === "dia" && def.fechas === "rango" ? ({ ventas: { clave: "importe", titulo: "Ventas por día" }, utilidad: { clave: "utilidad", titulo: "Utilidad por día" } } as const)[def.slug as "ventas" | "utilidad"] : undefined;
  const grafica =
    porDia && filas.some((f) => f[porDia.clave] != null) ? (
      <BarrasDiarias titulo={porDia.titulo} puntos={serieDiaria(filas, porDia.clave, desde, hasta)} />
    ) : def.slug === "cuentas-por-cobrar" && cuerpo.totales && ["corriente", "d1_30", "d31_60", "d61_90", "d90_mas"].some((k) => Number(cuerpo.totales?.[k]) > 0) ? (
      <BarraAntiguedad totales={cuerpo.totales} />
    ) : null;
  const tituloGrafica = porDia?.titulo ?? "Desde cuándo te deben";

  return (
    <main className="flex flex-col gap-4">
      <Titulo titulo={def.titulo} ayuda={def.ayuda}>
        <Link href="/reportes" className={clasesBoton("fantasma")}>Todos los reportes</Link>
      </Titulo>

      <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {def.fechas === "rango" && (
          <>
            <Campo etiqueta="Desde" type="date" name="desde" defaultValue={desde} />
            <Campo etiqueta="Hasta" type="date" name="hasta" defaultValue={hasta} />
          </>
        )}
        {def.fechas === "al" && <Campo etiqueta="Vencimiento al" type="date" name="al" defaultValue={al} />}
        {def.agrupar && (
          <Selector etiqueta="Ver" name="agrupar" defaultValue={agrupar}>
            {def.agrupar.map((a) => <option key={a.valor} value={a.valor}>{a.nombre}</option>)}
          </Selector>
        )}
        {(def.extra === "categoria" || def.extra === "zona") && (
          <Selector etiqueta={def.extra === "categoria" ? "Categoría" : "Zona"} name="extra" defaultValue={extra ?? ""}>
            <option value="">Todas</option>
            {opcionesExtra.map((o) => <option key={o.id} value={String(o.id)}>{o.nombre}</option>)}
          </Selector>
        )}
        {def.extra === "tipo_turno" && (
          <Selector etiqueta="Tipo de turno" name="extra" defaultValue={extra ?? ""}>
            <option value="">Todos</option>
            <option value="mostrador">Mostrador</option>
            <option value="ruta">Ruta</option>
          </Selector>
        )}
        <Boton type="submit" className="sm:col-span-2 lg:col-span-4">Ver reporte</Boton>
      </form>

      {def.fechas === "rango" && (
        <nav aria-label="Atajos de fechas" className="flex flex-wrap gap-2">
          {atajos.map((a) => (
            <Link key={a.nombre} href={qs({ desde: a.desde, hasta: a.hasta, agrupar })} className={clasesBoton("secundario")}>{a.nombre}</Link>
          ))}
        </nav>
      )}

      {!r.ok ? (
        <AvisoError mensaje={r.error.mensaje} reintentar={r.error.status !== 403} />
      ) : filas.length === 0 ? (
        <Vacio texto="No hay datos con esos filtros. Prueba con otras fechas." />
      ) : (
        <>
          <div className="flex justify-end">
            <BotonCsv
              archivo={`reporte-${def.slug}-${sufijo}.csv`}
              encabezados={columnas.map((c) => c.titulo)}
              filas={filasCsv}
            />
          </div>
          {grafica && (
            <Tarjeta aria-labelledby="titulo-grafica" className="flex flex-col gap-3">
              <h2 id="titulo-grafica" className="text-lg font-bold">{tituloGrafica}</h2>
              {grafica}
            </Tarjeta>
          )}
          <Tabla
            etiqueta={def.titulo}
            columnas={columnas.map((c, i) => ({ titulo: c.titulo, principal: i === 0, celda: (x: { f: FilaReporte }) => mostrar(x.f, c) }))}
            filas={filas.map((f, i) => ({ f, i }))}
            clave={(x) => x.i}
          />
          {(cuerpo.totales || cuerpo.valor_total != null || cuerpo.utilidad_neta != null) && (
            <Tarjeta aria-label="Totales" className="flex flex-col gap-1">
              <h2 className="text-lg font-bold">Total</h2>
              {cuerpo.totales &&
                columnas.filter((c) => c.clave !== "etiqueta" && c.clave !== "nombre" && c.clave !== "zona" && cuerpo.totales?.[c.clave] != null).map((c) => (
                  <p key={c.clave} className="flex justify-between gap-3 text-base">
                    <span className="text-suave">{c.titulo}</span>
                    <strong className="tabular-nums">{mostrar(cuerpo.totales as FilaReporte, c)}</strong>
                  </p>
                ))}
              {cuerpo.valor_total != null && (
                <p className="flex justify-between gap-3 text-base"><span className="text-suave">Valor de todo el inventario</span><strong className="tabular-nums">{dinero(cuerpo.valor_total)}</strong></p>
              )}
              {cuerpo.utilidad_neta != null && (
                <>
                  {mermas.map(([causa, monto]) => (
                    <p key={causa} className="flex justify-between gap-3 text-base"><span className="text-suave">Merma: {causa.replace(/_/g, " ")}</span><span className="tabular-nums">{dinero(monto)}</span></p>
                  ))}
                  {cuerpo.ajustes?.ajustes_netos != null && (
                    <p className="flex justify-between gap-3 text-base"><span className="text-suave">Ajustes de inventario</span><span className="tabular-nums">{dinero(cuerpo.ajustes.ajustes_netos)}</span></p>
                  )}
                  <p className="flex justify-between gap-3 text-lg"><span className="font-bold">Utilidad neta</span><strong className="tabular-nums">{dinero(cuerpo.utilidad_neta)}</strong></p>
                </>
              )}
            </Tarjeta>
          )}
        </>
      )}
    </main>
  );
}

import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { CancelarCompra } from "@/componentes/compras/cancelar-compra";
import { fecha, itemsDe, nombreDe, porcentaje, piezasTexto } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { BotonEnlace } from "@/componentes/ui/boton";
import { Insignia } from "@/componentes/ui/insignia";
import { Tabla } from "@/componentes/ui/tabla";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import { dinero } from "@/lib/dinero";
import type { CompraDetalle, CompraLinea, MargenCompra } from "@/lib/tipos";

export const metadata = { title: "Compra · ChevechevePOS" };

const TEXTO_ALERTA = { bajo_costo: "Vendes abajo del costo", margen_bajo: "Margen menor al objetivo" } as const;

export default async function PaginaCompra({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ registrada?: string }> }) {
  const { id } = await params;
  const { registrada } = await searchParams;
  if (!/^\d+$/.test(id)) notFound();
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "compras.ver")) return <SinPermiso />;
  const veCostos = tiene(yo.datos, "costos.ver");

  const [c, m] = await Promise.all([
    apiServidor<CompraDetalle>(`/compras/${id}`),
    veCostos ? apiServidor<MargenCompra[] | { filas: MargenCompra[] }>(`/compras/${id}/margenes`) : Promise.resolve(null),
  ]);
  if (!c.ok) {
    if (c.error.status === 404) notFound();
    return <AvisoError mensaje={c.error.mensaje} reintentar={c.error.status !== 403} />;
  }
  const compra = c.datos;
  const margenes = m && m.ok ? itemsDe(m.datos) : [];
  const enRojo = margenes.filter((x) => x.alerta);
  const idsRojos = [...new Set(enRojo.map((x) => String(x.producto_id)))];
  const hayCostos = compra.lineas.some((l) => l.costo_presentacion != null);
  const cancelada = compra.estado === "cancelada";

  return (
    <main className="flex flex-col gap-5">
      <Titulo titulo={`Compra ${compra.folio}`} ayuda={`${nombreDe(compra.proveedor)} · ${fecha(compra.fecha)}`}>
        <BotonEnlace variante="secundario" href="/compras">
          Volver a compras
        </BotonEnlace>
      </Titulo>

      {registrada && !cancelada && (
        <p role="status" className="flex items-center gap-2 rounded-tarjeta bg-exito-suave p-4 text-base font-semibold text-exito">
          <CheckCircle2 aria-hidden className="size-5 shrink-0" /> Compra guardada: {dinero(compra.total)}. {veCostos ? "Revisa abajo cuánto ganas con cada producto." : ""}
        </p>
      )}

      <Tarjeta className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Lo que compraste</h2>
          {cancelada ? <Insignia tono="peligro">Cancelada</Insignia> : <Insignia tono="exito">Registrada</Insignia>}
        </div>
        <p className="text-base">
          Total: <strong>{dinero(compra.total)}</strong> · {compra.condicion_pago === "credito" ? "A crédito" : "De contado"}
          {compra.folio_proveedor && <> · Folio del proveedor: {compra.folio_proveedor}</>}
        </p>
        {cancelada && compra.motivo_cancelacion && <p className="text-base text-peligro">Se canceló porque: {compra.motivo_cancelacion}</p>}
        <Tabla
          etiqueta="Productos de la compra"
          clave={(l) => `${l.presentacion_id}`}
          filas={compra.lineas}
          columnas={[
            { titulo: "Producto", principal: true, celda: (l) => `${l.producto} · ${l.presentacion}` },
            { titulo: "Cantidad", celda: (l) => (l.factor > 1 ? `${l.cantidad} (${piezasTexto(l.piezas)})` : String(l.cantidad)) },
            ...(hayCostos
              ? [
                  { titulo: "Pagaste c/u", celda: (l: CompraLinea) => dinero(l.costo_presentacion) },
                  { titulo: "Importe", celda: (l: CompraLinea) => dinero(l.importe) },
                ]
              : []),
            { titulo: "Caduca", celda: (l) => (l.caduca_el ? fecha(l.caduca_el) : "—") },
          ]}
        />
        {tiene(yo.datos, "compras.cancelar") && !cancelada && (
          <div>
            <CancelarCompra id={id} folio={compra.folio} productos={[...new Map(compra.lineas.filter((l) => l.producto_id != null).map((l) => [String(l.producto_id), { id: String(l.producto_id), nombre: l.producto }])).values()]} />
          </div>
        )}
      </Tarjeta>

      {veCostos && !cancelada && (
        <Tarjeta className="flex flex-col gap-3" aria-labelledby="margenes">
          <h2 id="margenes" className="text-lg font-bold">
            ¿Cuánto ganas?
          </h2>
          {m && !m.ok ? (
            <AvisoError mensaje={m.error.mensaje} />
          ) : margenes.length === 0 ? (
            <p className="text-base text-suave">Esta compra no tiene productos con precio para calcular el margen.</p>
          ) : (
            <>
              {enRojo.length > 0 ? (
                <p className="flex items-start gap-2 rounded-xl bg-peligro-suave p-3 text-base font-semibold text-peligro" role="alert">
                  <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0" />
                  {idsRojos.length === 1 ? "1 producto necesita" : `${idsRojos.length} productos necesitan`} que revises su precio.
                </p>
              ) : (
                <p className="text-base text-exito">Todos tus precios dejan el margen que quieres.</p>
              )}
              <Tabla
                etiqueta="Margen por producto"
                clave={(x) => `${x.presentacion_id}-${x.lista_precio_id}`}
                filas={margenes}
                columnas={[
                  { titulo: "Producto", principal: true, celda: (x) => (
                    <>
                      {x.producto} · {x.presentacion}
                      <span className="block text-sm font-normal text-suave">{x.lista}</span>
                    </>
                  ) },
                  { titulo: "Costo por pieza", celda: (x) => `${dinero(x.costo_anterior)} → ${dinero(x.costo_nuevo)}` },
                  { titulo: "Tu precio", celda: (x) => dinero(x.precio) },
                  { titulo: "Margen", celda: (x) => (
                    <span className={x.alerta ? "font-semibold text-peligro" : ""}>
                      {porcentaje(x.margen)}
                      {x.objetivo && <span className="text-suave"> (meta {porcentaje(x.objetivo)})</span>}
                      {x.alerta && <span className="block text-sm">{TEXTO_ALERTA[x.alerta]}</span>}
                    </span>
                  ) },
                  { titulo: "Precio sugerido", celda: (x) => (x.precio_sugerido ? dinero(x.precio_sugerido) : "—") },
                ]}
              />
              {idsRojos.length > 0 &&
                (tiene(yo.datos, "precios.editar") ? (
                  <div>
                    <BotonEnlace href={`/precios?producto_ids=${idsRojos.join(",")}&volver=${encodeURIComponent(`/compras/${id}`)}`}>Corregir precios</BotonEnlace>
                  </div>
                ) : (
                  <p className="text-base text-suave">Pídele al dueño que corrija estos precios.</p>
                ))}
            </>
          )}
        </Tarjeta>
      )}
    </main>
  );
}

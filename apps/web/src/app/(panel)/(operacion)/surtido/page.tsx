import { Tag } from "lucide-react";
import { ImprimirLista, MandarWhatsApp, PublicarLista } from "@/componentes/surtido/acciones-surtido";
import { fecha as fechaLarga, itemsDe } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { Campo, Selector } from "@/componentes/ui/campo";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { Vacio } from "@/componentes/ui/vacio";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import { dinero } from "@/lib/dinero";
import type { LineaSurtido, Lista, Surtido } from "@/lib/tipos";

export const metadata = { title: "Surtido · ChevechevePOS" };

type SP = Promise<{ fecha?: string; ruta_id?: string }>;
type RutaFila = { id: number | string; folio?: string; nombre?: string | null };

const piezas = (n: number) => `${n} ${n === 1 ? "pieza" : "piezas"}`;

function Linea({ l }: { l: LineaSurtido }) {
  const comprar = l.cantidad_sugerida ?? 0;
  return (
    <li className="flex flex-col gap-1 border-t border-borde py-3 first:border-t-0">
      <p className="text-base font-semibold [overflow-wrap:anywhere]">{l.producto}</p>
      {comprar > 0 && l.presentacion ? (
        <p className="text-2xl font-bold text-marca-fuerte">
          Comprar {comprar} <span className="text-lg">{l.presentacion}</span>
        </p>
      ) : (
        <p className="text-base font-medium text-suave">Nada urgente por los pedidos.</p>
      )}
      <p className="text-base text-suave">
        Te piden {piezas(l.piezas_pedidas)} · En bodega {piezas(l.existencia)}
        {l.comprometido_previo > 0 && ` (${piezas(l.comprometido_previo)} ya van en otros pedidos)`}
        {l.piezas_a_comprar > 0 && ` · Te faltan ${piezas(l.piezas_a_comprar)}`}
      </p>
      {l.reponer_minimo > 0 && <p className="text-base text-suave">Para no quedarte debajo de tu mínimo, {piezas(l.reponer_minimo)} más.</p>}
      {l.sugerido_demanda > 0 && <p className="text-base text-suave">Por lo que vendes, conviene pedir {piezas(l.sugerido_demanda)} extra (tú decides).</p>}
      {l.costo_promocion != null && l.ahorro != null && (
        <p className="flex items-start gap-1 text-base font-medium text-exito">
          <Tag aria-hidden className="mt-1 size-4 shrink-0" /> Hay promoción: a {dinero(l.costo_promocion)} cada {l.presentacion ?? "una"}. Ahorras {dinero(l.ahorro)}.
        </p>
      )}
      {(l.ultimo_costo != null || l.costo_estimado != null) && (
        <p className="text-base text-suave">
          {l.ultimo_costo != null && <>Te costó {dinero(l.ultimo_costo)} la última vez</>}
          {l.costo_estimado != null && <>{l.ultimo_costo != null ? " · " : ""}Calculado: {dinero(l.costo_estimado)}</>}
        </p>
      )}
    </li>
  );
}

/** Paso 2: que comprar para una fecha de entrega. La lista se calcula al vuelo (nada se guarda); comprar = registrar la compra en /compras/nueva. */
export default async function PaginaSurtido({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "surtido.ver")) return <SinPermiso />;

  const [r, rutas] = await Promise.all([
    apiServidor<Surtido>("/surtido", { fecha: sp.fecha, ruta_id: sp.ruta_id }),
    // El selector de ruta solo existe si existe GET /rutas (y se puede ver); si no, se oculta.
    apiServidor<Lista<RutaFila> | RutaFila[]>("/rutas", { fecha: sp.fecha }),
  ]);
  if (!r.ok) return <AvisoError mensaje={r.error.mensaje} reintentar={r.error.status !== 403} />;
  const { fecha, proveedores, totales } = r.datos;
  const listaRutas: RutaFila[] = rutas.ok ? itemsDe(rutas.datos) : [];
  const puedeComprar = tiene(yo.datos, "compras.registrar");
  const filtradoRuta = !!sp.ruta_id;
  const etiquetaFecha = fechaLarga(fecha);

  return (
    <main>
      {/* Hoja limpia al imprimir: sin menu ni barra superior. */}
      <style>{"@media print{nav[aria-label='Menú principal'],header.sticky{display:none!important}.lg\\:pl-72{padding-left:0!important}}"}</style>
      <Titulo titulo="Qué comprar" ayuda={`Para lo que entregas el ${etiquetaFecha}. Se calcula con tus pedidos y lo que hay en bodega.`}>
        <div className="flex flex-wrap gap-2 print:hidden">
          {puedeComprar && <PublicarLista fecha={fecha} />}
          <ImprimirLista />
          <BotonEnlace variante="fantasma" href="/surtido/promociones">
            Promociones de proveedores
          </BotonEnlace>
        </div>
      </Titulo>

      <form method="get" className="mb-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end print:hidden">
        <Campo etiqueta="Entrega del" name="fecha" type="date" defaultValue={fecha} />
        {listaRutas.length > 0 ? (
          <Selector etiqueta="Solo la ruta" name="ruta_id" defaultValue={sp.ruta_id ?? ""}>
            <option value="">Todas las rutas</option>
            {listaRutas.map((x) => (
              <option key={x.id} value={String(x.id)}>
                {x.nombre || x.folio || `Ruta ${x.id}`}
              </option>
            ))}
          </Selector>
        ) : (
          <span />
        )}
        <Boton type="submit">Ver lista</Boton>
      </form>

      {proveedores.length === 0 ? (
        <Vacio texto={`Nada que comprar para el ${etiquetaFecha}${filtradoRuta ? " en esa ruta" : ""}.`}>
          {filtradoRuta && (
            <BotonEnlace variante="secundario" href={`/surtido?fecha=${fecha}`}>
              Ver todas las rutas
            </BotonEnlace>
          )}
        </Vacio>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-base text-suave">
            {totales.productos} {totales.productos === 1 ? "producto" : "productos"} por comprar
            {totales.costo_estimado != null && <> · Calculado: <strong className="text-texto">{dinero(totales.costo_estimado)}</strong></>}
          </p>
          {proveedores.map((g) => (
            <Tarjeta key={g.proveedor_id ?? "sin"} className="flex flex-col gap-2 break-inside-avoid">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold [overflow-wrap:anywhere]">{g.proveedor ?? "Sin proveedor fijo"}</h2>
                  {g.costo_estimado != null && <p className="text-base text-suave">Calculado: {dinero(g.costo_estimado)}</p>}
                  {g.proveedor_id == null && <p className="text-base text-suave">Asígnale proveedor a estos productos para poder mandarles el pedido.</p>}
                </div>
                {g.proveedor_id != null && (
                  <div className="flex flex-wrap gap-2 print:hidden">
                    <MandarWhatsApp fecha={fecha} proveedorId={String(g.proveedor_id)} proveedor={g.proveedor ?? "el proveedor"} />
                    {puedeComprar && (
                      <BotonEnlace href={`/compras/nueva?surtido=${fecha}&proveedor_id=${g.proveedor_id}`}>Registrar compra</BotonEnlace>
                    )}
                  </div>
                )}
              </div>
              <ul>
                {g.lineas.map((l) => (
                  <Linea key={String(l.producto_id)} l={l} />
                ))}
              </ul>
            </Tarjeta>
          ))}
        </div>
      )}
      <div className="mt-2 print:hidden">
        <BotonEnlace href={`/rutas?fecha=${fecha}`}>Siguiente: armar las rutas</BotonEnlace>
      </div>
    </main>
  );
}


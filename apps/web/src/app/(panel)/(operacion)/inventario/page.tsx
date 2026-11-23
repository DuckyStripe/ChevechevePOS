import Link from "next/link";
import { cajasYSueltas, CAUSAS_MERMA, fecha, fechaHora, itemsDe, mayorFactor, nombreDe, piezasTexto, TIPOS_MOVIMIENTO } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { Campo, Selector } from "@/componentes/ui/campo";
import { Insignia } from "@/componentes/ui/insignia";
import { Paginacion } from "@/componentes/ui/paginacion";
import { Tabla } from "@/componentes/ui/tabla";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { Vacio } from "@/componentes/ui/vacio";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import { dinero } from "@/lib/dinero";
import type { Existencia, Lista, Movimiento, PorCaducar, Producto } from "@/lib/tipos";
import { cargarCatalogos } from "@/componentes/productos/cargar";

export const metadata = { title: "Inventario · ChevechevePOS" };

type SP = Promise<{ buscar?: string; categoria_id?: string; modo_surtido?: string; bajo_minimo?: string; pagina?: string; producto_id?: string; tipo?: string; causa_merma?: string; desde?: string; hasta?: string }>;

/** Presentacion para la oferta: la que traiga `v_por_caducar` o, si no, la que mas piezas trae y se vende. */
async function presentacionesDeOferta(filas: PorCaducar[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const faltan = [...new Set(filas.filter((f) => !f.presentacion_id).map((f) => String(f.producto_id)))].slice(0, 20);
  for (const f of filas) if (f.presentacion_id) mapa.set(String(f.producto_id), String(f.presentacion_id));
  const rs = await Promise.all(faltan.map((id) => apiServidor<Producto>(`/productos/${id}`)));
  for (const r of rs) {
    if (!r.ok) continue;
    const mejor = r.datos.presentaciones.filter((p) => p.activa && p.se_vende).sort((a, b) => b.factor - a.factor)[0];
    if (mejor) mapa.set(String(r.datos.id), String(mejor.id));
  }
  return mapa;
}

export default async function Inventario({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "inventario.ver")) return <SinPermiso />;
  const veCostos = tiene(yo.datos, "costos.ver");
  const puedeAjustar = tiene(yo.datos, "inventario.ajustar");
  const puedeOferta = tiene(yo.datos, "precios.editar");
  const productoId = sp.producto_id && /^\d+$/.test(sp.producto_id) ? sp.producto_id : undefined;

  const acciones = puedeAjustar && (
    <BotonEnlace href="/inventario/ajustes">Ajustar inventario</BotonEnlace>
  );

  /* ---------- Kardex de un producto ---------- */
  if (productoId) {
    const [p, mov] = await Promise.all([
      apiServidor<Producto>(`/productos/${productoId}`),
      apiServidor<Lista<Movimiento>>("/inventario/movimientos", { producto_id: productoId, tipo: sp.tipo, causa_merma: sp.causa_merma, desde: sp.desde, hasta: sp.hasta, pagina: sp.pagina }),
    ]);
    if (!mov.ok) return <AvisoError mensaje={mov.error.mensaje} reintentar={mov.error.status !== 403} />;
    const filtrado = !!(sp.tipo || sp.causa_merma || sp.desde || sp.hasta);
    return (
      <main>
        <Titulo titulo={p.ok ? `Movimientos de ${p.datos.nombre}` : "Movimientos"} ayuda={p.ok ? `Hay ${cajasYSueltas(p.datos.existencia, mayorFactor(p.datos.presentaciones))}.` : undefined}>
          <BotonEnlace variante="secundario" href="/inventario">
            Ver todas las existencias
          </BotonEnlace>
        </Titulo>
        <form method="get" className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="producto_id" value={productoId} />
          <Selector etiqueta="Qué pasó" name="tipo" defaultValue={sp.tipo ?? ""}>
            <option value="">Todo</option>
            {Object.entries(TIPOS_MOVIMIENTO).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </Selector>
          <Selector etiqueta="Causa de merma" name="causa_merma" defaultValue={sp.causa_merma ?? ""}>
            <option value="">Cualquiera</option>
            {CAUSAS_MERMA.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.texto}
              </option>
            ))}
          </Selector>
          <Campo etiqueta="Desde" name="desde" type="date" defaultValue={sp.desde} />
          <Campo etiqueta="Hasta" name="hasta" type="date" defaultValue={sp.hasta} />
          <Boton type="submit" className="sm:col-span-2 lg:col-span-4">
            Filtrar
          </Boton>
        </form>
        {mov.datos.items.length === 0 ? (
          <Vacio texto={filtrado ? "No hay movimientos con ese filtro." : "Este producto aún no tiene movimientos."}>
            {filtrado && (
              <BotonEnlace variante="secundario" href={`/inventario?producto_id=${productoId}`}>
                Quitar filtros
              </BotonEnlace>
            )}
          </Vacio>
        ) : (
          <Tabla
            etiqueta="Movimientos"
            clave={(m) => m.id}
            filas={mov.datos.items}
            columnas={[
              { titulo: "Cuándo", celda: (m) => fechaHora(m.creado_en) },
              { titulo: "Qué pasó", principal: true, celda: (m) => (
                <>
                  {TIPOS_MOVIMIENTO[m.tipo] ?? "Movimiento"}
                  {m.causa_merma && <span className="block text-sm font-normal text-suave">{CAUSAS_MERMA.find((c) => c.valor === m.causa_merma)?.texto ?? ""}</span>}
                  {m.motivo && <span className="block text-sm font-normal text-suave">{m.motivo}</span>}
                </>
              ) },
              { titulo: "Piezas", celda: (m) => <span className={m.cantidad < 0 ? "text-peligro" : "text-exito"}>{m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}</span> },
              { titulo: "Quedaron", celda: (m) => piezasTexto(m.existencia_resultante) },
              ...(veCostos ? [{ titulo: "Costo por pieza", celda: (m: Movimiento) => dinero(m.costo_unitario) }] : []),
            ]}
          />
        )}
        <Paginacion ruta="/inventario" query={{ producto_id: productoId, tipo: sp.tipo, causa_merma: sp.causa_merma, desde: sp.desde, hasta: sp.hasta }} pagina={mov.datos.pagina} porPagina={mov.datos.por_pagina} total={mov.datos.total} />
      </main>
    );
  }

  /* ---------- Existencias + por caducar ---------- */
  const [lista, caducar, cat] = await Promise.all([
    apiServidor<Lista<Existencia>>("/inventario/existencias", { buscar: sp.buscar, categoria_id: sp.categoria_id, modo_surtido: sp.modo_surtido, bajo_minimo: sp.bajo_minimo, pagina: sp.pagina }),
    apiServidor<{ filas: PorCaducar[] } | PorCaducar[]>("/inventario/por-caducar"),
    cargarCatalogos(),
  ]);
  if (!lista.ok) return <AvisoError mensaje={lista.error.mensaje} reintentar={lista.error.status !== 403} />;
  const filasCaducar = caducar.ok ? itemsDe(caducar.datos) : [];
  const presOferta = puedeOferta && filasCaducar.length > 0 ? await presentacionesDeOferta(filasCaducar) : new Map<string, string>();
  const filtrado = !!(sp.buscar || sp.categoria_id || sp.modo_surtido || sp.bajo_minimo);

  return (
    <main className="flex flex-col gap-5">
      <Titulo titulo="Inventario" ayuda="Lo que hay en bodega. Aquí solo se mira; para corregir algo usa «Ajustar inventario».">
        {acciones}
      </Titulo>

      {!caducar.ok ? (
        <AvisoError mensaje={caducar.error.mensaje} />
      ) : (
        filasCaducar.length > 0 && (
          <Tarjeta aria-labelledby="por-caducar" className="border-marca/50 bg-marca-suave/40">
            <h2 id="por-caducar" className="text-lg font-bold">
              Por caducar
            </h2>
            <p className="mb-3 text-base text-suave">Véndelo primero o ponle una oferta.</p>
            <ul className="flex flex-col gap-2">
              {filasCaducar.map((f) => {
                const pres = presOferta.get(String(f.producto_id));
                return (
                  <li key={`${f.producto_id}-${f.compra_folio}-${f.caduca_el}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-borde bg-superficie p-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold [overflow-wrap:anywhere]">{f.producto}</p>
                      <p className="text-base">
                        ~{piezasTexto(f.piezas_estimadas)} · caduca {fecha(f.caduca_el)} {f.dias_restantes < 0 ? <Insignia tono="peligro">Ya caducó</Insignia> : <Insignia tono={f.dias_restantes <= 7 ? "peligro" : "aviso"}>{f.dias_restantes === 0 ? "Caduca hoy" : `Faltan ${f.dias_restantes} ${f.dias_restantes === 1 ? "día" : "días"}`}</Insignia>}
                      </p>
                    </div>
                    {puedeOferta && pres && (
                      <BotonEnlace variante="secundario" href={`/precios?oferta=${pres}&producto_ids=${f.producto_id}&volver=${encodeURIComponent("/inventario")}`}>
                        Poner oferta
                      </BotonEnlace>
                    )}
                  </li>
                );
              })}
            </ul>
          </Tarjeta>
        )
      )}

      <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo etiqueta="Buscar" name="buscar" type="search" defaultValue={sp.buscar} placeholder="caguama, tecate lite…" />
        <Selector etiqueta="Categoría" name="categoria_id" defaultValue={sp.categoria_id ?? ""}>
          <option value="">Todas</option>
          {cat.ok && cat.datos.categorias.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.nombre}
            </option>
          ))}
        </Selector>
        <Selector etiqueta="Cómo se surte" name="modo_surtido" defaultValue={sp.modo_surtido ?? ""}>
          <option value="">Todos</option>
          <option value="inventario">Lo tengo en bodega</option>
          <option value="contra_pedido">Lo compro cuando lo piden</option>
        </Selector>
        <Selector etiqueta="Existencia" name="bajo_minimo" defaultValue={sp.bajo_minimo ?? ""}>
          <option value="">Toda</option>
          <option value="true">Solo lo que bajó del mínimo</option>
        </Selector>
        <Boton type="submit" className="sm:col-span-2 lg:col-span-4">
          Filtrar
        </Boton>
      </form>

      {lista.datos.items.length === 0 ? (
        <Vacio texto={filtrado ? "Nada coincide con ese filtro." : "Aún no hay existencias. Registra una compra o el inventario inicial."}>
          {filtrado ? (
            <BotonEnlace variante="secundario" href="/inventario">
              Quitar filtros
            </BotonEnlace>
          ) : (
            puedeAjustar && <BotonEnlace href="/inventario/ajustes">Ajustar inventario</BotonEnlace>
          )}
        </Vacio>
      ) : (
        <Tabla
          etiqueta="Existencias"
          clave={(e) => e.producto_id}
          filas={lista.datos.items}
          columnas={[
            { titulo: "Producto", principal: true, celda: (e) => (
              <Link href={`/inventario?producto_id=${e.producto_id}`} className="underline-offset-2 hover:underline">
                {e.producto}
                <span className="block text-sm font-normal text-suave">{nombreDe(e.categoria)}</span>
              </Link>
            ) },
            { titulo: "Hay", celda: (e) => (
              <>
                {e.cajas > 0 || e.sueltas > 0 ? `${e.cajas} ${e.cajas === 1 ? "caja" : "cajas"} + ${e.sueltas} ${e.sueltas === 1 ? "suelta" : "sueltas"}` : "Nada"}
                <span className="block text-sm text-suave">{piezasTexto(e.cantidad)}</span>
                {e.modo_surtido === "inventario" && e.cantidad < e.existencia_minima && <Insignia tono="peligro">Bajo mínimo ({e.existencia_minima})</Insignia>}
              </>
            ) },
            ...(veCostos ? [{ titulo: "Vale", celda: (e: Existencia) => dinero(e.valor) }] : []),
          ]}
        />
      )}
      <Paginacion ruta="/inventario" query={{ buscar: sp.buscar, categoria_id: sp.categoria_id, modo_surtido: sp.modo_surtido, bajo_minimo: sp.bajo_minimo }} pagina={lista.datos.pagina} porPagina={lista.datos.por_pagina} total={lista.datos.total} />
    </main>
  );
}

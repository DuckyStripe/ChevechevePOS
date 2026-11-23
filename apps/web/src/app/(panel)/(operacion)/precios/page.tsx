import { cargarCatalogos } from "@/componentes/productos/cargar";
import { hoyMX, itemsDe } from "@/componentes/productos/formato";
import { ListasPrecio } from "@/componentes/precios/listas";
import { MatrizPrecios } from "@/componentes/precios/matriz-precios";
import { Ofertas, type OpcionPresentacion } from "@/componentes/precios/ofertas";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { Paginacion } from "@/componentes/ui/paginacion";
import { Campo, Selector } from "@/componentes/ui/campo";
import { Titulo } from "@/componentes/ui/tarjeta";
import { Vacio } from "@/componentes/ui/vacio";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import type { Lista, ListaPrecio, Oferta, PrecioBajoCosto, PrecioSugerido, Producto } from "@/lib/tipos";

export const metadata = { title: "Precios · ChevechevePOS" };

type SP = Promise<{ producto_ids?: string; oferta?: string; buscar?: string; categoria_id?: string; pagina?: string; volver?: string }>;
const MAX_FILTRADOS = 50;

/** Solo rutas internas: `?volver=` nunca saca al usuario del sitio. */
const volverSeguro = (v?: string) => (v && /^\/(?!\/)[\w\-/?=&%.]*$/.test(v) ? v : undefined);

export default async function Precios({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "precios.editar")) return <SinPermiso />;
  const veCostos = tiene(yo.datos, "costos.ver");

  const todos = [...new Set((sp.producto_ids ?? "").split(",").map((s) => s.trim()).filter((s) => /^\d+$/.test(s)))];
  const paginaIds = Math.max(1, Number(sp.pagina) || 1);
  const ids = todos.slice((paginaIds - 1) * MAX_FILTRADOS, paginaIds * MAX_FILTRADOS);
  const [listasR, ofertasR, cat] = await Promise.all([
    apiServidor<Lista<ListaPrecio> | ListaPrecio[]>("/listas-precio"),
    apiServidor<Lista<Oferta> | Oferta[]>("/ofertas", { vigentes: "true", por_pagina: "200" }),
    cargarCatalogos(),
  ]);
  if (!listasR.ok) return <AvisoError mensaje={listasR.error.mensaje} />;

  let productos: Producto[] = [];
  let total = 0;
  let porPagina = 30;
  let pagina = 1;
  if (ids.length > 0) {
    const r = await apiServidor<Lista<Producto>>("/productos", { producto_ids: ids.join(","), por_pagina: String(MAX_FILTRADOS) });
    if (!r.ok) return <AvisoError mensaje={r.error.mensaje} reintentar={r.error.status !== 403} />;
    productos = r.datos.items;
    total = todos.length;
    porPagina = MAX_FILTRADOS;
    pagina = paginaIds;
  } else {
    const r = await apiServidor<Lista<Producto>>("/productos", { buscar: sp.buscar, categoria_id: sp.categoria_id, activo: "true", pagina: sp.pagina, por_pagina: "30" });
    if (!r.ok) return <AvisoError mensaje={r.error.mensaje} reintentar={r.error.status !== 403} />;
    productos = r.datos.items;
    total = r.datos.total;
    porPagina = r.datos.por_pagina;
    pagina = r.datos.pagina;
  }

  let sugeridos: PrecioSugerido[] | null = null;
  let bajoCosto: string[] | null = null;
  if (veCostos && productos.length > 0) {
    const [s, b] = await Promise.all([
      apiServidor<PrecioSugerido[] | { filas: PrecioSugerido[] }>("/precios/sugeridos", { producto_ids: productos.map((p) => p.id).join(",") }),
      apiServidor<{ filas: PrecioBajoCosto[] } | PrecioBajoCosto[]>("/precios/bajo-costo"),
    ]);
    if (s.ok) sugeridos = itemsDe(s.datos);
    if (b.ok) bajoCosto = itemsDe(b.datos).map((x) => `${x.presentacion_id}:${x.lista_precio_id}`);
  }

  const listas = itemsDe(listasR.datos).filter((l) => l.activa);
  const opciones: OpcionPresentacion[] = productos.flatMap((p) =>
    p.presentaciones.filter((pr) => pr.activa && pr.se_vende).map((pr) => ({ id: String(pr.id), etiqueta: `${p.nombre} · ${pr.nombre}` })),
  );
  const volver = volverSeguro(sp.volver);
  const filtrando = ids.length > 0;

  return (
    <main className="flex flex-col gap-5">
      <Titulo titulo="Precios" ayuda="Aquí se cambian todos los precios. Ves cuánto ganas y el precio que te conviene.">
        {volver && (
          <BotonEnlace variante="secundario" href={volver}>
            Volver
          </BotonEnlace>
        )}
      </Titulo>

      {filtrando ? (
        <p className="flex flex-wrap items-center gap-3 rounded-xl bg-marca-suave p-3 text-base">
          {todos.length > MAX_FILTRADOS ? `Mostrando ${productos.length} de ${todos.length} productos (página ${pagina}).` : `Mostrando solo ${productos.length === 1 ? "1 producto" : `${productos.length} productos`}.`}
          <BotonEnlace variante="secundario" href="/precios">
            Ver todos
          </BotonEnlace>
        </p>
      ) : (
        <form method="get" className="grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
          <Campo etiqueta="Buscar producto" name="buscar" type="search" defaultValue={sp.buscar} placeholder="caguama, tecate lite…" />
          <Selector etiqueta="Categoría" name="categoria_id" defaultValue={sp.categoria_id ?? ""}>
            <option value="">Todas</option>
            {cat.ok && cat.datos.categorias.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.nombre}
              </option>
            ))}
          </Selector>
          <Boton type="submit">Filtrar</Boton>
        </form>
      )}

      {listas.length === 0 ? (
        <Vacio texto="Aún no hay listas de precio activas. Crea una abajo." />
      ) : productos.length === 0 ? (
        <Vacio texto={sp.buscar || sp.categoria_id ? "Ningún producto coincide con ese filtro." : "Aún no hay productos para ponerles precio."}>
          <BotonEnlace variante="secundario" href={sp.buscar || sp.categoria_id || filtrando ? "/precios" : "/productos"}>
            {sp.buscar || sp.categoria_id || filtrando ? "Quitar filtros" : "Ir a productos"}
          </BotonEnlace>
        </Vacio>
      ) : (
        // key: al cambiar el filtro la matriz empieza limpia (sin cambios pendientes del filtro anterior)
        <MatrizPrecios key={`${ids.join(",")}|${sp.buscar ?? ""}|${sp.categoria_id ?? ""}|${pagina}`} productos={productos} listas={listas} sugeridos={sugeridos} bajoCosto={bajoCosto} />
      )}

      {total > porPagina && <Paginacion ruta="/precios" query={{ buscar: sp.buscar, categoria_id: sp.categoria_id, producto_ids: sp.producto_ids, volver: sp.volver, oferta: sp.oferta }} pagina={pagina} porPagina={porPagina} total={total} />}

      {ofertasR.ok ? (
        <Ofertas ofertas={itemsDe(ofertasR.datos)} opciones={opciones} listas={listas} hoy={hoyMX()} presentacionInicial={sp.oferta && /^\d+$/.test(sp.oferta) ? sp.oferta : undefined} />
      ) : (
        <AvisoError mensaje={ofertasR.error.mensaje} />
      )}
      <ListasPrecio listas={itemsDe(listasR.datos)} />
    </main>
  );
}

import Link from "next/link";
import { Plus } from "lucide-react";
import { cargarCatalogos } from "@/componentes/productos/cargar";
import { Foto } from "@/componentes/productos/foto";
import { nombreDe, piezasTexto } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { Campo, Casilla, Selector } from "@/componentes/ui/campo";
import { Insignia } from "@/componentes/ui/insignia";
import { Paginacion } from "@/componentes/ui/paginacion";
import { Tabla } from "@/componentes/ui/tabla";
import { Titulo } from "@/componentes/ui/tarjeta";
import { Vacio } from "@/componentes/ui/vacio";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import type { Lista, Producto } from "@/lib/tipos";

export const metadata = { title: "Productos · ChevechevePOS" };

type SP = Promise<{ buscar?: string; categoria_id?: string; marca_id?: string; modo_surtido?: string; activo?: string; bajo_minimo?: string; incluir_inactivos?: string; pagina?: string }>;

export default async function Productos({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "catalogo.ver")) return <SinPermiso />;

  const [lista, cat] = await Promise.all([apiServidor<Lista<Producto>>("/productos", { ...sp }), cargarCatalogos()]);
  if (!lista.ok) return <AvisoError mensaje={lista.error.mensaje} reintentar={lista.error.status !== 403} />;
  if (!cat.ok) return <AvisoError mensaje={cat.mensaje} />;
  const filtrado = !!(sp.buscar || sp.categoria_id || sp.marca_id || sp.modo_surtido || sp.activo || sp.bajo_minimo || sp.incluir_inactivos);
  const puedeEditar = tiene(yo.datos, "catalogo.editar");

  return (
    <main>
      <Titulo titulo="Productos" ayuda="Lo que vendes, con sus presentaciones y su foto.">
        {puedeEditar && (
          <BotonEnlace href="/productos/nuevo">
            <Plus aria-hidden className="size-5" /> Nuevo producto
          </BotonEnlace>
        )}
      </Titulo>

      <form method="get" className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Campo etiqueta="Buscar" name="buscar" type="search" defaultValue={sp.buscar} placeholder="caguama, tecate lite, kerona…" />
        <Selector etiqueta="Categoría" name="categoria_id" defaultValue={sp.categoria_id ?? ""}>
          <option value="">Todas</option>
          {cat.datos.categorias.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.nombre}
            </option>
          ))}
        </Selector>
        <Selector etiqueta="Marca" name="marca_id" defaultValue={sp.marca_id ?? ""}>
          <option value="">Todas</option>
          {cat.datos.marcas.map((m) => (
            <option key={m.id} value={String(m.id)}>
              {m.nombre}
            </option>
          ))}
        </Selector>
        <Selector etiqueta="Cómo se surte" name="modo_surtido" defaultValue={sp.modo_surtido ?? ""}>
          <option value="">Todos</option>
          <option value="inventario">Lo tengo en bodega</option>
          <option value="contra_pedido">Lo compro cuando lo piden</option>
        </Selector>
        <Selector etiqueta="Estado" name="activo" defaultValue={sp.activo ?? ""}>
          <option value="">Todos</option>
          <option value="true">Activos</option>
          <option value="false">Desactivados</option>
        </Selector>
        <Selector etiqueta="Existencia" name="bajo_minimo" defaultValue={sp.bajo_minimo ?? ""}>
          <option value="">Toda</option>
          <option value="true">Solo lo que bajó del mínimo</option>
        </Selector>
        <div className="sm:col-span-2 lg:col-span-3">
          <Casilla etiqueta="Ver inactivos" ayuda="Muestra también los productos desactivados." name="incluir_inactivos" value="true" defaultChecked={sp.incluir_inactivos === "true"} />
        </div>
        <Boton type="submit" className="sm:col-span-2 lg:col-span-3">
          Filtrar
        </Boton>
      </form>

      {lista.datos.items.length === 0 ? (
        <Vacio texto={filtrado ? "Ningún producto coincide con ese filtro." : "Aún no hay productos. Crea el primero."}>
          {filtrado ? (
            <BotonEnlace variante="secundario" href="/productos">
              Quitar filtros
            </BotonEnlace>
          ) : (
            puedeEditar && <BotonEnlace href="/productos/nuevo">Nuevo producto</BotonEnlace>
          )}
        </Vacio>
      ) : (
        <Tabla
          etiqueta="Productos"
          clave={(p) => p.id}
          filas={lista.datos.items}
          columnas={[
            { titulo: "Producto", principal: true, celda: (p) => (
              <Link href={`/productos/${p.id}`} className="flex items-center gap-3 text-left underline-offset-2 hover:underline">
                <Foto imagen={p.imagen} />
                <span className="min-w-0">
                  {p.nombre}
                  <span className="block text-sm font-normal text-suave">{p.presentaciones.filter((x) => x.activa).map((x) => x.nombre).join(" · ")}</span>
                </span>
              </Link>
            ) },
            { titulo: "Categoría", celda: (p) => nombreDe(p.categoria) },
            { titulo: "En bodega", celda: (p) => (
              <>
                {piezasTexto(p.existencia)}
                {p.modo_surtido === "inventario" && p.existencia < p.existencia_minima && <span className="ml-2"><Insignia tono="peligro">Bajo mínimo</Insignia></span>}
              </>
            ) },
            { titulo: "Estado", celda: (p) => (p.activo ? <Insignia tono="exito">Activo</Insignia> : <Insignia tono="peligro">Desactivado</Insignia>) },
          ]}
        />
      )}
      <Paginacion ruta="/productos" query={sp} pagina={lista.datos.pagina} porPagina={lista.datos.por_pagina} total={lista.datos.total} />
    </main>
  );
}

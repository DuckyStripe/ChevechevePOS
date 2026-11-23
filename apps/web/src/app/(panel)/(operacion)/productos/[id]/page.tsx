import { notFound } from "next/navigation";
import { cargarCatalogos } from "@/componentes/productos/cargar";
import { FichaProducto } from "@/componentes/productos/ficha-producto";
import { itemsDe } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { BotonEnlace } from "@/componentes/ui/boton";
import { Titulo } from "@/componentes/ui/tarjeta";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import type { Lista, ListaPrecio, Producto } from "@/lib/tipos";

export const metadata = { title: "Producto · ChevechevePOS" };

export default async function PaginaProducto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "catalogo.ver")) return <SinPermiso />;

  const [p, cat, listas] = await Promise.all([apiServidor<Producto>(`/productos/${id}`), cargarCatalogos(), apiServidor<Lista<ListaPrecio> | ListaPrecio[]>("/listas-precio")]);
  if (!p.ok) {
    if (p.error.status === 404) notFound();
    return <AvisoError mensaje={p.error.mensaje} reintentar={p.error.status !== 403} />;
  }
  if (!cat.ok) return <AvisoError mensaje={cat.mensaje} />;
  const permisos = yo.datos;

  return (
    <main>
      <Titulo titulo={p.datos.nombre} ayuda="Ficha del producto.">
        <BotonEnlace variante="secundario" href="/productos">
          Volver a productos
        </BotonEnlace>
      </Titulo>
      <FichaProducto
        producto={p.datos}
        catalogos={cat.datos}
        listas={listas.ok ? itemsDe(listas.datos) : []}
        puedeEditar={tiene(permisos, "catalogo.editar")}
        veCostos={tiene(permisos, "costos.ver")}
        puedeVerInventario={tiene(permisos, "inventario.ver")}
        puedeVerPrecios={tiene(permisos, "precios.editar")}
      />
    </main>
  );
}

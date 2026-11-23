import { cargarCatalogos } from "@/componentes/productos/cargar";
import { NuevoProducto } from "@/componentes/productos/nuevo-producto";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { BotonEnlace } from "@/componentes/ui/boton";
import { Titulo } from "@/componentes/ui/tarjeta";
import { obtenerYo, tiene } from "@/lib/api-servidor";

export const metadata = { title: "Nuevo producto · ChevechevePOS" };

export default async function PaginaNuevoProducto() {
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "catalogo.editar")) return <SinPermiso />;
  const cat = await cargarCatalogos();
  if (!cat.ok) return <AvisoError mensaje={cat.mensaje} />;
  return (
    <main>
      <Titulo titulo="Nuevo producto" ayuda="Después de crearlo podrás ponerle foto y precios.">
        <BotonEnlace variante="secundario" href="/productos">
          Volver a productos
        </BotonEnlace>
      </Titulo>
      <NuevoProducto catalogos={cat.datos} />
    </main>
  );
}

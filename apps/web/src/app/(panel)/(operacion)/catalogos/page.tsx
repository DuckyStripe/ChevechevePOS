import { Catalogos } from "@/componentes/catalogos/catalogos";
import { itemsDe } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { Titulo } from "@/componentes/ui/tarjeta";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import type { Categoria, Lista, Marca } from "@/lib/tipos";

export const metadata = { title: "Categorías y marcas · ChevechevePOS" };

export default async function PaginaCatalogos() {
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "catalogo.ver")) return <SinPermiso />;
  const [c, m] = await Promise.all([
    apiServidor<Lista<Categoria> | Categoria[]>("/categorias", { por_pagina: "200" }),
    apiServidor<Lista<Marca> | Marca[]>("/marcas", { por_pagina: "200" }),
  ]);
  if (!c.ok) return <AvisoError mensaje={c.error.mensaje} />;
  if (!m.ok) return <AvisoError mensaje={m.error.mensaje} />;
  return (
    <main>
      <Titulo titulo="Categorías y marcas" ayuda="Cómo se agrupan tus productos y qué margen quieres ganar en cada categoría." />
      <Catalogos categorias={itemsDe(c.datos)} marcas={itemsDe(m.datos)} puedeEditar={tiene(yo.datos, "catalogo.editar")} />
    </main>
  );
}

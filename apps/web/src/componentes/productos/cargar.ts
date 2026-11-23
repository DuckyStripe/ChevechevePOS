import { apiServidor } from "@/lib/api-servidor";
import type { Categoria, Lista, Marca, Proveedor } from "@/lib/tipos";
import type { Catalogos } from "./campos-producto";
import { itemsDe } from "./formato";

/** Categorias, marcas y proveedores activos para selectores. Devuelve el primer error legible. */
export async function cargarCatalogos(): Promise<{ ok: true; datos: Catalogos } | { ok: false; mensaje: string }> {
  const [c, m, p] = await Promise.all([
    apiServidor<Lista<Categoria> | Categoria[]>("/categorias", { por_pagina: "200" }),
    apiServidor<Lista<Marca> | Marca[]>("/marcas", { por_pagina: "200" }),
    apiServidor<Lista<Proveedor> | Proveedor[]>("/proveedores", { activo: "true", por_pagina: "200" }),
  ]);
  if (!c.ok) return { ok: false, mensaje: c.error.mensaje };
  if (!m.ok) return { ok: false, mensaje: m.error.mensaje };
  // Quien edita productos puede no tener `proveedores.gestionar`/`compras.ver`: sin lista, el selector queda vacio.
  return { ok: true, datos: { categorias: itemsDe(c.datos), marcas: itemsDe(m.datos), proveedores: p.ok ? itemsDe(p.datos) : [] } };
}

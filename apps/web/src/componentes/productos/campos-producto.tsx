import { Campo, AreaTexto, Selector } from "@/componentes/ui/campo";
import type { Categoria, Marca, Producto, Proveedor } from "@/lib/tipos";
import { fraccion, idDe, porcentaje } from "./formato";

export type Catalogos = { categorias: Categoria[]; marcas: Marca[]; proveedores: Proveedor[] };

/** Campos comunes del alta y de la ficha. Sin estado: se leen con `leerProducto(FormData)`. */
export function CamposProducto({ producto, catalogos, errores }: { producto?: Producto; catalogos: Catalogos; errores?: Record<string, string> }) {
  const e = errores ?? {};
  return (
    <>
      <Campo etiqueta="Nombre" name="nombre" defaultValue={producto?.nombre} autoComplete="off" error={e.nombre} required />
      <Selector etiqueta="Categoría" name="categoria_id" defaultValue={producto ? idDe(producto.categoria) : ""} error={e.categoria_id}>
        {!producto && <option value="">Elige una categoría</option>}
        {catalogos.categorias
          .filter((c) => c.activa || (producto && idDe(producto.categoria) === String(c.id)))
          .map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.nombre}
            </option>
          ))}
      </Selector>
      <Selector etiqueta="Marca (opcional)" name="marca_id" defaultValue={producto ? idDe(producto.marca) : ""}>
        <option value="">Sin marca</option>
        {catalogos.marcas
          .filter((m) => m.activa || (producto && idDe(producto.marca) === String(m.id)))
          .map((m) => (
            <option key={m.id} value={String(m.id)}>
              {m.nombre}
            </option>
          ))}
      </Selector>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Contenido en ml (opcional)" name="contenido_ml" type="number" inputMode="numeric" min={1} defaultValue={producto?.contenido_ml ?? ""} ayuda="355, 473, 940…" />
        <Selector etiqueta="Envase" name="tipo_envase" defaultValue={producto?.tipo_envase ?? ""}>
          <option value="">No aplica</option>
          <option value="lata">Lata</option>
          <option value="botella">Botella</option>
          <option value="retornable">Retornable</option>
        </Selector>
      </div>
      <Selector etiqueta="¿Cómo se surte?" name="modo_surtido" defaultValue={producto?.modo_surtido ?? "inventario"}>
        <option value="inventario">Lo tengo en bodega (inventario)</option>
        <option value="contra_pedido">Lo compro cuando me lo piden</option>
      </Selector>
      <Selector etiqueta="Proveedor habitual (opcional)" name="proveedor_id" defaultValue={producto ? idDe(producto.proveedor) : ""}>
        <option value="">Ninguno</option>
        {catalogos.proveedores.map((p) => (
          <option key={p.id} value={String(p.id)}>
            {p.nombre}
          </option>
        ))}
      </Selector>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Existencia mínima (piezas)" name="existencia_minima" type="number" inputMode="numeric" min={0} defaultValue={producto?.existencia_minima ?? 0} error={e.existencia_minima} ayuda="Avisa cuando baje de aquí." />
        <Campo
          etiqueta="Margen que quieres ganar (%)"
          name="margen_objetivo"
          type="text"
          inputMode="decimal"
          defaultValue={producto?.margen_objetivo ? porcentaje(producto.margen_objetivo).replace("%", "") : ""}
          error={e.margen_objetivo}
          ayuda="Vacío = el de su categoría."
        />
      </div>
      <Campo etiqueta="SKU (opcional)" name="sku" defaultValue={producto?.sku ?? ""} autoComplete="off" autoCapitalize="none" />
      <AreaTexto etiqueta="Descripción (opcional)" name="descripcion" defaultValue={producto?.descripcion ?? ""} className="!min-h-20" />
    </>
  );
}

/** Lee el formulario. `patch` manda `null` para vaciar; en el alta se omiten los vacios. */
export function leerProducto(f: FormData, patch: boolean): { cuerpo: Record<string, unknown> } | { errores: Record<string, string> } {
  const t = (k: string) => String(f.get(k) ?? "").trim();
  const errores: Record<string, string> = {};
  if (!t("nombre")) errores.nombre = "Escribe el nombre.";
  if (!t("categoria_id")) errores.categoria_id = "Elige una categoría.";
  const minimo = Number(t("existencia_minima") || "0");
  if (!Number.isInteger(minimo) || minimo < 0) errores.existencia_minima = "Escribe un número entero, 0 o más.";
  const margen = fraccion(t("margen_objetivo"));
  if (margen === undefined) errores.margen_objetivo = "Escribe un porcentaje entre 0 y 90.";
  if (Object.keys(errores).length) return { errores };

  const vacio = patch ? null : undefined;
  const cuerpo: Record<string, unknown> = {
    nombre: t("nombre"),
    categoria_id: t("categoria_id"),
    marca_id: t("marca_id") || vacio,
    sku: t("sku") || vacio,
    descripcion: t("descripcion") || vacio,
    contenido_ml: t("contenido_ml") ? Number(t("contenido_ml")) : vacio,
    tipo_envase: t("tipo_envase") || vacio,
    modo_surtido: t("modo_surtido") || "inventario",
    margen_objetivo: margen ?? vacio,
    proveedor_id: t("proveedor_id") || vacio,
    existencia_minima: minimo,
  };
  for (const k of Object.keys(cuerpo)) if (cuerpo[k] === undefined) delete cuerpo[k];
  return { cuerpo };
}

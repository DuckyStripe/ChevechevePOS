import { itemsDe, fecha, hoyMX } from "@/componentes/productos/formato";
import { AccionesPromocion, NuevaPromocion } from "@/componentes/surtido/promociones";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { Casilla, Selector } from "@/componentes/ui/campo";
import { Insignia } from "@/componentes/ui/insignia";
import { Paginacion } from "@/componentes/ui/paginacion";
import { Tabla } from "@/componentes/ui/tabla";
import { Titulo } from "@/componentes/ui/tarjeta";
import { Vacio } from "@/componentes/ui/vacio";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import { dinero } from "@/lib/dinero";
import type { Lista, Promocion, Proveedor } from "@/lib/tipos";

export const metadata = { title: "Promociones de proveedores · ChevechevePOS" };

type SP = Promise<{ vigentes?: string; proveedor_id?: string; pagina?: string }>;

/** Unica pantalla de promociones de proveedor (N1). Las usa la lista de surtido para calcular cuánto ahorras. */
export default async function PaginaPromociones({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "surtido.ver")) return <SinPermiso />;
  const puedeEditar = tiene(yo.datos, "compras.registrar");

  const [r, prov] = await Promise.all([
    apiServidor<Lista<Promocion>>("/promociones", { vigentes: sp.vigentes ? "true" : undefined, proveedor_id: sp.proveedor_id, pagina: sp.pagina, por_pagina: "50" }),
    apiServidor<Lista<Proveedor> | Proveedor[]>("/proveedores", { por_pagina: "200" }),
  ]);
  if (!r.ok) return <AvisoError mensaje={r.error.mensaje} reintentar={r.error.status !== 403} />;
  const proveedores = prov.ok ? itemsDe(prov.datos) : [];
  const filtrado = !!(sp.vigentes || sp.proveedor_id);
  const hoy = hoyMX();

  return (
    <main>
      <Titulo titulo="Promociones de proveedores" ayuda="Cuando un proveedor te baja el precio por unos días, anótalo aquí y la lista de qué comprar te dirá cuánto ahorras.">
        <div className="flex flex-wrap gap-2">
          <BotonEnlace variante="secundario" href="/surtido">
            Volver a la lista
          </BotonEnlace>
          {puedeEditar && <NuevaPromocion proveedores={proveedores} />}
        </div>
      </Titulo>

      <form method="get" className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <Selector etiqueta="Proveedor" name="proveedor_id" defaultValue={sp.proveedor_id ?? ""}>
          <option value="">Todos</option>
          {proveedores.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.nombre}
            </option>
          ))}
        </Selector>
        <Casilla etiqueta="Solo las que valen hoy" name="vigentes" value="true" defaultChecked={!!sp.vigentes} />
        <Boton type="submit">Filtrar</Boton>
      </form>

      {r.datos.items.length === 0 ? (
        <Vacio texto={filtrado ? "Ninguna promoción coincide." : "Aún no hay promociones. Cuando un proveedor te ofrezca un mejor precio, anótalo aquí."}>
          {filtrado && (
            <BotonEnlace variante="secundario" href="/surtido/promociones">
              Quitar filtros
            </BotonEnlace>
          )}
        </Vacio>
      ) : (
        <Tabla
          etiqueta="Promociones"
          clave={(p) => p.id}
          filas={r.datos.items}
          columnas={[
            { titulo: "Producto", principal: true, celda: (p) => (
              <>
                {p.producto.nombre}
                <span className="block text-sm font-normal text-suave">{p.presentacion.nombre} · {p.proveedor.nombre}</span>
              </>
            ) },
            { titulo: "Cuesta", celda: (p) => (
              <>
                {dinero(p.costo_presentacion)}
                {p.minimo_cantidad > 1 && <span className="block text-sm text-suave">comprando {p.minimo_cantidad} o más</span>}
              </>
            ) },
            { titulo: "Vale", celda: (p) => `${fecha(p.desde)} al ${fecha(p.hasta)}` },
            { titulo: "Estado", celda: (p) => (p.vigente ? <Insignia tono="exito">Vale hoy</Insignia> : p.desde > hoy ? <Insignia tono="aviso">Todavía no empieza</Insignia> : <Insignia>Ya terminó</Insignia>) },
            ...(puedeEditar ? [{ titulo: "Acciones", celda: (p: Promocion) => <AccionesPromocion promocion={p} proveedores={proveedores} /> }] : []),
          ]}
        />
      )}
      <Paginacion ruta="/surtido/promociones" query={{ vigentes: sp.vigentes, proveedor_id: sp.proveedor_id }} pagina={r.datos.pagina} porPagina={r.datos.por_pagina} total={r.datos.total} />
    </main>
  );
}

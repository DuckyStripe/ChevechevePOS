import Link from "next/link";
import { Plus } from "lucide-react";
import { fecha, itemsDe, nombreDe } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { Campo, Selector } from "@/componentes/ui/campo";
import { Insignia } from "@/componentes/ui/insignia";
import { Paginacion } from "@/componentes/ui/paginacion";
import { Tabla } from "@/componentes/ui/tabla";
import { Titulo } from "@/componentes/ui/tarjeta";
import { Vacio } from "@/componentes/ui/vacio";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import { dinero } from "@/lib/dinero";
import type { CompraResumen, Lista, Proveedor } from "@/lib/tipos";

export const metadata = { title: "Compras · ChevechevePOS" };

type SP = Promise<{ desde?: string; hasta?: string; proveedor_id?: string; estado?: string; pagina?: string }>;

export default async function Compras({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "compras.ver")) return <SinPermiso />;

  const [lista, provs] = await Promise.all([
    apiServidor<Lista<CompraResumen>>("/compras", { ...sp }),
    apiServidor<Lista<Proveedor> | Proveedor[]>("/proveedores", { por_pagina: "200" }),
  ]);
  if (!lista.ok) return <AvisoError mensaje={lista.error.mensaje} reintentar={lista.error.status !== 403} />;
  const proveedores = provs.ok ? itemsDe(provs.datos) : [];
  const filtrado = !!(sp.desde || sp.hasta || sp.proveedor_id || sp.estado);

  return (
    <main>
      <Titulo titulo="Compras" ayuda="Lo que te ha surtido cada proveedor.">
        {tiene(yo.datos, "compras.registrar") && (
          <BotonEnlace href="/compras/nueva">
            <Plus aria-hidden className="size-5" /> Registrar compra
          </BotonEnlace>
        )}
      </Titulo>

      <form method="get" className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo etiqueta="Desde" name="desde" type="date" defaultValue={sp.desde} />
        <Campo etiqueta="Hasta" name="hasta" type="date" defaultValue={sp.hasta} />
        <Selector etiqueta="Proveedor" name="proveedor_id" defaultValue={sp.proveedor_id ?? ""}>
          <option value="">Todos</option>
          {proveedores.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.nombre}
            </option>
          ))}
        </Selector>
        <Selector etiqueta="Estado" name="estado" defaultValue={sp.estado ?? ""}>
          <option value="">Todas</option>
          <option value="registrada">Registradas</option>
          <option value="cancelada">Canceladas</option>
        </Selector>
        <Boton type="submit" className="sm:col-span-2 lg:col-span-4">
          Filtrar
        </Boton>
      </form>

      {lista.datos.items.length === 0 ? (
        <Vacio texto={filtrado ? "No hay compras con ese filtro." : "Aún no registras compras. Cuando te surtan, anótala aquí."}>
          {filtrado ? (
            <BotonEnlace variante="secundario" href="/compras">
              Quitar filtros
            </BotonEnlace>
          ) : (
            tiene(yo.datos, "compras.registrar") && <BotonEnlace href="/compras/nueva">Registrar compra</BotonEnlace>
          )}
        </Vacio>
      ) : (
        <Tabla
          etiqueta="Compras"
          clave={(c) => c.id}
          filas={lista.datos.items}
          columnas={[
            { titulo: "Compra", principal: true, celda: (c) => (
              <Link href={`/compras/${c.id}`} className="underline-offset-2 hover:underline">
                {c.folio}
                {c.folio_proveedor && <span className="block text-sm font-normal text-suave">Folio del proveedor: {c.folio_proveedor}</span>}
              </Link>
            ) },
            { titulo: "Fecha", celda: (c) => fecha(c.fecha) },
            { titulo: "Proveedor", celda: (c) => nombreDe(c.proveedor) },
            { titulo: "Total", celda: (c) => dinero(c.total) },
            { titulo: "Estado", celda: (c) => (c.estado === "cancelada" ? <Insignia tono="peligro">Cancelada</Insignia> : <Insignia tono="exito">Registrada</Insignia>) },
          ]}
        />
      )}
      <Paginacion ruta="/compras" query={sp} pagina={lista.datos.pagina} porPagina={lista.datos.por_pagina} total={lista.datos.total} />
    </main>
  );
}

import { itemsDe } from "@/componentes/productos/formato";
import { EditarProveedor, NuevoProveedor } from "@/componentes/proveedores/proveedores";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { Campo, Selector } from "@/componentes/ui/campo";
import { Insignia } from "@/componentes/ui/insignia";
import { Tabla } from "@/componentes/ui/tabla";
import { Titulo } from "@/componentes/ui/tarjeta";
import { Vacio } from "@/componentes/ui/vacio";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import type { Lista, Proveedor } from "@/lib/tipos";

export const metadata = { title: "Proveedores · ChevechevePOS" };

type SP = Promise<{ buscar?: string; activo?: string }>;

export default async function Proveedores({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "proveedores.gestionar")) return <SinPermiso />;
  const r = await apiServidor<Lista<Proveedor> | Proveedor[]>("/proveedores", { buscar: sp.buscar, activo: sp.activo, por_pagina: "200" });
  if (!r.ok) return <AvisoError mensaje={r.error.mensaje} reintentar={r.error.status !== 403} />;
  const filas = itemsDe(r.datos);
  const filtrado = !!(sp.buscar || sp.activo);
  const verCompras = tiene(yo.datos, "compras.ver");

  return (
    <main>
      <Titulo titulo="Proveedores" ayuda="Los distribuidores donde compras.">
        <NuevoProveedor />
      </Titulo>
      <form method="get" className="mb-5 grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <Campo etiqueta="Buscar" name="buscar" type="search" defaultValue={sp.buscar} placeholder="Nombre" />
        <Selector etiqueta="Estado" name="activo" defaultValue={sp.activo ?? ""}>
          <option value="">Todos</option>
          <option value="true">Activos</option>
          <option value="false">Desactivados</option>
        </Selector>
        <Boton type="submit">Filtrar</Boton>
      </form>
      {filas.length === 0 ? (
        <Vacio texto={filtrado ? "Ningún proveedor coincide." : "Aún no hay proveedores. Crea el primero para poder registrar compras."}>
          {filtrado && (
            <BotonEnlace variante="secundario" href="/proveedores">
              Quitar filtros
            </BotonEnlace>
          )}
        </Vacio>
      ) : (
        <Tabla
          etiqueta="Proveedores"
          clave={(p) => p.id}
          filas={filas}
          columnas={[
            { titulo: "Nombre", principal: true, celda: (p) => (
              <>
                {p.nombre}
                {p.contacto && <span className="block text-sm font-normal text-suave">{p.contacto}</span>}
              </>
            ) },
            { titulo: "Teléfono", celda: (p) => p.telefono || "—" },
            { titulo: "Estado", celda: (p) => (p.activo ? <Insignia tono="exito">Activo</Insignia> : <Insignia tono="peligro">Desactivado</Insignia>) },
            { titulo: "Acciones", celda: (p) => (
              <div className="flex flex-wrap justify-end gap-2">
                <EditarProveedor proveedor={p} />
                {verCompras && (
                  <BotonEnlace variante="fantasma" href={`/compras?proveedor_id=${p.id}`}>
                    Ver compras
                  </BotonEnlace>
                )}
              </div>
            ) },
          ]}
        />
      )}
    </main>
  );
}

import { Plus } from "lucide-react";
import { ListaClientes } from "@/componentes/clientes/lista-clientes";
import { DIAS_LARGOS } from "@/componentes/clientes/formato-clientes";
import { itemsDe } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { Campo, Selector } from "@/componentes/ui/campo";
import { Paginacion } from "@/componentes/ui/paginacion";
import { Titulo } from "@/componentes/ui/tarjeta";
import { Vacio } from "@/componentes/ui/vacio";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import type { ClienteFila, Lista, Zona } from "@/lib/tipos";

export const metadata = { title: "Clientes · ChevechevePOS" };

type SP = Promise<{ buscar?: string; zona_id?: string; dia_visita?: string; sin_ubicacion?: string; con_propuesta?: string; con_saldo?: string; alerta?: string; enlace?: string; pagina?: string; revocar?: string }>;

export default async function Clientes({ searchParams }: { searchParams: SP }) {
  const { revocar, ...filtros } = await searchParams;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "clientes.ver")) return <SinPermiso />;

  const [lista, zonas] = await Promise.all([
    apiServidor<Lista<ClienteFila>>("/clientes", { ...filtros, por_pagina: "50" }),
    apiServidor<Lista<Zona> | Zona[]>("/zonas", { por_pagina: "200" }),
  ]);
  if (!lista.ok) return <AvisoError mensaje={lista.error.mensaje} reintentar={lista.error.status !== 403} />;
  const filtrado = Object.entries(filtros).some(([k, v]) => v && k !== "pagina");

  return (
    <main>
      <Titulo titulo="Clientes" ayuda="Quién te pide, cómo les llega su link y a quién le falta algo.">
        {tiene(yo.datos, "clientes.editar") && (
          <BotonEnlace href="/clientes/nuevo">
            <Plus aria-hidden className="size-5" /> Nuevo cliente
          </BotonEnlace>
        )}
      </Titulo>

      <form method="get" className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Campo etiqueta="Buscar por nombre o teléfono" name="buscar" defaultValue={filtros.buscar} type="search" />
        <Selector etiqueta="Zona" name="zona_id" defaultValue={filtros.zona_id ?? ""}>
          <option value="">Todas</option>
          {itemsDe(zonas.ok ? zonas.datos : []).map((z) => (
            <option key={z.id} value={String(z.id)}>
              {z.nombre}
            </option>
          ))}
        </Selector>
        <Selector etiqueta="Día de visita" name="dia_visita" defaultValue={filtros.dia_visita ?? ""}>
          <option value="">Todos</option>
          {DIAS_LARGOS.slice(1).map((d, i) => (
            <option key={d} value={i + 1}>
              {d}
            </option>
          ))}
        </Selector>
        <Selector etiqueta="Su link" name="enlace" defaultValue={filtros.enlace ?? ""}>
          <option value="">Todos</option>
          <option value="activo">Activo</option>
          <option value="sin_activar">Sin activar</option>
          <option value="dado_de_baja">Dado de baja</option>
          <option value="sin_link">Sin link</option>
        </Selector>
        <Selector etiqueta="Marcas" name="alerta" defaultValue={filtros.alerta ?? ""}>
          <option value="">Todas</option>
          <option value="visitas">Abre el link y no pide</option>
          <option value="inactivo">Hace mucho que no pide</option>
          <option value="dispositivo_nuevo">Teléfono nuevo</option>
        </Selector>
        <Selector etiqueta="Saldo" name="con_saldo" defaultValue={filtros.con_saldo ?? ""}>
          <option value="">Todos</option>
          <option value="true">Solo los que deben</option>
        </Selector>
        <Selector etiqueta="Ubicación" name="sin_ubicacion" defaultValue={filtros.sin_ubicacion ?? ""}>
          <option value="">Todas</option>
          <option value="true">Solo los que no tienen</option>
        </Selector>
        <Boton type="submit" className="sm:col-span-2 lg:col-span-3">
          Filtrar
        </Boton>
      </form>

      {lista.datos.items.length === 0 ? (
        <Vacio texto={filtrado ? "No hay clientes con ese filtro." : "Aún no tienes clientes. Da de alta el primero."}>
          {filtrado ? (
            <BotonEnlace variante="secundario" href="/clientes">
              Quitar filtros
            </BotonEnlace>
          ) : (
            tiene(yo.datos, "clientes.editar") && <BotonEnlace href="/clientes/nuevo">Nuevo cliente</BotonEnlace>
          )}
        </Vacio>
      ) : (
        <ListaClientes clientes={lista.datos.items} puedeBaja={tiene(yo.datos, "clientes.enlace")} revocarInicial={revocar} />
      )}
      <Paginacion ruta="/clientes" query={filtros} pagina={lista.datos.pagina} porPagina={lista.datos.por_pagina} total={lista.datos.total} />
    </main>
  );
}

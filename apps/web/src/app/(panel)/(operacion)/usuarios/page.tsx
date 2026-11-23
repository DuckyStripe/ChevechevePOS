import { AccionesUsuario, NuevoUsuario } from "@/componentes/usuarios/usuarios";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { Campo, Selector } from "@/componentes/ui/campo";
import { Insignia } from "@/componentes/ui/insignia";
import { Paginacion } from "@/componentes/ui/paginacion";
import { Tabla } from "@/componentes/ui/tabla";
import { Titulo } from "@/componentes/ui/tarjeta";
import { Vacio } from "@/componentes/ui/vacio";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import type { Lista, Rol, Usuario } from "@/lib/tipos";

export const metadata = { title: "Usuarios · ChevechevePOS" };

type SP = Promise<{ buscar?: string; rol_id?: string; activo?: string; pagina?: string }>;

export default async function Usuarios({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "usuarios.gestionar")) return <SinPermiso />;

  const [lista, roles] = await Promise.all([
    apiServidor<Lista<Usuario>>("/usuarios", { buscar: sp.buscar, rol_id: sp.rol_id, activo: sp.activo, pagina: sp.pagina }),
    apiServidor<Rol[]>("/roles"),
  ]);
  if (!lista.ok) return <AvisoError mensaje={lista.error.mensaje} reintentar={lista.error.status !== 403} />;
  if (!roles.ok) return <AvisoError mensaje={roles.error.mensaje} reintentar={roles.error.status !== 403} />;

  const filtrado = !!(sp.buscar || sp.rol_id || sp.activo);

  return (
    <main>
      <Titulo titulo="Usuarios" ayuda="Quién puede entrar al sistema y con qué rol.">
        <NuevoUsuario roles={roles.datos} />
      </Titulo>

      <form method="get" className="mb-5 grid gap-3 sm:grid-cols-[1fr_12rem_10rem_auto] sm:items-end">
        <Campo etiqueta="Buscar" name="buscar" type="search" defaultValue={sp.buscar} placeholder="Nombre o usuario" />
        <Selector etiqueta="Rol" name="rol_id" defaultValue={sp.rol_id ?? ""}>
          <option value="">Todos</option>
          {roles.datos.map((r) => (
            <option key={r.id} value={String(r.id)}>
              {r.nombre}
            </option>
          ))}
        </Selector>
        <Selector etiqueta="Estado" name="activo" defaultValue={sp.activo ?? ""}>
          <option value="">Todos</option>
          <option value="true">Activos</option>
          <option value="false">Desactivados</option>
        </Selector>
        <Boton type="submit">
          Filtrar
        </Boton>
      </form>

      {lista.datos.items.length === 0 ? (
        <Vacio texto={filtrado ? "Nadie coincide con ese filtro." : "Aún no hay usuarios."}>
          {filtrado && (
            <BotonEnlace variante="secundario" href="/usuarios">
              Quitar filtros
            </BotonEnlace>
          )}
        </Vacio>
      ) : (
        <Tabla
          etiqueta="Usuarios"
          clave={(u) => u.id}
          filas={lista.datos.items}
          columnas={[
            { titulo: "Nombre", principal: true, celda: (u) => (
              <>
                {u.nombre}
                <span className="block text-sm font-normal text-suave">{u.usuario}</span>
              </>
            ) },
            { titulo: "Rol", celda: (u) => u.rol.nombre },
            { titulo: "Teléfono", celda: (u) => u.telefono || "—" },
            { titulo: "Estado", celda: (u) =>
              !u.activo ? <Insignia tono="peligro">Desactivado</Insignia>
              : u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date() ? <Insignia tono="aviso">Bloqueado un rato</Insignia>
              : u.debe_cambiar_contrasena ? <Insignia tono="aviso">Debe cambiar contraseña</Insignia>
              : <Insignia tono="exito">Activo</Insignia> },
            { titulo: "Acciones", celda: (u) => <AccionesUsuario usuario={u} roles={roles.datos} /> },
          ]}
        />
      )}
      <Paginacion ruta="/usuarios" query={{ buscar: sp.buscar, rol_id: sp.rol_id, activo: sp.activo }} pagina={lista.datos.pagina} porPagina={lista.datos.por_pagina} total={lista.datos.total} />
    </main>
  );
}

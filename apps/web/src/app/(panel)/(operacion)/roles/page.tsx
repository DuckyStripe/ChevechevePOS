import { AccionesRol, NuevoRol } from "@/componentes/roles/roles";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { Insignia } from "@/componentes/ui/insignia";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { Vacio } from "@/componentes/ui/vacio";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import type { Permiso, Rol } from "@/lib/tipos";

export const metadata = { title: "Roles · ChevechevePOS" };

export default async function Roles() {
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "usuarios.gestionar")) return <SinPermiso />;

  const [roles, permisos] = await Promise.all([apiServidor<Rol[]>("/roles"), apiServidor<Permiso[]>("/permisos")]);
  if (!roles.ok) return <AvisoError mensaje={roles.error.mensaje} reintentar={roles.error.status !== 403} />;
  if (!permisos.ok) return <AvisoError mensaje={permisos.error.mensaje} reintentar={permisos.error.status !== 403} />;

  return (
    <main>
      <Titulo titulo="Roles y permisos" ayuda="Cada rol es un grupo de cosas que se pueden hacer. Asígnalo a cada usuario.">
        <NuevoRol permisos={permisos.datos} />
      </Titulo>
      {roles.datos.length === 0 ? (
        <Vacio texto="Aún no hay roles." />
      ) : (
        <ul className="flex flex-col gap-3">
          {roles.datos.map((r) => (
            <li key={r.id}>
              <Tarjeta className="flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold [overflow-wrap:anywhere]">{r.nombre}</h2>
                    {r.descripcion && <p className="text-base text-suave">{r.descripcion}</p>}
                  </div>
                  {r.es_sistema && <Insignia tono="aviso">Rol base</Insignia>}
                </div>
                <p className="text-base">
                  {r.num_usuarios === 1 ? "1 usuario" : `${r.num_usuarios} usuarios`} · {r.permisos.length} {r.permisos.length === 1 ? "permiso" : "permisos"}
                </p>
                <AccionesRol rol={r} permisos={permisos.datos} />
              </Tarjeta>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

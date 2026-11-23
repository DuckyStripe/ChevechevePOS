import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { Campo, Selector } from "@/componentes/ui/campo";
import { Paginacion } from "@/componentes/ui/paginacion";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { Vacio } from "@/componentes/ui/vacio";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import type { Auditoria as Fila, Lista } from "@/lib/tipos";

export const metadata = { title: "Auditoría · ChevechevePOS" };

const TABLAS: Record<string, string> = {
  usuario: "Usuarios",
  rol: "Roles",
  rol_permiso: "Permisos de roles",
  configuracion: "Configuración",
  plantilla: "Textos de mensajes",
  sucursal: "Sucursal",
};
const ACCION = { insertar: "Creó", actualizar: "Cambió", borrar: "Eliminó" } as const;

const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso));

/** Solo las llaves que cambiaron; `antes`/`despues` ya vienen sin secretos (la base los quita). */
function cambios(f: Fila): { llave: string; antes: string; despues: string }[] {
  const a = f.antes ?? {};
  const d = f.despues ?? {};
  const ver = (v: unknown) => (v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return [...new Set([...Object.keys(a), ...Object.keys(d)])]
    .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(d[k]) && k !== "actualizado_en")
    .map((k) => ({ llave: k.replaceAll("_", " "), antes: ver(a[k]), despues: ver(d[k]) }));
}

type SP = Promise<{ tabla?: string; desde?: string; hasta?: string; pagina?: string }>;

export default async function Auditoria({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "auditoria.ver")) return <SinPermiso />;

  const r = await apiServidor<Lista<Fila>>("/auditoria", { tabla: sp.tabla, desde: sp.desde, hasta: sp.hasta, pagina: sp.pagina });
  if (!r.ok) return <AvisoError mensaje={r.error.mensaje} reintentar={r.error.status !== 403} />;
  const filtrado = !!(sp.tabla || sp.desde || sp.hasta);

  return (
    <main>
      <Titulo titulo="Auditoría" ayuda="Quién cambió qué y cuándo." />
      <form method="get" className="mb-5 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Selector etiqueta="Qué se tocó" name="tabla" defaultValue={sp.tabla ?? ""}>
          <option value="">Todo</option>
          {Object.entries(TABLAS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Selector>
        <Campo etiqueta="Desde" name="desde" type="date" defaultValue={sp.desde} />
        <Campo etiqueta="Hasta" name="hasta" type="date" defaultValue={sp.hasta} />
        <Boton type="submit">Filtrar</Boton>
      </form>

      {r.datos.items.length === 0 ? (
        <Vacio texto={filtrado ? "No hay cambios con ese filtro." : "Todavía no hay cambios registrados."}>
          {filtrado && (
            <BotonEnlace variante="secundario" href="/auditoria">
              Quitar filtros
            </BotonEnlace>
          )}
        </Vacio>
      ) : (
        <ul className="flex flex-col gap-3">
          {r.datos.items.map((f) => {
            const c = cambios(f);
            return (
              <li key={f.id}>
                <Tarjeta className="flex flex-col gap-2">
                  <p className="text-base font-semibold [overflow-wrap:anywhere]">
                    {f.usuario_nombre ?? (f.usuario_id ? `Usuario ${f.usuario_id}` : "El sistema")} {ACCION[f.accion].toLowerCase()} {(TABLAS[f.tabla] ?? f.tabla).toLowerCase()}
                  </p>
                  <p className="text-sm text-suave">
                    {fecha(f.creado_en)} · {f.registro_id}
                  </p>
                  {c.length > 0 && (
                    <details>
                      <summary className="min-h-tocable cursor-pointer py-3 text-base font-medium text-marca-fuerte">Ver qué cambió</summary>
                      <dl className="flex flex-col gap-2 text-base">
                        {c.map((x) => (
                          <div key={x.llave}>
                            <dt className="text-sm font-medium capitalize text-suave">{x.llave}</dt>
                            <dd className="[overflow-wrap:anywhere]">
                              {x.antes} → <strong>{x.despues}</strong>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  )}
                </Tarjeta>
              </li>
            );
          })}
        </ul>
      )}
      <Paginacion ruta="/auditoria" query={{ tabla: sp.tabla, desde: sp.desde, hasta: sp.hasta }} pagina={r.datos.pagina} porPagina={r.datos.por_pagina} total={r.datos.total} />
    </main>
  );
}

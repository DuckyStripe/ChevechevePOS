"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Boton } from "@/componentes/ui/boton";
import { AreaTexto, Campo, Casilla } from "@/componentes/ui/campo";
import { Dialogo, DialogoConfirmar } from "@/componentes/ui/dialogo";
import { llamar } from "@/lib/api-cliente";
import type { Permiso, Rol } from "@/lib/tipos";

function FormRol({ rol, permisos, alTerminar }: { rol?: Rol; permisos: Permiso[]; alTerminar: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const modulos = [...permisos.reduce((m, p) => m.set(p.modulo, [...(m.get(p.modulo) ?? []), p]), new Map<string, Permiso[]>())];

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const nombre = String(f.get("nombre") ?? "").trim();
    if (!nombre) return setError("Escribe el nombre del rol.");
    const cuerpo = { nombre, descripcion: String(f.get("descripcion") ?? "").trim() || undefined, permisos: f.getAll("permisos").map(String) };
    setCargando(true);
    const r = rol ? await llamar("PATCH", `/roles/${rol.id}`, cuerpo) : await llamar("POST", "/roles", cuerpo);
    setCargando(false);
    if (!r.ok) return setError(r.error.status === 409 && !rol ? "Ya hay un rol con ese nombre." : r.error.mensaje);
    toast.success(rol ? "Rol guardado." : "Rol creado.");
    alTerminar();
    router.refresh();
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <Campo etiqueta="Nombre del rol" name="nombre" defaultValue={rol?.nombre} required />
      <AreaTexto etiqueta="Para qué sirve (opcional)" name="descripcion" defaultValue={rol?.descripcion ?? ""} rows={2} />
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-base font-medium">Qué puede hacer</legend>
        {modulos.map(([modulo, lista]) => (
          <div key={modulo}>
            <p className="text-sm font-semibold uppercase tracking-wide text-suave">{modulo}</p>
            {lista.map((p) => (
              <Casilla key={p.codigo} etiqueta={p.descripcion} name="permisos" value={p.codigo} defaultChecked={rol?.permisos.includes(p.codigo)} />
            ))}
          </div>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
          {error}
        </p>
      )}
      <Boton type="submit" cargando={cargando} ancho>
        {rol ? "Guardar rol" : "Crear rol"}
      </Boton>
    </form>
  );
}

export function NuevoRol({ permisos }: { permisos: Permiso[] }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton onClick={() => setAbierto(true)}>
        <Plus aria-hidden className="size-5" /> Nuevo rol
      </Boton>
      <Dialogo abierto={abierto} titulo="Nuevo rol" alCerrar={() => setAbierto(false)}>
        <FormRol permisos={permisos} alTerminar={() => setAbierto(false)} />
      </Dialogo>
    </>
  );
}

export function AccionesRol({ rol, permisos }: { rol: Rol; permisos: Permiso[] }) {
  const router = useRouter();
  const [modo, setModo] = useState<"editar" | "borrar" | null>(null);
  const [cargando, setCargando] = useState(false);
  const cerrar = () => setModo(null);

  async function borrar() {
    setCargando(true);
    const r = await llamar("DELETE", `/roles/${rol.id}`);
    setCargando(false);
    if (!r.ok) {
      toast.error(r.error.status === 409 ? "Este rol todavía tiene usuarios. Cámbiales el rol primero." : r.error.mensaje);
      return cerrar();
    }
    toast.success("Rol eliminado.");
    cerrar();
    router.refresh();
  }

  if (rol.es_sistema) return <p className="text-sm text-suave">Rol base: no se puede cambiar.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      <Boton variante="secundario" onClick={() => setModo("editar")}>
        Editar
      </Boton>
      <Boton variante="secundario" disabled={rol.num_usuarios > 0} title={rol.num_usuarios > 0 ? "Tiene usuarios" : undefined} onClick={() => setModo("borrar")}>
        Eliminar
      </Boton>
      <Dialogo abierto={modo === "editar"} titulo={`Rol ${rol.nombre}`} alCerrar={cerrar}>
        <FormRol rol={rol} permisos={permisos} alTerminar={cerrar} />
      </Dialogo>
      <DialogoConfirmar abierto={modo === "borrar"} titulo="Eliminar rol" texto={`Se elimina el rol «${rol.nombre}». No se puede deshacer.`} confirmar="Sí, eliminar" peligro cargando={cargando} alConfirmar={borrar} alCerrar={cerrar} />
    </div>
  );
}

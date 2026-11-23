"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Boton } from "@/componentes/ui/boton";
import { Campo, Casilla, Selector } from "@/componentes/ui/campo";
import { Dialogo, DialogoConfirmar } from "@/componentes/ui/dialogo";
import { llamar } from "@/lib/api-cliente";
import type { Usuario } from "@/lib/tipos";

type RolOpcion = { id: number | string; nombre: string };
type Modo = "editar" | "contrasena" | "sesiones" | null;

function FormUsuario({ usuario, roles, alTerminar }: { usuario?: Usuario; roles: RolOpcion[]; alTerminar: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const comun = {
      nombre: String(f.get("nombre") ?? "").trim(),
      telefono: String(f.get("telefono") ?? "").trim() || undefined,
      rol_id: String(f.get("rol_id") ?? ""),
    };
    if (!comun.nombre) return setError("Escribe el nombre.");
    if (!comun.rol_id) return setError("Elige un rol.");
    setCargando(true);
    const r = usuario
      ? await llamar("PATCH", `/usuarios/${usuario.id}`, { ...comun, telefono: String(f.get("telefono") ?? "").trim() || null, activo: f.get("activo") === "on" })
      : await llamar("POST", "/usuarios", { ...comun, usuario: String(f.get("usuario") ?? "").trim(), contrasena: String(f.get("contrasena") ?? "") });
    setCargando(false);
    if (!r.ok) return setError(r.error.status === 409 && !usuario ? "Ya existe alguien con ese usuario. Usa otro." : r.error.mensaje);
    toast.success(usuario ? "Cambios guardados." : "Usuario creado. Al entrar tendrá que cambiar su contraseña.");
    alTerminar();
    router.refresh();
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      {!usuario && <Campo etiqueta="Usuario para entrar" name="usuario" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />}
      <Campo etiqueta="Nombre" name="nombre" defaultValue={usuario?.nombre} autoComplete="off" required />
      <Campo etiqueta="Teléfono (opcional)" name="telefono" type="tel" inputMode="tel" defaultValue={usuario?.telefono ?? ""} />
      <Selector etiqueta="Rol" name="rol_id" defaultValue={usuario ? String(usuario.rol.id) : ""} required>
        {!usuario && <option value="">Elige un rol</option>}
        {roles.map((r) => (
          <option key={r.id} value={String(r.id)}>
            {r.nombre}
          </option>
        ))}
      </Selector>
      {!usuario && <Campo etiqueta="Contraseña inicial" name="contrasena" type="text" autoComplete="off" ayuda="Mínimo 8. Se la das tú; al entrar la cambia." required minLength={8} />}
      {usuario && <Casilla etiqueta="Puede entrar al sistema" ayuda="Si lo quitas, se le cierra la sesión." name="activo" defaultChecked={usuario.activo} />}
      {error && (
        <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
          {error}
        </p>
      )}
      <Boton type="submit" cargando={cargando} ancho>
        {usuario ? "Guardar cambios" : "Crear usuario"}
      </Boton>
    </form>
  );
}

export function NuevoUsuario({ roles }: { roles: RolOpcion[] }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton onClick={() => setAbierto(true)}>
        <Plus aria-hidden className="size-5" /> Nuevo usuario
      </Boton>
      <Dialogo abierto={abierto} titulo="Nuevo usuario" alCerrar={() => setAbierto(false)}>
        <FormUsuario roles={roles} alTerminar={() => setAbierto(false)} />
      </Dialogo>
    </>
  );
}

/** Tres acciones por fila (como mucho 3 grandes, P1 por analogia): editar, nueva contraseña, cerrar sesiones. */
export function AccionesUsuario({ usuario, roles }: { usuario: Usuario; roles: RolOpcion[] }) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>(null);
  const [cargando, setCargando] = useState(false);
  const [errorClave, setErrorClave] = useState<string | null>(null);
  const cerrar = () => setModo(null);

  async function cerrarSesiones() {
    setCargando(true);
    const r = await llamar("POST", `/usuarios/${usuario.id}/cerrar-sesiones`);
    setCargando(false);
    if (!r.ok) return toast.error(r.error.mensaje);
    toast.success("Sesiones cerradas.");
    cerrar();
  }

  async function nuevaClave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nueva = String(new FormData(e.currentTarget).get("nueva") ?? "");
    if (nueva.length < 8) return setErrorClave("Escribe al menos 8 letras o números.");
    setErrorClave(null);
    setCargando(true);
    const r = await llamar("POST", `/usuarios/${usuario.id}/contrasena`, { nueva });
    setCargando(false);
    if (!r.ok) return setErrorClave(r.error.mensaje);
    toast.success("Contraseña restablecida. Tendrá que cambiarla al entrar.");
    cerrar();
    router.refresh();
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Boton variante="secundario" onClick={() => setModo("editar")}>
        Editar
      </Boton>
      <Boton variante="secundario" onClick={() => setModo("contrasena")}>
        Nueva contraseña
      </Boton>
      <Boton variante="secundario" onClick={() => setModo("sesiones")}>
        Cerrar sesiones
      </Boton>

      <Dialogo abierto={modo === "editar"} titulo={`Editar a ${usuario.nombre}`} alCerrar={cerrar}>
        <FormUsuario usuario={usuario} roles={roles} alTerminar={cerrar} />
      </Dialogo>

      <Dialogo abierto={modo === "contrasena"} titulo={`Nueva contraseña para ${usuario.nombre}`} alCerrar={cerrar}>
        <form onSubmit={nuevaClave} className="flex flex-col gap-4" noValidate>
          <Campo etiqueta="Contraseña nueva" name="nueva" type="text" autoComplete="off" ayuda="Se cierran sus sesiones y la cambia al entrar." error={errorClave ?? undefined} required />
          <Boton type="submit" cargando={cargando} ancho>
            Restablecer contraseña
          </Boton>
        </form>
      </Dialogo>

      <DialogoConfirmar
        abierto={modo === "sesiones"}
        titulo="Cerrar sesiones"
        texto={`${usuario.nombre} saldrá de todos sus aparatos y tendrá que entrar otra vez.`}
        confirmar="Sí, cerrar sesiones"
        peligro
        cargando={cargando}
        alConfirmar={cerrarSesiones}
        alCerrar={cerrar}
      />
    </div>
  );
}

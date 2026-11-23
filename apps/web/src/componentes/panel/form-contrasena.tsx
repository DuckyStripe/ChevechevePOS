"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { llamar } from "@/lib/api-cliente";

export function FormContrasena() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [errorNueva, setErrorNueva] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrorNueva(null);
    const f = new FormData(e.currentTarget);
    const actual = String(f.get("actual") ?? "");
    const nueva = String(f.get("nueva") ?? "");
    if (nueva.length < 8) return setErrorNueva("Escribe al menos 8 letras o números.");
    if (nueva !== f.get("repetir")) return setErrorNueva("Las dos contraseñas nuevas no son iguales.");
    setCargando(true);
    const r = await llamar("POST", "/auth/contrasena", { actual, nueva });
    setCargando(false);
    if (!r.ok) return setError(r.error.status === 401 ? "La contraseña actual no es correcta." : r.error.mensaje);
    toast.success("Listo, tu contraseña ya cambió.");
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <Campo etiqueta="Contraseña actual" name="actual" type="password" autoComplete="current-password" required />
      <Campo etiqueta="Contraseña nueva" name="nueva" type="password" autoComplete="new-password" ayuda="Mínimo 8 letras o números." error={errorNueva ?? undefined} required />
      <Campo etiqueta="Repite la contraseña nueva" name="repetir" type="password" autoComplete="new-password" required />
      {error && (
        <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
          {error}
        </p>
      )}
      <Boton type="submit" cargando={cargando} ancho>
        Guardar contraseña
      </Boton>
    </form>
  );
}

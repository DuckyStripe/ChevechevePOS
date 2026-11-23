"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { llamar } from "@/lib/api-cliente";

/** `reintentar_en` puede venir en segundos o como fecha: se dice siempre en minutos. */
function minutosDeEspera(detalles: unknown): number | null {
  const v = (detalles as { reintentar_en?: unknown } | undefined)?.reintentar_en;
  const seg = typeof v === "number" ? v : typeof v === "string" ? (new Date(v).getTime() - Date.now()) / 1000 : NaN;
  return Number.isFinite(seg) ? Math.max(1, Math.ceil(seg / 60)) : null;
}

export function FormLogin() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [ver, setVer] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const f = new FormData(e.currentTarget);
    const r = await llamar("POST", "/auth/login", { usuario: String(f.get("usuario") ?? "").trim(), contrasena: String(f.get("contrasena") ?? "") });
    if (r.ok) {
      router.replace("/");
      router.refresh();
      return;
    }
    setCargando(false);
    if (r.error.status === 401) setError("Usuario o contraseña incorrectos. Revísalos e intenta otra vez.");
    else if (r.error.status === 429) {
      const min = minutosDeEspera(r.error.detalles);
      setError(min ? `Demasiados intentos. Espera ${min} ${min === 1 ? "minuto" : "minutos"} y vuelve a intentar.` : r.error.mensaje);
    } else setError(r.error.mensaje);
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <Campo etiqueta="Usuario" name="usuario" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required autoFocus />
      <div className="flex flex-col gap-1.5">
        <Campo etiqueta="Contraseña" name="contrasena" type={ver ? "text" : "password"} autoComplete="current-password" required />
        <button type="button" onClick={() => setVer(!ver)} className="min-h-tocable self-start px-1 text-base font-medium text-marca-fuerte underline">
          {ver ? "Ocultar contraseña" : "Mostrar contraseña"}
        </button>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
          {error}
        </p>
      )}
      <Boton type="submit" cargando={cargando} ancho>
        Entrar
      </Boton>
    </form>
  );
}

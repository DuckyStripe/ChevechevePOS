import { Beer } from "lucide-react";

// Placeholder: aun no hay API de autenticacion.
export default function Login() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="flex items-center gap-2 text-2xl font-semibold">
        <Beer aria-hidden /> ChevechevePOS
      </h1>
      <form className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Usuario
          <input name="usuario" autoComplete="username" className="rounded border border-stone-400 bg-transparent px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Contraseña
          <input name="contrasena" type="password" autoComplete="current-password" className="rounded border border-stone-400 bg-transparent px-3 py-2" />
        </label>
        <button type="button" disabled className="rounded bg-amber-500 px-3 py-2 font-medium text-stone-900 disabled:opacity-50">
          Entrar (pendiente)
        </button>
      </form>
    </main>
  );
}

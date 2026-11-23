import { Beer } from "lucide-react";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { FormLogin } from "@/componentes/panel/form-login";

export const metadata = { title: "Entrar · ChevechevePOS" };

export default function Login() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-8">
      <h1 className="flex items-center gap-3 text-3xl font-bold">
        <Beer aria-hidden className="size-9 text-marca" /> ChevechevePOS
      </h1>
      <Tarjeta>
        <p className="mb-4 text-base text-suave">Entra con tu usuario y tu contraseña.</p>
        <FormLogin />
      </Tarjeta>
    </main>
  );
}

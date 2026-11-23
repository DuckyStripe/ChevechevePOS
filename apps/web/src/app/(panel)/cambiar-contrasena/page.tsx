import { FormContrasena } from "@/componentes/panel/form-contrasena";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { obtenerYo } from "@/lib/api-servidor";

export const metadata = { title: "Cambiar contraseña · ChevechevePOS" };

export default async function CambiarContrasena() {
  const r = await obtenerYo();
  const obligado = r.ok && r.datos.debe_cambiar_contrasena;
  return (
    <main className="mx-auto max-w-md">
      <Titulo
        titulo="Cambiar contraseña"
        ayuda={obligado ? "Antes de seguir, elige una contraseña nueva que solo tú sepas." : "Al cambiarla, se cierra tu sesión en los demás aparatos."}
      />
      <Tarjeta>
        <FormContrasena />
      </Tarjeta>
    </main>
  );
}

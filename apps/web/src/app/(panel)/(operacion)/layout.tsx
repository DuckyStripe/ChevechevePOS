import { redirect } from "next/navigation";
import { obtenerYo } from "@/lib/api-servidor";

/** Con `debe_cambiar_contrasena` ninguna pantalla del dia abre: solo `/cambiar-contrasena` (fuera de este grupo). */
export default async function LayoutOperacion({ children }: { children: React.ReactNode }) {
  const r = await obtenerYo();
  if (r.ok && r.datos.debe_cambiar_contrasena) redirect("/cambiar-contrasena");
  return children;
}

import { Beer } from "lucide-react";
import { Campana } from "@/componentes/panel/campana";
import { Menu } from "@/componentes/panel/menu";
import { AvisoError } from "@/componentes/ui/aviso-error";
import { obtenerYo } from "@/lib/api-servidor";
import { menuPara } from "@/lib/navegacion";

/** Marco del panel (N2 menu por permisos, N5 campana). Solo escribe `logout`; el resto son lecturas. */
export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const r = await obtenerYo();
  if (!r.ok) {
    return (
      <main className="mx-auto max-w-lg p-4">
        <AvisoError mensaje={r.error.mensaje} />
      </main>
    );
  }
  const yo = r.datos;

  return (
    <div className="min-h-dvh lg:pl-72">
      <Menu grupos={menuPara(yo.permisos)} nombre={yo.nombre} rol={yo.rol.nombre} restringido={yo.debe_cambiar_contrasena} />
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-borde bg-superficie/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur lg:justify-end">
        <span className="flex items-center gap-2 pl-2 font-bold lg:hidden">
          <Beer aria-hidden className="size-5 text-marca" /> Chevecheve
        </span>
        <div className="flex items-center">
          {/* key: al leer avisos el servidor manda otro conteo y la campana arranca con el nuevo */}
          <Campana key={yo.notificaciones_sin_leer} inicial={yo.notificaciones_sin_leer} />
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
    </div>
  );
}

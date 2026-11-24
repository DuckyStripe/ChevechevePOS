import { Suspense, type CSSProperties } from "react";
import { Toaster } from "sonner";
import { BandejaAvisos } from "@/componentes/avisos/bandeja";
import { Campana } from "@/componentes/panel/campana";
import { Menu } from "@/componentes/panel/menu";
import { AvisoError } from "@/componentes/ui/aviso-error";
import { Marca } from "@/componentes/ui/marca";
import { obtenerYo, tiene } from "@/lib/api-servidor";
import { menuPara } from "@/lib/navegacion";

// Toasts de Sonner con los tokens del sistema (claro/oscuro sale solo de las variables CSS).
const ESTILO_TOASTS = {
  "--normal-bg": "var(--superficie)",
  "--normal-text": "var(--texto)",
  "--normal-border": "var(--borde)",
  "--success-bg": "var(--exito-suave)",
  "--success-text": "var(--exito)",
  "--success-border": "color-mix(in oklab, var(--exito) 30%, transparent)",
  "--error-bg": "var(--peligro-suave)",
  "--error-text": "var(--peligro)",
  "--error-border": "color-mix(in oklab, var(--peligro) 30%, transparent)",
  "--border-radius": "var(--radius-tarjeta)",
} as CSSProperties;

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
      {/* Sin backdrop-blur: cuesta en Android baratos y vuelve al header el contenedor del cajon fijo. */}
      <header className="sticky top-0 z-20 flex min-h-14 items-center justify-between gap-2 border-b border-borde bg-fondo px-2 pt-[env(safe-area-inset-top)] lg:justify-end lg:px-4">
        <div className="flex min-w-0 items-center gap-1">
          {/* El menu va aqui para que su boton quede en la barra; en PC su <nav> fijo es la barra lateral. */}
          <Menu grupos={menuPara(yo.permisos)} nombre={yo.nombre} rol={yo.rol.nombre} restringido={yo.debe_cambiar_contrasena} />
          <span className="lg:hidden">
            <Marca />
          </span>
        </div>
        <div className="flex items-center">
          {tiene(yo, "avisos.enviar") && (
            <Suspense>
              <BandejaAvisos puedeMarcar={tiene(yo, "pedidos.ver")} />
            </Suspense>
          )}
          {/* key: al leer avisos el servidor manda otro conteo y la campana arranca con el nuevo */}
          <Campana key={yo.notificaciones_sin_leer} inicial={yo.notificaciones_sin_leer} />
        </div>
      </header>
      <Toaster position="top-center" theme="system" richColors style={ESTILO_TOASTS} toastOptions={{ className: "text-base" }} />
      <div className="mx-auto w-full max-w-5xl px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:py-8">{children}</div>
    </div>
  );
}

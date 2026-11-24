"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { House, KeyRound, LogOut, Menu as IconoMenu, X } from "lucide-react";
import { toast } from "sonner";
import { Marca } from "@/componentes/ui/marca";
import { NumeroPaso } from "@/componentes/ui/numero-paso";
import { llamar } from "@/lib/api-cliente";
import { NUMERO_PASO, type Grupo } from "@/lib/navegacion";

type Props = {
  grupos: { grupo: Grupo; titulo: string; entradas: { ruta: string; titulo: string }[] }[];
  nombre: string;
  rol: string;
  /** Con la contraseña por cambiar solo se ofrece «Salir» (el servidor ya redirige lo demás). */
  restringido: boolean;
};

// Activo: fondo de marca suave + barra a la izquierda (no solo color: tambien `aria-current`).
const ENLACE =
  "relative flex min-h-tocable items-center gap-3 rounded-xl px-3 text-base font-medium transition-[background-color,transform] duration-150 ease-salida active:scale-[0.98] active:bg-hundido hover:bg-hundido aria-[current=page]:bg-marca-suave aria-[current=page]:font-semibold aria-[current=page]:text-marca-fuerte aria-[current=page]:before:absolute aria-[current=page]:before:inset-y-2.5 aria-[current=page]:before:left-0 aria-[current=page]:before:w-1 aria-[current=page]:before:rounded-full aria-[current=page]:before:bg-marca";

export function Menu({ grupos, nombre, rol, restringido }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  async function salir() {
    setSaliendo(true);
    const r = await llamar("POST", "/auth/logout");
    if (!r.ok) {
      setSaliendo(false);
      toast.error(r.error.mensaje);
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  const actual = (ruta: string) => (pathname === ruta || pathname.startsWith(`${ruta}/`) ? ("page" as const) : undefined);
  const cerrar = () => setAbierto(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Abrir menú"
        aria-expanded={abierto}
        className="flex size-12 items-center justify-center rounded-xl transition-transform duration-150 ease-salida active:scale-95 active:bg-hundido lg:hidden"
      >
        <IconoMenu aria-hidden className="size-6" />
      </button>

      {/* Velo: siempre montado para poder fundirse; sin clics mientras esta cerrado. */}
      <button
        type="button"
        aria-label="Cerrar menú"
        tabIndex={abierto ? 0 : -1}
        onClick={cerrar}
        className={`fixed inset-0 z-30 bg-velo transition-opacity duration-300 ease-salida lg:hidden ${abierto ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      {/* Cajon: transform con curva tipo iOS; cerrado en movil queda `invisible` (fuera del orden de tabulacion). */}
      <nav
        aria-label="Menú principal"
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col gap-0.5 overflow-y-auto overscroll-contain border-r border-borde bg-superficie p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] shadow-dialogo transition-[transform,visibility] duration-300 ease-cajon lg:visible lg:translate-x-0 lg:shadow-none ${
          abierto ? "visible translate-x-0" : "invisible -translate-x-full"
        }`}
      >
        <div className="mb-3 flex min-h-tocable items-center justify-between pl-2">
          <Marca />
          <button type="button" onClick={cerrar} aria-label="Cerrar menú" className="flex size-12 items-center justify-center rounded-xl active:bg-hundido lg:hidden">
            <X aria-hidden className="size-6" />
          </button>
        </div>

        {!restringido && (
          <>
            <Link href="/" onClick={cerrar} aria-current={pathname === "/" ? "page" : undefined} className={ENLACE}>
              <House aria-hidden className="size-5" /> Hoy
            </Link>
            {grupos.map((g) => {
              const n = NUMERO_PASO[g.grupo];
              return (
                <div key={g.grupo} className="mt-3">
                  <p className="flex items-center gap-2.5 px-3 pb-1 text-sm font-semibold text-suave">
                    {n ? <NumeroPaso n={n} chico /> : null}
                    {g.titulo}
                  </p>
                  {g.entradas.map((e) => (
                    <Link key={e.ruta} href={e.ruta} onClick={cerrar} aria-current={actual(e.ruta)} className={`${ENLACE} ${n ? "pl-[2.875rem]" : ""}`}>
                      {e.titulo}
                    </Link>
                  ))}
                </div>
              );
            })}
          </>
        )}

        <div className="mt-auto border-t border-borde pt-3">
          <p className="px-3 text-base font-semibold [overflow-wrap:anywhere]">{nombre}</p>
          <p className="px-3 pb-2 text-sm text-suave">{rol}</p>
          {!restringido && (
            <Link href="/cambiar-contrasena" onClick={cerrar} aria-current={actual("/cambiar-contrasena")} className={ENLACE}>
              <KeyRound aria-hidden className="size-5" /> Cambiar contraseña
            </Link>
          )}
          <button type="button" onClick={salir} disabled={saliendo} className={`${ENLACE} w-full text-left disabled:opacity-50`}>
            <LogOut aria-hidden className="size-5" /> Salir
          </button>
        </div>
      </nav>
    </>
  );
}

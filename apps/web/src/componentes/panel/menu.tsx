"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Beer, House, KeyRound, LogOut, Menu as IconoMenu, X } from "lucide-react";
import { toast } from "sonner";
import { llamar } from "@/lib/api-cliente";
import type { Grupo } from "@/lib/navegacion";

type Props = {
  grupos: { grupo: Grupo; titulo: string; entradas: { ruta: string; titulo: string }[] }[];
  nombre: string;
  rol: string;
  /** Con la contraseña por cambiar solo se ofrece «Salir» (el servidor ya redirige lo demás). */
  restringido: boolean;
};

const ENLACE = "flex min-h-tocable items-center gap-3 rounded-xl px-3 text-base font-medium";

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

  const activo = (ruta: string) => (pathname === ruta || pathname.startsWith(`${ruta}/`) ? "bg-marca-suave text-marca-fuerte" : "hover:bg-marca-suave");

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Abrir menú"
        className="flex size-12 items-center justify-center rounded-xl hover:bg-marca-suave lg:hidden"
      >
        <IconoMenu aria-hidden className="size-6" />
      </button>

      {abierto && <button type="button" aria-label="Cerrar menú" onClick={() => setAbierto(false)} className="fixed inset-0 z-30 bg-texto/50 lg:hidden" />}

      <nav
        aria-label="Menú principal"
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col gap-1 overflow-y-auto border-r border-borde bg-superficie p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] transition-transform lg:translate-x-0 ${
          abierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-2 flex items-center justify-between px-2">
          <span className="flex items-center gap-2 text-lg font-bold">
            <Beer aria-hidden className="size-6 text-marca" /> Chevecheve
          </span>
          <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar menú" className="flex size-12 items-center justify-center rounded-xl lg:hidden">
            <X aria-hidden className="size-6" />
          </button>
        </div>

        {!restringido && (
          <>
            <Link href="/" onClick={() => setAbierto(false)} className={`${ENLACE} ${pathname === "/" ? "bg-marca-suave text-marca-fuerte" : "hover:bg-marca-suave"}`}>
              <House aria-hidden className="size-5" /> Hoy
            </Link>
            {grupos.map((g) => (
              <div key={g.grupo} className="mt-3">
                <p className="px-3 pb-1 text-sm font-semibold uppercase tracking-wide text-suave">{g.titulo}</p>
                {g.entradas.map((e) => (
                  <Link key={e.ruta} href={e.ruta} onClick={() => setAbierto(false)} className={`${ENLACE} ${activo(e.ruta)}`}>
                    {e.titulo}
                  </Link>
                ))}
              </div>
            ))}
          </>
        )}

        <div className="mt-auto border-t border-borde pt-3">
          <p className="px-3 text-base font-semibold [overflow-wrap:anywhere]">{nombre}</p>
          <p className="px-3 pb-2 text-sm text-suave">{rol}</p>
          {!restringido && (
            <Link href="/cambiar-contrasena" onClick={() => setAbierto(false)} className={`${ENLACE} ${activo("/cambiar-contrasena")}`}>
              <KeyRound aria-hidden className="size-5" /> Cambiar contraseña
            </Link>
          )}
          <button type="button" onClick={salir} disabled={saliendo} className={`${ENLACE} w-full text-left hover:bg-marca-suave disabled:opacity-50`}>
            <LogOut aria-hidden className="size-5" /> Salir
          </button>
        </div>
      </nav>
    </>
  );
}

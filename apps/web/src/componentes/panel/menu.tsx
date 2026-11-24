"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  BarChart3, Boxes, ClipboardList, FileClock, House, KeyRound, LogOut, Menu as IconoMenu, Navigation, PackageCheck, Receipt, Route,
  Settings, ShieldCheck, ShoppingCart, Store, Tags, Truck, UserCog, Users, Wallet, Warehouse, HandCoins, Lock, Package, X, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Marca } from "@/componentes/ui/marca";
import { llamar } from "@/lib/api-cliente";
import { NUMERO_PASO, type Grupo } from "@/lib/navegacion";

// Solo presentacion: un icono por pantalla para leer el menu de un vistazo (la ruta y el permiso siguen en navegacion.ts).
const ICONOS: Record<string, LucideIcon> = {
  "/pedidos": ClipboardList, "/surtido": PackageCheck, "/compras": ShoppingCart, "/rutas": Route, "/reparto": Navigation,
  "/cobranza": HandCoins, "/cierre": Lock, "/ventas": Receipt, "/pos": Store, "/caja": Wallet, "/reportes": BarChart3,
  "/clientes": Users, "/productos": Package, "/precios": Tags, "/catalogos": Boxes, "/inventario": Warehouse,
  "/proveedores": Truck, "/usuarios": UserCog, "/roles": ShieldCheck, "/configuracion": Settings, "/auditoria": FileClock,
};

type Props = {
  grupos: { grupo: Grupo; titulo: string; entradas: { ruta: string; titulo: string }[] }[];
  nombre: string;
  rol: string;
  /** Con la contraseña por cambiar solo se ofrece «Salir» (el servidor ya redirige lo demás). */
  restringido: boolean;
};

// Activo: fondo de marca suave + barra a la izquierda (no solo color: tambien `aria-current`). 44px en PC, 48px en el cajon del telefono.
const ENLACE =
  "relative flex min-h-tocable items-center gap-3 rounded-lg px-3 text-base font-medium text-texto/85 transition-[background-color,transform] duration-150 ease-salida active:scale-[0.98] active:bg-hundido hover:bg-hundido lg:min-h-11 lg:text-[0.9375rem] aria-[current=page]:bg-marca-suave aria-[current=page]:font-semibold aria-[current=page]:text-marca-fuerte aria-[current=page]:before:absolute aria-[current=page]:before:inset-y-2 aria-[current=page]:before:left-0 aria-[current=page]:before:w-1 aria-[current=page]:before:rounded-full aria-[current=page]:before:bg-marca";
const ICONO = "size-5 shrink-0 opacity-80";

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
        {/* Misma altura que la barra de arriba (h-14) para que la linea inferior siga de lado a lado. */}
        <div className="-mx-3 -mt-3 mb-2 flex h-14 shrink-0 items-center justify-between border-b border-borde px-5 pt-[env(safe-area-inset-top)] lg:pt-0">
          <Marca />
          <button type="button" onClick={cerrar} aria-label="Cerrar menú" className="-mr-2 flex size-12 items-center justify-center rounded-xl active:bg-hundido lg:hidden">
            <X aria-hidden className="size-6" />
          </button>
        </div>

        {!restringido && (
          <>
            <Link href="/" onClick={cerrar} aria-current={pathname === "/" ? "page" : undefined} className={ENLACE}>
              <House aria-hidden className={ICONO} /> Hoy
            </Link>
            {grupos.map((g) => {
              const n = NUMERO_PASO[g.grupo];
              return (
                <div key={g.grupo} role="group" aria-labelledby={`menu-${g.grupo}`} className="mt-3">
                  <p id={`menu-${g.grupo}`} className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-suave">
                    {n ? <span className="cifra text-marca">{n} · </span> : null}
                    {g.titulo}
                  </p>
                  {g.entradas.map((e) => {
                    const Icono = ICONOS[e.ruta] ?? House;
                    return (
                      <Link key={e.ruta} href={e.ruta} onClick={cerrar} aria-current={actual(e.ruta)} className={ENLACE}>
                        <Icono aria-hidden className={ICONO} /> {e.titulo}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}

        <div className="mt-auto border-t border-borde pt-3 lg:mt-6">
          <p className="px-3 text-base font-semibold [overflow-wrap:anywhere]">{nombre}</p>
          <p className="px-3 pb-2 text-sm text-suave">{rol}</p>
          {!restringido && (
            <Link href="/cambiar-contrasena" onClick={cerrar} aria-current={actual("/cambiar-contrasena")} className={ENLACE}>
              <KeyRound aria-hidden className={ICONO} /> Cambiar contraseña
            </Link>
          )}
          <button type="button" onClick={salir} disabled={saliendo} className={`${ENLACE} w-full text-left disabled:opacity-50`}>
            <LogOut aria-hidden className={ICONO} /> Salir
          </button>
        </div>
      </nav>
    </>
  );
}

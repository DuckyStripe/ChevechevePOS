import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";

type Variante = "primario" | "secundario" | "peligro" | "fantasma";

const BASE =
  "inline-flex min-h-tocable items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const VARIANTES: Record<Variante, string> = {
  primario: "bg-marca text-white hover:bg-marca-fuerte active:bg-marca-fuerte",
  secundario: "border border-borde bg-superficie text-texto hover:bg-marca-suave active:bg-marca-suave",
  peligro: "bg-peligro text-white hover:opacity-90 active:opacity-90",
  fantasma: "text-marca-fuerte hover:bg-marca-suave active:bg-marca-suave",
};

export const clasesBoton = (v: Variante = "primario", ancho = false) => `${BASE} ${VARIANTES[v]} ${ancho ? "w-full" : ""}`;

type Props = ComponentProps<"button"> & { variante?: Variante; cargando?: boolean; ancho?: boolean };

export function Boton({ variante = "primario", cargando, ancho, className = "", disabled, children, type = "button", ...r }: Props) {
  return (
    <button type={type} disabled={disabled || cargando} aria-busy={cargando} className={`${clasesBoton(variante, ancho)} ${className}`} {...r}>
      {cargando && <Loader2 aria-hidden className="size-5 animate-spin" />}
      {children}
    </button>
  );
}

export function BotonEnlace({ variante = "primario", ancho, className = "", ...r }: ComponentProps<typeof Link> & { variante?: Variante; ancho?: boolean }) {
  return <Link className={`${clasesBoton(variante, ancho)} ${className}`} {...r} />;
}

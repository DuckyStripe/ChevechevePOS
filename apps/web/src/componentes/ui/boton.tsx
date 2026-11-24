import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";

type Variante = "primario" | "secundario" | "peligro" | "fantasma";
type Tam = "normal" | "grande";

// Presion: escala 0.97 en 120 ms (solo transform); color con `ease`. El hover de Tailwind 4 ya solo aplica con mouse.
const BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold select-none transition-[transform,background-color,border-color,color] duration-150 ease-salida active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";
const TAMS: Record<Tam, string> = {
  normal: "min-h-tocable px-5 text-base",
  grande: "min-h-tocable-grande px-6 text-lg font-bold", // accion primaria de la pantalla (56 px)
};
const VARIANTES: Record<Variante, string> = {
  primario: "bg-marca text-white shadow-boton hover:bg-marca-presionado active:bg-marca-presionado",
  secundario: "border border-borde bg-superficie text-texto shadow-tarjeta hover:bg-hundido active:bg-hundido",
  peligro: "bg-peligro-relleno text-white shadow-boton hover:opacity-90 active:opacity-90",
  fantasma: "text-marca-fuerte hover:bg-marca-suave active:bg-marca-suave",
};

export const clasesBoton = (v: Variante = "primario", ancho = false, tam: Tam = "normal") => `${BASE} ${TAMS[tam]} ${VARIANTES[v]} ${ancho ? "w-full" : ""}`;

type Props = ComponentProps<"button"> & { variante?: Variante; cargando?: boolean; ancho?: boolean; tam?: Tam };

export function Boton({ variante = "primario", cargando, ancho, tam, className = "", disabled, children, type = "button", ...r }: Props) {
  return (
    <button type={type} disabled={disabled || cargando} aria-busy={cargando} className={`${clasesBoton(variante, ancho, tam)} ${className}`} {...r}>
      {cargando && <Loader2 aria-hidden className="size-5 animate-spin" />}
      {children}
    </button>
  );
}

export function BotonEnlace({ variante = "primario", ancho, tam, className = "", ...r }: ComponentProps<typeof Link> & { variante?: Variante; ancho?: boolean; tam?: Tam }) {
  return <Link className={`${clasesBoton(variante, ancho, tam)} ${className}`} {...r} />;
}

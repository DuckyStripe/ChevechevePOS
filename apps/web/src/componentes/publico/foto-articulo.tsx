import { Package } from "lucide-react";

/** Miniatura 240 px (C9): ancho/alto fijos, carga diferida. `miniatura` puede venir como nombre de archivo o como ruta. */
export const rutaImagen = (m: string) => (m.startsWith("/") || m.startsWith("http") ? m : `/img/${m}`);

export function FotoArticulo({ miniatura, tam = 64 }: { miniatura: string | null; tam?: number }) {
  if (!miniatura) {
    return (
      <span aria-hidden style={{ width: tam, height: tam }} className="flex shrink-0 items-center justify-center rounded-xl bg-hundido text-suave">
        <Package className="size-6" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- miniatura de 240 px ya reducida; /img sirve cache inmutable
    <img src={rutaImagen(miniatura)} alt="" width={tam} height={tam} loading="lazy" decoding="async" className="shrink-0 rounded-xl bg-hundido object-cover" style={{ width: tam, height: tam }} />
  );
}

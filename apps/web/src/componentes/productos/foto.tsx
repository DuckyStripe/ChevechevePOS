import { ImageOff } from "lucide-react";
import { urlMiniatura } from "./formato";

/** Miniatura con tamano fijo (sin saltos) y carga diferida; sin foto, un icono con texto accesible. */
export function Foto({ imagen, tam = 56 }: { imagen: string | null; tam?: number }) {
  const estilo = { width: tam, height: tam };
  if (!imagen)
    return (
      <span role="img" aria-label="Sin foto" style={estilo} className="inline-flex shrink-0 items-center justify-center rounded-xl bg-borde/50 text-suave">
        <ImageOff aria-hidden className="size-5" />
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element -- miniatura de 240 px ya reducida; /img sirve cache inmutable
    <img src={urlMiniatura(imagen)} alt="" width={tam} height={tam} loading="lazy" decoding="async" style={estilo} className="shrink-0 rounded-xl object-cover" />
  );
}

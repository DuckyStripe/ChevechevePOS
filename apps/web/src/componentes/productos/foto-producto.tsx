"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Boton } from "@/componentes/ui/boton";
import { llamar, subirArchivo } from "@/lib/api-cliente";
import { reducirImagen } from "@/lib/imagen";
import { mensajeError, urlMiniatura } from "./formato";

/** Foto del producto: se reduce en el telefono (800 px + miniatura de 240 px) y se sube con `PUT /productos/:id/imagen`. */
export function FotoProducto({ productoId, imagen, puedeEditar }: { productoId: string; imagen: string | null; puedeEditar: boolean }) {
  const router = useRouter();
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const [trabajando, setTrabajando] = useState<"subiendo" | "quitando" | null>(null);

  async function elegida(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    if (!archivo.type.startsWith("image/")) return void toast.error("Elige una foto.");
    setTrabajando("subiendo");
    try {
      const { imagen: grande, miniatura, extension } = await reducirImagen(archivo);
      const f = new FormData();
      f.append("imagen", grande, `foto.${extension}`);
      f.append("miniatura", miniatura, `miniatura.${extension}`);
      const r = await subirArchivo<{ imagen: string }>(`/productos/${productoId}/imagen`, f);
      if (!r.ok) return void toast.error(mensajeError(r.error));
      toast.success("Foto guardada.");
      router.refresh();
    } catch {
      toast.error("No pudimos preparar esa foto. Prueba con otra.");
    } finally {
      setTrabajando(null);
    }
  }

  async function quitar() {
    setTrabajando("quitando");
    const r = await llamar("DELETE", `/productos/${productoId}/imagen`);
    setTrabajando(null);
    if (!r.ok) return void toast.error(mensajeError(r.error));
    toast.success("Foto quitada.");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-3">
      {imagen ? (
        // eslint-disable-next-line @next/next/no-img-element -- miniatura ya reducida, cache inmutable
        <img src={urlMiniatura(imagen)} alt="Foto del producto" width={160} height={160} className="size-40 rounded-tarjeta border border-borde object-cover" />
      ) : (
        <p className="flex size-40 items-center justify-center rounded-tarjeta border border-dashed border-borde p-3 text-center text-base text-suave">Sin foto todavía</p>
      )}
      {puedeEditar && (
        <>
          <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={elegida} />
          <input ref={galeria} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={elegida} />
          <div className="flex flex-wrap gap-2">
            <Boton variante="secundario" cargando={trabajando === "subiendo"} onClick={() => camara.current?.click()}>
              <Camera aria-hidden className="size-5" /> Tomar foto
            </Boton>
            <Boton variante="secundario" disabled={trabajando !== null} onClick={() => galeria.current?.click()}>
              <ImagePlus aria-hidden className="size-5" /> Elegir de la galería
            </Boton>
            {imagen && (
              <Boton variante="fantasma" cargando={trabajando === "quitando"} onClick={quitar}>
                <Trash2 aria-hidden className="size-5" /> Quitar foto
              </Boton>
            )}
          </div>
        </>
      )}
    </div>
  );
}

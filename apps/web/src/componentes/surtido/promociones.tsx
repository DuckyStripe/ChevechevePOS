"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { BuscadorProductos } from "@/componentes/productos/buscador-productos";
import { hoyMX, mensajeError, PRECIO_VALIDO } from "@/componentes/productos/formato";
import { Boton } from "@/componentes/ui/boton";
import { AreaTexto, Campo, Selector } from "@/componentes/ui/campo";
import { Dialogo, DialogoConfirmar } from "@/componentes/ui/dialogo";
import { llamar } from "@/lib/api-cliente";
import type { Promocion, Proveedor } from "@/lib/tipos";

type Eleccion = { id: string; texto: string };

/** Alta (con buscador de producto) y edicion (sin cambiar de presentacion: se borra y se crea otra) de una promocion de proveedor. */
function Formulario({ promocion, proveedores, alTerminar }: { promocion?: Promocion; proveedores: Proveedor[]; alTerminar: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [eleccion, setEleccion] = useState<Eleccion | null>(promocion ? { id: String(promocion.presentacion.id), texto: `${promocion.producto.nombre} · ${promocion.presentacion.nombre}` } : null);

  async function enviar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const t = (k: string) => String(f.get(k) ?? "").trim();
    if (!t("proveedor_id")) return setError("Elige el proveedor.");
    if (!eleccion) return setError("Busca el producto y elige cómo se compra (caja, six…).");
    if (!PRECIO_VALIDO.test(t("costo"))) return setError("Escribe cuánto cuesta cada una con la promoción (por ejemplo 280 o 280.50).");
    const minimo = Number(t("minimo") || "1");
    if (!Number.isInteger(minimo) || minimo < 1) return setError("El mínimo es cuántas hay que comprar para que aplique: 1 o más.");
    if (!t("desde") || !t("hasta")) return setError("Pon desde cuándo y hasta cuándo vale.");
    if (t("hasta") < t("desde")) return setError("La promoción no puede terminar antes de empezar.");
    const notas = t("notas");
    const cuerpo = {
      proveedor_id: t("proveedor_id"),
      ...(promocion ? {} : { presentacion_id: eleccion.id }),
      costo_presentacion: t("costo"),
      minimo_cantidad: minimo,
      desde: t("desde"),
      hasta: t("hasta"),
      notas: notas || (promocion ? null : undefined),
    };
    setError(null);
    setCargando(true);
    const r = promocion ? await llamar("PATCH", `/promociones/${promocion.id}`, cuerpo) : await llamar("POST", "/promociones", cuerpo);
    setCargando(false);
    if (!r.ok) return setError(mensajeError(r.error));
    toast.success("Promoción guardada.");
    alTerminar();
    router.refresh();
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
      <Selector etiqueta="Proveedor" name="proveedor_id" defaultValue={promocion ? String(promocion.proveedor.id) : ""}>
        <option value="">Elige el proveedor</option>
        {proveedores.filter((p) => p.activo || String(p.id) === String(promocion?.proveedor.id)).map((p) => (
          <option key={p.id} value={String(p.id)}>
            {p.nombre}
          </option>
        ))}
      </Selector>
      {eleccion ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-borde p-3">
          <p className="min-w-0 text-base font-semibold [overflow-wrap:anywhere]">{eleccion.texto}</p>
          {!promocion && (
            <Boton variante="fantasma" onClick={() => setEleccion(null)}>
              Cambiar
            </Boton>
          )}
        </div>
      ) : (
        <BuscadorProductos
          etiqueta="¿De qué producto es la promoción?"
          ayuda="Escribe «corona», «victoria»…"
          resultado={(p, limpiar) => (
            <div>
              <p className="mb-2 text-base font-semibold [overflow-wrap:anywhere]">{p.nombre}</p>
              <div className="flex flex-wrap gap-2">
                {p.presentaciones.filter((x) => x.activa && x.se_compra).map((x) => (
                  <Boton key={x.id} variante="secundario" onClick={() => { setEleccion({ id: String(x.id), texto: `${p.nombre} · ${x.nombre}` }); limpiar(); }}>
                    {x.nombre}
                  </Boton>
                ))}
              </div>
            </div>
          )}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Cuesta con la promoción ($)" name="costo" inputMode="decimal" defaultValue={promocion?.costo_presentacion ?? ""} placeholder="280.00" autoComplete="off" />
        <Campo etiqueta="Hay que comprar al menos" name="minimo" type="number" inputMode="numeric" min={1} defaultValue={promocion?.minimo_cantidad ?? 1} />
        <Campo etiqueta="Vale desde" name="desde" type="date" defaultValue={promocion?.desde ?? hoyMX()} />
        <Campo etiqueta="Vale hasta" name="hasta" type="date" defaultValue={promocion?.hasta ?? ""} />
      </div>
      <AreaTexto etiqueta="Notas (opcional)" name="notas" defaultValue={promocion?.notas ?? ""} className="!min-h-20" />
      {error && (
        <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
          {error}
        </p>
      )}
      <Boton type="submit" cargando={cargando} ancho>
        Guardar
      </Boton>
    </form>
  );
}

export function NuevaPromocion({ proveedores }: { proveedores: Proveedor[] }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton onClick={() => setAbierto(true)}>
        <Plus aria-hidden className="size-5" /> Nueva promoción
      </Boton>
      <Dialogo abierto={abierto} titulo="Nueva promoción" alCerrar={() => setAbierto(false)}>
        <Formulario proveedores={proveedores} alTerminar={() => setAbierto(false)} />
      </Dialogo>
    </>
  );
}

export function AccionesPromocion({ promocion, proveedores }: { promocion: Promocion; proveedores: Proveedor[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [cargando, setCargando] = useState(false);

  async function borrar() {
    setCargando(true);
    const r = await llamar("DELETE", `/promociones/${promocion.id}`);
    setCargando(false);
    if (!r.ok) return void toast.error(r.error.mensaje);
    setBorrando(false);
    toast.success("Promoción borrada.");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Boton variante="secundario" onClick={() => setEditando(true)}>
        Editar
      </Boton>
      <Boton variante="fantasma" onClick={() => setBorrando(true)}>
        Borrar
      </Boton>
      <Dialogo abierto={editando} titulo="Editar promoción" alCerrar={() => setEditando(false)}>
        <Formulario promocion={promocion} proveedores={proveedores} alTerminar={() => setEditando(false)} />
      </Dialogo>
      <DialogoConfirmar
        abierto={borrando}
        titulo="¿Borrar esta promoción?"
        texto={`Se quita la promoción de ${promocion.producto.nombre}. La lista de qué comprar ya no la tomará en cuenta.`}
        confirmar="Sí, borrarla"
        peligro
        cargando={cargando}
        alConfirmar={borrar}
        alCerrar={() => setBorrando(false)}
      />
    </div>
  );
}

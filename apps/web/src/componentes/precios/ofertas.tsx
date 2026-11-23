"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { fecha, mensajeError, PRECIO_VALIDO } from "@/componentes/productos/formato";
import { Boton } from "@/componentes/ui/boton";
import { Campo, Selector } from "@/componentes/ui/campo";
import { Dialogo, DialogoConfirmar } from "@/componentes/ui/dialogo";
import { Insignia } from "@/componentes/ui/insignia";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { Vacio } from "@/componentes/ui/vacio";
import { llamar } from "@/lib/api-cliente";
import { dinero } from "@/lib/dinero";
import type { ListaPrecio, Oferta } from "@/lib/tipos";

export type OpcionPresentacion = { id: string; etiqueta: string };
const MOTIVO = { por_caducar: "Por caducar", promocion: "Promoción" } as const;

function FormOferta({ oferta, opciones, listas, presentacionInicial, motivoInicial, hoy, alTerminar }: {
  oferta?: Oferta;
  opciones: OpcionPresentacion[];
  listas: ListaPrecio[];
  presentacionInicial?: string;
  motivoInicial?: Oferta["motivo"];
  hoy: string;
  alTerminar: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const t = (k: string) => String(f.get(k) ?? "").trim();
    if (!oferta && !t("presentacion_id")) return setError("Elige el producto.");
    if (!PRECIO_VALIDO.test(t("precio"))) return setError("Escribe el precio como 280 o 280.50.");
    if (!t("desde") || !t("hasta")) return setError("Elige desde y hasta cuándo.");
    if (t("hasta") < t("desde")) return setError("La oferta no puede terminar antes de empezar.");
    setError(null);
    const base = { precio: t("precio"), desde: t("desde"), hasta: t("hasta"), motivo: t("motivo"), lista_precio_id: t("lista_precio_id") || (oferta ? null : undefined) };
    const cuerpo: Record<string, unknown> = oferta ? base : { ...base, presentacion_id: t("presentacion_id") };
    if (cuerpo.lista_precio_id === undefined) delete cuerpo.lista_precio_id;
    setCargando(true);
    const r = oferta ? await llamar("PATCH", `/ofertas/${oferta.id}`, cuerpo) : await llamar("POST", "/ofertas", cuerpo);
    setCargando(false);
    if (!r.ok) return setError(mensajeError(r.error));
    toast.success("Oferta guardada.");
    alTerminar();
    router.refresh();
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
      {oferta ? (
        <p className="text-base font-semibold">{oferta.producto} · {oferta.presentacion}</p>
      ) : (
        <Selector etiqueta="Producto" name="presentacion_id" defaultValue={presentacionInicial ?? ""}>
          <option value="">Elige el producto</option>
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.etiqueta}
            </option>
          ))}
        </Selector>
      )}
      <Selector etiqueta="Para qué lista" name="lista_precio_id" defaultValue={oferta?.lista_precio_id ? String(oferta.lista_precio_id) : ""}>
        <option value="">Todas las listas</option>
        {listas.map((l) => (
          <option key={l.id} value={String(l.id)}>
            {l.nombre}
          </option>
        ))}
      </Selector>
      <Campo etiqueta="Precio de oferta ($)" name="precio" inputMode="decimal" defaultValue={oferta?.precio ?? ""} autoComplete="off" required />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Desde" name="desde" type="date" defaultValue={oferta?.desde ?? hoy} required />
        <Campo etiqueta="Hasta" name="hasta" type="date" defaultValue={oferta?.hasta ?? ""} required />
      </div>
      <Selector etiqueta="Por qué" name="motivo" defaultValue={oferta?.motivo ?? motivoInicial ?? "promocion"}>
        <option value="por_caducar">Por caducar</option>
        <option value="promocion">Promoción</option>
      </Selector>
      {error && (
        <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
          {error}
        </p>
      )}
      <Boton type="submit" cargando={cargando} ancho>
        Guardar oferta
      </Boton>
    </form>
  );
}

/** Ofertas con vigencia: vigentes y proximas. Se crean, cambian y quitan solo aqui (A8, N1). */
export function Ofertas({ ofertas, opciones, listas, hoy, presentacionInicial }: { ofertas: Oferta[]; opciones: OpcionPresentacion[]; listas: ListaPrecio[]; hoy: string; presentacionInicial?: string }) {
  const router = useRouter();
  const [edicion, setEdicion] = useState<Oferta | "nueva" | null>(presentacionInicial ? "nueva" : null);
  const [quitar, setQuitar] = useState<Oferta | null>(null);
  const [cargando, setCargando] = useState(false);

  const vigentes = ofertas.filter((o) => o.desde <= hoy && o.hasta >= hoy);
  const proximas = ofertas.filter((o) => o.desde > hoy);

  async function confirmarQuitar() {
    if (!quitar) return;
    setCargando(true);
    const r = await llamar("DELETE", `/ofertas/${quitar.id}`);
    setCargando(false);
    if (!r.ok) return void toast.error(mensajeError(r.error));
    toast.success("Oferta quitada.");
    setQuitar(null);
    router.refresh();
  }

  const fila = (o: Oferta) => (
    <li key={o.id} className="rounded-xl border border-borde p-3">
      <p className="text-base font-semibold [overflow-wrap:anywhere]">{o.producto} · {o.presentacion}</p>
      <p className="text-base">
        <strong>{dinero(o.precio)}</strong>
        {o.precio_normal && <span className="text-suave"> (normal {dinero(o.precio_normal)})</span>} · {o.lista ?? "Todas las listas"}
      </p>
      <p className="text-sm text-suave">
        Del {fecha(o.desde)} al {fecha(o.hasta)} <Insignia>{MOTIVO[o.motivo]}</Insignia>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Boton variante="secundario" onClick={() => setEdicion(o)}>
          Cambiar
        </Boton>
        <Boton variante="fantasma" onClick={() => setQuitar(o)}>
          Quitar
        </Boton>
      </div>
    </li>
  );

  return (
    <Tarjeta id="ofertas">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Ofertas</h2>
        <Boton variante="secundario" onClick={() => setEdicion("nueva")}>
          <Plus aria-hidden className="size-5" /> Nueva oferta
        </Boton>
      </div>
      {ofertas.length === 0 ? (
        <Vacio texto="No hay ofertas. Ponle una a lo que está por caducar." />
      ) : (
        <div className="flex flex-col gap-4">
          {vigentes.length > 0 && (
            <div>
              <h3 className="mb-2 text-base font-semibold">Vigentes hoy</h3>
              <ul className="flex flex-col gap-2">{vigentes.map(fila)}</ul>
            </div>
          )}
          {proximas.length > 0 && (
            <div>
              <h3 className="mb-2 text-base font-semibold">Próximas</h3>
              <ul className="flex flex-col gap-2">{proximas.map(fila)}</ul>
            </div>
          )}
        </div>
      )}
      <Dialogo abierto={edicion !== null} titulo={edicion === "nueva" ? "Nueva oferta" : "Cambiar oferta"} alCerrar={() => setEdicion(null)}>
        {edicion && (
          <FormOferta
            oferta={edicion === "nueva" ? undefined : edicion}
            opciones={opciones}
            listas={listas}
            presentacionInicial={presentacionInicial}
            motivoInicial={presentacionInicial ? "por_caducar" : undefined}
            hoy={hoy}
            alTerminar={() => setEdicion(null)}
          />
        )}
      </Dialogo>
      <DialogoConfirmar
        abierto={quitar !== null}
        titulo="Quitar oferta"
        texto={quitar ? `¿Quitar la oferta de ${quitar.producto} · ${quitar.presentacion}? Vuelve a su precio normal.` : ""}
        confirmar="Sí, quitarla"
        peligro
        cargando={cargando}
        alConfirmar={confirmarQuitar}
        alCerrar={() => setQuitar(null)}
      />
    </Tarjeta>
  );
}

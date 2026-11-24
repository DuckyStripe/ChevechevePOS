"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { Campo, Casilla } from "@/componentes/ui/campo";
import { Dialogo } from "@/componentes/ui/dialogo";
import { Insignia } from "@/componentes/ui/insignia";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { useSinGuardar } from "@/lib/cascaron";
import { llamar } from "@/lib/api-cliente";
import { dinero } from "@/lib/dinero";
import type { ListaPrecio, Presentacion, Producto } from "@/lib/tipos";
import { Equivalentes } from "@/componentes/equivalentes/equivalentes";
import { CamposProducto, leerProducto, type Catalogos } from "./campos-producto";
import { FotoProducto } from "./foto-producto";
import { mensajeError, piezasTexto } from "./formato";

/** Datos del producto (PATCH) + activar/desactivar. Nunca se borra. */
function Datos({ producto, catalogos, puedeEditar }: { producto: Producto; catalogos: Catalogos; puedeEditar: boolean }) {
  const router = useRouter();
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [sucio, setSucio] = useState(false);
  useSinGuardar(sucio);

  async function guardar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setError(null);
    const f = new FormData(ev.currentTarget);
    const d = leerProducto(f, true);
    if ("errores" in d) return setErrores(d.errores);
    setErrores({});
    setCargando(true);
    const r = await llamar("PATCH", `/productos/${producto.id}`, { ...d.cuerpo, activo: f.get("activo") === "on" });
    setCargando(false);
    if (!r.ok) return setError(mensajeError(r.error));
    toast.success("Cambios guardados.");
    router.refresh();
  }

  return (
    <Tarjeta>
      <h2 className="mb-4 text-lg font-bold">Datos</h2>
      <form onChange={() => setSucio(true)} onSubmit={guardar} noValidate className="flex flex-col gap-4">
        <fieldset disabled={!puedeEditar} className="flex flex-col gap-4">
          <CamposProducto producto={producto} catalogos={catalogos} errores={errores} />
          <Casilla etiqueta="Se vende y se compra" ayuda="Si lo quitas, deja de salir en listas y buscadores. Nunca se borra." name="activo" defaultChecked={producto.activo} />
        </fieldset>
        {error && (
          <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
            {error}
          </p>
        )}
        {puedeEditar && (
          <Boton type="submit" cargando={cargando} ancho>
            Guardar cambios
          </Boton>
        )}
      </form>
    </Tarjeta>
  );
}

/** «Cómo lo piden»: caguama, cartón… alimenta el buscador tolerante (C10). */
function Alias({ producto, puedeEditar }: { producto: Producto; puedeEditar: boolean }) {
  const router = useRouter();
  const [nuevo, setNuevo] = useState("");
  const [cargando, setCargando] = useState(false);

  async function guardar(alias: string[]) {
    setCargando(true);
    const r = await llamar("PATCH", `/productos/${producto.id}`, { alias });
    setCargando(false);
    if (!r.ok) return void toast.error(mensajeError(r.error));
    setNuevo("");
    router.refresh();
  }
  const agregar = (e: React.FormEvent) => {
    e.preventDefault();
    const a = nuevo.trim();
    if (!a || producto.alias.some((x) => x.toLowerCase() === a.toLowerCase())) return setNuevo("");
    void guardar([...producto.alias, a]);
  };

  return (
    <Tarjeta>
      <h2 className="text-lg font-bold">Cómo lo piden</h2>
      <p className="mb-3 text-base text-suave">Palabras con las que los clientes lo buscan: caguama, cartón, lite.</p>
      {producto.alias.length === 0 ? (
        <p className="mb-3 text-base text-suave">Aún no tiene.</p>
      ) : (
        <ul className="mb-3 flex flex-wrap gap-2">
          {producto.alias.map((a) => (
            <li key={a} className="inline-flex items-center gap-1 rounded-full bg-borde/60 py-1 pl-3 pr-1 text-base">
              {a}
              {puedeEditar && (
                <button type="button" aria-label={`Quitar ${a}`} disabled={cargando} onClick={() => guardar(producto.alias.filter((x) => x !== a))} className="inline-flex size-9 items-center justify-center rounded-full hover:bg-borde">
                  <X aria-hidden className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {puedeEditar && (
        <form onSubmit={agregar} className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Campo etiqueta="Agregar palabra" value={nuevo} onChange={(e) => setNuevo(e.target.value)} autoComplete="off" />
          </div>
          <Boton type="submit" variante="secundario" cargando={cargando}>
            Agregar
          </Boton>
        </form>
      )}
    </Tarjeta>
  );
}

function FormPresentacion({ productoId, presentacion, alTerminar }: { productoId: string; presentacion?: Presentacion; alTerminar: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const nombre = String(f.get("nombre") ?? "").trim();
    const codigo = String(f.get("codigo_barras") ?? "").trim();
    const factor = Number(f.get("factor"));
    if (!nombre) return setError("Escribe cómo la llama el cliente.");
    if (!presentacion && (!Number.isInteger(factor) || factor < 1)) return setError("Escribe cuántas piezas trae.");
    setError(null);
    setCargando(true);
    const comun = { nombre, se_vende: f.get("se_vende") === "on", se_compra: f.get("se_compra") === "on" };
    const r = presentacion
      ? await llamar("PATCH", `/presentaciones/${presentacion.id}`, { ...comun, codigo_barras: codigo || null })
      : await llamar("POST", `/productos/${productoId}/presentaciones`, { ...comun, factor, ...(codigo ? { codigo_barras: codigo } : {}) });
    setCargando(false);
    if (!r.ok) return setError(mensajeError(r.error));
    toast.success(presentacion ? "Cambios guardados." : "Presentación agregada.");
    alTerminar();
    router.refresh();
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
      <Campo etiqueta="Nombre para el cliente" name="nombre" defaultValue={presentacion?.nombre} placeholder="Caja de 24 latas" autoComplete="off" required />
      {presentacion ? (
        <p className="text-base text-suave">Trae {piezasTexto(presentacion.factor)}. Eso no se puede cambiar; si hace falta, crea otra presentación.</p>
      ) : (
        <Campo etiqueta="Piezas que trae" name="factor" type="number" inputMode="numeric" min={1} required />
      )}
      <Campo etiqueta="Código de barras (opcional)" name="codigo_barras" inputMode="numeric" defaultValue={presentacion?.codigo_barras ?? ""} autoComplete="off" />
      <Casilla etiqueta="Se vende" name="se_vende" defaultChecked={presentacion?.se_vende ?? true} />
      <Casilla etiqueta="Se compra al proveedor" name="se_compra" defaultChecked={presentacion?.se_compra ?? true} />
      {error && (
        <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
          {error}
        </p>
      )}
      <Boton type="submit" cargando={cargando} ancho>
        {presentacion ? "Guardar cambios" : "Agregar presentación"}
      </Boton>
    </form>
  );
}

/** Presentaciones; los precios solo se ven (N1: se cambian en `/precios`). */
function Presentaciones({ producto, listas, puedeEditar }: { producto: Producto; listas: ListaPrecio[]; puedeEditar: boolean }) {
  const router = useRouter();
  const [editando, setEditando] = useState<Presentacion | "nueva" | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const nombreLista = (id: number | string) => listas.find((l) => String(l.id) === String(id))?.nombre ?? "Lista";

  async function alternar(p: Presentacion) {
    setOcupada(String(p.id));
    const r = await llamar("PATCH", `/presentaciones/${p.id}`, { activa: !p.activa });
    setOcupada(null);
    if (!r.ok) return void toast.error(mensajeError(r.error));
    router.refresh();
  }

  return (
    <Tarjeta>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Presentaciones</h2>
        {puedeEditar && (
          <Boton variante="secundario" onClick={() => setEditando("nueva")}>
            <Plus aria-hidden className="size-5" /> Agregar
          </Boton>
        )}
      </div>
      <ul className="flex flex-col gap-3">
        {producto.presentaciones.map((p) => (
          <li key={p.id} className={`rounded-xl border border-borde p-3 ${p.activa ? "" : "opacity-70"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-base font-semibold [overflow-wrap:anywhere]">{p.nombre}</p>
                <p className="text-sm text-suave">{piezasTexto(p.factor)}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {!p.activa && <Insignia tono="peligro">Desactivada</Insignia>}
                {!p.se_vende && <Insignia>No se vende</Insignia>}
                {!p.se_compra && <Insignia>No se compra</Insignia>}
              </div>
            </div>
            {p.precios.length > 0 && (
              <p className="mt-1 text-base">
                {p.precios.map((x) => `${nombreLista(x.lista_precio_id)} ${dinero(x.precio)}`).join(" · ")}
              </p>
            )}
            {puedeEditar && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Boton variante="secundario" onClick={() => setEditando(p)}>
                  Editar
                </Boton>
                {p.factor !== 1 && (
                  <Boton variante="fantasma" cargando={ocupada === String(p.id)} onClick={() => alternar(p)}>
                    {p.activa ? "Desactivar" : "Activar"}
                  </Boton>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <Dialogo abierto={editando !== null} titulo={editando === "nueva" ? "Agregar presentación" : "Editar presentación"} alCerrar={() => setEditando(null)}>
        <FormPresentacion productoId={String(producto.id)} presentacion={editando && editando !== "nueva" ? editando : undefined} alTerminar={() => setEditando(null)} />
      </Dialogo>
    </Tarjeta>
  );
}

export function FichaProducto({ producto, catalogos, listas, puedeEditar, veCostos, puedeVerInventario, puedeVerPrecios }: {
  producto: Producto;
  catalogos: Catalogos;
  listas: ListaPrecio[];
  puedeEditar: boolean;
  veCostos: boolean;
  puedeVerInventario: boolean;
  puedeVerPrecios: boolean;
}) {
  const id = String(producto.id);
  return (
    <div className="flex flex-col gap-5">
      <Tarjeta className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">Foto</h2>
        <FotoProducto productoId={id} imagen={producto.imagen} puedeEditar={puedeEditar} />
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Precios y existencia</h2>
        <p className="text-base">
          En bodega: <strong>{piezasTexto(producto.existencia)}</strong>
          {veCostos && producto.costo_promedio != null && <> · Costo por pieza: <strong>{dinero(producto.costo_promedio)}</strong></>}
        </p>
        <p className="text-sm text-suave">Aquí solo se ven. Los precios se cambian en Precios y la existencia se ajusta en Inventario.</p>
        <div className="flex flex-wrap gap-2">
          {puedeVerPrecios && (
            <BotonEnlace variante="secundario" href={`/precios?producto_ids=${id}&volver=${encodeURIComponent(`/productos/${id}`)}`}>
              Cambiar precios
            </BotonEnlace>
          )}
          {puedeVerInventario && (
            <BotonEnlace variante="secundario" href={`/inventario?producto_id=${id}`}>
              Ver movimientos
            </BotonEnlace>
          )}
        </div>
      </Tarjeta>

      <Presentaciones producto={producto} listas={listas} puedeEditar={puedeEditar} />
      <Alias producto={producto} puedeEditar={puedeEditar} />
      <Equivalentes productoId={id} puedeEditar={puedeEditar} />
      <Datos producto={producto} catalogos={catalogos} puedeEditar={puedeEditar} />
    </div>
  );
}

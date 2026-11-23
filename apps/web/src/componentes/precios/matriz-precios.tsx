"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";
import { mensajeError, porcentaje, PRECIO_VALIDO } from "@/componentes/productos/formato";
import { Boton } from "@/componentes/ui/boton";
import { Dialogo } from "@/componentes/ui/dialogo";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { llamar } from "@/lib/api-cliente";
import { dinero } from "@/lib/dinero";
import type { AdvertenciaPrecio, ListaPrecio, PrecioSugerido, Producto } from "@/lib/tipos";

const clave = (pres: number | string, lista: number | string) => `${pres}:${lista}`;
type Cambio = { presentacion_id: string; lista_precio_id: string; precio: string };

/**
 * Matriz presentacion x lista (N1: unico lugar donde se cambian precios).
 * `sugeridos`/`bajoCosto` son `null` sin `costos.ver`: entonces no hay columnas de costo ni margen.
 */
export function MatrizPrecios({ productos, listas, sugeridos, bajoCosto }: { productos: Producto[]; listas: ListaPrecio[]; sugeridos: PrecioSugerido[] | null; bajoCosto: string[] | null }) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [marcados, setMarcados] = useState<string[]>([]);
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [advertencias, setAdvertencias] = useState<AdvertenciaPrecio[]>([]);

  const sug = new Map((sugeridos ?? []).map((s) => [clave(s.presentacion_id, s.lista_precio_id), s]));
  const rojo = new Set(bajoCosto ?? []);
  const nombres = new Map<string, string>();
  const actual = new Map<string, string>();
  for (const p of productos)
    for (const pr of p.presentaciones) {
      nombres.set(String(pr.id), `${p.nombre} · ${pr.nombre}`);
      for (const x of pr.precios) actual.set(clave(pr.id, x.lista_precio_id), x.precio);
    }
  const listaNombre = (id: number | string) => listas.find((l) => String(l.id) === String(id))?.nombre ?? "Lista";

  const cambios: Cambio[] = [];
  let invalidos = 0;
  for (const [k, v] of Object.entries(edits)) {
    const t = v.trim();
    if (t === (actual.get(k) ?? "")) continue;
    if (!PRECIO_VALIDO.test(t)) {
      invalidos++;
      continue;
    }
    const [presentacion_id, lista_precio_id] = k.split(":");
    cambios.push({ presentacion_id, lista_precio_id, precio: t });
  }

  const aAplicar: (Cambio & { antes: string | null })[] = marcados.flatMap((k) => {
    const s = sug.get(k);
    if (!s?.precio_sugerido) return [];
    const [presentacion_id, lista_precio_id] = k.split(":");
    return [{ presentacion_id, lista_precio_id, precio: s.precio_sugerido, antes: actual.get(k) ?? null }];
  });

  async function enviar(lote: Cambio[]): Promise<boolean> {
    setGuardando(true);
    setErrorGuardar(null);
    const avisos: AdvertenciaPrecio[] = [];
    for (let i = 0; i < lote.length; i += 500) {
      const r = await llamar<{ actualizados: number; advertencias?: AdvertenciaPrecio[] }>("PUT", "/precios", { precios: lote.slice(i, i + 500) });
      if (!r.ok) {
        setGuardando(false);
        setErrorGuardar(mensajeError(r.error));
        return false;
      }
      avisos.push(...(r.datos.advertencias ?? []));
    }
    setGuardando(false);
    setAdvertencias(avisos);
    toast.success(lote.length === 1 ? "Precio guardado." : `${lote.length} precios guardados.`);
    router.refresh();
    return true;
  }

  async function guardar() {
    if (invalidos > 0) return setErrorGuardar("Revisa los precios marcados: escríbelos como 310 o 310.50.");
    if (await enviar(cambios)) setEdits({});
  }
  async function aplicar() {
    if (await enviar(aAplicar.map(({ presentacion_id, lista_precio_id, precio }) => ({ presentacion_id, lista_precio_id, precio })))) {
      setMarcados([]);
      setConfirmando(false);
    }
  }
  const alternar = (k: string) => setMarcados((m) => (m.includes(k) ? m.filter((x) => x !== k) : [...m, k]));

  return (
    <div className="flex flex-col gap-4">
      {advertencias.length > 0 && (
        <div role="status" className="rounded-tarjeta border border-peligro/40 bg-peligro-suave p-4">
          <p className="mb-2 flex gap-2 text-base font-bold text-peligro">
            <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0" /> Guardado, pero ojo con estos precios:
          </p>
          <ul className="flex flex-col gap-1 text-base">
            {advertencias.map((a) => (
              <li key={clave(a.presentacion_id, a.lista_precio_id)}>
                {nombres.get(String(a.presentacion_id)) ?? "Producto"} ({listaNombre(a.lista_precio_id)}) a {dinero(a.precio)}: queda abajo del costo ({dinero(a.costo_presentacion)}).
              </li>
            ))}
          </ul>
        </div>
      )}

      {productos.map((p) => (
        <Tarjeta key={p.id}>
          <h2 className="mb-3 text-lg font-bold [overflow-wrap:anywhere]">
            <Link href={`/productos/${p.id}`} className="underline-offset-2 hover:underline">
              {p.nombre}
            </Link>
          </h2>
          <div className="flex flex-col gap-4">
            {p.presentaciones
              .filter((pr) => pr.activa && pr.se_vende)
              .map((pr) => (
                <div key={pr.id}>
                  <p className="mb-2 text-base font-semibold">
                    {pr.nombre} <span className="text-sm font-normal text-suave">· {pr.factor} {pr.factor === 1 ? "pieza" : "piezas"}</span>
                  </p>
                  <ul className="flex flex-col gap-3">
                    {listas.map((l) => {
                      const k = clave(pr.id, l.id);
                      const valor = edits[k] ?? actual.get(k) ?? "";
                      const malo = edits[k] !== undefined && edits[k].trim() !== (actual.get(k) ?? "") && !PRECIO_VALIDO.test(edits[k].trim());
                      const bajo = rojo.has(k);
                      const s = sug.get(k);
                      const hayDistinto = !!s?.precio_sugerido && s.precio_sugerido !== actual.get(k);
                      const id = `precio-${pr.id}-${l.id}`;
                      return (
                        <li key={l.id} className="rounded-xl border border-borde p-3">
                          <label htmlFor={id} className="text-base font-medium">
                            {l.nombre}
                          </label>
                          <div className="mt-1 flex items-center gap-2">
                            <span aria-hidden className="text-lg">$</span>
                            <input
                              id={id}
                              inputMode="decimal"
                              autoComplete="off"
                              placeholder="Sin precio"
                              value={valor}
                              onChange={(e) => setEdits((x) => ({ ...x, [k]: e.target.value }))}
                              aria-invalid={malo || bajo}
                              aria-describedby={bajo ? `${id}-aviso` : undefined}
                              className={`min-h-tocable w-full rounded-xl border bg-superficie px-4 py-2 text-lg tabular-nums ${bajo || malo ? "border-peligro bg-peligro-suave" : "border-borde"}`}
                            />
                          </div>
                          {malo && (
                            <p role="alert" className="mt-1 text-sm font-medium text-peligro">
                              Escríbelo como 310 o 310.50.
                            </p>
                          )}
                          {bajo && (
                            <p id={`${id}-aviso`} className="mt-1 flex items-center gap-1 text-sm font-medium text-peligro">
                              <AlertTriangle aria-hidden className="size-4" /> Vendes abajo del costo
                            </p>
                          )}
                          {s && (s.precio_sugerido || s.margen) && (
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-base">
                              <p>
                                {s.precio_sugerido && <>Sugerido: <strong>{dinero(s.precio_sugerido)}</strong> · </>}
                                Margen hoy: <strong>{porcentaje(s.margen)}</strong>
                                {s.objetivo && <span className="text-suave"> (meta {porcentaje(s.objetivo)})</span>}
                              </p>
                              {hayDistinto && (
                                <label className="flex min-h-tocable cursor-pointer items-center gap-2">
                                  <input type="checkbox" className="size-6 accent-marca" checked={marcados.includes(k)} onChange={() => alternar(k)} />
                                  Usar sugerido
                                </label>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
          </div>
        </Tarjeta>
      ))}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-borde bg-superficie/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        {errorGuardar && (
          <p role="alert" className="text-base font-medium text-peligro">
            {errorGuardar}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {marcados.length > 0 && (
            <Boton variante="secundario" onClick={() => setConfirmando(true)}>
              <Check aria-hidden className="size-5" /> Aplicar sugeridos ({marcados.length})
            </Boton>
          )}
          <Boton cargando={guardando} disabled={cambios.length === 0 && invalidos === 0} onClick={guardar}>
            {cambios.length > 0 ? `Guardar ${cambios.length} ${cambios.length === 1 ? "precio" : "precios"}` : "Guardar"}
          </Boton>
        </div>
      </div>

      <Dialogo abierto={confirmando} titulo="Aplicar precios sugeridos" alCerrar={() => setConfirmando(false)}>
        <p className="mb-3 text-base">Estos precios van a cambiar:</p>
        <ul className="mb-5 flex flex-col gap-2">
          {aAplicar.map((c) => (
            <li key={clave(c.presentacion_id, c.lista_precio_id)} className="rounded-xl bg-borde/40 p-3 text-base">
              <span className="block font-semibold [overflow-wrap:anywhere]">{nombres.get(c.presentacion_id) ?? "Producto"} · {listaNombre(c.lista_precio_id)}</span>
              {c.antes ? dinero(c.antes) : "Sin precio"} → <strong>{dinero(c.precio)}</strong>
            </li>
          ))}
        </ul>
        {errorGuardar && (
          <p role="alert" className="mb-3 text-base font-medium text-peligro">
            {errorGuardar}
          </p>
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Boton variante="secundario" onClick={() => setConfirmando(false)}>
            Mejor no
          </Boton>
          <Boton cargando={guardando} onClick={aplicar}>
            Sí, cambiar precios
          </Boton>
        </div>
      </Dialogo>
    </div>
  );
}

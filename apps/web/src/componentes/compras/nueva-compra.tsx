"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { BuscadorProductos } from "@/componentes/productos/buscador-productos";
import { aCentavos, deCentavos, hoyMX, mensajeError, PRECIO_VALIDO, uuid } from "@/componentes/productos/formato";
import { Boton } from "@/componentes/ui/boton";
import { Campo, Selector } from "@/componentes/ui/campo";
import { DialogoConfirmar } from "@/componentes/ui/dialogo";
import { Esqueleto } from "@/componentes/ui/esqueleto";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { useSinGuardar } from "@/lib/cascaron";
import { llamar } from "@/lib/api-cliente";
import { dinero } from "@/lib/dinero";
import type { Producto, Proveedor } from "@/lib/tipos";

type Linea = { presentacion_id: string; producto: string; presentacion: string; factor: number; cantidad: string; costo: string; caduca_el: string };
type Borrador = { clave: string; proveedor_id: string; folio_proveedor: string; fecha: string; condicion_pago: "contado" | "credito"; lineas: Linea[]; fecha_surtido?: string };

/** F5: lo que trae `/compras/nueva?surtido=<fecha>&proveedor_id=` desde la lista de surtido (la cantidad sugerida y el costo, ya calculados en la API). */
export type PrecargaSurtido = { fecha_surtido: string; proveedor_id: string; lineas: Omit<Linea, "caduca_el">[] };

const llave = (usuario: string) => `chv:compra-borrador:${usuario}`;

/** La clave de idempotencia nace al abrir la pantalla: reintentar con la misma clave no duplica la compra (C8/P5). */
const vacio = (): Borrador => ({ clave: uuid(), proveedor_id: "", folio_proveedor: "", fecha: hoyMX(), condicion_pago: "contado", lineas: [] });

function leerBorrador(usuario: string): Borrador {
  try {
    const raw = localStorage.getItem(llave(usuario));
    if (raw) {
      const b = JSON.parse(raw) as Partial<Borrador>;
      if (typeof b.clave === "string" && Array.isArray(b.lineas)) return { ...vacio(), ...b, lineas: b.lineas } as Borrador;
    }
  } catch {
    /* sin almacenamiento: se trabaja en memoria */
  }
  return vacio();
}

const piezasDe = (l: Linea) => {
  const c = Number(l.cantidad);
  return Number.isInteger(c) && c > 0 ? c * l.factor : null;
};

/** Total solo para MOSTRAR (nunca se envia): centavos enteros, la API da el total real al guardar. */
function totalEstimado(lineas: Linea[]): string | null {
  let t = 0;
  let alguna = false;
  for (const l of lineas) {
    const c = Number(l.cantidad);
    const k = aCentavos(l.costo);
    if (!Number.isInteger(c) || c < 1 || k === null) continue;
    t += k * c;
    alguna = true;
  }
  return alguna ? deCentavos(t) : null;
}

function Editor({ usuarioId, proveedores, precarga }: { usuarioId: string; proveedores: Proveedor[]; precarga?: PrecargaSurtido }) {
  const router = useRouter();
  const [b, setB] = useState<Borrador>(() =>
    precarga
      ? { ...vacio(), proveedor_id: precarga.proveedor_id, fecha_surtido: precarga.fecha_surtido, lineas: precarga.lineas.map((l) => ({ ...l, caduca_el: "" })) }
      : leerBorrador(usuarioId),
  );
  const [error, setError] = useState<string | null>(null);
  const [aProveedores, setAProveedores] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [guardada, setGuardada] = useState(false);
  const [reiniciar, setReiniciar] = useState(false);
  useSinGuardar(b.lineas.length > 0 && !guardada);

  // Borrador local: sobrevive recargar o quedarse sin senal.
  useEffect(() => {
    if (guardada) return;
    try {
      localStorage.setItem(llave(usuarioId), JSON.stringify(b));
    } catch {
      /* cuota o modo privado: no se guarda el borrador, la pantalla sigue funcionando */
    }
  }, [b, guardada, usuarioId]);

  const cambiarLinea = (id: string, parcial: Partial<Linea>) => setB((x) => ({ ...x, lineas: x.lineas.map((l) => (l.presentacion_id === id ? { ...l, ...parcial } : l)) }));

  function agregar(nueva: Omit<Linea, "cantidad" | "costo" | "caduca_el">) {
    setB((x) =>
      x.lineas.some((l) => l.presentacion_id === nueva.presentacion_id)
        ? { ...x, lineas: x.lineas.map((l) => (l.presentacion_id === nueva.presentacion_id ? { ...l, cantidad: String((Number(l.cantidad) || 0) + 1) } : l)) }
        : { ...x, lineas: [...x.lineas, { ...nueva, cantidad: "1", costo: "", caduca_el: "" }] },
    );
  }

  async function guardar() {
    setError(null);
    setAProveedores(false);
    if (!b.proveedor_id) return setError("Elige el proveedor.");
    if (b.lineas.length === 0) return setError("Agrega al menos un producto.");
    for (const l of b.lineas) {
      const c = Number(l.cantidad);
      if (!Number.isInteger(c) || c < 1) return setError(`Escribe cuántas ${l.presentacion} compraste de ${l.producto}.`);
      if (!PRECIO_VALIDO.test(l.costo.trim())) return setError(`Escribe cuánto pagaste por cada ${l.presentacion} de ${l.producto} (por ejemplo 300 o 300.50).`);
    }
    setCargando(true);
    const r = await llamar<{ id: number | string; folio: string; total: string }>("POST", "/compras", {
      clave_idempotencia: b.clave,
      proveedor_id: b.proveedor_id,
      ...(b.folio_proveedor.trim() ? { folio_proveedor: b.folio_proveedor.trim() } : {}),
      fecha: b.fecha,
      ...(b.fecha_surtido ? { fecha_surtido: b.fecha_surtido } : {}),
      condicion_pago: b.condicion_pago,
      lineas: b.lineas.map((l) => ({
        presentacion_id: l.presentacion_id,
        cantidad: Number(l.cantidad),
        costo_presentacion: l.costo.trim(),
        ...(l.caduca_el ? { caduca_el: l.caduca_el } : {}),
      })),
    });
    setCargando(false);
    if (!r.ok) {
      if (r.error.codigo === "IDEMPOTENCIA_CONFLICTO") return setError("Esta compra ya se guardó antes con otros datos. Revisa Compras; si no está, empieza otra.");
      const d = r.error.detalles as { motivo?: string; presentacion_ids?: (number | string)[] } | undefined;
      if (r.error.codigo === "ESTADO_NO_VALIDO" && d?.motivo === "proveedor_inactivo") {
        setAProveedores(true);
        return setError("Ese proveedor está desactivado. Actívalo en Proveedores o elige otro.");
      }
      if (r.error.codigo === "PRESENTACION_NO_VALIDA" && Array.isArray(d?.presentacion_ids)) {
        const malos = d.presentacion_ids.map(String);
        const nombres = b.lineas.filter((l) => malos.includes(l.presentacion_id)).map((l) => `${l.producto} (${l.presentacion})`);
        if (nombres.length) return setError(`${nombres.join(", ")} ya no se compra así; quítalo o elige otra presentación.`);
      }
      return setError(mensajeError(r.error));
    }
    setGuardada(true);
    try {
      localStorage.removeItem(llave(usuarioId));
    } catch {
      /* nada que limpiar */
    }
    router.push(`/compras/${r.datos.id}?registrada=1`);
  }

  function empezarDeNuevo() {
    setB(vacio());
    setReiniciar(false);
    setError(null);
  }

  const total = totalEstimado(b.lineas);

  return (
    <div className="flex flex-col gap-5 pb-24">
      <Tarjeta className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">1. ¿A quién le compraste?</h2>
        <Selector etiqueta="Proveedor" value={b.proveedor_id} onChange={(e) => setB({ ...b, proveedor_id: e.target.value })}>
          <option value="">Elige el proveedor</option>
          {proveedores.filter((p) => p.activo).map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.nombre}
            </option>
          ))}
        </Selector>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo etiqueta="Fecha" type="date" value={b.fecha} onChange={(e) => setB({ ...b, fecha: e.target.value })} />
          <Selector etiqueta="Pago" value={b.condicion_pago} onChange={(e) => setB({ ...b, condicion_pago: e.target.value as Borrador["condicion_pago"] })}>
            <option value="contado">De contado</option>
            <option value="credito">A crédito</option>
          </Selector>
          <Campo etiqueta="Folio del proveedor (opcional)" value={b.folio_proveedor} onChange={(e) => setB({ ...b, folio_proveedor: e.target.value })} autoComplete="off" />
        </div>
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">2. ¿Qué compraste?</h2>
        <BuscadorProductos
          etiqueta="Escanea el código o busca por nombre"
          ayuda="Con el lector, escanea y se agrega solo. Si no, escribe «caguama», «corona»…"
          alCodigo={(a) => {
            if (a.se_compra === false) return setError(`${a.producto} (${a.presentacion}) no se compra al proveedor. Busca otra presentación.`);
            setError(null);
            agregar({ presentacion_id: String(a.presentacion_id), producto: a.producto, presentacion: a.presentacion, factor: a.factor });
          }}
          resultado={(p: Producto, limpiar) => (
            <div>
              <p className="mb-2 text-base font-semibold [overflow-wrap:anywhere]">{p.nombre}</p>
              <div className="flex flex-wrap gap-2">
                {p.presentaciones.filter((x) => x.activa && x.se_compra).map((x) => (
                  <Boton key={x.id} variante="secundario" onClick={() => { agregar({ presentacion_id: String(x.id), producto: p.nombre, presentacion: x.nombre, factor: x.factor }); limpiar(); }}>
                    <Plus aria-hidden className="size-5" /> {x.nombre}
                  </Boton>
                ))}
              </div>
            </div>
          )}
        />

        {b.lineas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-borde p-4 text-center text-base text-suave">Aún no agregas nada. Escanea o busca el primer producto.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {b.lineas.map((l) => {
              const piezas = piezasDe(l);
              const c = Number(l.cantidad);
              const importe = aCentavos(l.costo) !== null && Number.isInteger(c) && c > 0 ? deCentavos(aCentavos(l.costo)! * c) : null;
              return (
                <li key={l.presentacion_id} className="rounded-xl border border-borde p-3">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <p className="min-w-0 text-base font-semibold [overflow-wrap:anywhere]">
                      {l.producto} <span className="font-normal text-suave">· {l.presentacion}</span>
                    </p>
                    <button type="button" aria-label={`Quitar ${l.producto} ${l.presentacion}`} onClick={() => setB((x) => ({ ...x, lineas: x.lineas.filter((y) => y.presentacion_id !== l.presentacion_id) }))} className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl text-peligro hover:bg-peligro-suave">
                      <Trash2 aria-hidden className="size-5" />
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <span className="text-base font-medium" id={`cant-${l.presentacion_id}`}>¿Cuántas compraste?</span>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Boton variante="secundario" aria-label="Una menos" onClick={() => cambiarLinea(l.presentacion_id, { cantidad: String(Math.max(1, (Number(l.cantidad) || 1) - 1)) })}>
                          <Minus aria-hidden className="size-5" />
                        </Boton>
                        <input aria-labelledby={`cant-${l.presentacion_id}`} type="number" inputMode="numeric" min={1} value={l.cantidad} onChange={(e) => cambiarLinea(l.presentacion_id, { cantidad: e.target.value })} className="min-h-tocable w-full min-w-0 rounded-xl border border-borde bg-superficie px-2 text-center text-lg tabular-nums" />
                        <Boton variante="secundario" aria-label="Una más" onClick={() => cambiarLinea(l.presentacion_id, { cantidad: String((Number(l.cantidad) || 0) + 1) })}>
                          <Plus aria-hidden className="size-5" />
                        </Boton>
                      </div>
                      {piezas !== null && l.factor > 1 && <p className="mt-1 text-sm text-suave">= {piezas} piezas</p>}
                    </div>
                    <Campo etiqueta={`Lo que pagaste por cada ${l.presentacion} ($)`} inputMode="decimal" value={l.costo} onChange={(e) => cambiarLinea(l.presentacion_id, { costo: e.target.value })} autoComplete="off" placeholder="300.00" />
                  </div>
                  {importe && <p className="mt-2 text-base">Importe aprox.: <strong>{dinero(importe)}</strong></p>}
                  <details className="mt-2">
                    <summary className="flex min-h-tocable cursor-pointer items-center text-base text-marca-fuerte">Fecha de caducidad (opcional)</summary>
                    <div className="pb-1 pt-2">
                      <Campo etiqueta="Caduca el" type="date" value={l.caduca_el} onChange={(e) => cambiarLinea(l.presentacion_id, { caduca_el: e.target.value })} />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>

      <p className="text-sm text-suave">Se guarda en este teléfono mientras la capturas, aunque recargues o te quedes sin señal.</p>
      {b.lineas.length > 0 && (
        <Boton variante="fantasma" onClick={() => setReiniciar(true)} className="self-start">
          Empezar de nuevo
        </Boton>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-borde bg-superficie/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:left-72">
        <div className="mx-auto flex max-w-5xl flex-col gap-2">
          {error && (
            <p role="alert" className="text-base font-medium text-peligro">
              {error}
              {aProveedores && (
                <>
                  {" "}
                  <Link href="/proveedores?volver=/compras/nueva" className="font-bold underline">
                    Ir a Proveedores
                  </Link>
                </>
              )}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-lg">
              Total aprox.: <strong className="tabular-nums">{total ? dinero(total) : "—"}</strong>
            </p>
            <Boton cargando={cargando} onClick={guardar}>
              Guardar compra
            </Boton>
          </div>
        </div>
      </div>

      <DialogoConfirmar abierto={reiniciar} titulo="¿Empezar de nuevo?" texto="Se borra lo que llevas capturado en esta compra." confirmar="Sí, borrarlo" peligro alConfirmar={empezarDeNuevo} alCerrar={() => setReiniciar(false)} />
    </div>
  );
}

const sinSuscripcion = () => () => undefined;

/** `localStorage` solo existe en el navegador: se espera al montaje para no desajustar la hidratacion. */
export function NuevaCompra({ usuarioId, proveedores, precarga }: { usuarioId: string; proveedores: Proveedor[]; precarga?: PrecargaSurtido }) {
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  if (!montado)
    return (
      <div role="status" aria-label="Cargando" className="flex flex-col gap-3">
        <Esqueleto className="h-48" />
        <Esqueleto className="h-64" />
      </div>
    );
  return <Editor usuarioId={usuarioId} proveedores={proveedores} precarga={precarga} />;
}

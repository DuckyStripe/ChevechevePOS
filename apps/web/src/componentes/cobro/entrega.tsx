"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { Aviso, CampoFoto, mensajeCobro, Teclado, textoSemaforo, useClave } from "./comunes";
import { conVolver, montoValido } from "./volver";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { Campo, Selector } from "@/componentes/ui/campo";
import { Insignia } from "@/componentes/ui/insignia";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { llamar } from "@/lib/api-cliente";
import { useSinGuardar } from "@/lib/cascaron";
import { dinero } from "@/lib/dinero";
import type { ResultadoEntrega, Semaforo, VistaCobro } from "@/lib/tipos";

export type DatosEntrega = {
  pedido: { id: string; folio: string; total: string };
  cliente: { id: string; nombre: string; saldo: string | null; vencido: string | null; disponible: string | null; semaforo: Semaforo | null };
  /** `null` = quien entrega no puede leer las líneas del pedido: solo se entrega completo. */
  lineas: { id: string; texto: string; cantidad: number; precio: string }[] | null;
};
type Metodo = "efectivo" | "transferencia" | "fiado" | "mixto";
const NOMBRE_METODO: Record<Metodo, string> = { efectivo: "Efectivo", transferencia: "Transferencia", fiado: "Fiado", mixto: "Pago mixto" };

const saldoDe = (s: ResultadoEntrega["saldo_cliente"]): string | null => (s == null ? null : typeof s === "string" ? s : s.saldo);

/**
 * `/cobrar?pedido=`: dueña de entregar y cobrar un pedido (N1). P4: Entregar → Efectivo → Listo. P5: la clave nace al abrir y se
 * conserva al reintentar; siempre se dice si se guardó. Totales, el resto del pago mixto, el cambio y el aviso de límite salen de
 * `POST /cobrar/vista` (SQL): esta pantalla no suma ni resta dinero.
 */
export function Entrega({ datos, volver, hayTurno, puedeFiado, puedeAvisar }: { datos: DatosEntrega; volver: string; hayTurno: boolean; puedeFiado: boolean; puedeAvisar: boolean }) {
  const { pedido, cliente, lineas } = datos;
  const [clave] = useClave(`chv:entrega:${pedido.id}`);
  const [metodo, setMetodo] = useState<Metodo | null>(null);
  const [cant, setCant] = useState<Record<string, number>>(() => Object.fromEntries((lineas ?? []).map((l) => [l.id, l.cantidad])));
  const [recibio, setRecibio] = useState("");
  const [fotoEntrega, setFotoEntrega] = useState<string | null>(null);
  const [referencia, setReferencia] = useState("");
  const [comprobante, setComprobante] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [paga, setPaga] = useState("");
  const [efMixto, setEfMixto] = useState("");
  const [restoMixto, setRestoMixto] = useState<"transferencia" | "credito">("transferencia");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<ResultadoEntrega | null>(null);
  const [vista, setVista] = useState<VistaCobro | null>(null);
  const [errorVista, setErrorVista] = useState<string | null>(null);

  const cambios = (lineas ?? []).filter((l) => cant[l.id] !== l.cantidad);
  const editado = cambios.length > 0;
  const hayAlgo = !lineas || lineas.some((l) => (cant[l.id] ?? 0) > 0);
  const lineasEntrega = editado ? cambios.map((l) => ({ pedido_linea_id: l.id, cantidad_entregada: cant[l.id] ?? 0 })) : undefined;
  const efectivoRecibido = (metodo === "efectivo" || metodo === "mixto") && montoValido(paga) ? paga : undefined;
  // Pagos de la vista previa: `monto: null` = «el resto» (lo resuelve SQL).
  const pagosVista = !metodo || (metodo === "mixto" && !montoValido(efMixto))
    ? []
    : metodo === "efectivo" ? [{ metodo: "efectivo", monto: null }]
    : metodo === "transferencia" ? [{ metodo: "transferencia", monto: null }]
    : metodo === "fiado" ? [{ metodo: "credito", monto: null }]
    : [{ metodo: "efectivo", monto: efMixto }, { metodo: restoMixto, monto: null }];
  const clavePagos = JSON.stringify(pagosVista);
  const claveLineas = JSON.stringify(lineasEntrega ?? null);
  useEffect(() => {
    let vigente = true;
    const espera = setTimeout(async () => {
      const r = await llamar<VistaCobro>("POST", "/cobrar/vista", {
        pedido_id: pedido.id,
        ...(claveLineas !== "null" ? { lineas: JSON.parse(claveLineas) as unknown } : {}),
        pagos: JSON.parse(clavePagos) as unknown,
        ...(efectivoRecibido ? { efectivo_recibido: efectivoRecibido } : {}),
      });
      if (!vigente) return;
      setVista(r.ok ? r.datos : null);
      setErrorVista(r.ok ? null : mensajeCobro(r.error));
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [pedido.id, claveLineas, clavePagos, efectivoRecibido]);
  const total = vista?.total ?? pedido.total;
  const mixtoOk = metodo !== "mixto" || (montoValido(efMixto) && vista?.cuadra === true);
  const resto = metodo === "mixto" && mixtoOk ? (vista?.pagos.find((p) => p.metodo === restoMixto)?.monto ?? null) : null;
  useSinGuardar(!listo && (metodo !== null || editado || recibio !== ""));

  const cambiar = (id: string, max: number, delta: number) => setCant((c) => ({ ...c, [id]: Math.min(max, Math.max(0, (c[id] ?? 0) + delta)) }));

  /** Pagos que se mandan: los montos ya resueltos por la vista (SQL) mas referencia y comprobante de la transferencia. */
  function pagos() {
    const extra = { ...(referencia.trim() ? { referencia: referencia.trim() } : {}), ...(comprobante ? { comprobante } : {}) };
    return (vista?.pagos ?? []).map((p) => ({ ...p, ...(p.metodo === "transferencia" ? extra : {}) }));
  }

  async function guardar() {
    if (!metodo) return;
    setEnviando(true);
    setError(null);
    const r = await llamar<ResultadoEntrega>("POST", `/pedidos/${pedido.id}/entregar`, {
      clave_idempotencia: clave,
      ...(lineasEntrega ? { lineas: lineasEntrega } : {}),
      pagos: pagos(),
      ...(efectivoRecibido ? { efectivo_recibido: efectivoRecibido } : {}),
      ...(recibio.trim() ? { recibio: recibio.trim() } : {}),
      ...(fotoEntrega ? { foto_entrega: fotoEntrega } : {}),
    });
    setEnviando(false);
    if (!r.ok) return setError(`No se guardó. ${mensajeCobro(r.error)}`);
    setListo(r.datos);
  }

  if (listo) {
    const saldo = saldoDe(listo.saldo_cliente);
    const debe = saldo != null && Number(saldo) > 0;
    return (
      <div className="flex flex-col gap-4">
        <Tarjeta className="flex flex-col items-center gap-2 text-center">
          <Check aria-hidden className="size-14 rounded-full bg-exito-suave p-3 text-exito" />
          <p role="status" className="text-2xl font-extrabold">Se guardó: entregado</p>
          <p className="text-lg">{cliente.nombre} · {listo.venta.folio}</p>
          <p className="text-3xl font-extrabold tabular-nums">{dinero(listo.venta.total)}</p>
          {listo.venta.cambio != null && Number(listo.venta.cambio) > 0 && (
            <p className="rounded-xl bg-marca-suave px-4 py-2 text-2xl font-extrabold text-marca-fuerte">Dale de cambio {dinero(listo.venta.cambio)}</p>
          )}
          {debe && <p className="text-base">Ahora debe {dinero(saldo)}.</p>}
        </Tarjeta>
        {listo.aviso?.url && (
          <>
            <a href={listo.aviso.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-14 items-center justify-center rounded-xl bg-marca px-5 text-lg font-semibold text-white">
              Mandar nota por WhatsApp
            </a>
            <Link href={`/?bandeja=1&cliente=${cliente.id}`} className="text-center text-base font-semibold text-marca-fuerte underline">
              Ya la mandé: marcarla como enviada
            </Link>
          </>
        )}
        {debe && (
          <BotonEnlace variante="secundario" className="!min-h-14" href={conVolver(`/cobrar?cliente=${cliente.id}`, volver)}>
            Cobrar saldo anterior
          </BotonEnlace>
        )}
        <BotonEnlace className="!min-h-14 !text-lg" href={volver}>
          {volver.startsWith("/reparto") ? "Siguiente: la siguiente parada" : "Listo, volver"}
        </BotonEnlace>
      </div>
    );
  }

  if (!hayTurno) {
    return (
      <Tarjeta className="flex flex-col gap-3">
        <p className="text-lg font-bold">Abre tu turno para cobrar.</p>
        <p className="text-base text-suave">Sin turno abierto no se puede guardar el dinero que recibes.</p>
        <BotonEnlace className="!min-h-14" href={conVolver("/caja", `/cobrar?pedido=${pedido.id}&volver=${encodeURIComponent(volver)}`)}>
          Abre tu turno
        </BotonEnlace>
      </Tarjeta>
    );
  }

  const etiquetaListo = metodo === "efectivo" ? `Listo, cobré ${dinero(total)}` : metodo === "transferencia" ? "Listo, ya me pagó por transferencia" : metodo === "fiado" ? `Dejar a crédito ${dinero(total)}` : "Listo, guardar";

  return (
    <div className="flex flex-col gap-4 pb-40">
      <Tarjeta className="flex flex-col gap-1">
        <h2 className="text-2xl font-extrabold [overflow-wrap:anywhere]">{cliente.nombre}</h2>
        <p className="text-base text-suave">Pedido {pedido.folio}</p>
        <p className="text-4xl font-extrabold tabular-nums">{dinero(total)}</p>
        {editado && <p className="text-base text-suave">Total de lo que sí entregas. La caja lo confirma al guardar.</p>}
        {cliente.saldo != null && Number(cliente.saldo) > 0 && <p className="text-base font-medium">Antes ya debía {dinero(cliente.saldo)}.</p>}
      </Tarjeta>

      {lineas && (
        <details className="rounded-tarjeta border border-borde bg-superficie px-4 py-2">
          <summary className="flex min-h-14 cursor-pointer items-center text-base font-semibold">Entregué menos de lo pedido</summary>
          <ul className="flex flex-col divide-y divide-borde pb-2">
            {lineas.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0 text-base [overflow-wrap:anywhere]">{l.texto}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <Boton variante="secundario" className="!min-h-12 !px-3" aria-label={`Quitar uno de ${l.texto}`} disabled={(cant[l.id] ?? 0) <= 0} onClick={() => cambiar(l.id, l.cantidad, -1)}>
                    <Minus aria-hidden className="size-5" />
                  </Boton>
                  <span className="w-8 text-center text-xl font-bold tabular-nums" aria-label={`${cant[l.id] ?? 0} de ${l.cantidad}`}>{cant[l.id] ?? 0}</span>
                  <Boton variante="secundario" className="!min-h-12 !px-3" aria-label={`Agregar uno de ${l.texto}`} disabled={(cant[l.id] ?? 0) >= l.cantidad} onClick={() => cambiar(l.id, l.cantidad, 1)}>
                    <Plus aria-hidden className="size-5" />
                  </Boton>
                </span>
              </li>
            ))}
          </ul>
          {!hayAlgo && <Aviso texto="No hay nada que entregar. Si no se entregó, usa «No entregado» en la ruta." />}
        </details>
      )}

      <details className="rounded-tarjeta border border-borde bg-superficie px-4 py-2">
        <summary className="flex min-h-14 cursor-pointer items-center text-base font-semibold">Quién recibió y foto (opcional)</summary>
        <div className="flex flex-col gap-3 pb-2">
          <Campo etiqueta="Nombre de quien recibió" value={recibio} maxLength={80} onChange={(e) => setRecibio(e.target.value)} autoComplete="off" />
          <CampoFoto etiqueta="Tomar foto de la entrega" nombre={fotoEntrega} alCambiar={setFotoEntrega} alOcupar={setSubiendo} />
        </div>
      </details>

      <section aria-labelledby="como-paga" className="flex flex-col gap-3">
        <h2 id="como-paga" className="text-xl font-bold">¿Cómo paga?</h2>
        <div className="grid grid-cols-2 gap-2">
          {(["efectivo", "transferencia", ...(puedeFiado ? (["fiado"] as const) : []), "mixto"] as Metodo[]).map((m) => (
            <Boton key={m} variante={metodo === m ? "primario" : "secundario"} aria-pressed={metodo === m} className="!min-h-16 !text-lg" onClick={() => setMetodo(m)}>
              {NOMBRE_METODO[m]}
            </Boton>
          ))}
        </div>

        {metodo === "efectivo" && (
          <details className="rounded-tarjeta border border-borde bg-superficie px-4 py-2">
            <summary className="flex min-h-14 cursor-pointer items-center text-base font-semibold">Con cuánto paga (para el cambio)</summary>
            <div className="pb-2">
              <Teclado etiqueta="Con cuánto paga" valor={paga} alCambiar={setPaga} />
            </div>
          </details>
        )}
        {metodo === "transferencia" && (
          <Tarjeta className="flex flex-col gap-3">
            <Campo etiqueta="Referencia o clave de rastreo (opcional)" value={referencia} maxLength={60} onChange={(e) => setReferencia(e.target.value)} autoComplete="off" />
            <CampoFoto etiqueta="Tomar foto del comprobante" nombre={comprobante} alCambiar={setComprobante} alOcupar={setSubiendo} />
            {puedeAvisar && (
              <Link href={`/cobrar?pedido=${pedido.id}&volver=${encodeURIComponent(volver)}&nuevo=wa_datos_transferencia&cliente=${cliente.id}`} className="inline-flex min-h-tocable items-center font-semibold text-marca-fuerte underline">
                Mandarle los datos de transferencia por WhatsApp
              </Link>
            )}
          </Tarjeta>
        )}
        {metodo === "fiado" && (
          <Tarjeta className="flex flex-col gap-2">
            {cliente.semaforo && <Insignia tono={textoSemaforo(cliente.semaforo.color).tono}>{textoSemaforo(cliente.semaforo.color).texto}</Insignia>}
            <p className="text-base">Debe ahora: <strong>{dinero(cliente.saldo)}</strong></p>
            <p className="text-lg font-bold">Le quedan {dinero(cliente.disponible)} de crédito</p>
            {vista?.excede_limite && <Aviso tono="aviso" texto="Esto pasa de su límite. Si no alcanza, la caja no lo deja guardar." />}
          </Tarjeta>
        )}
        {metodo === "mixto" && (
          <Tarjeta className="flex flex-col gap-3">
            <Campo etiqueta="Cuánto paga en efectivo" inputMode="decimal" value={efMixto} onChange={(e) => setEfMixto(e.target.value.replace(",", "."))} error={efMixto && !mixtoOk && (errorVista || vista) ? "Escribe un monto menor al total." : undefined} />
            <Selector etiqueta="El resto lo paga con" value={restoMixto} onChange={(e) => setRestoMixto(e.target.value as "transferencia" | "credito")}>
              <option value="transferencia">Transferencia</option>
              {puedeFiado && <option value="credito">Fiado</option>}
            </Selector>
            {resto && <p className="text-lg font-bold">El resto: {dinero(resto)}</p>}
            {restoMixto === "transferencia" && <CampoFoto etiqueta="Tomar foto del comprobante" nombre={comprobante} alCambiar={setComprobante} alOcupar={setSubiendo} />}
          </Tarjeta>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-borde bg-superficie px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-xl flex-col gap-2">
          {error && <Aviso texto={error} />}
          {metodo ? (
            <Boton className="!min-h-14 !text-lg" ancho cargando={enviando} disabled={!hayAlgo || subiendo || !mixtoOk || !vista || !vista.cuadra} onClick={() => void guardar()}>
              {etiquetaListo}
            </Boton>
          ) : (
            <p className="text-center text-base text-suave">Elige cómo paga para terminar.</p>
          )}
          <Link href={volver} className="text-center text-base font-semibold text-marca-fuerte underline">Cancelar y volver</Link>
        </div>
      </div>
    </div>
  );
}

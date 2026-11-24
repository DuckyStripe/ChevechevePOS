"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Aviso, mensajeCobro, Teclado, textoSemaforo } from "@/componentes/cobro/comunes";
import { montoValido } from "@/componentes/cobro/volver";
import { Boton } from "@/componentes/ui/boton";
import { Campo, Selector } from "@/componentes/ui/campo";
import { Insignia } from "@/componentes/ui/insignia";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { llamar } from "@/lib/api-cliente";
import { dinero } from "@/lib/dinero";
import type { Semaforo, VistaCobro } from "@/lib/tipos";

type Metodo = "efectivo" | "tarjeta" | "transferencia" | "fiado" | "mixto";
type Resto = "transferencia" | "tarjeta" | "credito";
const NOMBRE: Record<Metodo, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia", fiado: "Fiado", mixto: "Pago mixto" };

export type CreditoCliente = { nombre: string; saldo: string | null; disponible: string | null; semaforo: Semaforo | null };
export type CuerpoPago = { pagos: { metodo: string; monto: string; referencia?: string }[]; efectivo_recibido?: string };

/**
 * Cobro del mostrador (F8). Cada cambio se manda a `POST /cobrar/vista` y de ahí salen el total, el cambio, lo que falta y el
 * crédito: la web no suma ni resta importes. Al cobrar manda los pagos que devolvió la vista (montos ya repartidos por SQL).
 */
export function CobroPos({ total, datos, credito, puedeFiado, enviando, error, alVolver, alCobrar }: {
  total: string;
  /** JSON `{cliente_id?, lineas}` de la venta (el mismo de la vista del carrito). */
  datos: string;
  credito: CreditoCliente | null;
  puedeFiado: boolean;
  enviando: boolean;
  error: string | null;
  alVolver: () => void;
  alCobrar: (c: CuerpoPago) => void;
}) {
  const [metodo, setMetodo] = useState<Metodo>("efectivo");
  const [paga, setPaga] = useState("");
  const [referencia, setReferencia] = useState("");
  const [efMixto, setEfMixto] = useState("");
  const [resto, setResto] = useState<Resto>("transferencia");
  const [vista, setVista] = useState<{ k: string; v: VistaCobro } | null>(null);
  const [errorVista, setErrorVista] = useState<string | null>(null);
  const fiadoOk = puedeFiado && credito != null;

  // Pagos para la vista previa: un solo monto null = «el resto» (lo reparte SQL).
  const pagosVista = (() => {
    if (metodo === "efectivo") return [{ metodo: "efectivo", monto: null }];
    if (metodo === "tarjeta") return [{ metodo: "tarjeta", monto: null }];
    if (metodo === "transferencia") return [{ metodo: "transferencia", monto: null }];
    if (metodo === "fiado") return [{ metodo: "credito", monto: null }];
    return montoValido(efMixto) ? [{ metodo: "efectivo", monto: efMixto }, { metodo: resto, monto: null }] : [];
  })();
  const recibido = (metodo === "efectivo" || metodo === "mixto") && montoValido(paga) ? paga : undefined;
  const clave = JSON.stringify({ datos, pagosVista, recibido });

  useEffect(() => {
    if (pagosVista.length === 0) return;
    let vivo = true;
    const t = setTimeout(async () => {
      const r = await llamar<VistaCobro>("POST", "/cobrar/vista", { ...(JSON.parse(datos) as object), pagos: pagosVista, ...(recibido ? { efectivo_recibido: recibido } : {}) });
      if (!vivo) return;
      if (r.ok) {
        setVista({ k: clave, v: r.datos });
        setErrorVista(null);
      } else setErrorVista(mensajeCobro(r.error));
    }, 200);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
    // `clave` resume todas las entradas de la vista previa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const v = vista?.k === clave ? vista.v : null;
  const listo = v != null && v.cuadra && !v.efectivo_insuficiente && !v.excede_limite && (metodo !== "fiado" || fiadoOk) && (resto !== "credito" || metodo !== "mixto" || fiadoOk);
  const montoEfectivo = v?.pagos.find((p) => p.metodo === "efectivo")?.monto ?? null;

  function cuerpo(): CuerpoPago {
    const ref = referencia.trim();
    const pagos = (v?.pagos ?? []).map((p) => (p.metodo === "transferencia" && ref ? { ...p, referencia: ref } : p));
    const r = (metodo === "efectivo" || metodo === "mixto") && montoEfectivo ? (recibido ?? montoEfectivo) : undefined;
    return { pagos, ...(r ? { efectivo_recibido: r } : {}) };
  }

  // F4 cobra y Esc regresa; siempre con la versión actual del cuerpo.
  const ultimo = useRef<() => void>(() => {});
  useEffect(() => {
    ultimo.current = () => {
      if (listo && !enviando) alCobrar(cuerpo());
    };
  });
  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if (e.key === "F4") {
        e.preventDefault();
        ultimo.current();
      } else if (e.key === "Escape" && !e.defaultPrevented) {
        alVolver();
      }
    };
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [alVolver]);

  const usaCredito = metodo === "fiado" || (metodo === "mixto" && resto === "credito");

  return (
    <div className="flex flex-col gap-4 pb-44">
      <Tarjeta className="flex flex-col gap-1">
        <button type="button" onClick={alVolver} className="inline-flex min-h-tocable items-center gap-2 self-start text-base font-semibold text-marca-fuerte">
          <ArrowLeft aria-hidden className="size-5" /> Volver a la venta
        </button>
        <p className="text-base text-suave">Total a cobrar</p>
        <p className="text-5xl font-extrabold tabular-nums">{dinero(v?.total ?? total)}</p>
        {credito && <p className="text-base [overflow-wrap:anywhere]">Cliente: <strong>{credito.nombre}</strong></p>}
      </Tarjeta>

      <section aria-labelledby="pos-como" className="flex flex-col gap-3">
        <h2 id="pos-como" className="text-xl font-bold">¿Cómo paga?</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(Object.keys(NOMBRE) as Metodo[]).map((m) => (
            <Boton key={m} variante={metodo === m ? "primario" : "secundario"} aria-pressed={metodo === m} className="!min-h-16 !text-lg" disabled={m === "fiado" && !fiadoOk} onClick={() => setMetodo(m)}>
              {NOMBRE[m]}
            </Boton>
          ))}
        </div>
        {!fiadoOk && <p className="text-base text-suave">{puedeFiado ? "Para dejarle a fiado, elige primero al cliente." : "Tu usuario no puede vender a fiado."}</p>}
        {errorVista && <Aviso texto={errorVista} />}

        {(metodo === "efectivo" || metodo === "mixto") && (
          <Tarjeta className="flex flex-col gap-3">
            {metodo === "mixto" && <Campo etiqueta="Cuánto paga en efectivo" inputMode="decimal" value={efMixto} onChange={(e) => setEfMixto(e.target.value.replace(",", "."))} />}
            <p className="text-base font-semibold">Con cuánto paga{metodo === "mixto" ? " en efectivo" : ""} (para el cambio)</p>
            <Teclado etiqueta="Con cuánto paga" valor={paga} alCambiar={setPaga} />
            <Boton variante="secundario" className="!min-h-14" disabled={!montoEfectivo} onClick={() => setPaga(montoEfectivo ?? "")}>Paga exacto</Boton>
            {v?.efectivo_insuficiente && <Aviso texto="Con eso no alcanza para cubrir el efectivo." />}
            {v?.cambio != null && Number(v.cambio) > 0 && <p role="status" className="rounded-xl bg-marca-suave px-4 py-3 text-center text-3xl font-extrabold text-marca-fuerte">Cambio {dinero(v.cambio)}</p>}
          </Tarjeta>
        )}
        {metodo === "mixto" && (
          <Tarjeta className="flex flex-col gap-3">
            <Selector etiqueta="El resto lo paga con" value={resto} onChange={(e) => setResto(e.target.value as Resto)}>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta</option>
              {fiadoOk && <option value="credito">Fiado</option>}
            </Selector>
            {v && v.pagos[1] && <p className="text-xl font-bold">El resto: {dinero(v.pagos[1].monto)}</p>}
            {v && !v.cuadra && Number(v.falta) !== 0 && <Aviso tono="aviso" texto="El efectivo debe ser menos que el total." />}
          </Tarjeta>
        )}
        {(metodo === "transferencia" || (metodo === "mixto" && resto === "transferencia")) && (
          <Campo etiqueta="Referencia o clave de rastreo (opcional)" value={referencia} maxLength={60} autoComplete="off" onChange={(e) => setReferencia(e.target.value)} />
        )}
        {usaCredito && credito && (
          <Tarjeta className="flex flex-col gap-2">
            {credito.semaforo && <Insignia tono={textoSemaforo(credito.semaforo.color).tono}>{textoSemaforo(credito.semaforo.color).texto}</Insignia>}
            <p className="text-base">Debe ahora: <strong>{dinero(v?.saldo ?? credito.saldo)}</strong></p>
            {v?.saldo_despues != null && <p className="text-base">Con esta venta debería: <strong>{dinero(v.saldo_despues)}</strong></p>}
            {v?.disponible_despues != null && <p className="text-lg font-bold">Le quedarían {dinero(v.disponible_despues)} de crédito</p>}
            {v?.excede_limite && <Aviso texto="Esto pasa de su límite de crédito. Cobra una parte en efectivo o transferencia." />}
          </Tarjeta>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-borde bg-superficie px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-xl flex-col gap-2">
          {error && <Aviso texto={error} />}
          <Boton className="!min-h-16 !text-xl" ancho cargando={enviando} disabled={!listo} onClick={() => alCobrar(cuerpo())}>
            Cobrar {dinero(v?.total ?? total)} <kbd className="hidden rounded border border-white/60 px-1.5 text-sm font-normal lg:inline">F4</kbd>
          </Boton>
        </div>
      </div>
    </div>
  );
}

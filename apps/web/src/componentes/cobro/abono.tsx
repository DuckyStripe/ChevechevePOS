"use client";

import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";
import { Aviso, CampoFoto, mensajeCobro, Teclado, textoSemaforo, useClave } from "./comunes";
import { montoValido } from "./volver";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { Insignia } from "@/componentes/ui/insignia";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { fecha } from "@/componentes/productos/formato";
import { llamar } from "@/lib/api-cliente";
import { useSinGuardar } from "@/lib/cascaron";
import { dinero } from "@/lib/dinero";
import type { ResultadoAbono, Semaforo } from "@/lib/tipos";

export type DatosAbono = {
  cliente: { id: string; nombre: string; saldo: string | null; vencido: string | null; semaforo: Semaforo | null };
  paradaId: string | null;
  /** Cuentas pendientes (solo con `cobranza.ver`); vacío = no se pueden elegir. */
  cuentas: { id: string; texto: string; vence_el: string; saldo: string }[];
};
type Metodo = "efectivo" | "transferencia" | "tarjeta";
const NOMBRE: Record<Metodo, string> = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta" };

/** `/cobrar?cliente=[&parada=]`: abono. La suma de lo aplicado y el saldo nuevo los calcula la API (FIFO si no se elige cuenta). */
export function Abono({ datos, volver, hayTurno }: { datos: DatosAbono; volver: string; hayTurno: boolean }) {
  const { cliente, paradaId, cuentas } = datos;
  const sugerido = cliente.vencido != null && Number(cliente.vencido) > 0 ? cliente.vencido : (cliente.saldo ?? "");
  const [clave, renovar] = useClave(`chv:abono:${cliente.id}:${paradaId ?? "-"}`);
  const [monto, setMonto] = useState(sugerido && Number(sugerido) > 0 ? sugerido : "");
  const [metodo, setMetodo] = useState<Metodo>("efectivo");
  const [referencia, setReferencia] = useState("");
  const [comprobante, setComprobante] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [cuenta, setCuenta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<ResultadoAbono | null>(null);
  useSinGuardar(!listo && monto !== "" && monto !== sugerido);

  async function guardar() {
    setEnviando(true);
    setError(null);
    const r = await llamar<ResultadoAbono>("POST", "/abonos", {
      clave_idempotencia: clave,
      cliente_id: cliente.id,
      metodo,
      monto,
      ...(metodo === "transferencia" && referencia.trim() ? { referencia: referencia.trim() } : {}),
      ...(metodo !== "efectivo" && comprobante ? { comprobante } : {}),
      ...(paradaId ? { ruta_parada_id: paradaId } : {}),
      ...(cuenta ? { cuentas: [{ cuenta_por_cobrar_id: cuenta, monto }] } : {}),
    });
    setEnviando(false);
    if (!r.ok) return setError(`No se guardó. ${mensajeCobro(r.error)}`);
    renovar();
    setListo(r.datos);
  }

  if (listo) {
    const saldo = listo.saldo_cliente == null ? null : typeof listo.saldo_cliente === "string" ? listo.saldo_cliente : listo.saldo_cliente.saldo;
    return (
      <div className="flex flex-col gap-4">
        <Tarjeta className="flex flex-col items-center gap-2 text-center">
          <Check aria-hidden className="size-14 rounded-full bg-exito-suave p-3 text-exito" />
          <p role="status" className="text-2xl font-extrabold">Se guardó el abono</p>
          <p className="text-lg">{cliente.nombre} · {listo.folio}</p>
          <p className="text-3xl font-extrabold tabular-nums">{dinero(monto)}</p>
          {saldo != null && <p className="text-base">{Number(saldo) > 0 ? `Todavía debe ${dinero(saldo)}.` : "Ya no debe nada."}</p>}
        </Tarjeta>
        <BotonEnlace className="!min-h-14 !text-lg" href={volver}>
          {volver.startsWith("/reparto") ? "Siguiente: la siguiente parada" : "Listo, volver"}
        </BotonEnlace>
      </div>
    );
  }

  if (!hayTurno && metodo === "efectivo") {
    return (
      <Tarjeta className="flex flex-col gap-3">
        <p className="text-lg font-bold">Abre tu turno para recibir efectivo.</p>
        <BotonEnlace className="!min-h-14" href={`/caja?volver=${encodeURIComponent(`/cobrar?cliente=${cliente.id}&volver=${encodeURIComponent(volver)}`)}`}>
          Abre tu turno
        </BotonEnlace>
        <Boton variante="secundario" className="!min-h-14" onClick={() => setMetodo("transferencia")}>Cobrar por transferencia</Boton>
      </Tarjeta>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-44">
      <Tarjeta className="flex flex-col gap-1">
        <h2 className="text-2xl font-extrabold [overflow-wrap:anywhere]">{cliente.nombre}</h2>
        {cliente.semaforo && <div><Insignia tono={textoSemaforo(cliente.semaforo.color).tono}>{textoSemaforo(cliente.semaforo.color).texto}</Insignia></div>}
        <p className="text-base text-suave">Debe</p>
        <p className="text-4xl font-extrabold tabular-nums">{dinero(cliente.saldo)}</p>
        {cliente.vencido != null && Number(cliente.vencido) > 0 && <p className="text-base font-bold text-peligro">Vencido: {dinero(cliente.vencido)}</p>}
      </Tarjeta>

      <section aria-labelledby="cuanto" className="flex flex-col gap-2">
        <h2 id="cuanto" className="text-xl font-bold">¿Cuánto abona?</h2>
        <Teclado etiqueta="Monto del abono" valor={monto} alCambiar={setMonto} />
        <div className="flex flex-wrap gap-2">
          {cliente.vencido != null && Number(cliente.vencido) > 0 && <Boton variante="secundario" onClick={() => setMonto(cliente.vencido!)}>Lo vencido {dinero(cliente.vencido)}</Boton>}
          {cliente.saldo != null && Number(cliente.saldo) > 0 && <Boton variante="secundario" onClick={() => setMonto(cliente.saldo!)}>Todo {dinero(cliente.saldo)}</Boton>}
        </div>
      </section>

      <section aria-labelledby="como" className="flex flex-col gap-3">
        <h2 id="como" className="text-xl font-bold">¿Cómo paga?</h2>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(NOMBRE) as Metodo[]).map((m) => (
            <Boton key={m} variante={metodo === m ? "primario" : "secundario"} aria-pressed={metodo === m} className="!min-h-16 !px-2" onClick={() => setMetodo(m)}>{NOMBRE[m]}</Boton>
          ))}
        </div>
        {metodo === "transferencia" && <Campo etiqueta="Referencia o clave de rastreo (opcional)" value={referencia} maxLength={60} onChange={(e) => setReferencia(e.target.value)} autoComplete="off" />}
        {metodo !== "efectivo" && <CampoFoto etiqueta="Tomar foto del comprobante" nombre={comprobante} alCambiar={setComprobante} alOcupar={setSubiendo} />}
        {cuentas.length > 0 && (
          <details className="rounded-tarjeta border border-borde bg-superficie px-4 py-2">
            <summary className="flex min-h-14 cursor-pointer items-center text-base font-semibold">Pagar solo una cuenta</summary>
            <div className="flex flex-col gap-1 pb-2" role="radiogroup" aria-label="Cuenta a pagar">
              <label className="flex min-h-tocable items-center gap-3 text-base"><input type="radio" name="cuenta" className="size-5 accent-marca" checked={cuenta === ""} onChange={() => setCuenta("")} /> La más vieja primero</label>
              {cuentas.map((c) => (
                <label key={c.id} className="flex min-h-tocable items-center gap-3 text-base">
                  <input type="radio" name="cuenta" className="size-5 accent-marca" checked={cuenta === c.id} onChange={() => setCuenta(c.id)} />
                  <span className="[overflow-wrap:anywhere]">{c.texto} · vence {fecha(c.vence_el)} · {dinero(c.saldo)}</span>
                </label>
              ))}
            </div>
          </details>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-borde bg-superficie px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-xl flex-col gap-2">
          {error && <Aviso texto={error} />}
          <Boton className="!min-h-14 !text-lg" ancho cargando={enviando} disabled={!montoValido(monto) || subiendo} onClick={() => void guardar()}>
            {montoValido(monto) ? `Guardar abono de ${dinero(monto)}` : "Escribe cuánto abona"}
          </Boton>
          <Link href={volver} className="text-center text-base font-semibold text-marca-fuerte underline">Cancelar y volver</Link>
        </div>
      </div>
    </div>
  );
}

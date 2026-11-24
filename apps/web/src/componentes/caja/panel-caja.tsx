"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Aviso, mensajeCobro, Teclado, useClave } from "@/componentes/cobro/comunes";
import { montoValido } from "@/componentes/cobro/volver";
import { fechaHora } from "@/componentes/productos/formato";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { Campo, Selector } from "@/componentes/ui/campo";
import { BotonImprimirTicket } from "@/componentes/ticket/imprimir-ticket";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { llamar } from "@/lib/api-cliente";
import { useSinGuardar } from "@/lib/cascaron";
import { dinero } from "@/lib/dinero";
import type { Caja, ResumenTurno, TurnoCaja } from "@/lib/tipos";
import { HojaCorte } from "./hoja-corte";
import { ResumenCaja } from "./resumen";

type Tipo = "entrada" | "salida" | "retiro";
const TIPOS: { v: Tipo; texto: string; ayuda: string }[] = [
  { v: "salida", texto: "Gasto", ayuda: "Gasolina, caseta, comida…" },
  { v: "entrada", texto: "Entra dinero", ayuda: "Dinero que pones en la caja" },
  { v: "retiro", texto: "Retiro", ayuda: "Dinero que sacas de la caja" },
];

/** `/caja`: dueña de abrir y cerrar el mostrador y de todos los movimientos y gastos del turno (N1). */
export function PanelCaja({ turno, resumen, cajas, volver, puedeAbrir, puedeVender }: { turno: TurnoCaja | null; resumen: ResumenTurno | null; cajas: Caja[]; volver: string | null; puedeAbrir: boolean; puedeVender: boolean }) {
  const router = useRouter();
  const [caja, setCaja] = useState(cajas.find((c) => !c.turno_abierto)?.id ?? "");
  const [fondo, setFondo] = useState("");
  const [tipo, setTipo] = useState<Tipo>("salida");
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [contado, setContado] = useState("");
  const [notas, setNotas] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cierre, setCierre] = useState<ResumenTurno | null>(null);
  const [claveMov, renovarMov] = useClave(`chv:movimiento:${turno?.id ?? "-"}`);
  useSinGuardar(monto !== "" || motivo !== "");

  const esRuta = turno?.tipo === "ruta";
  const tipos = esRuta ? TIPOS.filter((t) => t.v === "salida") : TIPOS;

  async function abrir() {
    setOcupado("abrir");
    setError(null);
    const r = await llamar("POST", "/turnos", { caja_id: caja, fondo_inicial: fondo === "" ? "0.00" : fondo });
    setOcupado(null);
    if (!r.ok) return setError(r.error.codigo === "TURNO_YA_ABIERTO" ? "Ya tienes un turno abierto." : r.error.codigo === "CAJA_OCUPADA" ? "Esa caja ya la tiene otra persona." : mensajeCobro(r.error));
    toast.success("Turno abierto.");
    router.refresh();
  }

  async function anotar() {
    if (!turno) return;
    setOcupado("mov");
    setError(null);
    const r = await llamar("POST", `/turnos/${turno.id}/movimientos`, { clave_idempotencia: claveMov, tipo, monto, motivo: motivo.trim() });
    setOcupado(null);
    if (!r.ok) return setError(`No se guardó. ${mensajeCobro(r.error)}`);
    toast.success("Se guardó.");
    renovarMov();
    setMonto("");
    setMotivo("");
    router.refresh();
  }

  async function cerrar() {
    if (!turno) return;
    setOcupado("cerrar");
    setError(null);
    const r = await llamar<ResumenTurno>("POST", `/turnos/${turno.id}/cerrar`, { efectivo_contado: contado, ...(notas.trim() ? { notas: notas.trim() } : {}) });
    setOcupado(null);
    if (!r.ok) return setError(`No se cerró. ${mensajeCobro(r.error)}`);
    setCierre(r.datos);
    router.refresh();
  }

  if (cierre) {
    return (
      <Tarjeta className="flex flex-col gap-3">
        <p role="status" className="text-2xl font-extrabold">Turno cerrado</p>
        <ResumenCaja r={cierre} />
        <BotonImprimirTicket texto="Imprimir corte" variante="secundario" />
        <BotonEnlace href="/caja">Listo</BotonEnlace>
        <HojaCorte r={cierre} usuario={turno?.usuario} abierto={turno?.abierto_en} />
      </Tarjeta>
    );
  }

  if (!turno) {
    if (!puedeAbrir) return <Tarjeta><p className="text-base">No tienes un turno abierto. Si repartes, se abre solo al iniciar tu ruta en «Mi ruta».</p></Tarjeta>;
    const libres = cajas.filter((c) => c.activa && !c.turno_abierto);
    return (
      <Tarjeta className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Abre tu turno de mostrador</h2>
        {libres.length === 0 ? (
          <p className="text-base text-suave">No hay una caja libre. Pídele al dueño que active una.</p>
        ) : (
          <>
            <Selector etiqueta="Caja" value={caja} onChange={(e) => setCaja(e.target.value)}>
              {libres.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Selector>
            <Campo etiqueta="Con cuánto dinero empiezas (fondo)" inputMode="decimal" value={fondo} onChange={(e) => setFondo(e.target.value.replace(",", "."))} ayuda="Si no hay fondo, déjalo vacío." />
            {error && <Aviso texto={error} />}
            <Boton className="!min-h-14" cargando={ocupado === "abrir"} disabled={!caja || (fondo !== "" && !/^\d{1,10}(\.\d{1,2})?$/.test(fondo))} onClick={() => void abrir()}>
              Abrir turno
            </Boton>
          </>
        )}
      </Tarjeta>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta className="flex flex-col gap-1">
        <p className="text-lg font-bold">{esRuta ? "Turno de tu ruta" : "Turno de mostrador"}</p>
        <p className="text-base text-suave">Abierto desde {fechaHora(turno.abierto_en)} · empezó con {dinero(turno.fondo_inicial)}</p>
        {volver && <BotonEnlace className="!min-h-14 mt-2" href={volver}>Volver a la ruta</BotonEnlace>}
        {!esRuta && puedeVender && <BotonEnlace className="!min-h-14 mt-2" href="/pos">Vender</BotonEnlace>}
      </Tarjeta>

      <Tarjeta aria-labelledby="mov" className="flex flex-col gap-3">
        <h2 id="mov" className="text-xl font-bold">{esRuta ? "Anotar un gasto" : "Anotar un movimiento"}</h2>
        {tipos.length > 1 && (
          <div className="grid grid-cols-3 gap-2">
            {tipos.map((t) => <Boton key={t.v} variante={tipo === t.v ? "primario" : "secundario"} aria-pressed={tipo === t.v} className="!px-2" onClick={() => setTipo(t.v)}>{t.texto}</Boton>)}
          </div>
        )}
        <p className="text-base text-suave">{tipos.find((t) => t.v === tipo)?.ayuda}</p>
        <Teclado etiqueta="Monto" valor={monto} alCambiar={setMonto} />
        <Campo etiqueta="Motivo (por ejemplo: gasolina)" value={motivo} maxLength={120} onChange={(e) => setMotivo(e.target.value)} />
        {error && <Aviso texto={error} />}
        <Boton className="!min-h-14 !text-lg" cargando={ocupado === "mov"} disabled={!montoValido(monto) || !motivo.trim()} onClick={() => void anotar()}>
          {montoValido(monto) ? `Guardar ${dinero(monto)}` : "Escribe el monto"}
        </Boton>
      </Tarjeta>

      {resumen && (
        <Tarjeta aria-labelledby="res">
          <h2 id="res" className="mb-1 text-xl font-bold">Cómo va tu turno</h2>
          <ResumenCaja r={resumen} />
          {!esRuta && <div className="mt-3"><BotonImprimirTicket texto="Imprimir corte" variante="secundario" /></div>}
          {!esRuta && <HojaCorte r={resumen} usuario={turno.usuario} abierto={turno.abierto_en} titulo="Corte parcial" />}
        </Tarjeta>
      )}

      {esRuta ? (
        <p className="text-base text-suave">Al terminar tu ruta, quien liquida cuenta el efectivo contigo.</p>
      ) : (
        <details className="rounded-tarjeta border border-borde bg-superficie px-4 py-2">
          <summary className="flex min-h-14 cursor-pointer items-center text-base font-semibold">Cerrar mi turno</summary>
          <div className="flex flex-col gap-3 pb-2">
            {resumen && <p className="text-base">Debe haber {dinero(resumen.efectivo_esperado)} en efectivo.</p>}
            <Campo etiqueta="Efectivo que contaste" inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value.replace(",", "."))} />
            <Campo etiqueta="Notas (opcional)" value={notas} maxLength={200} onChange={(e) => setNotas(e.target.value)} />
            <Boton variante="peligro" className="!min-h-14" cargando={ocupado === "cerrar"} disabled={!/^\d{1,10}(\.\d{1,2})?$/.test(contado)} onClick={() => void cerrar()}>
              Cerrar turno
            </Boton>
          </div>
        </details>
      )}
    </div>
  );
}

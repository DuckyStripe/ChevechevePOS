"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Smartphone } from "lucide-react";
import { toast } from "sonner";
import { fechaHora, mensajeError } from "@/componentes/productos/formato";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { DialogoConfirmar } from "@/componentes/ui/dialogo";
import { Insignia } from "@/componentes/ui/insignia";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { llamar } from "@/lib/api-cliente";
import type { ClienteDetalle, Dispositivo } from "@/lib/tipos";

type Pendiente = "generar" | "forzar" | "pin" | null;

/** Enlace del cliente: generar, dispositivos, restablecer numeros. Solo vive en `/clientes/[id]` (N1); dar de baja vive en `/clientes`. */
export function EnlaceCliente({ cliente, dispositivos, puedeEnlace }: { cliente: ClienteDetalle; dispositivos: Dispositivo[]; puedeEnlace: boolean }) {
  const router = useRouter();
  const [pendiente, setPendiente] = useState<Pendiente>(null);
  const [cargando, setCargando] = useState(false);
  const [sinCompra, setSinCompra] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generado, setGenerado] = useState(false);

  async function generar(forzar: boolean) {
    setCargando(true);
    setError(null);
    const r = await llamar("POST", `/clientes/${cliente.id}/enlace`, forzar ? { forzar: true } : {});
    setCargando(false);
    setPendiente(null);
    if (!r.ok) {
      if (r.error.codigo === "SIN_PRIMERA_COMPRA") return setSinCompra(true);
      return setError(mensajeError(r.error));
    }
    setSinCompra(false);
    setGenerado(true);
    toast.success("Link nuevo generado. El mensaje está en Avisos por enviar.");
    router.refresh();
  }

  async function restablecer() {
    setCargando(true);
    const r = await llamar("POST", `/clientes/${cliente.id}/pin/restablecer`);
    setCargando(false);
    setPendiente(null);
    if (!r.ok) return setError(mensajeError(r.error));
    toast.success("Listo. La próxima vez que entre elegirá 4 números nuevos.");
    router.refresh();
  }

  async function quitar(d: Dispositivo) {
    const r = await llamar("DELETE", `/clientes/${cliente.id}/dispositivos/${d.id}`);
    if (!r.ok) return void toast.error(mensajeError(r.error));
    toast.success("Teléfono quitado. Ese teléfono volverá a pedir los 4 números.");
    router.refresh();
  }

  const conLink = !!cliente.enlace;
  const avisoHref = `/clientes/${cliente.id}?nuevo=wa_enlace_cliente&cliente=${cliente.id}`;

  return (
    <Tarjeta className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">Link para pedir</h2>
      <p className="flex flex-wrap items-center gap-2 text-base">
        {conLink ? <Insignia tono="exito">Tiene link</Insignia> : <Insignia>Sin link</Insignia>}
        {cliente.enlace && <span className="text-suave">Último uso: {cliente.enlace.ultimo_uso_en ? fechaHora(cliente.enlace.ultimo_uso_en) : "todavía no lo abre"}</span>}
      </p>

      {puedeEnlace && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Boton onClick={() => (conLink ? setPendiente("generar") : void generar(false))} cargando={cargando && pendiente === null}>
            {conLink ? "Generar link nuevo" : "Generar link"}
          </Boton>
          {conLink && (
            <BotonEnlace variante="secundario" href={avisoHref}>
              Mandar link por WhatsApp
            </BotonEnlace>
          )}
          {conLink && (
            <Boton variante="secundario" onClick={() => setPendiente("pin")}>
              Restablecer sus 4 números
            </Boton>
          )}
          {conLink && (
            <BotonEnlace variante="fantasma" href={`/clientes?revocar=${cliente.id}`}>
              Dar de baja link
            </BotonEnlace>
          )}
        </div>
      )}

      {generado && (
        <p role="status" className="rounded-xl bg-exito-suave p-3 text-base font-medium text-exito">
          Listo. Mándaselo desde{" "}
          <Link href={`/clientes/${cliente.id}?bandeja=1&cliente=${cliente.id}`} className="underline">
            Avisos por enviar
          </Link>
          .
        </p>
      )}
      {sinCompra && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl border border-marca bg-marca-suave p-3">
          <p className="text-base font-medium">Este cliente todavía no te compra. Normalmente el link se da después de su primera compra.</p>
          <Boton variante="secundario" onClick={() => setPendiente("forzar")}>
            Generar de todos modos
          </Boton>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
          {error}
        </p>
      )}

      {puedeEnlace && conLink && (
        <div>
          <h3 className="mb-1 text-base font-semibold">Teléfonos que ya entraron</h3>
          {dispositivos.length === 0 ? (
            <p className="text-base text-suave">Ninguno todavía.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {dispositivos.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-borde p-2">
                  <span className="flex min-w-0 items-center gap-2 text-base">
                    <Smartphone aria-hidden className="size-5 shrink-0 text-suave" />
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      {d.navegador ?? "Teléfono"}
                      <span className="block text-sm text-suave">Último uso: {fechaHora(d.ultimo_uso_en)}</span>
                    </span>
                  </span>
                  <Boton variante="secundario" onClick={() => void quitar(d)}>
                    Quitar
                  </Boton>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <DialogoConfirmar
        abierto={pendiente === "generar" || pendiente === "forzar"}
        titulo="Generar link nuevo"
        texto="El link anterior de este cliente dejará de funcionar. Después le mandas el nuevo por WhatsApp."
        confirmar="Generar link nuevo"
        cargando={cargando}
        alConfirmar={() => void generar(pendiente === "forzar")}
        alCerrar={() => setPendiente(null)}
      />
      <DialogoConfirmar
        abierto={pendiente === "pin"}
        titulo="Restablecer sus 4 números"
        texto="Su link sigue igual. La próxima vez que entre desde un teléfono que no conocemos, elegirá 4 números nuevos."
        confirmar="Restablecer"
        cargando={cargando}
        alConfirmar={() => void restablecer()}
        alCerrar={() => setPendiente(null)}
      />
    </Tarjeta>
  );
}

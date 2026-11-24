"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, Delete } from "lucide-react";
import { mensajeError, uuid } from "@/componentes/productos/formato";
import { Boton } from "@/componentes/ui/boton";
import { subirArchivo, type ErrorApi } from "@/lib/api-cliente";
import { dinero } from "@/lib/dinero";
import { reducirImagen } from "@/lib/imagen";
import type { Semaforo } from "@/lib/tipos";

/**
 * `clave_idempotencia`: nace al abrir la pantalla y sobrevive a recargar (sessionStorage), así reintentar nunca duplica (P5).
 * `renovar()` solo cuando la acción terminó y la pantalla puede repetirse (p. ej. otro gasto).
 */
export function useClave(llave: string): [string, () => void] {
  const [clave, setClave] = useState(() => {
    try {
      const guardada = sessionStorage.getItem(llave);
      if (guardada) return guardada;
      const nueva = uuid();
      sessionStorage.setItem(llave, nueva);
      return nueva;
    } catch {
      return uuid();
    }
  });
  const renovar = () => {
    const nueva = uuid();
    try {
      sessionStorage.setItem(llave, nueva);
    } catch {
      /* sin almacenamiento: la clave vive en memoria */
    }
    setClave(nueva);
  };
  return [clave, renovar];
}

/** Texto llano para lo que puede fallar al cobrar (P6): nunca el código. */
export function mensajeCobro(e: ErrorApi): string {
  const d = (e.detalles ?? {}) as { disponible?: string; saldo?: string };
  switch (e.codigo) {
    case "SIN_RED":
      return "No sabemos si se guardó: no hay señal. Toca otra vez cuando tengas; si ya estaba guardado, no se cobra doble.";
    case "TURNO_NO_ABIERTO":
      return "Primero abre tu turno en Caja.";
    case "LIMITE_CREDITO_EXCEDIDO":
      return d.disponible != null ? `Su crédito no alcanza: le quedan ${dinero(d.disponible)} disponibles.` : "Su crédito no alcanza para dejarlo a fiado.";
    case "ABONO_EXCEDE_SALDO":
      return d.saldo != null ? `Está pagando más de lo que debe (debe ${dinero(d.saldo)}).` : "Está pagando más de lo que debe.";
    case "EFECTIVO_INSUFICIENTE":
      return "Con lo que paga no alcanza para cubrir el efectivo.";
    case "PAGOS_NO_CUADRAN":
      return "Lo que se cobra no cuadra con el total. Revisa los montos.";
    case "ENTREGA_VACIA":
      return "No hay nada que entregar. Si no se entregó, usa «No entregado».";
    case "IDEMPOTENCIA_CONFLICTO":
      return "Eso ya se había guardado con otros datos. Revisa en Ventas o Cobranza antes de volver a cobrar.";
    case "RUTA_AJENA":
      return "Este pedido es de la ruta de otra persona.";
    case "ESTADO_NO_VALIDO":
      return "Este pedido ya no se puede entregar así. Recarga la pantalla.";
    default:
      return mensajeError(e);
  }
}

export function Aviso({ texto, tono = "peligro" }: { texto: string; tono?: "peligro" | "exito" | "aviso" }) {
  const c = { peligro: "bg-peligro-suave text-peligro", exito: "bg-exito-suave text-exito", aviso: "bg-marca-suave text-marca-fuerte" }[tono];
  return (
    <p role={tono === "peligro" ? "alert" : "status"} className={`rounded-xl p-3 text-base font-bold ${c}`}>
      {texto}
    </p>
  );
}

const COLOR_SEMAFORO = {
  verde: { texto: "Al corriente", tono: "exito" },
  amarillo: { texto: "Algo atrasado", tono: "aviso" },
  rojo: { texto: "Muy atrasado", tono: "peligro" },
} as const;
export const textoSemaforo = (s: Semaforo["color"]) => COLOR_SEMAFORO[s];

/** Teclado de montos grande (P4): sin teclado del teléfono, un dedo. */
export function Teclado({ valor, alCambiar, etiqueta }: { valor: string; alCambiar: (v: string) => void; etiqueta: string }) {
  const tocar = (k: string) => {
    if (k === "<") return alCambiar(valor.slice(0, -1));
    if (k === ".") return valor.includes(".") ? undefined : alCambiar(valor === "" ? "0." : `${valor}.`);
    const [ent = "", dec] = valor.split(".");
    if (dec !== undefined ? dec.length >= 2 : ent.length >= 7) return;
    alCambiar(valor === "0" ? k : `${valor}${k}`);
  };
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-col gap-2">
      <output aria-live="polite" className="block rounded-xl border border-borde bg-fondo px-4 py-3 text-right text-3xl font-extrabold tabular-nums">
        ${valor || "0"}
      </output>
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "<"].map((k) => (
          <Boton key={k} variante="secundario" className="!min-h-14 !text-2xl" aria-label={k === "<" ? "Borrar" : k === "." ? "Punto" : k} onClick={() => tocar(k)}>
            {k === "<" ? <Delete aria-hidden className="size-6" /> : k}
          </Boton>
        ))}
      </div>
    </div>
  );
}

/**
 * Foto con la cámara (`<input capture>`: funciona en el cascarón Android). Se reduce en el teléfono y se sube al instante
 * (`POST /comprobantes`, ≤ 1 MB); `alCambiar` recibe el nombre guardado para mandarlo luego con el pago.
 */
export function CampoFoto({ etiqueta, nombre, alCambiar, alOcupar }: { etiqueta: string; nombre: string | null; alCambiar: (n: string | null) => void; alOcupar?: (o: boolean) => void }) {
  const [estado, setEstado] = useState<"quieto" | "subiendo" | "error">("quieto");
  const [vista, setVista] = useState<string | null>(null);
  const url = useRef<string | null>(null);
  useEffect(() => () => void (url.current && URL.revokeObjectURL(url.current)), []);

  async function elegida(archivo: File | undefined) {
    if (!archivo) return;
    setEstado("subiendo");
    alOcupar?.(true);
    alCambiar(null);
    try {
      const { imagen, extension } = await reducirImagen(archivo);
      const f = new FormData();
      f.append("imagen", imagen, `foto.${extension}`);
      const r = await subirArchivo<{ comprobante: string }>("/comprobantes", f, "POST");
      if (!r.ok) throw new Error(r.error.mensaje);
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(imagen);
      setVista(url.current);
      alCambiar(r.datos.comprobante);
      setEstado("quieto");
    } catch {
      setEstado("error");
    } finally {
      alOcupar?.(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border border-borde bg-superficie px-5 text-base font-semibold active:bg-marca-suave">
        <Camera aria-hidden className="size-6" /> {nombre ? `Cambiar ${etiqueta.toLowerCase()}` : etiqueta}
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void elegida(e.target.files?.[0])} />
      </label>
      {estado === "subiendo" && <p role="status" className="text-base text-suave">Guardando la foto…</p>}
      {estado === "error" && <Aviso texto="No se pudo guardar la foto. Intenta otra vez o sigue sin ella." />}
      {nombre && (
        <p role="status" className="flex items-center gap-2 text-base font-semibold text-exito">
          <Check aria-hidden className="size-5" /> Foto guardada
          {vista && (
            // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), no pasa por el optimizador
            <img src={vista} alt="Foto tomada" width={48} height={48} className="size-12 rounded-lg object-cover" />
          )}
        </p>
      )}
    </div>
  );
}

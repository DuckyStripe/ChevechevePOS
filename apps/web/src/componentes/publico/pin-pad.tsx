"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Delete } from "lucide-react";
import { T } from "@/lib/textos-publico";

const TECLA = "flex h-16 items-center justify-center rounded-2xl border border-borde bg-superficie text-3xl font-bold active:bg-marca-suave";
const nada = () => () => {};

/**
 * Teclado numerico grande (C1). Sin JS (o antes de hidratar) es un campo `inputmode="numeric"` dentro del formulario, que
 * se envia por POST normal; con JS el teclado llena el campo y envia solo al cuarto numero.
 */
export function PinPad({ boton }: { boton: string }) {
  const conJs = useSyncExternalStore(nada, () => true, () => false);
  const [pin, setPin] = useState("");
  const campo = useRef<HTMLInputElement>(null);

  function tecla(d: string) {
    const nuevo = (pin + d).slice(0, 4);
    setPin(nuevo);
    if (nuevo.length === 4) setTimeout(() => campo.current?.form?.requestSubmit(), 0);
  }

  if (!conJs) {
    return (
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-lg font-semibold">
          {T.pinCampo}
          <input name="pin" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required autoComplete="off" className="min-h-16 rounded-2xl border border-borde bg-superficie text-center text-4xl tracking-[0.5em]" />
        </label>
        <button type="submit" className="min-h-14 rounded-xl bg-marca text-lg font-bold text-white">
          {boton}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <input ref={campo} type="hidden" name="pin" value={pin} />
      <div role="status" aria-label={`${T.pinCampo}: ${pin.length} de 4`} className="flex justify-center gap-4 py-2">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} aria-hidden className={`size-5 rounded-full border-2 border-marca ${i < pin.length ? "bg-marca" : ""}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className={TECLA} onClick={() => tecla(d)}>
            {d}
          </button>
        ))}
        <button type="button" className={`${TECLA} text-base`} aria-label={T.pinBorrar} onClick={() => setPin((p) => p.slice(0, -1))}>
          <Delete aria-hidden className="size-7" />
        </button>
        <button type="button" className={TECLA} onClick={() => tecla("0")}>
          0
        </button>
        <button type="submit" disabled={pin.length !== 4} className="flex h-16 items-center justify-center rounded-2xl bg-marca text-lg font-bold text-white disabled:opacity-40">
          {T.pinEntrar}
        </button>
      </div>
    </div>
  );
}

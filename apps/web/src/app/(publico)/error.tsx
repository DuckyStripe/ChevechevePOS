"use client";

import { T } from "@/lib/textos-publico";

export default function ErrorPublico({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="mt-6 rounded-tarjeta border border-peligro/40 bg-peligro-suave p-4">
      <p className="mb-3 text-base font-medium text-peligro">
        {T.errorGeneral} {T.sinRed}
      </p>
      <button type="button" onClick={reset} className="min-h-tocable rounded-xl border border-borde bg-superficie px-5 text-base font-semibold">
        {T.reintentar}
      </button>
    </div>
  );
}

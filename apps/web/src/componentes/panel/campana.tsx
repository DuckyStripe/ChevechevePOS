"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { llamar } from "@/lib/api-cliente";
import type { Yo } from "@/lib/tipos";

/** N5: la campana esta en todo el panel. Sondea `GET /auth/yo` cada 30 s (solo lectura; sin sesion el servidor redirige). */
export function Campana({ inicial }: { inicial: number }) {
  const [sinLeer, setSinLeer] = useState(inicial);

  useEffect(() => {
    const id = setInterval(async () => {
      if (document.hidden) return;
      const r = await llamar<Yo>("GET", "/auth/yo");
      if (r.ok) setSinLeer(r.datos.notificaciones_sin_leer);
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Link
      href="/notificaciones"
      aria-label={sinLeer > 0 ? `Avisos: ${sinLeer} sin leer` : "Avisos"}
      className="relative flex size-12 items-center justify-center rounded-xl hover:bg-marca-suave"
    >
      <Bell aria-hidden className="size-6" />
      {sinLeer > 0 && (
        <span className="absolute right-1 top-1 min-w-5 rounded-full bg-peligro px-1 text-center text-xs font-bold leading-5 text-white">
          {sinLeer > 99 ? "99+" : sinLeer}
        </span>
      )}
    </Link>
  );
}

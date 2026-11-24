"use client";

import { useCallback, useEffect, useState } from "react";
import type { CatalogoPublico } from "@/lib/tipos";
import { irSiSesionPerdida } from "./llamar-publico";

type Estado = { datos: CatalogoPublico | null; error: boolean };

/** `fetch` normal, no `llamar` (que usa no-store): asi el navegador revalida con `If-None-Match` y la segunda visita baja un 304 (C9). */
async function traer(): Promise<Estado | null> {
  try {
    const r = await fetch("/api/publico/catalogo");
    if (r.status === 401) {
      const j = (await r.json().catch(() => null)) as { error?: { codigo?: string } } | null;
      irSiSesionPerdida(j?.error?.codigo ?? "");
      return null;
    }
    if (!r.ok) throw new Error("catalogo");
    return { datos: (await r.json()) as CatalogoPublico, error: false };
  } catch {
    return { datos: null, error: true };
  }
}

/** Catalogo del cliente. Si falla una recarga con datos ya cargados, se conservan los datos. */
export function useCatalogo() {
  const [estado, setEstado] = useState<Estado>({ datos: null, error: false });
  const aplicar = (n: Estado | null) => n && setEstado((e) => (n.error ? { ...e, error: true } : n));

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const n = await traer();
      if (vivo && n) setEstado((e) => (n.error ? { ...e, error: true } : n));
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const recargar = useCallback(async () => aplicar(await traer()), []);
  return { ...estado, recargar };
}

"use client";

import { AvisoError } from "@/componentes/ui/aviso-error";

export default function ErrorPanel({ reset }: { error: Error; reset: () => void }) {
  return <AvisoError mensaje="Esta pantalla no pudo cargar. Tus datos no se tocaron." alReintentar={reset} />;
}

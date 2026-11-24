import Link from "next/link";
import { ClipboardList, ShoppingBasket } from "lucide-react";
import { T } from "@/lib/textos-publico";

/** Marco comun de las pantallas del cliente: nombre del negocio y dos enlaces grandes. Sin JS. */
export function Encabezado({ negocio, saludo }: { negocio: string; saludo?: string }) {
  return (
    <header className="mb-4">
      <p className="text-xl font-bold [overflow-wrap:anywhere]">{negocio}</p>
      {saludo && <p className="text-base text-suave">{saludo}</p>}
      <nav aria-label="Secciones" className="mt-3 flex gap-2">
        <Link href="/pedido" className="flex min-h-tocable flex-1 items-center justify-center gap-2 rounded-xl border border-borde bg-superficie text-base font-semibold">
          <ShoppingBasket aria-hidden className="size-5" /> {T.volverAlCatalogo}
        </Link>
        <Link href="/pedido/mis-pedidos" className="flex min-h-tocable flex-1 items-center justify-center gap-2 rounded-xl border border-borde bg-superficie text-base font-semibold">
          <ClipboardList aria-hidden className="size-5" /> {T.misPedidos}
        </Link>
      </nav>
    </header>
  );
}

/** Error de lectura en palabras llanas, con salida. */
export function ErrorPublico({ mensaje }: { mensaje: string }) {
  return (
    <div role="alert" className="rounded-tarjeta border border-peligro/40 bg-peligro-suave p-4">
      <p className="mb-3 text-base font-medium text-peligro">{mensaje}</p>
      <Link href="/pedido" className="inline-flex min-h-tocable items-center rounded-xl border border-borde bg-superficie px-5 text-base font-semibold">
        {T.reintentar}
      </Link>
    </div>
  );
}

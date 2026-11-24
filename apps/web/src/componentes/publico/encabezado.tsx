import Link from "next/link";
import { ClipboardList, ShoppingBasket } from "lucide-react";
import { dinero } from "@/lib/dinero";
import { T } from "@/lib/textos-publico";
import type { ClientePublico } from "@/lib/tipos";

/** Marco comun de las pantallas del cliente: nombre del negocio y dos enlaces grandes. Sin JS. */
export function Encabezado({ negocio, saludo, credito }: { negocio: string; saludo?: string; credito?: ClientePublico["credito"] }) {
  // C15: su saldo en una línea (sin sumar: la API manda saldo y disponible). Sin crédito ni saldo no se muestra.
  const debe = credito != null && Number(credito.saldo) > 0;
  const tieneLimite = credito != null && Number(credito.limite) > 0;
  const linea = !credito ? null : debe && tieneLimite ? T.cuentaDebesYQuedan(dinero(credito.saldo), dinero(credito.disponible)) : debe ? T.cuentaSoloDebes(dinero(credito.saldo)) : tieneLimite ? T.cuentaSoloCredito(dinero(credito.disponible)) : null;
  return (
    <header className="mb-4">
      <p className="text-xl font-bold [overflow-wrap:anywhere]">{negocio}</p>
      {saludo && <p className="text-base text-suave">{saludo}</p>}
      {linea && (
        <Link href="/pedido/estado-cuenta" className="mt-1 inline-flex min-h-tocable items-center text-base font-semibold text-marca-fuerte underline">
          {linea}
        </Link>
      )}
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

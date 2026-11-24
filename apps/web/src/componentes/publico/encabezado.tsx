import Link from "next/link";
import { ClipboardList, ShoppingBasket } from "lucide-react";
import { dinero } from "@/lib/dinero";
import { T } from "@/lib/textos-publico";
import type { ClientePublico } from "@/lib/tipos";

const SECCION =
  "flex min-h-tocable min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-2 text-base font-semibold text-suave transition-[transform,background-color] duration-150 ease-salida active:scale-[0.97] aria-[current=page]:bg-superficie aria-[current=page]:text-texto aria-[current=page]:shadow-tarjeta";

/** Marco comun de las pantallas del cliente: nombre del negocio y dos secciones grandes. Sin JS. */
export function Encabezado({
  negocio,
  saludo,
  credito,
  lealtad,
  actual,
}: {
  negocio: string;
  saludo?: string;
  credito?: ClientePublico["credito"];
  lealtad?: ClientePublico["lealtad"];
  /** Seccion en la que esta (se marca en el selector). */
  actual?: "catalogo" | "pedidos";
}) {
  // C15: su saldo en una línea (sin sumar: la API manda saldo y disponible). Sin crédito ni saldo no se muestra.
  const debe = credito != null && Number(credito.saldo) > 0;
  const tieneLimite = credito != null && Number(credito.limite) > 0;
  const linea = !credito ? null : debe && tieneLimite ? T.cuentaDebesYQuedan(dinero(credito.saldo), dinero(credito.disponible)) : debe ? T.cuentaSoloDebes(dinero(credito.saldo)) : tieneLimite ? T.cuentaSoloCredito(dinero(credito.disponible)) : null;
  return (
    <header className="mb-4">
      <p className="font-titulo text-2xl font-bold leading-tight tracking-tight [overflow-wrap:anywhere]">{negocio}</p>
      {saludo && <p className="mt-0.5 text-base text-suave">{saludo}</p>}
      {linea && (
        <Link href="/pedido/estado-cuenta" className="mt-1 inline-flex min-h-tocable items-center text-base font-semibold text-marca-fuerte underline underline-offset-4">
          {linea}
        </Link>
      )}
      {/* C19: la frase sale armada de la plantilla en la API; aquí solo se muestra. */}
      {lealtad && <p className="mt-1 text-base font-semibold [overflow-wrap:anywhere]">{lealtad.texto}</p>}
      <nav aria-label="Secciones" className="mt-3 flex gap-1 rounded-2xl bg-hundido p-1">
        <Link href="/pedido" aria-current={actual === "catalogo" ? "page" : undefined} className={SECCION}>
          <ShoppingBasket aria-hidden className="size-5 shrink-0" /> <span className="text-center leading-tight">{T.volverAlCatalogo}</span>
        </Link>
        <Link href="/pedido/mis-pedidos" aria-current={actual === "pedidos" ? "page" : undefined} className={SECCION}>
          <ClipboardList aria-hidden className="size-5 shrink-0" /> <span className="text-center leading-tight">{T.misPedidos}</span>
        </Link>
      </nav>
    </header>
  );
}

/** Error de lectura en palabras llanas, con salida. */
export function ErrorPublico({ mensaje }: { mensaje: string }) {
  return (
    <div role="alert" className="mt-4 rounded-tarjeta border border-peligro/30 bg-peligro-suave p-4">
      <p className="mb-3 text-base font-semibold text-peligro">{mensaje}</p>
      <Link href="/pedido" className="inline-flex min-h-tocable items-center rounded-xl border border-borde bg-superficie px-5 text-base font-semibold shadow-tarjeta active:scale-[0.97]">
        {T.reintentar}
      </Link>
    </div>
  );
}

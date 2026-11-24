import Link from "next/link";
import { ChevronRight, Truck } from "lucide-react";
import { Encabezado, ErrorPublico } from "@/componentes/publico/encabezado";
import { fecha } from "@/componentes/productos/formato";
import { apiPublico } from "@/lib/api-publico";
import { dinero } from "@/lib/dinero";
import { T } from "@/lib/textos-publico";
import type { ClientePublico, PedidoPublicoFila } from "@/lib/tipos";

export const metadata = { title: "Mis pedidos" };

const TERMINADAS = new Set(["entregado", "cancelado", "no_entregado"]);

function Fila({ p }: { p: PedidoPublicoFila }) {
  return (
    <li>
      <Link href={`/pedido/mis-pedidos/${p.id}`} className="flex min-h-tocable items-center gap-3 rounded-tarjeta border border-borde bg-superficie p-4">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold">{T.pedidoNumero(p.folio)}</p>
          <p className="text-base [overflow-wrap:anywhere]">{p.etiqueta}</p>
          {p.reparto && (
            <p className="flex items-center gap-1 text-base font-semibold text-marca-fuerte">
              <Truck aria-hidden className="size-5" /> {T.paradaDe(p.reparto.parada, p.reparto.paradas)}
            </p>
          )}
          {p.faltantes_pendientes > 0 && <p className="text-base font-semibold text-peligro">{T.faltantesPendientes(p.faltantes_pendientes)}</p>}
          <p className="text-base text-suave">
            {dinero(p.total)}
            {p.fecha_entrega ? ` · ${T.entregaFecha} ${fecha(p.fecha_entrega)}` : ""}
          </p>
        </div>
        <ChevronRight aria-hidden className="size-6 shrink-0 text-suave" />
      </Link>
    </li>
  );
}

export default async function MisPedidos() {
  const [c, r] = await Promise.all([apiPublico<ClientePublico>("/cliente"), apiPublico<{ items: PedidoPublicoFila[] }>("/pedidos")]);
  if (!c.ok) return <ErrorPublico mensaje={c.error.mensaje} />;
  if (!r.ok) return <ErrorPublico mensaje={r.error.mensaje} />;
  const lista = r.datos.items;
  const enCurso = lista.filter((p) => !TERMINADAS.has(p.etapa));
  const anteriores = lista.filter((p) => TERMINADAS.has(p.etapa));

  return (
    <main>
      <Encabezado negocio={c.datos.negocio.nombre} credito={c.datos.credito} />
      <h1 className="mb-3 text-2xl font-bold">{T.misPedidos}</h1>
      {lista.length === 0 && <p className="rounded-tarjeta border border-dashed border-borde p-6 text-center text-base text-suave">{T.sinPedidos}</p>}
      {enCurso.length > 0 && (
        <section aria-labelledby="en-curso" className="mb-5">
          <h2 id="en-curso" className="mb-2 text-xl font-bold">
            {T.enCurso}
          </h2>
          <ul className="flex flex-col gap-3">{enCurso.map((p) => <Fila key={p.id} p={p} />)}</ul>
        </section>
      )}
      {anteriores.length > 0 && (
        <section aria-labelledby="anteriores">
          <h2 id="anteriores" className="mb-2 text-xl font-bold">
            {T.anteriores}
          </h2>
          <ul className="flex flex-col gap-3">{anteriores.map((p) => <Fila key={p.id} p={p} />)}</ul>
        </section>
      )}
    </main>
  );
}

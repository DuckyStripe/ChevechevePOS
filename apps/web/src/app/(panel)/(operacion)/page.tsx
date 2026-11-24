import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { apiServidor, obtenerYo } from "@/lib/api-servidor";
import { TITULOS_GRUPO } from "@/lib/navegacion";
import type { Despacho } from "@/lib/tipos";

export const metadata = { title: "Hoy · ChevechevePOS" };

const PASOS = [
  { grupo: "paso1", texto: "Ver los pedidos que entraron y confirmarlos." },
  { grupo: "paso2", texto: "Ver qué falta comprar y registrar la compra." },
  { grupo: "paso3", texto: "Armar las rutas y la hoja de carga." },
  { grupo: "paso4", texto: "Entregar, cobrar y registrar abonos." },
  { grupo: "paso5", texto: "Liquidar al repartidor y cerrar caja." },
] as const;

function Contador({ n, texto, href, urgente = false }: { n: number; texto: string; href: string; urgente?: boolean }) {
  return (
    <Link href={href} className="flex min-h-tocable items-center justify-between gap-3 rounded-xl border border-borde px-3 py-2 hover:bg-marca-suave">
      <span className="text-base">{texto}</span>
      <span className="flex items-center gap-1">
        <span className={`rounded-full px-2.5 py-0.5 text-base font-bold ${n > 0 ? (urgente ? "bg-peligro-suave text-peligro" : "bg-marca-suave text-marca-fuerte") : "bg-borde/60 text-suave"}`}>{n}</span>
        <ChevronRight aria-hidden className="size-5 text-suave" />
      </span>
    </Link>
  );
}

/** N4: informa y lleva al paso; no tiene acciones propias. Los contadores salen de `GET /despacho` (unica fuente). */
export default async function Hoy() {
  const [r, d] = await Promise.all([obtenerYo(), apiServidor<Despacho>("/despacho")]);
  const nombre = r.ok ? r.datos.nombre.split(" ")[0] : "";
  const despacho = d.ok ? d.datos : null;
  const p = despacho?.pedidos;
  // Paradas que faltan en las rutas en camino (conteo, no dinero).
  const porEntregar = (despacho?.rutas?.lista ?? []).filter((x) => x.estado === "en_curso").reduce((n, x) => n + x.paradas - x.entregadas, 0);
  const verRutas = r.ok && r.datos.permisos.includes("rutas.ver"); // el repartidor (solo rutas.operar) va a /reparto

  return (
    <main>
      <Titulo titulo={nombre ? `Hola, ${nombre}` : "Hoy"} ayuda="Así va tu día en ChevechevePOS, paso por paso." />
      {despacho?.respaldo?.vencido && (
        <p role="alert" className="mb-4 rounded-tarjeta border border-peligro/40 bg-peligro-suave p-4 text-base font-bold text-peligro">
          Hace mucho que no se prueba un respaldo de tu información. Pídele a quien lo maneja que lo revise.
        </p>
      )}
      {!d.ok && d.error.status !== 403 && <p className="mb-4 rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">{d.error.mensaje}</p>}
      <ol className="flex flex-col gap-3">
        {PASOS.map((paso) => (
          <li key={paso.grupo}>
            <Tarjeta className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold">{TITULOS_GRUPO[paso.grupo]}</h2>
                  <p className="text-base text-suave">{paso.texto}</p>
                </div>
              </div>
              {paso.grupo === "paso2" && despacho?.surtido && (
                <div className="flex flex-col gap-2">
                  <Contador n={despacho.surtido.productos_por_comprar} texto="Productos por comprar" href={`/surtido?fecha=${despacho.fecha}`} />
                </div>
              )}
              {paso.grupo === "paso3" && despacho?.rutas && (
                <div className="flex flex-col gap-2">
                  <Contador n={despacho.rutas.por_cargar} texto="Rutas por cargar" href={verRutas ? `/rutas?fecha=${despacho.fecha}` : "/reparto"} />
                  <Contador n={despacho.rutas.en_curso} texto="Rutas en camino" href={verRutas ? `/rutas?fecha=${despacho.fecha}` : "/reparto"} />
                </div>
              )}
              {paso.grupo === "paso4" && (
                <div className="flex flex-col gap-2">
                  {despacho?.rutas && <Contador n={porEntregar} texto="Paradas por entregar" href={verRutas ? `/rutas?fecha=${despacho.fecha}` : "/reparto"} />}
                  {r.ok && r.datos.permisos.includes("cobranza.ver") && <Link href="/cobranza" className="inline-flex min-h-tocable items-center font-semibold text-marca-fuerte underline">Ver quién debe (cobranza)</Link>}
                </div>
              )}
              {paso.grupo === "paso5" && (
                <div className="flex flex-col gap-2">
                  {despacho?.rutas && <Contador n={despacho.rutas.por_liquidar ?? despacho.rutas.lista.filter((x) => x.estado === "terminada").length} texto="Rutas por liquidar" href="/cierre" />}
                  {despacho?.cierre && <Contador n={despacho.cierre.transferencias_por_verificar} texto="Transferencias por verificar" href="/cierre/transferencias" />}
                  {despacho?.cierre && <Contador n={despacho.cierre.turnos_mostrador_abiertos} texto="Turnos de mostrador sin cerrar" href="/cierre" />}
                </div>
              )}
              {paso.grupo === "paso1" && p && (
                <div className="flex flex-col gap-2">
                  <Contador n={p.por_confirmar} texto="Pedidos por confirmar" href="/pedidos?vista=por-confirmar" />
                  <Contador n={p.esperando_cliente} texto="Esperando respuesta del cliente" href="/pedidos?vista=esperando" />
                  <Contador n={p.faltantes_vencen_1h} texto="Faltantes que vencen en 1 hora" href="/pedidos?vista=esperando" urgente />
                  <Contador n={p.confirmados_sin_ruta} texto="Confirmados sin ruta" href="/pedidos?vista=confirmados" />
                  {despacho?.avisos_pendientes != null && <Contador n={despacho.avisos_pendientes} texto="Mensajes de WhatsApp por enviar" href="/?bandeja=1" />}
                </div>
              )}
            </Tarjeta>
          </li>
        ))}
      </ol>
    </main>
  );
}

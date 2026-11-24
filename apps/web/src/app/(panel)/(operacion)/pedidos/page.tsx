import Link from "next/link";
import { Plus } from "lucide-react";
import { DIAS_LARGOS } from "@/componentes/clientes/formato-clientes";
import { ESTADO_PEDIDO, ORIGEN_PEDIDO } from "@/componentes/pedidos/estados";
import { fecha, itemsDe } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { Boton, BotonEnlace } from "@/componentes/ui/boton";
import { Campo, Selector } from "@/componentes/ui/campo";
import { Insignia } from "@/componentes/ui/insignia";
import { Paginacion } from "@/componentes/ui/paginacion";
import { Titulo } from "@/componentes/ui/tarjeta";
import { Vacio } from "@/componentes/ui/vacio";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import { dinero } from "@/lib/dinero";
import type { Lista, PedidoFila, Zona } from "@/lib/tipos";

export const metadata = { title: "Pedidos · ChevechevePOS" };

const VISTAS = [
  { clave: "por-confirmar", titulo: "Por confirmar", estado: "recibido", vacio: "No hay pedidos por confirmar. Cuando entre uno por su link o por llamada, sale aquí." },
  { clave: "esperando", titulo: "Esperando al cliente", estado: "esperando_cliente", vacio: "No hay pedidos esperando respuesta del cliente." },
  { clave: "confirmados", titulo: "Confirmados", estado: "confirmado", vacio: "No hay pedidos confirmados con ese filtro." },
] as const;

type SP = Promise<{ vista?: string; zona_id?: string; fecha_entrega?: string; origen?: string; pagina?: string }>;

export default async function Pedidos({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "pedidos.ver")) return <SinPermiso />;

  const vista = VISTAS.find((v) => v.clave === sp.vista) ?? VISTAS[0];
  const filtros = { zona_id: sp.zona_id, fecha_entrega: sp.fecha_entrega, origen: sp.origen };
  const [lista, zonas] = await Promise.all([
    apiServidor<Lista<PedidoFila>>("/pedidos", { estado: vista.estado, ...filtros, pagina: sp.pagina, por_pagina: "50" }),
    apiServidor<Lista<Zona> | Zona[]>("/zonas", { por_pagina: "200" }),
  ]);
  if (!lista.ok) return <AvisoError mensaje={lista.error.mensaje} reintentar={lista.error.status !== 403} />;
  const puedeGestionar = tiene(yo.datos, "pedidos.gestionar");
  const filtrado = !!(sp.zona_id || sp.fecha_entrega || sp.origen);

  // Confirmados: agrupados por fecha de entrega.
  const grupos = new Map<string, PedidoFila[]>();
  for (const p of lista.datos.items) {
    const k = vista.clave === "confirmados" ? (p.fecha_entrega ?? "") : "";
    grupos.set(k, [...(grupos.get(k) ?? []), p]);
  }

  return (
    <main>
      <Titulo titulo="Pedidos" ayuda="Lo que pidieron tus clientes y en qué paso va.">
        {tiene(yo.datos, "pedidos.capturar") && (
          <BotonEnlace href="/pedidos/nuevo">
            <Plus aria-hidden className="size-5" /> Capturar pedido
          </BotonEnlace>
        )}
      </Titulo>

      <nav aria-label="Etapas" className="mb-4 flex flex-wrap gap-2">
        {VISTAS.map((v) => (
          <Link
            key={v.clave}
            href={`/pedidos?vista=${v.clave}`}
            aria-current={v.clave === vista.clave ? "page" : undefined}
            className={`flex min-h-tocable items-center rounded-full border px-4 text-base font-medium ${v.clave === vista.clave ? "border-marca bg-marca text-white" : "border-borde bg-superficie"}`}
          >
            {v.titulo}
          </Link>
        ))}
      </nav>

      <form method="get" className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input type="hidden" name="vista" value={vista.clave} />
        <Selector etiqueta="Zona" name="zona_id" defaultValue={sp.zona_id ?? ""}>
          <option value="">Todas</option>
          {itemsDe(zonas.ok ? zonas.datos : []).map((z) => (
            <option key={z.id} value={String(z.id)}>
              {z.nombre}
            </option>
          ))}
        </Selector>
        <Campo etiqueta="Entrega" name="fecha_entrega" type="date" defaultValue={sp.fecha_entrega} />
        <Selector etiqueta="Cómo entró" name="origen" defaultValue={sp.origen ?? ""}>
          <option value="">Todos</option>
          <option value="enlace">Por su link</option>
          <option value="captura">Por llamada</option>
          <option value="sugerido">Lo de siempre</option>
        </Selector>
        <Boton type="submit" className="self-end">
          Filtrar
        </Boton>
      </form>

      {lista.datos.items.length === 0 ? (
        <Vacio texto={filtrado ? "No hay pedidos con ese filtro." : vista.vacio}>
          {filtrado ? (
            <BotonEnlace variante="secundario" href={`/pedidos?vista=${vista.clave}`}>
              Quitar filtros
            </BotonEnlace>
          ) : (
            tiene(yo.datos, "pedidos.capturar") && <BotonEnlace href="/pedidos/nuevo">Capturar un pedido por llamada</BotonEnlace>
          )}
        </Vacio>
      ) : (
        [...grupos.entries()].map(([k, filas]) => (
          <section key={k || "todos"} className="mb-5">
            {k !== "" && <h2 className="mb-2 text-lg font-bold">{DIAS_LARGOS[new Date(`${k}T12:00:00Z`).getUTCDay() || 7]} {fecha(k)}</h2>}
            <ul className="flex flex-col gap-3">
              {filas.map((p) => {
                const estado = ESTADO_PEDIDO[p.estado] ?? { texto: p.estado, tono: "neutro" as const };
                return (
                  <li key={p.id} className="rounded-tarjeta border border-borde bg-superficie p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/pedidos/${p.id}`} className="text-lg font-bold [overflow-wrap:anywhere] hover:underline">
                          {p.cliente.nombre}
                        </Link>
                        <p className="text-base text-suave">
                          {p.folio} · {p.num_lineas} {p.num_lineas === 1 ? "producto" : "productos"} · {dinero(p.total)}
                        </p>
                        <p className="text-base text-suave">
                          {p.zona?.nombre ?? "Sin zona"} · {ORIGEN_PEDIDO[p.origen]}
                          {p.fecha_entrega ? ` · Entrega ${fecha(p.fecha_entrega)}` : p.fecha_solicitada ? ` · Pidió para ${fecha(p.fecha_solicitada)}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Insignia tono={estado.tono}>{estado.texto}</Insignia>
                        {(p.faltantes_pendientes ?? 0) > 0 && <Insignia tono="peligro">{p.faltantes_pendientes} sin responder</Insignia>}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {puedeGestionar && p.estado === "recibido" && <BotonEnlace href={`/pedidos/${p.id}?accion=confirmar`}>Confirmar</BotonEnlace>}
                      {puedeGestionar && (p.estado === "recibido" || p.estado === "confirmado") && (
                        <BotonEnlace variante="secundario" href={`/pedidos/${p.id}?accion=faltante`}>
                          Faltante
                        </BotonEnlace>
                      )}
                      {p.estado === "esperando_cliente" && <BotonEnlace href={`/pedidos/${p.id}`}>Ver respuesta</BotonEnlace>}
                      <BotonEnlace variante="secundario" href={`/pedidos?vista=${vista.clave}&bandeja=1&cliente=${p.cliente.id}`}>
                        WhatsApp
                      </BotonEnlace>
                    </div>
                    <details className="mt-1">
                      <summary className="flex min-h-tocable cursor-pointer items-center text-base font-medium text-suave">Más</summary>
                      <div className="flex flex-wrap gap-2 pb-1">
                        <BotonEnlace variante="fantasma" href={`/pedidos/${p.id}`}>
                          Ver pedido
                        </BotonEnlace>
                        {tiene(yo.datos, "clientes.ver") && (
                          <BotonEnlace variante="fantasma" href={`/clientes/${p.cliente.id}`}>
                            Ver cliente
                          </BotonEnlace>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      <Paginacion ruta="/pedidos" query={{ vista: vista.clave, ...filtros }} pagina={lista.datos.pagina} porPagina={lista.datos.por_pagina} total={lista.datos.total} />
    </main>
  );
}

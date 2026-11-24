import { Abono, type DatosAbono } from "@/componentes/cobro/abono";
import { Entrega, type DatosEntrega } from "@/componentes/cobro/entrega";
import { rutaVolver } from "@/componentes/cobro/volver";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { BotonEnlace } from "@/componentes/ui/boton";
import { Titulo } from "@/componentes/ui/tarjeta";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import type { ContextoAbono, ContextoEntrega } from "@/lib/tipos";

export const metadata = { title: "Cobrar · ChevechevePOS" };

type SP = Promise<{ pedido?: string; cliente?: string; parada?: string; volver?: string }>;
const ID = /^\d{1,18}$/;

/**
 * `/cobrar`: único lugar donde entra dinero de un cliente (N1). `?pedido=` entrega y cobra; `?cliente=[&parada=]` abona.
 * Todo sale de `GET /cobrar/contexto` (una sola lectura que sirve igual al repartidor, que no lee `/pedidos` ni `/clientes`).
 */
export default async function Cobrar({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  const y = yo.datos;
  const modoPedido = !!sp.pedido;
  const volver = rutaVolver(sp.volver, modoPedido ? "/pedidos" : "/cobranza");
  const puede = modoPedido ? tiene(y, "rutas.operar") || tiene(y, "ventas.crear") : tiene(y, "cobranza.abonar");
  if (!puede) return <SinPermiso />;
  const salida = (
    <BotonEnlace variante="secundario" href={volver}>
      Volver
    </BotonEnlace>
  );

  if (modoPedido) {
    if (!ID.test(sp.pedido!)) return <AvisoError reintentar={false} mensaje="No encontramos ese pedido." />;
    // Una sola lectura (SQL decide quién puede cobrarlo: el repartidor de la ruta, o quien vende en el mostrador si el pedido se recoge).
    const r = await apiServidor<ContextoEntrega>("/cobrar/contexto", { pedido: sp.pedido });
    if (!r.ok) return <AvisoError mensaje={r.error.status === 404 ? "No encontramos ese pedido." : r.error.status === 403 ? "Este pedido es de la ruta de otra persona." : r.error.mensaje} reintentar={r.error.status !== 404 && r.error.status !== 403} />;
    const ctx = r.datos;
    const datos: DatosEntrega = {
      pedido: { id: ctx.pedido.id, folio: ctx.pedido.folio, total: ctx.pedido.total },
      cliente: { id: ctx.cliente.id, nombre: ctx.cliente.nombre, saldo: ctx.cliente.saldo, vencido: ctx.cliente.vencido, disponible: ctx.cliente.disponible, semaforo: ctx.cliente.semaforo },
      lineas: ctx.lineas.map((l) => ({ id: l.id, texto: `${l.producto} · ${l.presentacion}`, cantidad: l.cantidad, precio: l.precio_unitario })),
    };
    if (ctx.pedido.estado === "entregado") return <main><Titulo titulo="Cobrar" /><AvisoError reintentar={false} mensaje="Este pedido ya se entregó." />{salida}</main>;
    if (!ctx.pedido.entregable) return <main><Titulo titulo="Cobrar" /><AvisoError reintentar={false} mensaje="Este pedido todavía no está listo para entregarse." />{salida}</main>;
    return (
      <main>
        <Titulo titulo="Entregar y cobrar" />
        <Entrega datos={datos} volver={volver} hayTurno={ctx.turno != null} puedeFiado={ctx.metodos.includes("credito")} puedeAvisar={tiene(y, "pedidos.ver")} />
      </main>
    );
  }

  if (!sp.cliente || !ID.test(sp.cliente)) return <main><Titulo titulo="Cobrar" /><AvisoError reintentar={false} mensaje="Elige a quién se le cobra desde Cobranza o desde su ficha." />{salida}</main>;
  const c = await apiServidor<ContextoAbono>("/cobrar/contexto", { cliente: sp.cliente, ...(sp.parada && ID.test(sp.parada) ? { parada: sp.parada } : {}) });
  if (!c.ok) return <AvisoError mensaje={c.error.status === 404 ? "No encontramos a ese cliente en tu cuenta o en tu ruta." : c.error.mensaje} reintentar={c.error.status !== 404 && c.error.status !== 403} />;
  const ctx = c.datos;
  const cliente: DatosAbono["cliente"] = { id: ctx.cliente.id, nombre: ctx.cliente.nombre, saldo: ctx.cliente.saldo, vencido: ctx.cliente.vencido, semaforo: ctx.cliente.semaforo };
  const cuentas = ctx.cuentas.map((x) => ({ id: x.id, texto: x.venta_folio ? `Venta ${x.venta_folio}` : (x.concepto ?? "Saldo anterior"), vence_el: x.vence_el, saldo: x.saldo }));
  return (
    <main>
      <Titulo titulo="Cobrar un abono" />
      <Abono datos={{ cliente, paradaId: ctx.parada?.id ?? null, cuentas }} volver={volver} hayTurno={ctx.turno != null} />
    </main>
  );
}

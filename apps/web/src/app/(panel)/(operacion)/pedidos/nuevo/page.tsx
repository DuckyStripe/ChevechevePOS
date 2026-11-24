import { NuevoPedido } from "@/componentes/pedidos/nuevo-pedido";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { BotonEnlace } from "@/componentes/ui/boton";
import { Titulo } from "@/componentes/ui/tarjeta";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import type { ClienteDetalle } from "@/lib/tipos";

export const metadata = { title: "Capturar pedido · ChevechevePOS" };

export default async function PaginaNuevoPedido({ searchParams }: { searchParams: Promise<{ cliente_id?: string }> }) {
  const { cliente_id } = await searchParams;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "pedidos.capturar")) return <SinPermiso />;

  let inicial: ClienteDetalle | null = null;
  if (cliente_id && /^\d{1,18}$/.test(cliente_id)) {
    const c = await apiServidor<ClienteDetalle>(`/clientes/${cliente_id}`);
    if (c.ok) inicial = c.datos;
  }
  return (
    <main>
      <Titulo titulo="Capturar pedido" ayuda="Para cuando el cliente llama o manda mensaje.">
        <BotonEnlace variante="secundario" href="/pedidos">
          Volver a pedidos
        </BotonEnlace>
      </Titulo>
      {/* key: un solo borrador por usuario y cliente; si cambia, se reinicia el editor */}
      <NuevoPedido key={`${yo.datos.id}-${inicial?.id ?? ""}`} usuarioId={String(yo.datos.id)} inicial={inicial} />
    </main>
  );
}

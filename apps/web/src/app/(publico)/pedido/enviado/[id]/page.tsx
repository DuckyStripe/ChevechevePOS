import { Enviado } from "@/componentes/publico/enviado";
import { ErrorPublico } from "@/componentes/publico/encabezado";
import { apiPublico } from "@/lib/api-publico";
import type { Seguimiento } from "@/lib/tipos";

export const metadata = { title: "Pedido enviado" };

export default async function PaginaEnviado({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return <ErrorPublico mensaje="No encontramos ese pedido." />;
  const r = await apiPublico<Seguimiento>(`/pedidos/${id}`);
  if (!r.ok) return <ErrorPublico mensaje={r.error.mensaje} />;
  return (
    <main className="pt-6">
      <Enviado id={id} folio={r.datos.folio} total={r.datos.total ?? ""} etiqueta={r.datos.etiqueta} />
    </main>
  );
}

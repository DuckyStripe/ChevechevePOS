import { CarritoPantalla } from "@/componentes/publico/carrito-pantalla";
import { Encabezado, ErrorPublico } from "@/componentes/publico/encabezado";
import { apiPublico } from "@/lib/api-publico";
import { T } from "@/lib/textos-publico";
import type { ClientePublico } from "@/lib/tipos";

export const metadata = { title: "Tu pedido" };

export default async function Carrito() {
  const r = await apiPublico<ClientePublico>("/cliente");
  if (!r.ok) return <ErrorPublico mensaje={r.error.mensaje} />;
  return (
    <main>
      <Encabezado negocio={r.datos.negocio.nombre} />
      <h1 className="mb-3 text-2xl font-bold">{T.carritoTitulo}</h1>
      <CarritoPantalla cliente={r.datos} />
    </main>
  );
}

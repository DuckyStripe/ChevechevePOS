import { Catalogo } from "@/componentes/publico/catalogo";
import { Encabezado, ErrorPublico } from "@/componentes/publico/encabezado";
import { apiPublico } from "@/lib/api-publico";
import type { ClientePublico } from "@/lib/tipos";

export const metadata = { title: "Mi pedido" };

/** C1: abre directo en su catalogo. El servidor solo trae al cliente; el catalogo lo baja la isla (con ETag, C9). */
export default async function Pedido() {
  const r = await apiPublico<ClientePublico>("/cliente");
  if (!r.ok) return <ErrorPublico mensaje={r.error.mensaje} />;
  const c = r.datos;
  return (
    <main>
      <Encabezado negocio={c.negocio.nombre} credito={c.credito} lealtad={c.lealtad} saludo={c.textos.bienvenida} actual="catalogo" />
      <h1 className="sr-only">Mi pedido</h1>
      <Catalogo cliente={c} />
    </main>
  );
}

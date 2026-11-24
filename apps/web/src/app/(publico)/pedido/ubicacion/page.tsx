import { Encabezado, ErrorPublico } from "@/componentes/publico/encabezado";
import { Ubicacion } from "@/componentes/publico/ubicacion";
import { apiPublico } from "@/lib/api-publico";
import { T } from "@/lib/textos-publico";
import type { ClientePublico } from "@/lib/tipos";

export const metadata = { title: "Tu ubicación" };

export default async function PaginaUbicacion() {
  const r = await apiPublico<ClientePublico>("/cliente");
  if (!r.ok) return <ErrorPublico mensaje={r.error.mensaje} />;
  return (
    <main>
      <Encabezado negocio={r.datos.negocio.nombre} />
      <h1 className="mb-3 text-2xl font-bold">{T.ubicacionTitulo}</h1>
      <p className="mb-5 text-lg">{r.datos.textos.aviso_ubicacion}</p>
      <Ubicacion />
    </main>
  );
}

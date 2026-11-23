import { Titulo } from "@/componentes/ui/tarjeta";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { obtenerYo } from "@/lib/api-servidor";
import { TITULOS_GRUPO } from "@/lib/navegacion";

export const metadata = { title: "Hoy · ChevechevePOS" };

const PASOS = [
  { grupo: "paso1", texto: "Ver los pedidos que entraron y confirmarlos." },
  { grupo: "paso2", texto: "Ver qué falta comprar y registrar la compra." },
  { grupo: "paso3", texto: "Armar las rutas y la hoja de carga." },
  { grupo: "paso4", texto: "Entregar, cobrar y registrar abonos." },
  { grupo: "paso5", texto: "Liquidar al repartidor y cerrar caja." },
] as const;

/** N4: solo informa. Sin contadores ni enlaces hasta que exista la pantalla de cada paso (llegan con `GET /despacho`). */
export default async function Hoy() {
  const r = await obtenerYo();
  const nombre = r.ok ? r.datos.nombre.split(" ")[0] : "";
  return (
    <main>
      <Titulo titulo={nombre ? `Hola, ${nombre}` : "Hoy"} ayuda="Así será tu día en ChevechevePOS, paso por paso." />
      <ol className="flex flex-col gap-3">
        {PASOS.map((p) => (
          <li key={p.grupo}>
            <Tarjeta className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold">{TITULOS_GRUPO[p.grupo]}</h2>
                <p className="text-base text-suave">{p.texto}</p>
              </div>
              <span className="shrink-0 rounded-full bg-borde/60 px-2.5 py-0.5 text-sm text-suave">Próximamente</span>
            </Tarjeta>
          </li>
        ))}
      </ol>
    </main>
  );
}

import { Pos } from "@/componentes/pos/pos";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { BotonEnlace } from "@/componentes/ui/boton";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { itemsDe } from "@/componentes/productos/formato";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import type { ArticuloVenta, Categoria, Lista, TurnoCaja } from "@/lib/tipos";

export const metadata = { title: "Vender · ChevechevePOS" };

/**
 * `/pos`: vender en mostrador (F8). Vender solo vive aquí; cancelar y devolver en `/ventas/[id]`, el corte en `/caja`
 * y entregar un pedido que recoge en `/cobrar?pedido=` (N1). Sin turno de mostrador no se vende (se abre en `/caja`).
 */
export default async function PaginaPos() {
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  const y = yo.datos;
  if (!tiene(y, "ventas.crear")) return <SinPermiso />;

  const t = await apiServidor<TurnoCaja | null>("/turnos/actual");
  if (!t.ok) return <AvisoError mensaje={t.error.mensaje} />;
  const turno = t.datos;
  if (!turno || turno.tipo !== "mostrador" || !turno.caja_id) {
    return (
      <main>
        <Titulo titulo="Vender" />
        <Tarjeta className="flex flex-col gap-3">
          <p className="text-xl font-bold">Abre tu turno para vender.</p>
          <p className="text-base text-suave">
            {turno?.tipo === "ruta" ? "Tu turno abierto es el de la ruta. Para vender en el mostrador necesitas un turno de mostrador." : "Sin turno abierto no se puede guardar el dinero que recibes."}
          </p>
          <BotonEnlace className="!min-h-14 !text-lg" href="/caja?volver=%2Fpos">Abrir mi turno</BotonEnlace>
        </Tarjeta>
      </main>
    );
  }

  const [cat, cats] = await Promise.all([
    apiServidor<ArticuloVenta[] | Lista<ArticuloVenta>>("/catalogo-venta"),
    tiene(y, "catalogo.ver") ? apiServidor<Categoria[] | Lista<Categoria>>("/categorias") : null,
  ]);
  if (!cat.ok) return <AvisoError mensaje={cat.error.mensaje} />;
  const categorias = cats?.ok ? itemsDe(cats.datos).filter((c) => c.activa) : [];

  return (
    <main>
      <Titulo titulo="Vender" ayuda="Escanea o busca, cobra y entrega el ticket." />
      <Pos
        key={`${y.id}-${turno.caja_id}`}
        usuarioId={String(y.id)}
        cajaId={String(turno.caja_id)}
        catalogoInicial={itemsDe(cat.datos)}
        categorias={categorias}
        puedeFiado={tiene(y, "ventas.credito")}
        puedeClientes={tiene(y, "clientes.ver")}
      />
    </main>
  );
}

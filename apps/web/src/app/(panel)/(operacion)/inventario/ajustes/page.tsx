import { AjusteForm } from "@/componentes/inventario/ajuste-form";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { BotonEnlace } from "@/componentes/ui/boton";
import { Titulo } from "@/componentes/ui/tarjeta";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import type { Producto } from "@/lib/tipos";

export const metadata = { title: "Ajustar inventario · ChevechevePOS" };

type SP = Promise<{ modo?: string; producto_id?: string; volver?: string }>;

export default async function Ajustes({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "inventario.ajustar")) return <SinPermiso />;
  const puedeCorregirCosto = tiene(yo.datos, "precios.editar");
  // Solo rutas internas: `?volver=` nunca saca al usuario del sitio.
  const volver = sp.volver && /^\/(?!\/)[\w\-/?=&%.]*$/.test(sp.volver) ? sp.volver : undefined;
  const p = sp.producto_id && /^\d+$/.test(sp.producto_id) ? await apiServidor<Producto>(`/productos/${sp.producto_id}`) : null;

  return (
    <main>
      <Titulo titulo="Ajustar inventario" ayuda="Entradas, salidas, merma, conteo, inventario inicial y corrección de costo.">
        <BotonEnlace variante="secundario" href={volver ?? "/inventario"}>
          {volver ? "Volver" : "Volver a inventario"}
        </BotonEnlace>
      </Titulo>
      <AjusteForm
        veCostos={tiene(yo.datos, "costos.ver")}
        puedeCorregirCosto={puedeCorregirCosto}
        productoInicial={p && p.ok ? p.datos : null}
        modoInicial={sp.modo === "costo" ? "costo" : undefined}
        volver={volver}
      />
    </main>
  );
}

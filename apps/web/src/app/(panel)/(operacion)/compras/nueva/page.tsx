import { itemsDe } from "@/componentes/productos/formato";
import { NuevaCompra, type PrecargaSurtido } from "@/componentes/compras/nueva-compra";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { BotonEnlace } from "@/componentes/ui/boton";
import { Titulo } from "@/componentes/ui/tarjeta";
import { Vacio } from "@/componentes/ui/vacio";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import type { Lista, Proveedor, Surtido } from "@/lib/tipos";

export const metadata = { title: "Registrar compra · ChevechevePOS" };

type SP = Promise<{ surtido?: string; proveedor_id?: string }>;

export default async function PaginaNuevaCompra({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "compras.registrar")) return <SinPermiso />;
  const r = await apiServidor<Lista<Proveedor> | Proveedor[]>("/proveedores", { activo: "true", por_pagina: "200" });
  if (!r.ok) return <AvisoError mensaje={r.error.mensaje} />;
  const proveedores = itemsDe(r.datos);

  // F5: desde la lista de surtido llegan la fecha y el proveedor; las lineas son la cantidad sugerida (calculada en la API). El usuario las corrige.
  let precarga: PrecargaSurtido | undefined;
  if (sp.surtido && sp.proveedor_id && /^\d+$/.test(sp.proveedor_id) && tiene(yo.datos, "surtido.ver")) {
    const s = await apiServidor<Surtido>("/surtido", { fecha: sp.surtido });
    const grupo = s.ok ? s.datos.proveedores.find((g) => String(g.proveedor_id) === sp.proveedor_id) : undefined;
    if (s.ok && grupo) {
      precarga = {
        fecha_surtido: s.datos.fecha,
        proveedor_id: sp.proveedor_id,
        lineas: grupo.lineas
          .filter((l) => l.presentacion_id != null && (l.cantidad_sugerida ?? 0) > 0)
          .map((l) => ({
            presentacion_id: String(l.presentacion_id),
            producto: l.producto,
            presentacion: l.presentacion ?? "",
            factor: l.factor ?? 1,
            cantidad: String(l.cantidad_sugerida),
            costo: l.costo_promocion ?? l.ultimo_costo ?? "",
          })),
      };
    }
  }

  return (
    <main>
      <Titulo titulo="Registrar compra" ayuda="Anota lo que te surtió el proveedor. Al guardar verás cuánto ganas con cada producto.">
        <BotonEnlace variante="secundario" href={sp.surtido ? `/surtido?fecha=${sp.surtido}` : "/compras"}>
          {sp.surtido ? "Volver a la lista de surtido" : "Volver a compras"}
        </BotonEnlace>
      </Titulo>
      {proveedores.length === 0 ? (
        <Vacio texto="Primero da de alta a tu proveedor.">
          {tiene(yo.datos, "proveedores.gestionar") && <BotonEnlace href="/proveedores">Ir a proveedores</BotonEnlace>}
        </Vacio>
      ) : (
        // key: un solo borrador por usuario; si cambia la sesion se reinicia el editor
        <NuevaCompra key={`${yo.datos.id}-${sp.surtido ?? ""}-${sp.proveedor_id ?? ""}`} usuarioId={String(yo.datos.id)} proveedores={proveedores} precarga={precarga} />
      )}
    </main>
  );
}

import { itemsDe } from "@/componentes/productos/formato";
import { NuevaCompra } from "@/componentes/compras/nueva-compra";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { BotonEnlace } from "@/componentes/ui/boton";
import { Titulo } from "@/componentes/ui/tarjeta";
import { Vacio } from "@/componentes/ui/vacio";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import type { Lista, Proveedor } from "@/lib/tipos";

export const metadata = { title: "Registrar compra · ChevechevePOS" };

export default async function PaginaNuevaCompra() {
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "compras.registrar")) return <SinPermiso />;
  const r = await apiServidor<Lista<Proveedor> | Proveedor[]>("/proveedores", { activo: "true", por_pagina: "200" });
  if (!r.ok) return <AvisoError mensaje={r.error.mensaje} />;
  const proveedores = itemsDe(r.datos);

  return (
    <main>
      <Titulo titulo="Registrar compra" ayuda="Anota lo que te surtió el proveedor. Al guardar verás cuánto ganas con cada producto.">
        <BotonEnlace variante="secundario" href="/compras">
          Volver a compras
        </BotonEnlace>
      </Titulo>
      {proveedores.length === 0 ? (
        <Vacio texto="Primero da de alta a tu proveedor.">
          {tiene(yo.datos, "proveedores.gestionar") && <BotonEnlace href="/proveedores">Ir a proveedores</BotonEnlace>}
        </Vacio>
      ) : (
        // key: un solo borrador por usuario; si cambia la sesion se reinicia el editor
        <NuevaCompra key={String(yo.datos.id)} usuarioId={String(yo.datos.id)} proveedores={proveedores} />
      )}
    </main>
  );
}

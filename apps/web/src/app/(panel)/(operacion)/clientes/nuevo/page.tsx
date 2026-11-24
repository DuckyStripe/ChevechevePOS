import { FormCliente } from "@/componentes/clientes/form-cliente";
import { itemsDe } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { BotonEnlace } from "@/componentes/ui/boton";
import { Titulo } from "@/componentes/ui/tarjeta";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import type { Lista, ListaPrecio, Zona } from "@/lib/tipos";

export const metadata = { title: "Nuevo cliente · ChevechevePOS" };

export default async function NuevoCliente() {
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "clientes.editar")) return <SinPermiso />;
  const puedeCredito = tiene(yo.datos, "clientes.credito");
  const [zonas, listas] = await Promise.all([
    apiServidor<Lista<Zona> | Zona[]>("/zonas", { por_pagina: "200" }),
    puedeCredito ? apiServidor<Lista<ListaPrecio> | ListaPrecio[]>("/listas-precio", { por_pagina: "200" }) : null,
  ]);
  return (
    <main>
      <Titulo titulo="Nuevo cliente" ayuda="Después podrás generarle su link para que pida solo.">
        <BotonEnlace variante="secundario" href="/clientes">
          Volver a clientes
        </BotonEnlace>
      </Titulo>
      <FormCliente zonas={itemsDe(zonas.ok ? zonas.datos : [])} listas={itemsDe(listas?.ok ? listas.datos : [])} puedeCredito={puedeCredito} />
    </main>
  );
}

import Link from "next/link";
import { EnlaceCliente } from "@/componentes/clientes/enlace-cliente";
import { CreditoCliente } from "@/componentes/cobranza/credito-cliente";
import { HojaEstadoCuenta } from "@/componentes/cobranza/estado-cuenta";
import { BotonImprimir } from "@/componentes/cobranza/imprimir";
import { FormCliente } from "@/componentes/clientes/form-cliente";
import { UbicacionCliente } from "@/componentes/clientes/ubicacion-cliente";
import { itemsDe } from "@/componentes/productos/formato";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { BotonEnlace } from "@/componentes/ui/boton";
import { Tarjeta, Titulo } from "@/componentes/ui/tarjeta";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import type { ArticuloVenta, ClienteDetalle, Dispositivo, EstadoCuenta, Lista, ListaPrecio, Zona } from "@/lib/tipos";

export const metadata = { title: "Cliente · ChevechevePOS" };

export default async function Cliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "clientes.ver")) return <SinPermiso />;
  if (!/^\d{1,18}$/.test(id)) return <AvisoError reintentar={false} mensaje="No encontramos a ese cliente." />;

  const puedeEnlace = tiene(yo.datos, "clientes.enlace");
  const puedeCredito = tiene(yo.datos, "clientes.credito");
  const puedeNombres = tiene(yo.datos, "pedidos.capturar") || tiene(yo.datos, "ventas.crear");
  const verCuenta = tiene(yo.datos, "cobranza.ver");
  const [c, zonas, listas, disp, catalogo, cuenta] = await Promise.all([
    apiServidor<ClienteDetalle>(`/clientes/${id}`),
    apiServidor<Lista<Zona> | Zona[]>("/zonas", { por_pagina: "200" }),
    puedeCredito ? apiServidor<Lista<ListaPrecio> | ListaPrecio[]>("/listas-precio", { por_pagina: "200" }) : null,
    puedeEnlace ? apiServidor<Dispositivo[]>(`/clientes/${id}/dispositivos`) : null,
    // Nombres de los productos (frecuentes y ultimo pedido solo traen ids de presentacion).
    puedeNombres ? apiServidor<ArticuloVenta[] | Lista<ArticuloVenta>>("/catalogo-venta") : null,
    verCuenta ? apiServidor<EstadoCuenta>(`/clientes/${id}/estado-cuenta`) : null,
  ]);
  if (!c.ok) return <AvisoError mensaje={c.error.status === 404 ? "No encontramos a ese cliente." : c.error.mensaje} reintentar={c.error.status !== 404 && c.error.status !== 403} />;
  const cliente = c.datos;
  const nombres = new Map(itemsDe(catalogo?.ok ? catalogo.datos : []).map((a) => [String(a.presentacion_id), `${a.producto} · ${a.presentacion}`]));
  const nombreDe = (pid: number | string) => nombres.get(String(pid)) ?? "Producto que ya no está a la venta";
  const puedeEditar = tiene(yo.datos, "clientes.editar");

  return (
    <main className="flex flex-col gap-4">
      <Titulo titulo={cliente.nombre} ayuda={cliente.activo ? undefined : "Este cliente está desactivado."}>
        <div className="flex flex-wrap gap-2">
          {tiene(yo.datos, "pedidos.capturar") && cliente.activo && <BotonEnlace href={`/pedidos/nuevo?cliente_id=${cliente.id}`}>Capturar un pedido</BotonEnlace>}
          <BotonEnlace variante="secundario" href="/clientes">
            Volver a clientes
          </BotonEnlace>
        </div>
      </Titulo>

      <EnlaceCliente cliente={cliente} dispositivos={disp?.ok ? itemsDe(disp.datos) : []} puedeEnlace={puedeEnlace} />
      <UbicacionCliente cliente={cliente} puedeEditar={puedeEditar} />
      {(verCuenta || puedeCredito || cliente.saldo != null) && (
        <CreditoCliente cliente={cliente} puedeCredito={puedeCredito} puedeAbonar={tiene(yo.datos, "cobranza.abonar")} puedeAvisar={tiene(yo.datos, "avisos.enviar") && tiene(yo.datos, "pedidos.ver")} />
      )}
      {cuenta && (
        <Tarjeta aria-labelledby="cuenta">
          <details>
            <summary id="cuenta" className="flex min-h-tocable cursor-pointer items-center text-lg font-bold">Estado de cuenta (últimos 90 días)</summary>
            {cuenta.ok ? (
              <div className="mt-2 flex flex-col gap-3">
                <HojaEstadoCuenta e={cuenta.datos} />
                <div><BotonImprimir /></div>
              </div>
            ) : (
              <p className="mt-2 text-base text-suave">{cuenta.error.mensaje}</p>
            )}
          </details>
        </Tarjeta>
      )}

      <Tarjeta aria-labelledby="frecuentes">
        <h2 id="frecuentes" className="mb-2 text-lg font-bold">
          Lo que más pide
        </h2>
        {cliente.frecuentes.length === 0 ? (
          <p className="text-base text-suave">Todavía no hay pedidos para saber qué pide más.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-base">
            {cliente.frecuentes.slice(0, 12).map((f) => (
              <li key={f.presentacion_id} className="flex justify-between gap-3">
                <span className="[overflow-wrap:anywhere]">{nombreDe(f.presentacion_id)}</span>
                <span className="shrink-0 text-suave">{f.ultima_cantidad} la última vez</span>
              </li>
            ))}
          </ul>
        )}
        {cliente.ultimo_pedido && (
          <div className="mt-4 border-t border-borde pt-3">
            <h3 className="mb-1 text-base font-semibold">
              Su último pedido ({cliente.ultimo_pedido.folio})
            </h3>
            <ul className="flex flex-col gap-1 text-base">
              {cliente.ultimo_pedido.lineas.map((l) => (
                <li key={l.presentacion_id} className="flex justify-between gap-3">
                  <span className="[overflow-wrap:anywhere]">{nombreDe(l.presentacion_id)}</span>
                  <span className="shrink-0">× {l.cantidad}</span>
                </li>
              ))}
            </ul>
            <Link href={`/pedidos/${cliente.ultimo_pedido.id}`} className="mt-2 inline-flex min-h-tocable items-center font-semibold text-marca-fuerte underline">
              Ver ese pedido
            </Link>
          </div>
        )}
      </Tarjeta>

      {puedeEditar ? (
        <FormCliente cliente={cliente} zonas={itemsDe(zonas.ok ? zonas.datos : [])} listas={itemsDe(listas?.ok ? listas.datos : [])} puedeCredito={puedeCredito} />
      ) : (
        <p className="text-base text-suave">Tu usuario puede ver este cliente pero no cambiar sus datos.</p>
      )}
    </main>
  );
}

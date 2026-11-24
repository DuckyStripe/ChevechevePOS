import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Zonas } from "@/componentes/clientes/zonas";
import { SeccionCalendario } from "@/componentes/surtido/seccion-calendario";
import { SeccionVehiculos } from "@/componentes/vehiculos/seccion-vehiculos";
import { itemsDe } from "@/componentes/productos/formato";
import { FormConfiguracion, type Config } from "@/componentes/configuracion/form-configuracion";
import { AvisoError, SinPermiso } from "@/componentes/ui/aviso-error";
import { Titulo } from "@/componentes/ui/tarjeta";
import { apiServidor, obtenerYo, tiene } from "@/lib/api-servidor";
import type { Lista, Zona } from "@/lib/tipos";

export const metadata = { title: "Configuración · ChevechevePOS" };

export default async function Configuracion() {
  const yo = await obtenerYo();
  if (!yo.ok) return <AvisoError mensaje={yo.error.mensaje} />;
  if (!tiene(yo.datos, "configuracion.editar")) return <SinPermiso />;

  const [cfg, zonas] = await Promise.all([apiServidor<Config>("/configuracion"), tiene(yo.datos, "clientes.ver") ? apiServidor<Lista<Zona> | Zona[]>("/zonas", { por_pagina: "200" }) : null]);
  if (!cfg.ok) return <AvisoError mensaje={cfg.error.mensaje} reintentar={cfg.error.status !== 403} />;

  return (
    <main>
      <Titulo titulo="Configuración" ayuda="Los datos de tu negocio y las reglas de los pedidos." />
      <Link href="/configuracion/plantillas" className="mb-4 flex min-h-tocable items-center justify-between gap-3 rounded-tarjeta border border-borde bg-superficie px-4 py-3 text-base font-semibold">
        <span>
          Textos de mensajes
          <span className="block text-sm font-normal text-suave">Lo que se manda por WhatsApp, a tu celular y lo que ve el cliente.</span>
        </span>
        <ChevronRight aria-hidden className="size-6 shrink-0 text-suave" />
      </Link>
      {zonas?.ok && <Zonas zonas={itemsDe(zonas.datos)} puedeEditar={tiene(yo.datos, "clientes.editar")} />}
      <SeccionVehiculos />
      <SeccionCalendario />
      <FormConfiguracion config={cfg.datos} />
    </main>
  );
}

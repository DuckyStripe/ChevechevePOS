import { itemsDe } from "@/componentes/productos/formato";
import { apiServidor } from "@/lib/api-servidor";
import type { Lista, Vehiculo } from "@/lib/tipos";
import { Vehiculos } from "./vehiculos";

/** Sección «Vehículos» de /configuracion (la página ya exige configuracion.editar). Sin rutas.ver no se puede leer: no estorba. */
export async function SeccionVehiculos() {
  const r = await apiServidor<Lista<Vehiculo>>("/vehiculos", { por_pagina: "200" });
  if (!r.ok) return null;
  return <Vehiculos vehiculos={itemsDe(r.datos)} />;
}

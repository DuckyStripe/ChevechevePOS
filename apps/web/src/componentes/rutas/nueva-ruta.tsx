"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { mensajeError } from "@/componentes/productos/formato";
import { Boton } from "@/componentes/ui/boton";
import { Campo, Selector } from "@/componentes/ui/campo";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { llamar } from "@/lib/api-cliente";
import type { Repartidor, RutaDetalle, Vehiculo } from "@/lib/tipos";

/** «Nueva ruta» vive aquí (N1): crea y manda a `/rutas/[id]`, donde se asignan los pedidos. */
export function NuevaRuta({ fecha, vehiculos, repartidores }: { fecha: string; vehiculos: Vehiculo[]; repartidores: Repartidor[] }) {
  const router = useRouter();
  const [dia, setDia] = useState(fecha);
  const [nombre, setNombre] = useState("");
  const [vehiculo, setVehiculo] = useState(vehiculos[0]?.id ?? "");
  const [repartidor, setRepartidor] = useState(repartidores[0]?.id ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (vehiculos.length === 0 || repartidores.length === 0) {
    return (
      <Tarjeta className="mb-4">
        <h2 className="text-lg font-bold">Nueva ruta</h2>
        <p className="text-base text-suave">
          {vehiculos.length === 0 ? "Primero da de alta tu camioneta en Configuración (sección Vehículos)." : "No hay nadie que pueda repartir. Dale el permiso «operar su ruta» a un usuario."}
        </p>
      </Tarjeta>
    );
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setError(null);
    const r = await llamar<RutaDetalle>("POST", "/rutas", { fecha: dia, vehiculo_id: vehiculo, repartidor_id: repartidor, ...(nombre.trim() ? { nombre: nombre.trim() } : {}) });
    if (!r.ok) {
      setOcupado(false);
      setError(r.error.codigo === "REPARTIDOR_NO_VALIDO" ? "Esa persona no puede repartir. Elige a otra." : mensajeError(r.error));
      return;
    }
    router.push(`/rutas/${r.datos.id}`);
  }

  return (
    <Tarjeta aria-labelledby="nueva-ruta" className="mb-4">
      <form onSubmit={(e) => void crear(e)} className="flex flex-col gap-3">
        <h2 id="nueva-ruta" className="text-xl font-bold">
          Nueva ruta
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="¿Para qué día?" type="date" required value={dia} onChange={(e) => setDia(e.target.value)} />
          <Campo etiqueta="Nombre (opcional)" placeholder="Norte mañana" maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <Selector etiqueta="Camioneta" value={vehiculo} onChange={(e) => setVehiculo(e.target.value)}>
            {vehiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre}
              </option>
            ))}
          </Selector>
          <Selector etiqueta="¿Quién reparte?" value={repartidor} onChange={(e) => setRepartidor(e.target.value)}>
            {repartidores.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </Selector>
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-base font-medium text-peligro">
            {error}
          </p>
        )}
        <Boton type="submit" cargando={ocupado} disabled={!dia}>
          Crear ruta
        </Boton>
      </form>
    </Tarjeta>
  );
}

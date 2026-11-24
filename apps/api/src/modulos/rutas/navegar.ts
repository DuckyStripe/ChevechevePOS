/** Enlaces de navegacion (CONTRATOS §2.7.1): sin API ni costo. Una parada sin ubicacion no tiene enlace (nunca se inventan coordenadas). */

export interface PuntoTexto {
  lat: string | null;
  lng: string | null;
}

export interface Navegar {
  google: string;
  waze: string;
}

/** Google Maps limita la URL a 9 paradas intermedias: la ruta completa se parte en tramos de 9 waypoints + destino. */
const MAX_WAYPOINTS = 9;

export function navegarParada(p: PuntoTexto): Navegar | null {
  if (p.lat === null || p.lng === null) return null;
  const ll = `${p.lat},${p.lng}`;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${ll}`,
    waze: `https://waze.com/ul?ll=${ll}&navigate=yes`,
  };
}

/** Tramos de la ruta completa en Google Maps. Cada tramo sale del destino del anterior (el primero, de la bodega si tiene ubicacion). */
export function navegarRuta(bodega: PuntoTexto, puntos: PuntoTexto[]): string[] {
  const validos = puntos.filter((p): p is { lat: string; lng: string } => p.lat !== null && p.lng !== null).map((p) => `${p.lat},${p.lng}`);
  const urls: string[] = [];
  let origen = bodega.lat !== null && bodega.lng !== null ? `${bodega.lat},${bodega.lng}` : null;
  for (let i = 0; i < validos.length; i += MAX_WAYPOINTS + 1) {
    const tramo = validos.slice(i, i + MAX_WAYPOINTS + 1);
    const destino = tramo[tramo.length - 1]!;
    const waypoints = tramo.slice(0, -1);
    urls.push(
      `https://www.google.com/maps/dir/?api=1${origen ? `&origin=${origen}` : ""}&destination=${destino}` +
        (waypoints.length ? `&waypoints=${waypoints.join("%7C")}` : ""),
    );
    origen = destino;
  }
  return urls;
}

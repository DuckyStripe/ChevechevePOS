/** Orden de paradas (CONTRATOS §2.7.1): vecino mas cercano desde la bodega + 2-opt, haversine, recorrido cerrado. Puro: sin base ni red. */

export interface Punto {
  lat: number;
  lng: number;
}

export interface ParadaOptimizar {
  id: string;
  cliente_id: string;
  lat: number | null;
  lng: number | null;
}

export interface ResultadoOrden {
  /** Ids de parada en el orden de visita. */
  orden: string[];
  /** n + 1 tramos redondeados a 2 decimales (el ultimo es el regreso a la bodega). Una parada sin ubicacion aporta 0. */
  km: number[];
  /** Suma de `km` (lo que guarda `fn_ordenar_ruta`), en km con 2 decimales. */
  distancia_km: number;
  sin_ubicacion: string[];
}

const RADIO_KM = 6371;
const MAX_ITERACIONES = 2000;
const rad = (g: number) => (g * Math.PI) / 180;

export function haversine(a: Punto, b: Punto): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Largo del recorrido cerrado bodega -> puntos (en ese orden) -> bodega. */
export function distanciaCerrada(bodega: Punto, puntos: Punto[]): number {
  let total = 0;
  let previo = bodega;
  for (const p of puntos) {
    total += haversine(previo, p);
    previo = p;
  }
  return total + haversine(previo, bodega);
}

/** Indices de `puntos` en orden de vecino mas cercano desde la bodega (empates: el de menor indice). */
export function vecinoMasCercano(bodega: Punto, puntos: Punto[]): number[] {
  const pendientes = new Set(puntos.keys());
  const orden: number[] = [];
  let actual = bodega;
  while (pendientes.size) {
    let mejor = -1;
    let mejorD = Infinity;
    for (const i of pendientes) {
      const d = haversine(actual, puntos[i]!);
      if (d < mejorD) {
        mejorD = d;
        mejor = i;
      }
    }
    pendientes.delete(mejor);
    orden.push(mejor);
    actual = puntos[mejor]!;
  }
  return orden;
}

/** 2-opt sobre el recorrido cerrado: invierte tramos mientras alguna inversion acorte (tope 2000 mejoras). */
export function dosOpt(bodega: Punto, puntos: Punto[], orden: number[]): number[] {
  const r = [...orden];
  const en = (i: number): Punto => (i < 0 || i >= r.length ? bodega : puntos[r[i]!]!);
  let mejoras = 0;
  let mejoro = true;
  while (mejoro && mejoras < MAX_ITERACIONES) {
    mejoro = false;
    for (let i = 0; i < r.length - 1 && mejoras < MAX_ITERACIONES; i++) {
      for (let j = i + 1; j < r.length && mejoras < MAX_ITERACIONES; j++) {
        const actual = haversine(en(i - 1), en(i)) + haversine(en(j), en(j + 1));
        const nuevo = haversine(en(i - 1), en(j)) + haversine(en(i), en(j + 1));
        if (nuevo < actual - 1e-9) {
          r.splice(i, j - i + 1, ...r.slice(i, j + 1).reverse());
          mejoras++;
          mejoro = true;
        }
      }
    }
  }
  return r;
}

const dosDecimales = (x: number) => Math.round(x * 100) / 100;

/**
 * Las paradas del mismo cliente van juntas (un solo punto); las sin ubicacion van al final en su orden actual.
 * shortcut: haversine ignora calles y sentidos; con recorridos reales distintos, cambiar solo `haversine` por una matriz de OSRM.
 */
export function ordenarParadas(bodega: Punto, paradas: ParadaOptimizar[]): ResultadoOrden {
  const sin: ParadaOptimizar[] = [];
  const grupos = new Map<string, { punto: Punto; paradas: ParadaOptimizar[] }>();
  for (const p of paradas) {
    if (p.lat === null || p.lng === null) {
      sin.push(p);
      continue;
    }
    const g = grupos.get(p.cliente_id);
    if (g) g.paradas.push(p);
    else grupos.set(p.cliente_id, { punto: { lat: p.lat, lng: p.lng }, paradas: [p] });
  }
  const nodos = [...grupos.values()];
  const puntos = nodos.map((n) => n.punto);
  const indices = dosOpt(bodega, puntos, vecinoMasCercano(bodega, puntos));

  const conUbicacion = indices.flatMap((i) => nodos[i]!.paradas);
  const km: number[] = [];
  let previo = bodega;
  for (const i of indices) {
    // Paradas del mismo cliente: tramo 0 salvo la primera del grupo.
    nodos[i]!.paradas.forEach((_, k) => km.push(k === 0 ? dosDecimales(haversine(previo, nodos[i]!.punto)) : 0));
    previo = nodos[i]!.punto;
  }
  for (let i = 0; i < sin.length; i++) km.push(0);
  km.push(dosDecimales(haversine(previo, bodega)));
  const distancia = dosDecimales(km.reduce((a, b) => a + b, 0));
  return { orden: [...conUbicacion, ...sin].map((p) => p.id), km, distancia_km: distancia, sin_ubicacion: sin.map((p) => p.id) };
}

import { describe, expect, it } from "vitest";
import { distanciaCerrada, dosOpt, haversine, ordenarParadas, vecinoMasCercano, type ParadaOptimizar, type Punto } from "../../src/modulos/rutas/optimizar.js";
import { navegarParada, navegarRuta } from "../../src/modulos/rutas/navegar.js";

const BODEGA: Punto = { lat: 19, lng: -99 };
/** Juego fijo de F6.md: cliente i en 19.000000, -99.0 + 0.01·i. */
const p = (i: number, extra: Partial<ParadaOptimizar> = {}): ParadaOptimizar => ({ id: `p${i}`, cliente_id: `c${i}`, lat: 19, lng: -99 + 0.01 * i, ...extra });

// Semilla fija (mulberry32): las 20 pruebas aleatorias son siempre las mismas.
function semilla(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("haversine", () => {
  it("0.01 grados de longitud a 19 N son 1.05 km (6371·cos 19°·0.01°)", () => {
    expect(haversine(BODEGA, { lat: 19, lng: -98.99 })).toBeCloseTo(1.0514, 3);
    expect(haversine(BODEGA, BODEGA)).toBe(0);
  });
});

describe("ordenarParadas", () => {
  it("juego fijo capturado en orden [4,1,6,2,5,3] -> [1..6] y 12.60 a 12.63 km (el de captura mide 25.23)", () => {
    const captura = [4, 1, 6, 2, 5, 3].map((i) => p(i));
    const medida = (ps: ParadaOptimizar[]) => distanciaCerrada(BODEGA, ps.map((x) => ({ lat: x.lat!, lng: x.lng! })));
    expect(medida(captura)).toBeCloseTo(25.23, 2);
    const r = ordenarParadas(BODEGA, captura);
    expect(r.orden).toEqual(["p1", "p2", "p3", "p4", "p5", "p6"]);
    expect(r.distancia_km).toBeGreaterThanOrEqual(12.6);
    expect(r.distancia_km).toBeLessThanOrEqual(12.63);
    expect(r.sin_ubicacion).toEqual([]);
    // n + 1 tramos (el ultimo es el regreso), redondeados a 2 decimales; su suma es la distancia.
    expect(r.km).toHaveLength(7);
    expect(r.km.slice(0, 6)).toEqual([1.05, 1.05, 1.05, 1.05, 1.05, 1.05]);
    expect(r.km[6]).toBe(6.31);
    expect(Math.round(r.km.reduce((a, b) => a + b, 0) * 100) / 100).toBe(r.distancia_km);
  });

  it("20 juegos aleatorios con semilla fija: 2-opt <= vecino mas cercano solo, cada parada una sola vez", () => {
    const azar = semilla(20261123);
    let mejoras = 0;
    for (let j = 0; j < 20; j++) {
      const n = 5 + Math.floor(azar() * 36);
      const ps: ParadaOptimizar[] = Array.from({ length: n }, (_, i) => ({
        id: `x${i}`, cliente_id: `k${i}`, lat: 19 + (azar() - 0.5) * 0.2, lng: -99 + (azar() - 0.5) * 0.2,
      }));
      const pts = ps.map((x) => ({ lat: x.lat!, lng: x.lng! }));
      const nn = vecinoMasCercano(BODEGA, pts);
      const dosopt = dosOpt(BODEGA, pts, nn);
      const r = ordenarParadas(BODEGA, ps);
      expect([...r.orden].sort()).toEqual(ps.map((x) => x.id).sort());
      expect(new Set(r.orden).size).toBe(n);
      const dNn = distanciaCerrada(BODEGA, nn.map((i) => pts[i]!));
      const d2 = distanciaCerrada(BODEGA, dosopt.map((i) => pts[i]!));
      expect(d2).toBeLessThanOrEqual(dNn + 1e-9);
      if (d2 < dNn - 1e-9) mejoras++;
      expect(distanciaCerrada(BODEGA, r.orden.map((id) => pts[ps.findIndex((x) => x.id === id)]!))).toBeCloseTo(d2, 6);
    }
    expect(mejoras).toBeGreaterThan(0); // 2-opt si corrige al vecino mas cercano en algun juego
  });

  it("dos paradas del mismo cliente quedan seguidas (tramo 0 entre ellas)", () => {
    const ps = [p(3), p(1), p(2, { id: "p2a", cliente_id: "c1" }), p(2), p(5)];
    const r = ordenarParadas(BODEGA, ps);
    const i = r.orden.indexOf("p1");
    expect(r.orden[i + 1]).toBe("p2a");
    expect(r.km[i + 1]).toBe(0);
    expect(r.orden).toHaveLength(5);
  });

  it("parada sin coordenadas -> al final, en su orden actual, y en sin_ubicacion; el regreso es del ultimo con ubicacion", () => {
    const ps = [p(2), p(9, { lat: null, lng: null, cliente_id: "sin1" }), p(1), p(8, { lat: null, lng: null, cliente_id: "sin2" })];
    const r = ordenarParadas(BODEGA, ps);
    expect(r.orden).toEqual(["p1", "p2", "p9", "p8"]);
    expect(r.sin_ubicacion).toEqual(["p9", "p8"]);
    expect(r.km).toEqual([1.05, 1.05, 0, 0, 2.1]);
    // todo sin ubicacion: orden intacto, distancia 0
    const solo = ordenarParadas(BODEGA, [p(2, { lat: null, lng: null }), p(1, { lat: null, lng: null })]);
    expect(solo.orden).toEqual(["p2", "p1"]);
    expect(solo.km).toEqual([0, 0, 0]);
    expect(ordenarParadas(BODEGA, [])).toEqual({ orden: [], km: [0], distancia_km: 0, sin_ubicacion: [] });
  });

  it("60 paradas tardan menos de 50 ms", () => {
    const azar = semilla(7);
    const ps = Array.from({ length: 60 }, (_, i) => ({ id: `y${i}`, cliente_id: `k${i}`, lat: 19 + (azar() - 0.5) * 0.3, lng: -99 + (azar() - 0.5) * 0.3 }));
    ordenarParadas(BODEGA, ps); // calentamiento del JIT
    const t = performance.now();
    const r = ordenarParadas(BODEGA, ps);
    expect(performance.now() - t).toBeLessThan(50);
    expect(r.orden).toHaveLength(60);
  });
});

describe("navegar", () => {
  it("parada: enlaces de Google Maps y Waze; sin ubicacion: null", () => {
    expect(navegarParada({ lat: "19.010000", lng: "-99.020000" })).toEqual({
      google: "https://www.google.com/maps/dir/?api=1&destination=19.010000,-99.020000",
      waze: "https://waze.com/ul?ll=19.010000,-99.020000&navigate=yes",
    });
    expect(navegarParada({ lat: null, lng: null })).toBeNull();
  });

  it("ruta completa en tramos de 9 waypoints + destino, cada uno sale del destino del anterior; las paradas sin ubicacion se saltan", () => {
    const puntos = Array.from({ length: 23 }, (_, i) => ({ lat: `19.0${String(i).padStart(5, "0")}`, lng: "-99.000000" }));
    const urls = navegarRuta({ lat: "19.000000", lng: "-99.000000" }, [{ lat: null, lng: null }, ...puntos]);
    expect(urls).toHaveLength(3); // 10 + 10 + 3
    expect(urls[0]).toContain("origin=19.000000,-99.000000");
    expect(urls[0]!.match(/%7C/g)).toHaveLength(8); // 9 waypoints
    expect(urls[1]).toContain(`origin=${puntos[9]!.lat},-99.000000`);
    expect(urls[1]).toContain(`destination=${puntos[19]!.lat},-99.000000`);
    expect(urls[2]).toContain(`destination=${puntos[22]!.lat},-99.000000`);
    expect(navegarRuta({ lat: null, lng: null }, [puntos[0]!])).toEqual([`https://www.google.com/maps/dir/?api=1&destination=${puntos[0]!.lat},-99.000000`]);
    expect(navegarRuta({ lat: null, lng: null }, [])).toEqual([]);
  });
});

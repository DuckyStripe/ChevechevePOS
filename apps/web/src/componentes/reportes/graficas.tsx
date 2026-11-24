import { fecha } from "@/componentes/productos/formato";
import { dinero } from "@/lib/dinero";
import type { FilaReporte } from "@/lib/tipos";

/**
 * Graficas de solo lectura en HTML/CSS (sin librerias ni JS en el cliente).
 * Los importes llegan como string: se pasan a numero SOLO para la escala del dibujo;
 * todo lo que se lee (maximo, totales, tooltips) es el string de la API formateado con `dinero`.
 */

export type Punto = { dia: string; valor: string | null };

const escala = (v: string | null): number | null => (v != null && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DIAS = 62;

/** Serie por dia del rango: un dia sin movimiento queda como hueco (no se junta con el siguiente). */
export function serieDiaria(filas: FilaReporte[], clave: string, desde: string, hasta: string): Punto[] {
  const porDia = new Map(filas.map((f) => [String(f.etiqueta), f[clave] == null ? null : String(f[clave])]));
  const dias: string[] = [];
  if (ISO.test(desde) && ISO.test(hasta)) {
    for (let t = Date.parse(`${desde}T12:00:00Z`), fin = Date.parse(`${hasta}T12:00:00Z`); t <= fin && dias.length <= MAX_DIAS; t += 86_400_000) {
      dias.push(new Date(t).toISOString().slice(0, 10));
    }
  }
  // Rango invalido o muy largo: solo los dias que trajo la API, en su orden.
  if (dias.length === 0 || dias.length > MAX_DIAS) return filas.map((f) => ({ dia: String(f.etiqueta), valor: f[clave] == null ? null : String(f[clave]) }));
  return dias.map((dia) => ({ dia, valor: porDia.get(dia) ?? null }));
}

/** Barras por dia (una sola serie: el titulo la nombra, sin leyenda). Negativos hacia abajo en rojo, con su texto en el tooltip. */
export function BarrasDiarias({ titulo, puntos, mini = false, vacio = "sin movimiento" }: { titulo: string; puntos: Punto[]; mini?: boolean; vacio?: string }) {
  const nums = puntos.map((p) => escala(p.valor));
  const validos = nums.filter((n): n is number => n != null);
  if (validos.length === 0) return null;
  const max = Math.max(0, ...validos);
  const min = Math.min(0, ...validos);
  const iMax = nums.findIndex((n) => n === Math.max(...validos));
  const pico = puntos[iMax];
  const primero = puntos[0]!;
  const ultimo = puntos[puntos.length - 1]!;
  const resumen = `${titulo}, del ${fecha(primero.dia)} al ${fecha(ultimo.dia)}. El día más alto fue el ${fecha(pico?.dia)} con ${dinero(pico?.valor)}.${min < 0 ? " Hay días en negativo." : ""}`;

  return (
    <figure className="m-0 flex flex-col gap-2" role="group" aria-label={resumen}>
      {!mini && (
        <p className="text-sm text-suave">
          Día más alto: <strong className="cifra text-texto">{dinero(pico?.valor)}</strong> <span aria-hidden>·</span> {fecha(pico?.dia)}
        </p>
      )}
      <div aria-hidden className={`flex items-stretch ${mini ? "h-10 gap-px" : "h-44 gap-0.5"}`}>
        {puntos.map((p, i) => {
          const n = nums[i];
          const texto = `${fecha(p.dia)}: ${n == null ? vacio : dinero(p.valor)}`;
          return (
            // Toda la columna es el blanco del puntero (mas grande que la barra); `title` = tooltip nativo.
            <div key={p.dia} title={texto} className="group flex min-w-0 flex-1 flex-col">
              <div className={`flex items-end ${min < 0 ? "border-b border-control/60" : ""}`} style={{ flex: `${max} 1 0%` }}>
                {n != null && n > 0 && (
                  <div
                    className="w-full min-h-0.5 rounded-t-[4px] bg-marca transition-colors duration-150 group-hover:bg-marca-presionado"
                    style={{ height: `${(n / max) * 100}%` }}
                  />
                )}
              </div>
              {min < 0 && (
                <div className="flex items-start" style={{ flex: `${-min} 1 0%` }}>
                  {n != null && n < 0 && <div className="w-full min-h-0.5 rounded-b-[4px] bg-peligro-relleno" style={{ height: `${(n / min) * 100}%` }} />}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!mini && (
        <div aria-hidden className="flex justify-between gap-3 border-t border-borde pt-1 text-sm text-suave">
          <span>{fecha(primero.dia)}</span>
          <span>{fecha(ultimo.dia)}</span>
        </div>
      )}
    </figure>
  );
}

const CUBETAS = [
  { clave: "corriente", titulo: "Al corriente", color: "bg-antig-1" },
  { clave: "d1_30", titulo: "1 a 30 días", color: "bg-antig-2" },
  { clave: "d31_60", titulo: "31 a 60 días", color: "bg-antig-3" },
  { clave: "d61_90", titulo: "61 a 90 días", color: "bg-antig-4" },
  { clave: "d90_mas", titulo: "Más de 90 días", color: "bg-antig-5" },
] as const;

/** Antiguedad de lo que te deben: una barra apilada (un tono, de claro a oscuro segun lo viejo) con leyenda y montos en texto. */
export function BarraAntiguedad({ totales, mini = false }: { totales: FilaReporte; mini?: boolean }) {
  const partes = CUBETAS.map((c) => {
    const v = totales[c.clave] == null ? null : String(totales[c.clave]);
    return { ...c, valor: v, n: Math.max(0, escala(v) ?? 0) };
  });
  if (!partes.some((p) => p.n > 0)) return null;
  const resumen = `Antigüedad de lo que te deben: ${partes.map((p) => `${p.titulo} ${dinero(p.valor)}`).join(", ")}.`;

  return (
    <figure className="m-0 flex flex-col gap-3" role="group" aria-label={resumen}>
      <div aria-hidden className={`flex overflow-hidden ${mini ? "h-3 gap-px rounded-full" : "h-10 gap-0.5 rounded-xl"}`}>
        {partes
          .filter((p) => p.n > 0)
          .map((p) => (
            <div key={p.clave} title={`${p.titulo}: ${dinero(p.valor)}`} className={`${p.color} min-w-1`} style={{ flex: `${p.n} 1 0%` }} />
          ))}
      </div>
      {!mini && (
        <ul aria-hidden className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {partes.map((p) => (
            <li key={p.clave} className="flex min-h-8 items-center gap-2 text-base">
              <span className={`size-3.5 shrink-0 rounded-[4px] ${p.color} ring-1 ring-borde`} />
              <span className="min-w-0 flex-1 text-suave">{p.titulo}</span>
              <span className="cifra font-semibold">{dinero(p.valor)}</span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

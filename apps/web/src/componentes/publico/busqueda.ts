/** Busqueda tolerante en el telefono (C10): sin acentos, mayusculas ni signos, y con un error de una letra. */
export const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** true si `a` y `b` difieren en como mucho una letra (cambiada, de mas, de menos o dos intercambiadas). */
function unaLetra(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // una letra cambiada
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // dos intercambiadas
  }
  const [corta, larga] = a.length < b.length ? [a, b] : [b, a];
  return corta.slice(i) === larga.slice(i + 1);
}

/** `buscar` ya viene normalizado de la API (nombre + marca + alias); aqui se normaliza la consulta. */
export function coincide(buscar: string, consulta: string): boolean {
  const tokens = normalizar(consulta).split(" ").filter(Boolean);
  if (tokens.length === 0) return true;
  const palabras = buscar.split(" ");
  return tokens.every((t) => buscar.includes(t) || (t.length >= 4 && palabras.some((p) => unaLetra(p, t) || unaLetra(p.slice(0, t.length), t))));
}

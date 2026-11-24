// Corcholata de 21 dientes: el logo de la bodega. Puntos calculados una vez (sin JS en el cliente).
const PUNTOS = Array.from({ length: 42 }, (_, i) => {
  const a = (Math.PI * i) / 21 - Math.PI / 2;
  const r = i % 2 ? 13.2 : 15.5;
  return `${(16 + r * Math.cos(a)).toFixed(2)},${(16 + r * Math.sin(a)).toFixed(2)}`;
}).join(" ");

export function Corcholata({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={`shrink-0 ${className}`}>
      <polygon points={PUNTOS} className="fill-marca" />
      <circle cx="16" cy="16" r="9.5" fill="none" strokeWidth="1.6" className="stroke-white/70" />
    </svg>
  );
}

/** Logo + nombre. `tam` grande para el login. */
export function Marca({ grande = false }: { grande?: boolean }) {
  return (
    <span className={`flex items-center gap-2 font-titulo font-bold tracking-tight ${grande ? "text-3xl" : "text-lg"}`}>
      <Corcholata className={grande ? "size-10" : "size-7"} /> Chevecheve
    </span>
  );
}

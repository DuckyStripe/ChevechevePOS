/** Estado con texto (nunca solo color); el punto refuerza el tono sin depender de el. */
export function Insignia({ tono = "neutro", children }: { tono?: "neutro" | "exito" | "peligro" | "aviso"; children: React.ReactNode }) {
  const t = {
    neutro: "bg-hundido text-texto",
    exito: "bg-exito-suave text-exito",
    peligro: "bg-peligro-suave text-peligro",
    aviso: "bg-marca-suave text-marca-fuerte",
  }[tono];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-semibold ${t}`}>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      {children}
    </span>
  );
}

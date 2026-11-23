/** Estado con texto (nunca solo color). */
export function Insignia({ tono = "neutro", children }: { tono?: "neutro" | "exito" | "peligro" | "aviso"; children: React.ReactNode }) {
  const t = {
    neutro: "bg-borde/60 text-texto",
    exito: "bg-exito-suave text-exito",
    peligro: "bg-peligro-suave text-peligro",
    aviso: "bg-marca-suave text-marca-fuerte",
  }[tono];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-sm font-medium ${t}`}>{children}</span>;
}

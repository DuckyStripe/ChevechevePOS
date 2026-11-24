/** Circulo con el numero del paso del dia (N2). El lector de pantalla oye «Paso 1:». */
export function NumeroPaso({ n, chico = false }: { n: number; chico?: boolean }) {
  return (
    <span className={`cifra inline-flex shrink-0 items-center justify-center rounded-full bg-marca font-bold text-white ${chico ? "size-6 text-sm" : "size-8 text-base"}`}>
      <span className="sr-only">Paso </span>
      {n}
      <span className="sr-only">:</span>
    </span>
  );
}

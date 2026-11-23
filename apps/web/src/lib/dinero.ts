/** `"1250.5"` -> `"$1,250.50"`. Solo formatea el string de la API: la web no suma importes. */
export function dinero(valor: string | null | undefined): string {
  if (valor == null || !/^-?\d+(\.\d+)?$/.test(valor)) return "—";
  const negativo = valor.startsWith("-");
  const [entero, dec = ""] = valor.replace("-", "").split(".");
  const miles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negativo ? "-" : ""}$${miles}.${dec.padEnd(2, "0").slice(0, 2)}`;
}

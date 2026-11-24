import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error: modulo .mjs sin tipos
import { leerArchivo, parsearCsv, detectarSeparador } from "../../../scripts/eleventa/leer.mjs";

const fx = (n: string) => join(import.meta.dirname, "..", "fixtures", n);

describe("lector Eleventa", () => {
  it("CSV con ';', comillas, windows-1252 y acentos", async () => {
    const r = await leerArchivo(fx("catalogo.csv"));
    expect(r.encabezados[0]).toBe("Código");
    expect(r.filas).toHaveLength(5);
    expect(r.filas[0][1]).toBe('Cerveza "Clara" 355 ml');
    expect(r.filas[1][4]).toBe("$1,020.00"); // coma dentro de comillas
  });
  it("CSV con ',', BOM y coma dentro de comillas", async () => {
    const r = await leerArchivo(fx("clientes.csv"));
    expect(r.encabezados[0]).toBe("Nombre");
    expect(r.filas[0][2]).toBe("Calle 1, Col. Centro");
  });
  it("XLSX", async () => {
    const r = await leerArchivo(fx("catalogo.xlsx"));
    expect(r.encabezados).toEqual(["Código", "Descripción", "Precio Venta"]);
    expect(r.filas).toEqual([["7501", "Producto uno", "10.5"], ["7502", "Producto dos", "20"]]);
  });
  it("separador y saltos CRLF", () => {
    expect(detectarSeparador('a;b;"c,d"\n1;2;3')).toBe(";");
    expect(parsearCsv("a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it(".xls y .fdb dan mensaje claro", async () => {
    const d = mkdtempSync(join(tmpdir(), "elev-"));
    try {
      writeFileSync(join(d, "a.xls"), "x");
      writeFileSync(join(d, "a.fdb"), "x");
      await expect(leerArchivo(join(d, "a.xls"))).rejects.toThrow("guárdalo como CSV");
      await expect(leerArchivo(join(d, "a.fdb"))).rejects.toThrow("pendiente");
    } finally {
      rmSync(d, { recursive: true });
    }
  });
});

import { describe, expect, it } from "vitest";
// @ts-expect-error: modulo .mjs sin tipos
import { enmascarar, mapearCliente, mapearProducto, normalizarTelefono, parsearDinero, parsearEntero, resolverColumnas } from "../../../scripts/eleventa/mapeo.mjs";

describe("mapeo Eleventa", () => {
  it("teléfonos: los 4 casos", () => {
    expect(normalizarTelefono("55 1234 5678")).toBe("525512345678");
    expect(normalizarTelefono("525512345678")).toBe("525512345678");
    expect(normalizarTelefono("+52 1 55 1234 5678")).toBe("525512345678");
    expect(normalizarTelefono("12345")).toBeNull();
    expect(enmascarar("525512345678")).toBe("52******5678");
  });
  it("dinero y enteros", () => {
    expect(parsearDinero("$1,020.50")).toBe("1020.50");
    expect(parsearDinero("")).toBeNull();
    expect(parsearDinero("abc")).toBeNull();
    expect(parsearDinero("-3")).toBeNull();
    expect(parsearEntero("5.0")).toBe(5);
    expect(parsearEntero("2.5")).toBeNull();
  });
  const enc = ["Código", "Descripción", "Departamento", "Precio Costo", "Precio Venta", "Precio Mayoreo", "Existencia", "Inv. Mínimo"];
  it("columnas por alias y por --mapeo", () => {
    const c = resolverColumnas(enc, "catalogo");
    expect(c).toMatchObject({ codigo: 0, nombre: 1, departamento: 2, costo: 3, precio: 4, mayoreo: 5, existencia: 6, minimo: 7 });
    const c2 = resolverColumnas(["Clave", "Nombre", "P Publico"], "catalogo", { catalogo: { codigo: "clave", precio: ["P. Publico"] } });
    expect(c2).toMatchObject({ codigo: 0, nombre: 1, precio: 2, mayoreo: -1 });
  });
  it("producto: ok y rechazos", () => {
    const c = resolverColumnas(enc, "catalogo");
    const ok = mapearProducto(["7500", "Cola", "Refrescos", "10", "$1,020.00", "", "5", ""], c);
    expect(ok.dato).toMatchObject({ codigo: "7500", precio: "1020.00", mayoreo: null, minimo: 0, existencia: 5, costo: "10" });
    expect(mapearProducto(["7500", "", "", "", "1"], c).rechazo).toBe("sin nombre");
    expect(mapearProducto(["", "x", "", "", "1"], c).rechazo).toBe("sin código");
    expect(mapearProducto(["7500", "x", "", "", ""], c).rechazo).toMatch(/precio/);
    expect(mapearProducto(["7.5E+12", "x", "", "", "1"], c).rechazo).toMatch(/científica/);
  });
  it("cliente: teléfono inválido se conserva el cliente sin teléfono", () => {
    const c = resolverColumnas(["Nombre", "Teléfono", "Dirección", "Saldo"], "clientes");
    const r = mapearCliente(["Lupe", "123456", "Calle", "10.5"], c);
    expect(r.dato).toMatchObject({ telefono: null, saldo: "10.5" });
    expect(r.dato.telefono_invalido).not.toContain("123456".slice(0, 6));
    expect(mapearCliente(["", "5512345678", "", ""], c).rechazo).toBe("sin nombre");
  });
});

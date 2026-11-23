import { describe, expect, it } from "vitest";
import { AppError, mapearError } from "./errores.js";

const conCodigo = (code: string, message = "x") => Object.assign(new Error(message), { code });

describe("mapearError", () => {
  it("respeta AppError", () => {
    const r = mapearError(new AppError(404, "NO_ENCONTRADO", "no esta"));
    expect(r).toMatchObject({ statusCode: 404, code: "NO_ENCONTRADO" });
  });

  it.each([
    ["23505", 409],
    ["23503", 409],
    ["23514", 400],
    ["P0001", 422],
  ])("pg %s -> %i", (codigo, estado) => {
    expect(mapearError(conCodigo(codigo)).statusCode).toBe(estado);
  });

  it("P0001 expone el mensaje de negocio; un error desconocido no filtra detalles", () => {
    expect(mapearError(conCodigo("P0001", "Stock insuficiente")).message).toBe("Stock insuficiente");
    const r = mapearError(conCodigo("XX000", "detalle interno"));
    expect(r.statusCode).toBe(500);
    expect(r.message).not.toContain("interno");
  });
});

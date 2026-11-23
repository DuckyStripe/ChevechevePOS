import { describe, expect, it } from "vitest";
import { AppError, mapearError } from "../src/comun/errores.js";

const pg = (code: string, message = "x", detail?: string) => Object.assign(new Error(message), { code, detail });

describe("mapearError", () => {
  it.each([
    ["VALIDACION", 400],
    ["NO_AUTENTICADO", 401],
    ["SIN_PERMISO", 403],
    ["NO_ENCONTRADO", 404],
    ["ULTIMO_DUENO", 409],
    ["ARCHIVO_GRANDE", 413],
    ["DEMASIADAS_PETICIONES", 429],
    ["ERROR_INTERNO", 500],
  ])("AppError %s -> %i con mensaje", (codigo, estado) => {
    const r = mapearError(new AppError(codigo));
    expect(r).toMatchObject({ statusCode: estado, codigo });
    expect(r.mensaje.length).toBeGreaterThan(0);
  });

  it("AppError lleva detalles", () => {
    expect(mapearError(new AppError("SIN_PERMISO", { permiso: "x" })).detalles).toEqual({ permiso: "x" });
  });

  it("P0001: message = codigo y DETAIL JSON -> detalles", () => {
    const r = mapearError(pg("P0001", "USUARIO_BLOQUEADO", '{"reintentar_en":900}'));
    expect(r).toMatchObject({ statusCode: 429, codigo: "USUARIO_BLOQUEADO", detalles: { reintentar_en: 900 } });
  });

  it("P0001 con codigo no listado -> 500 sin filtrar el mensaje", () => {
    const r = mapearError(pg("P0001", "CODIGO_RARO"));
    expect(r).toMatchObject({ statusCode: 500, codigo: "ERROR_INTERNO" });
    expect(JSON.stringify(r)).not.toContain("CODIGO_RARO");
  });

  it("23505 -> 409 DUPLICADO", () => {
    expect(mapearError(pg("23505"))).toMatchObject({ statusCode: 409, codigo: "DUPLICADO" });
  });

  it.each(["23503", "23514", "23502", "XX000"])("SQL %s -> 500 sin detalles", (c) => {
    const r = mapearError(pg(c, "detalle interno"));
    expect(r).toMatchObject({ statusCode: 500, codigo: "ERROR_INTERNO" });
    expect(r.detalles).toBeUndefined();
    expect(r.mensaje).not.toContain("interno");
  });

  it("valor no Error -> 500", () => {
    expect(mapearError("x").statusCode).toBe(500);
  });
});

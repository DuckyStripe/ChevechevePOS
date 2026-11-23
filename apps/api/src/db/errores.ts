/** Unica fuente de verdad del mapeo error -> respuesta HTTP. */

export interface ErrorApi {
  statusCode: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

interface ErrorPg extends Error {
  code?: string;
  constraint?: string;
  detail?: string;
}

/**
 * Convierte cualquier error en un ErrorApi.
 * - AppError: tal cual.
 * - 23505 unique_violation -> 409; 23503 foreign_key_violation -> 409;
 *   23514 check_violation -> 400.
 * - P0001 (RAISE EXCEPTION en PL/pgSQL): el mensaje es de negocio y se expone, 422.
 * - Todo lo demas: 500 generico, sin filtrar detalles internos.
 */
export function mapearError(err: unknown): ErrorApi {
  if (err instanceof AppError) {
    return { statusCode: err.statusCode, code: err.code, message: err.message, details: err.details };
  }
  if (!(err instanceof Error)) {
    return { statusCode: 500, code: "ERROR_INTERNO", message: "Error inesperado" };
  }
  const e = err as ErrorPg;
  switch (e.code) {
    case "23505":
      return { statusCode: 409, code: "DUPLICADO", message: "Ya existe un registro con esos datos", details: { restriccion: e.constraint } };
    case "23503":
      return { statusCode: 409, code: "REFERENCIA_INVALIDA", message: "El registro referencia o es referenciado por otro", details: { restriccion: e.constraint } };
    case "23514":
      return { statusCode: 400, code: "DATO_INVALIDO", message: "Un dato no cumple una regla de la base", details: { restriccion: e.constraint } };
    case "P0001":
      return { statusCode: 422, code: "REGLA_DE_NEGOCIO", message: e.message };
    default:
      return { statusCode: 500, code: "ERROR_INTERNO", message: "Error inesperado" };
  }
}

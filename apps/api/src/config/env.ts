import { z } from "zod";

// Valores de ejemplo que nunca deben llegar a produccion.
const MARCAS_DE_EJEMPLO = ["cambia", "changeme", "secret", "password", "example"];

const esquema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3860),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW: z.coerce.number().int().positive().default(60000),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
});

export type Entorno = z.infer<typeof esquema>;

export function leerEntorno(origen: NodeJS.ProcessEnv = process.env): Entorno {
  const resultado = esquema.safeParse(origen);
  if (!resultado.success) {
    const detalle = resultado.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Entorno invalido: ${detalle}`);
  }
  const env = resultado.data;
  if (env.NODE_ENV === "production") {
    const bajo = env.JWT_SECRET.toLowerCase();
    if (MARCAS_DE_EJEMPLO.some((m) => bajo.includes(m))) {
      throw new Error("JWT_SECRET parece un valor de ejemplo: define uno aleatorio en produccion");
    }
  }
  return env;
}

export const env: Entorno = leerEntorno();

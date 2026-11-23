// Se ejecuta antes de cada archivo de prueba: apunta todo a la base de pruebas y nunca a otra.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error: modulo .mjs sin tipos
import { urlPruebas } from "../scripts/preparar-pruebas.mjs";

const raiz = resolve(import.meta.dirname, "../../../.env");
if (existsSync(raiz)) process.loadEnvFile(raiz);

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = urlPruebas() as string;
process.env.JWT_SECRET ||= "secreto-jwt-solo-para-pruebas-0123456789";
process.env.SECRETO_ENLACES ||= "secreto-enlaces-solo-para-pruebas-0123456";
process.env.LOG_LEVEL = "silent";

// Recrea la base de pruebas desde cero y aplica las migraciones. NUNCA toca otra base:
// aborta si el destino no es 127.0.0.1/localhost:5436/chevechevepos_pruebas.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const BASE = "chevechevepos_pruebas";

export function urlPruebas(env = process.env) {
  let url = env.DATABASE_URL_PRUEBAS;
  if (!url) {
    const { POSTGRES_USER: u, POSTGRES_PASSWORD: p } = env;
    if (!u || !p) throw new Error("Define DATABASE_URL_PRUEBAS o POSTGRES_USER/POSTGRES_PASSWORD en .env");
    url = `postgresql://${encodeURIComponent(u)}:${encodeURIComponent(p)}@127.0.0.1:5436/${BASE}`;
  }
  const u = new URL(url);
  if (!["127.0.0.1", "localhost"].includes(u.hostname)) throw new Error(`Host no permitido para pruebas: ${u.hostname}`);
  if (u.port !== "5436") throw new Error(`Puerto no permitido para pruebas: ${u.port || "(5432)"}`);
  if (u.pathname !== `/${BASE}`) throw new Error(`Base no permitida para pruebas: ${u.pathname.slice(1)}`);
  return url;
}

async function main() {
  const url = urlPruebas();
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const cliente = new pg.Client({ connectionString: admin.toString() });
  await cliente.connect();
  try {
    await cliente.query(`drop database if exists ${BASE} with (force)`);
    await cliente.query(`create database ${BASE}`);
  } finally {
    await cliente.end();
  }
  const migrar = join(dirname(fileURLToPath(import.meta.url)), "migrar.mjs");
  const r = spawnSync(process.execPath, [migrar], { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
  process.exit(r.status ?? 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[preparar-pruebas] ${err.message}`);
    process.exit(1);
  });
}

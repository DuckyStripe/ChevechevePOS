// Migrador unico. Aplica db/migraciones/NNN_*.sql en orden, cada archivo en su transaccion.
// Una migracion aplicada NUNCA se edita: si su checksum cambia, este script falla.
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migraciones");
// Clave arbitraria pero fija: serializa migradores concurrentes (varias replicas arrancando).
const CLAVE_BLOQUEO = 862_001;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrar] DATABASE_URL no esta definida");
  process.exit(1);
}

const cliente = new pg.Client({ connectionString: url });
await cliente.connect();

try {
  await cliente.query("select pg_advisory_lock($1)", [CLAVE_BLOQUEO]);
  await cliente.query("create schema if not exists app");
  await cliente.query(`
    create table if not exists app.migraciones (
      archivo     text primary key,
      checksum    text not null,
      aplicada_en timestamptz not null default now()
    )`);

  const archivos = (await readdir(DIR)).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
  const aplicadas = new Map(
    (await cliente.query("select archivo, checksum from app.migraciones")).rows.map((r) => [r.archivo, r.checksum]),
  );

  let nuevas = 0;
  for (const archivo of archivos) {
    const sql = await readFile(join(DIR, archivo), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const previo = aplicadas.get(archivo);

    if (previo) {
      if (previo !== checksum) {
        throw new Error(`La migracion ${archivo} ya estaba aplicada y fue modificada. Crea una nueva en vez de editarla.`);
      }
      continue;
    }

    await cliente.query("begin");
    try {
      await cliente.query(sql);
      await cliente.query("insert into app.migraciones (archivo, checksum) values ($1, $2)", [archivo, checksum]);
      await cliente.query("commit");
    } catch (err) {
      await cliente.query("rollback");
      throw new Error(`Fallo ${archivo}: ${err.message}`);
    }
    console.log(`[migrar] aplicada ${archivo}`);
    nuevas++;
  }
  console.log(nuevas ? `[migrar] ${nuevas} migracion(es) aplicada(s)` : "[migrar] nada pendiente");
} catch (err) {
  console.error(`[migrar] ${err.message}`);
  process.exitCode = 1;
} finally {
  await cliente.end();
}

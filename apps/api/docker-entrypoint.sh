#!/bin/sh
set -eu

# Espera a Postgres (Compose ya lo cubre con depends_on, pero asi la imagen es autonoma).
DB_WAIT_TIMEOUT_MS="${DB_WAIT_TIMEOUT_MS:-30000}" node -e '
const net = require("node:net");
const url = new URL(process.env.DATABASE_URL || "postgres://postgres:5432");
const host = url.hostname, port = Number(url.port || 5432);
const limite = Date.now() + Number(process.env.DB_WAIT_TIMEOUT_MS);
const intentar = () => {
  const s = net.createConnection({ host, port });
  s.setTimeout(2000);
  s.on("connect", () => { s.end(); process.exit(0); });
  const reintentar = () => {
    s.destroy();
    if (Date.now() >= limite) { console.error("Base no alcanzable en " + host + ":" + port); process.exit(1); }
    setTimeout(intentar, 1000);
  };
  s.on("timeout", reintentar);
  s.on("error", reintentar);
};
intentar();
'

# Idempotente y con checksum: si no hay nada pendiente no toca la base.
if [ "${RUN_MIGRATIONS_ON_BOOT:-true}" = "true" ]; then
  echo "[api] aplicando migraciones pendientes..."
  su-exec node node scripts/migrar.mjs
fi

# Volumen de archivos (imagenes y comprobantes): carpetas y duenio antes de bajar privilegios.
ARCHIVOS_DIR="${ARCHIVOS_DIR:-/datos/archivos}"
mkdir -p "$ARCHIVOS_DIR/imagenes" "$ARCHIVOS_DIR/comprobantes"
chown -R node:node "$ARCHIVOS_DIR"

# node directo (no npm) para que sea PID 1 y reciba SIGTERM.
exec su-exec node node dist/app.js

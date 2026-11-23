#!/bin/sh
# Instala el cron diario (03:00 Ciudad de Mexico) y lo deja en primer plano.
set -eu

# El cron no hereda el entorno: se vuelca (solo lo que usa respaldar.sh) a un archivo legible solo por root.
env | grep -E '^(PG[A-Z]+|RESPALDO_[A-Z_]+)=' | sed "s/'/'\\\\''/g; s/=/='/; s/\$/'/; s/^/export /" > /etc/respaldo.env
chmod 600 /etc/respaldo.env

echo "0 3 * * * TZ=America/Mexico_City . /etc/respaldo.env && /usr/local/bin/respaldar.sh" > /etc/crontabs/root
echo "[respaldo] cron instalado: diario 03:00 America/Mexico_City"
exec crond -f -l 8

#!/bin/sh
# Respaldo diario (CONTRATOS §3.2): pg_dump + tar de archivos, retencion 14 diarios + 8 semanales,
# copia remota con rclone y estado en /respaldos/respaldo_estado.json. Nunca imprime secretos.
set -eu

R=/respaldos
ESTADO="$R/respaldo_estado.json"
DESTINO="${RESPALDO_DESTINO:-}"
CONF="${RESPALDO_RCLONE_CONF:-/run/secrets/rclone.conf}"
export TZ="${TZ:-America/Mexico_City}"
FECHA=$(date +%F)
ERROR=""
LOCAL=true # false si fallo el dump o el tar (la copia remota aparte)

# Escribe el estado pase lo que pase (al salir, bien o mal).
escribir_estado() {
  ahora=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  if [ -z "$ERROR" ]; then
    printf '{"ultimo":"%s","ok":true,"local":true}\n' "$ahora" > "$ESTADO.tmp"
  else
    msg=$(printf '%s' "$ERROR" | tr -d '"\\' | tr '\n' ' ')
    printf '{"ultimo":"%s","ok":false,"local":%s,"error":"%s"}\n' "$ahora" "$LOCAL" "$msg" > "$ESTADO.tmp"
  fi
  mv "$ESTADO.tmp" "$ESTADO"
}
trap escribir_estado EXIT

fallo() { ERROR="${ERROR:+$ERROR; }$1"; echo "[respaldo] $1" >&2; }

mkdir -p "$R/diario" "$R/semanal"

pg_dump -Fc -f "$R/diario/$FECHA.dump" || { rm -f "$R/diario/$FECHA.dump"; LOCAL=false; fallo "pg_dump fallo"; }
tar czf "$R/diario/$FECHA-archivos.tar.gz" -C /datos/archivos . || { rm -f "$R/diario/$FECHA-archivos.tar.gz"; LOCAL=false; fallo "tar de archivos fallo"; }

# Domingo (date +%u = 7): copia semanal.
if [ "$(date +%u)" = "7" ]; then
  cp -f "$R"/diario/"$FECHA"* "$R/semanal/" 2>/dev/null || true
fi

# Retencion: los nombres empiezan con la fecha, asi que el orden alfabetico es cronologico.
ls -1 "$R/diario" | sort -r | tail -n +29 | while read -r f; do rm -f "$R/diario/$f"; done   # 14 dias x 2 archivos
ls -1 "$R/semanal" | sort -r | tail -n +17 | while read -r f; do rm -f "$R/semanal/$f"; done # 8 semanas x 2 archivos

if [ -z "$DESTINO" ] || [ ! -f "$CONF" ]; then
  fallo "falta RESPALDO_DESTINO o rclone.conf: no hay copia fuera del servidor"
else
  rclone sync "$R/" "$DESTINO" --config "$CONF" --exclude respaldo_estado.json --exclude "*.tmp" >/dev/null 2>&1 \
    || fallo "rclone sync fallo"
fi

echo "[respaldo] terminado $FECHA ${ERROR:+con errores}"

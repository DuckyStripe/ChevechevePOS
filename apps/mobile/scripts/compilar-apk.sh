#!/usr/bin/env bash
# Compila la APK de release firmada (Linux, en el servidor). NO se corre en F4: se usa en la validación final.
# Guía paso a paso: docs/deploy/actualizar-app.md.
#
# Antes:
#   source ~/.chevecheve-actualizaciones/android-release.env   # CHV_APK_ALMACEN, CHV_APK_ALMACEN_CLAVE, CHV_APK_ALIAS, CHV_APK_LLAVE_CLAVE
#   export EXPO_PUBLIC_URL_PANEL=https://<dominio de apps/web>
#   export GOOGLE_SERVICES_JSON=<ruta al google-services.json>  (o déjalo en apps/mobile/; nunca va a git)
# Uso: bash apps/mobile/scripts/compilar-apk.sh
set -euo pipefail

cd "$(dirname "$0")/.."

falta() { echo "ERROR: $1" >&2; exit 1; }

[[ "${EXPO_PUBLIC_URL_PANEL:-}" =~ ^https://[^/]+/?$ ]] || falta "EXPO_PUBLIC_URL_PANEL debe ser el https:// del panel (sin ruta)."
[ -f certs/certificado.pem ] || falta "Falta certs/certificado.pem (certs/README.md): sin él la APK no verificaría las actualizaciones."
GS="${GOOGLE_SERVICES_JSON:-./google-services.json}"
[ -f "$GS" ] || falta "Falta google-services.json ($GS): sin él la APK saldría sin push."
for v in CHV_APK_ALMACEN CHV_APK_ALMACEN_CLAVE CHV_APK_ALIAS CHV_APK_LLAVE_CLAVE; do
  [ -n "${!v:-}" ] || falta "Falta $v: corre 'source ~/.chevecheve-actualizaciones/android-release.env'."
done
[ -f "$CHV_APK_ALMACEN" ] || falta "No existe el almacén de llaves $CHV_APK_ALMACEN."
export GOOGLE_SERVICES_JSON="$GS"

VERSION="$(node -p "require('./app.json').expo.version")"
CODE="$(node -p "require('./app.json').expo.android.versionCode")"
echo "== APK $VERSION (versionCode $CODE) para $EXPO_PUBLIC_URL_PANEL"

npm ci
npx tsc --noEmit
npm run lint
npm run prueba

echo "== expo prebuild"
CI=1 npx expo prebuild --platform android --clean --no-install

echo "== gradlew assembleRelease"
# Solo procesadores de teléfono (64 y 32 bits); x86 es de emuladores.
( cd android && ./gradlew assembleRelease --console=plain --build-cache \
    -PreactNativeArchitectures=arm64-v8a,armeabi-v7a )

APK="android/app/build/outputs/apk/release/app-release.apk"
[ -f "$APK" ] || falta "No salió $APK."
if command -v apksigner >/dev/null 2>&1; then
  echo "== Firma"
  apksigner verify --print-certs "$APK" | grep -E 'SHA-256|DN'
fi

SALIDA="${SALIDA_APK:-$HOME/.chevecheve-actualizaciones/apk/chevecheve-$CODE.apk}"
mkdir -p "$(dirname "$SALIDA")"
cp "$APK" "$SALIDA"
echo "== SHA-256"
sha256sum "$SALIDA"
echo "APK lista: $SALIDA"
echo "Publicar: npm run ota:publicar-apk --prefix apps/api (ver docs/deploy/actualizar-app.md)"

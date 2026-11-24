# Cómo actualizar la app de Android

Guía para el dueño. La app del celular (`apps/mobile`) es un cascarón: muestra el panel web. Contrato: `docs/CONTRATOS.md` §4.6 y §4.6.1.

**Los comandos de compilación están escritos aquí pero no se corren hasta la validación final** (regla del dueño: nada de builds hasta terminar el plan).

## 1. Qué cambia con un push a `main` y qué no

- Un push a `main` despliega la web y la API (Dokploy). **Las pantallas del panel se actualizan solas en todos los teléfonos**: no hay que tocar la app.
- Solo si cambias el código del cascarón (`apps/mobile`) hay que publicar algo aparte.

| Cambió… | Se publica | El teléfono |
|---|---|---|
| Solo JS de `apps/mobile/src/` | **Actualización interna (OTA)** | Nada: la baja y la aplica sola |
| Paquete nativo, plugin o permiso (`apps/mobile/package.json`, `app.json`, `app.config.ts`), SDK, ícono o nombre | **APK nueva** | Aviso «Hay una versión nueva» → Instalar (Android pide confirmar) |

En duda, APK nueva (una OTA con código nativo faltante truena al abrir).

Regla del **runtime**: una OTA solo llega a las APK con la misma `version` de `apps/mobile/app.json`. OTA: no se toca `version`. APK nueva: se sube `version` **y** `android.versionCode`. Antes de publicar, agrega la entrada en `apps/mobile/src/actualizaciones/novedades.ts` (la más nueva primero; la prueba falla si la primera no es la `version` de `app.json`).

## 2. Crear las llaves (una sola vez)

Todo vive en el servidor, en `~/.chevecheve-actualizaciones/`. **Nunca** en git.

```bash
mkdir -p ~/.chevecheve-actualizaciones && chmod 700 ~/.chevecheve-actualizaciones
```

**Llave de las actualizaciones (OTA):**

```bash
openssl genrsa -out ~/.chevecheve-actualizaciones/llave-privada.pem 2048
chmod 600 ~/.chevecheve-actualizaciones/llave-privada.pem
openssl req -new -x509 -key ~/.chevecheve-actualizaciones/llave-privada.pem -out apps/mobile/certs/certificado.pem -days 3650 -subj "/CN=Chevecheve OTA"
```

El `certificado.pem` (público) **sí se sube a git**; la `llave-privada.pem` no.

**Llave de la APK (firma de Android):**

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore ~/.chevecheve-actualizaciones/android-release.p12 \
  -alias chevecheve -keyalg RSA -keysize 2048 -validity 10000
chmod 600 ~/.chevecheve-actualizaciones/android-release.p12
```

Guarda las contraseñas en `~/.chevecheve-actualizaciones/android-release.env` (permiso 600):

```bash
export CHV_APK_ALMACEN=$HOME/.chevecheve-actualizaciones/android-release.p12
export CHV_APK_ALMACEN_CLAVE='...'
export CHV_APK_ALIAS=chevecheve
export CHV_APK_LLAVE_CLAVE='...'
```

La compilación de release **falla** si faltan estas variables (nunca usa la llave de depuración).

**Respaldo:** copia toda la carpeta `~/.chevecheve-actualizaciones/` fuera del servidor (gestor de contraseñas o USB cifrada). **Perder la llave = APK nueva con certificado nuevo, instalada a mano en cada teléfono.**

## 2.1 Push: la cuenta de servicio de Firebase (una sola vez)

1. En Firebase: Configuración del proyecto › Cuentas de servicio › Generar nueva clave privada. Baja el JSON.
2. Cópialo al servidor, **fuera del repo**, y dale permiso de lectura: `chmod 644 ~/.chevecheve-actualizaciones/fcm.json` (la carpeta ya es 700).
3. En Dokploy define la variable `FCM_ARCHIVO=/home/<usuario>/.chevecheve-actualizaciones/fcm.json` (ruta del archivo en el servidor). El compose lo monta **solo lectura** en el contenedor de la API como `/run/secrets/fcm.json`, que es el valor por omisión de `FCM_CUENTA_SERVICIO`.
4. Al arrancar, la API revisa que el archivo exista y traiga `client_email`, `private_key` y `project_id`. Si no, escribe **un** error claro en el log («FCM_CUENTA_SERVICIO … el envío de push queda apagado») y sigue funcionando sin push.

El archivo debe existir antes del primer despliegue; si no, Docker crea una carpeta en su lugar y el push queda apagado.

## 3. Primera APK (instalación a mano en los 2 teléfonos)

Hace falta `google-services.json` de Firebase (push) en `apps/mobile/` (nunca va a git).

```bash
source ~/.chevecheve-actualizaciones/android-release.env
export EXPO_PUBLIC_URL_PANEL=https://<dominio del panel>
bash apps/mobile/scripts/compilar-apk.sh
```

Deja la APK en `~/.chevecheve-actualizaciones/apk/chevecheve-<versionCode>.apk`. Pásala a cada teléfono, ábrela y permite «instalar apps de esta fuente». Después, las APK nuevas se instalan desde el aviso de la propia app.

## 4. Publicar una OTA (solo JS)

**Siempre después** de que el despliegue de web y API esté en verde.

```bash
cd apps/mobile
export EXPO_PUBLIC_URL_PANEL=https://<dominio del panel>
npx expo export --platform android --output-dir /tmp/chv-dist
npx expo config --json --type public > /tmp/chv-expo-config.json
cd ../..
npm run ota:publicar --prefix apps/api -- --dist /tmp/chv-dist --runtime <version de app.json> \
  --llave ~/.chevecheve-actualizaciones/llave-privada.pem --expo-config /tmp/chv-expo-config.json \
  --url-base https://<dominio del panel> --salida /tmp/chv-publicar
docker cp /tmp/chv-publicar/. <contenedor de la api>:/datos/actualizaciones/
```

El script imprime el `id` de la actualización: anótalo (sirve para regresar). Los teléfonos la bajan al abrir la app, y la aplican al abrir o al volver tras 5 minutos; nunca reinician con algo sin guardar. «Esta app» en `/notificaciones` tiene el botón «Buscar actualización».

## 5. Publicar una APK nueva

Sube `version` y `android.versionCode` en `app.json`, compila (sección 3) y publica:

```bash
npm run ota:publicar-apk --prefix apps/api -- --apk ~/.chevecheve-actualizaciones/apk/chevecheve-<versionCode>.apk \
  --version-code <versionCode> --version-name <version> --runtime <version> --notas "Qué trae, en palabras del negocio" \
  --salida /tmp/chv-publicar-apk
docker cp /tmp/chv-publicar-apk/. <contenedor de la api>:/datos/actualizaciones/
```

- Nunca repite un `versionCode` ya publicado.
- Agrega `--obligatoria` **solo** si las apps viejas dejarían de funcionar o serían peligrosas (pantalla «Actualiza la app para seguir», sin «Más tarde»).

## 6. Regresar a una versión buena

Si una OTA salió mal (usa el `id` de la que sí servía):

```bash
npm run ota:regresar --prefix apps/api -- --runtime <version> --a <id bueno> \
  --llave ~/.chevecheve-actualizaciones/llave-privada.pem --salida /tmp/chv-publicar
docker cp /tmp/chv-publicar/. <contenedor de la api>:/datos/actualizaciones/
```

Vuelve a emitir esa versión con un id nuevo, así también regresan los teléfonos que ya habían bajado la mala.

## 7. Problemas comunes

- **No llega el push**: en `/notificaciones` toca «Activar avisos» y acepta el permiso; revisa que `FCM_CUENTA_SERVICIO` apunte al JSON de la cuenta de servicio y que el usuario tenga ese aviso marcado en «Qué avisos quiero en el celular».
- **«Sin conexión»**: es la señal del teléfono o el panel caído; toca Reintentar.
- **El teléfono no se actualiza**: ¿el `runtime` de la OTA es igual a la `version` instalada? ¿La copiaste con `docker cp` al volumen `actualizaciones`? Prueba `https://<dominio>/api/movil/actualizaciones/apk` (debe responder `null` o JSON, nunca error).
- **Firma inválida**: el `certificado.pem` de la APK no es el de la `llave-privada.pem` con que publicaste. Hay que instalar una APK nueva con el certificado correcto.

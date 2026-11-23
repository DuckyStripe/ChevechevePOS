# apps/mobile — cascarón Android (fase F4)

Aún no tiene código. Se construye en F4 (`docs/PLAN.md`, `docs/CONTRATOS.md` §4.6).

- Es una app Expo para Android que muestra el panel web (`apps/web`) en un WebView. No tiene
  pantallas de negocio propias: nada se construye dos veces.
- Lo nativo que agrega: push FCM, abrir la pantalla exacta desde un push, cámara y archivos,
  ubicación, mantener la pantalla encendida durante la ruta, y abrir wa.me, Maps, Waze y `tel:`
  en su app.
- **No la despliega Dokploy.** Dokploy levanta `db`, `api` y `web` con `docker-compose.yml`.
- **Actualización: se copia el mecanismo de chachaplancha** (`~/proyectos/chacha/chachaplancha-manager`:
  `docs/deploy/actualizar-app.md`, `docs/planes/spec-actualizaciones-app.md`, `app/src/features/app-updates/`,
  `app/app.config.ts`).
  - **Las pantallas de negocio** se actualizan solas con cada push a `main`, porque la app muestra
    el panel web.
  - **El código JS del cascarón** se actualiza por OTA interna, con `expo-updates` y un servidor
    propio de manifiestos firmados. Se aplica sola al abrir la app o al volver después de 5 minutos
    o más, y nunca reinicia sobre algo sin guardar. Si una actualización sale mal, se regresa a la
    anterior (rollback).
  - **APK nueva** solo cuando cambia algo nativo. La app la descarga y la instala desde dentro. Con
    `--mandatory` bloquea las versiones viejas, pero nunca bloquea si no hay red.
  - **Novedades** en `changelog.ts`, obligatorias en cada publicación.
  - **Llaves** (firma de OTA y firma de APK) solo en el servidor y respaldadas fuera; nunca en git.
- Nunca entran al repo: `google-services.json` y la llave de firma.

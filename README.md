# ChevechevePOS

Sistema para una bodega de cerveza (México) que surte en caliente a tiendas pequeñas:
pedidos por link personal del cliente, surtido, rutas de reparto, cobro y fiado. Todo en español.

## Estructura

```
apps/api/    Fastify 5 + TypeScript + PostgreSQL (puerto 3860)
  db/migraciones/   NNN_*.sql, aplicadas por scripts/migrar.mjs
apps/web/    Next.js 16 (App Router) + Tailwind v4; es el BFF (puerto 3760)
apps/mobile/ (F4) cascarón Expo Android: WebView del panel + push FCM
docs/        CONTRATOS.md (manda), PLAN.md, PREGUNTAS-NEGOCIO.md, legado/
legacy/      front CRA anterior (solo referencia, no se toca)
```

El navegador solo habla con `web`; `web` habla con `api` por la red interna. La API no se publica.

## Desarrollo

```bash
cp .env.example .env                                   # ajusta secretos
docker compose -f docker-compose.dev.yml up -d --build  # db :5436, api :3860, web :3760
```

Sin Docker para api/web (con la db del compose levantada):

```bash
cd apps/api && npm install && npm run migrar && npm run dev
cd apps/web && npm install && npm run dev
```

Validación: `npm run lint` y `npm run typecheck` en `apps/api`; `npm run lint` y `npx tsc --noEmit` en `apps/web`.

Pruebas de la API: `npm run prueba --prefix apps/api` (con `db` de desarrollo arriba). Recrea y migra la base
`chevechevepos_pruebas` (el script rechaza cualquier otro host, puerto o base) y corre vitest;
`npm run prueba --prefix apps/api -- test/sql` corre solo las pruebas SQL.

## Variables de entorno

Ver `.env.example` y la tabla completa en `docs/CONTRATOS.md` §3.1. Obligatorias en producción:
`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `JWT_SECRET` y `SECRETO_ENLACES` (mín. 32 caracteres;
la API rechaza valores de ejemplo). Opcionales: `SESION_WEB_HORAS` (12), `SESION_APP_DIAS` (30),
`FCM_CUENTA_SERVICIO` (ruta a un JSON montado), `ARCHIVOS_DIR` (`/datos/archivos`), `COOKIE_SECURE`
(`true` en producción), `DATABASE_URL_PRUEBAS` (solo local). La sesión del panel es la cookie `chv_jwt`;
no existen `SESSION_SECRET` ni `JWT_EXPIRES_IN`.

## Respaldos

El servicio `respaldo` de `docker-compose.yml` hace cada día a las 03:00 (hora de Ciudad de México)
`pg_dump` y un `tar` de los archivos (14 diarios + 8 semanales) y los copia con rclone a `RESPALDO_DESTINO`.
En Dokploy hay que definir `RESPALDO_DESTINO` y montar el `rclone.conf` en `RESPALDO_RCLONE_CONF`
(por omisión `/run/secrets/rclone.conf`); sin ellos el estado queda `ok=false`. La API lo muestra en
`GET /health` (`respaldo`). Detalle y prueba de restauración: `docs/CONTRATOS.md` §3.2.

## Despliegue en Dokploy

Aplicación tipo Compose apuntando a este repo, `Compose Path: ./docker-compose.yml`, rama `main`.
Variables en la pestaña Environment. Dominio sobre el servicio `web`, puerto 3760. Requiere la red
externa `dokploy-network`. La API aplica las migraciones al arrancar (`RUN_MIGRATIONS_ON_BOOT`).

## Documentación

- `docs/CONTRATOS.md`: fuente de verdad (esquema, rutas, firmas).
- `docs/PLAN.md`: plan de desarrollo.
- `docs/legado/`: material del sistema anterior.

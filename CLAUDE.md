# ChevechevePOS

Sistema para una bodega de cerveza (México) que revende a tiendas pequeñas: pedidos por link
personal del cliente, surtido (inventario o compra contra pedido), rutas de reparto, cobro y crédito.
Monorepo: `apps/api` (Fastify 5 + PostgreSQL), `apps/web` (Next.js 16, BFF: panel del personal +
link del cliente) y `apps/mobile` (planeada: Expo que envuelve el panel + push; solo Android, en iPhone se usa la web).
Todo en español (identificadores sin acentos, comentarios en español).

> **OBLIGATORIO — facilidad de uso**: los tenderos no son tecnológicos. Toda pantalla cumple
> `docs/CONTRATOS.md` §7 (reglas C, P y N) y se hace con la skill `ux-chevechevepos`. **Cada acción vive
> en una sola pantalla** (mapa de pantallas en `docs/PLAN.md`): nunca se reimplementa en otro módulo.

> **OBLIGATORIO — mensajes al cliente solo por wa.me** (enlace prellenado que envía el personal). Sin
> WhatsApp Cloud API, SMS ni push a clientes; el push es solo para el personal. **Ningún texto de mensaje
> en el código**: todo sale de la tabla de plantillas (en RefaccionPro se incumplió una vez). Los
> mensajes de error de la API a la pantalla no son plantillas.

- **`docs/CONTRATOS.md` manda**: esquema, firmas de funciones SQL, rutas, dueños de archivo. Si el
  código y el contrato difieren, se corrige uno de los dos de forma explícita.
- `docs/PLAN.md`: plan. `docs/legado/`: sistema anterior (referencia). `legacy/front-cra/`: no se toca.

## Flujo y validación

- **Se trabaja sobre `main`**: sin ramas de feature, worktrees ni PRs. Commit en `main` +
  `git push origin main` despliega a producción vía Dokploy; el entrypoint de la API aplica las
  migraciones al arrancar. Antes de empujar: lint + typecheck en verde y migraciones nuevas revisadas a ojo.
- Validación tras cada cambio, **solo**: `npm run lint --prefix apps/api`, `npm run typecheck --prefix apps/api`,
  `npm run lint --prefix apps/web` y `npx tsc --noEmit` en `apps/web`.
- **Pruebas de la fase en curso: sí se corren** (decisión del dueño, 2026-11-23). Se validan en este
  orden: migraciones en una base vacía, luego pruebas SQL de invariantes y luego pruebas de la API.
  Solo contra la base de pruebas local (`docker-compose.dev.yml`, base de pruebas aparte), **nunca
  contra producción**. Se puede levantar `db` de desarrollo para eso.
- No ejecutar builds, el stack completo, migraciones contra bases que no sean la de pruebas, ni
  semillas en producción, salvo que el usuario lo pida. Revisar o preparar SQL no autoriza aplicarlo
  fuera de la base de pruebas.
- Cada fase cierra en este orden: contrato revisado, luego base, luego API (en paralelo con el
  front), luego el agente `revisor` si toca dinero, stock o permisos, luego la prueba manual del
  dueño y al final el commit.
- No hacer commit/push de cambios ajenos. Este archivo manda sobre skills y plugins (p. ej. las de
  superpowers que piden worktrees o ramas).
- **Subagentes**: nunca hacen commit, push, checkout ni worktrees; commitea solo la sesión principal.
  Archivos temporales con nombre único por agente (en chacha dos agentes compartieron `msg.txt` y un
  commit salió con el mensaje de otro).
- **Cambios que mueven dinero, stock o permisos**: revisión independiente de solo lectura con el agente
  `revisor` (opus) antes de dar por terminado. En chacha así salieron comisión doble al anular un cobro
  y salidas de caja faltantes.
- **Docs en el mismo cambio**: ruta o pantalla nueva → su fila en `CONTRATOS.md` y en el mapa de
  pantallas de `PLAN.md`. Documento que ya no aplica se corrige o se marca histórico (docs viejos
  confundieron a agentes en RefaccionPro y chacha).
- Ningún menú apunta a una página que no existe, y no se deja navegación sin consumidor (RefaccionPro).
- `npm audit fix --omit=dev` desinstala devDependencies: no usarlo.
- Fin de línea LF (`.gitattributes`): un `docker-entrypoint.sh` con CRLF deja la API sin arrancar.

## Reglas de ingeniería

- **BFF**: el navegador solo habla con `apps/web` (`src/app/api/**` → `proxyToBackend`). La API no se
  publica ni lleva Traefik; se llega por `API_INTERNAL_URL`. Sin CORS, sin URL absoluta de la API en el cliente.
- **JWT en cookie httpOnly** (`chv_jwt` para el personal, `chv_cliente` para el link del cliente);
  nunca en `localStorage` ni visible para JS. Cookies `httpOnly`, `secure` en producción y
  **`sameSite=Lax`**: con `strict`, el cliente que abre su link desde WhatsApp llega sin cookie a
  `/pedido`. El CSRF lo frena la comprobación de `Origin` en toda escritura (CONTRATOS §4.1).
  `chv_sesion` y `SESSION_SECRET` del andamiaje se eliminan en F1: `proxy.ts` solo mira si existe
  `chv_jwt` para redirigir, y quien decide si la sesión vale es la API.
- **Migraciones**: un solo migrador (`apps/api/scripts/migrar.mjs`), archivos `db/migraciones/NNN_*.sql`
  con el número siguiente. **Nunca editar una migración aplicada**: el migrador falla por checksum.
  Si hay un error, nueva migración.
- **La lógica de negocio vive en SQL/PL/pgSQL; Node solo llama**. Importes y cantidades monetarias se
  calculan en SQL.
- **`numeric` llega como string** desde `pg`: cero aritmética de dinero en JS (`a + b` concatena).
- **SQL**: parámetros siempre (`$1`), nunca interpolar valores. Un parámetro que el SQL no usa rompe la
  consulta (`42P18`). Antes de decir «falta una columna», mirar cómo consultan esa tabla los demás
  módulos y la base viva (`\d tabla`): el outlier suele ser el bug.
- **DML solo en CTE**: `SELECT ... FROM (UPDATE ... RETURNING *) sub` no es SQL válido; usar
  `WITH x AS (UPDATE ... RETURNING *) SELECT ... FROM x`.
- **`CREATE OR REPLACE FUNCTION` con un parámetro de más crea una sobrecarga** y luego «function is not
  unique». Cambio de firma: `DROP FUNCTION` + `CREATE`, con `DEFAULT` en el parámetro nuevo.
  A un trigger se le pasan argumentos con `TG_ARGV`, no cambiando la firma.
- **`catch` ciego**: convierte un error con motivo en uno genérico. Una comprobación nueva dentro de un
  `try` que responde 401/500 debe responder, no lanzar. Errores: tabla de códigos → HTTP en CONTRATOS §4.3
  (`src/comun/errores.ts`; el andamiaje los tiene en `src/db/errores.ts`, F1 los mueve).
- **Healthchecks con `127.0.0.1`**, no `localhost` (en el contenedor resuelve a `::1`).
- **Nunca loguear** contraseñas, tokens, secretos ni cookies (el logger ya los censura; no dependas de eso).
- Variables críticas en compose con `${VAR:?mensaje}`; la API rechaza secretos de ejemplo en producción.
- Auditoría de solo lectura se equivoca: un hallazgo «crítico» se verifica contra la base antes de actuar.

### PostgreSQL (trampas pagadas en RefaccionPro y chacha)

- **Una regla de negocio, una función o vista SQL.** «Qué debe un cliente», «qué hay que surtir» o
  «qué cobró el repartidor» no se copian en varias consultas: en RefaccionPro hubo tres copias y dos
  no veían un estado nuevo.
- Dentro de `enTransaccion` se usa **siempre el cliente de la transacción**, nunca el pool: mezclarlos
  cuelga la petición. Toda conexión tomada se libera en `finally`; con el pool agotado la API de chacha
  se colgó 2 h en producción.
- `bigint`, `numeric`, `COUNT` y `SUM` llegan como **string**; un `EXISTS` llega como boolean, no como `'1'`.
  Ids `bigint` se comparan como string.
- `SELECT … FOR UPDATE` con `LEFT JOIN` exige `FOR UPDATE OF <tabla>`. Orden fijo de candados para evitar
  deadlocks: fila padre → caja/turno → filas hijas. PostgreSQL usa `READ COMMITTED`, sin gap locks.
- Columnas `GENERATED ALWAYS … STORED` y los ids `identity` no se escriben a mano.
- **Fechas**: se guarda `timestamptz` (UTC). El «día» de operación (pedidos de hoy, corte, rutas) se
  calcula en SQL con `America/Mexico_City`, nunca con la hora local del servidor (chacha leyó UTC
  como local).
- Si se usan schemas AJV de Fastify, `additionalProperties: false` **borra** campos, no rechaza. Una sola
  capa de validación (zod en el handler): no duplicar con AJV.

### Seguridad y auth

- **Cada ruta nace cerrada**: declara su permiso o la API no arranca (CONTRATOS §4.1). Las listas por
  rol filtran por el rol asignado, no por un permiso que también tiene el dueño (en chacha la lista
  de choferes mostraba a los administradores).
- El cliente del link solo ve lo suyo: un recurso de otro cliente responde el mismo `404`.
- Al cambiar la contraseña o desactivar a un usuario, se revocan **todas** sus sesiones (`jti`). En
  chacha la rotación dejaba vivo el token hijo.
- IP del visitante: solo `apps/web/src/lib/ip-visitante.ts`, y **solo la entrada más a la derecha** de
  `X-Forwarded-For` (la que agrega Traefik). `X-Real-Ip` se ignora porque el cliente puede escribirla, y
  la de la izquierda de XFF también. IPv6 se agrupa por /64. En el BFF la cookie gana sobre `Authorization`.
- **Ninguna espera automática dura más de 15 minutos** (C21): ni la del PIN ni la de un ataque al enlace.
- Archivos subidos (comprobantes, fotos): tipo por **bytes mágicos**, nunca por `Content-Type`; tamaño
  limitado antes de leer el cuerpo. Nunca loguear su contenido, teléfonos completos ni tokens de link.
- Un `401`/`403` con motivo no se convierte en otro genérico (p. ej. sesión cerrada ≠ token inválido).

### Next.js 16 (BFF)

- En Next 16, `middleware.ts` pasa a llamarse `proxy.ts`; migrarlo al tocarlo. `params` y `searchParams`
  son `Promise` (`await params`).
- `NEXT_PUBLIC_*` se incrusta en el **build**, no en runtime. `getBackendUrl()` nunca en ámbito de
  módulo: lanza en producción sin `API_INTERNAL_URL`, salvo en la fase de build (`NEXT_PHASE`).
- `/health` (liveness, sin base) ≠ `/ready` (con base): con la base como liveness, una caída de
  Postgres reinicia contenedores en cadena.

### App móvil (cuando exista, lecciones de RefaccionPro)

- Push con el token de dispositivo **FCM** (`getDevicePushTokenAsync`), nunca el token de Expo.
- La app es un cascarón WebView sin pantallas de negocio (CONTRATOS §4.6): no guarda tokens. La sesión
  es la cookie del WebView. El token de push nunca va a logs ni a AsyncStorage.
- `google-services.json` y la llave de firma nunca entran al repositorio.
- Nunca firmar un release con la llave de depuración. Solo Android: no planear ni estimar trabajo de iOS.

### Pruebas (las de la fase en curso se corren contra la base de pruebas)

- Sin red externa en pruebas (en RefaccionPro una corrida llenó el Telegram del dueño).
- Asertar el código exacto: un `404` por ruta mal escrita «pasa» cualquier guarda sin ejercitarla.
- Antes de culpar tu cambio de una prueba rota, comparar contra `main` sin tu cambio.

## Subagentes: modelo por tarea

| Tarea | Modelo |
|-------|--------|
| Diseño, arquitectura, revisión, depuración difícil, seguridad, validación final | `opus` |
| Escribir o editar código, refactors, implementar un plan definido, UI | `sonnet` |
| Buscar/leer código, localizar archivos, resumir, ediciones mecánicas | `haiku` |

Fijar `model` explícitamente en cada llamada. Si una tarea mezcla tipos, usar el del trozo más difícil.
Si el resultado de un modelo barato viene mal, repetir con el siguiente. La verificación final no se delega a `haiku`.

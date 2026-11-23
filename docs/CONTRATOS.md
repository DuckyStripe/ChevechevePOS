# ChevechevePOS — Contratos (fuente de verdad)

> Este archivo manda sobre código, planes y skills. Cambiar un contrato = editar aquí primero, en el
> mismo commit que el código. Supuestos de negocio no confirmados: `docs/PREGUNTAS-NEGOCIO.md` (se citan
> como **[Pn]**). Sistema viejo (solo referencia de pantallas): `docs/legado/contrato-api-php.md`.
>
> **Revisión 2026-11-23.** El centro del sistema pasa del mostrador a **pedidos de clientes por enlace +
> reparto por rutas**. Los clientes son tiendas pequeñas (abarrotes, misceláneas) que no facturan: **los
> precios son finales, sin desglose de impuestos** [P8/P9/P10 resueltas]. Hoy piden por llamada o
> WhatsApp; el enlace personal reemplaza ambos y el personal sigue capturando los pedidos por llamada.
> **El único canal hacia el cliente es `wa.me`** (enlace de WhatsApp prellenado que el personal abre y
> envía a mano): sin WhatsApp Cloud API, sin SMS, sin push a clientes. El push es solo para el personal.
> **Una sola interfaz del personal**: el panel web, en el navegador (PC, iPhone, PWA instalable) y dentro de
> un cascarón Android (`apps/mobile`) que solo agrega lo nativo (push, cámara, ubicación, enlaces
> profundos). Hoy el personal son 2 personas que hacen todo. El POS de mostrador sigue, pero es secundario. Nada estaba implementado salvo `000_base.sql` (F0), así que las migraciones se
> renumeraron.

## 0. Reglas generales

- Un negocio, una base, esquema `app`. **No es multi-tenant.** `sucursal_id` existe en inventario, caja,
  ventas, compras, pedidos, rutas, abonos y folios para que una segunda bodega no obligue a reescribir;
  hoy hay una (id 1) y no hay pantallas de sucursales ni traspasos.
- Español en todo. Identificadores sin acentos, `snake_case` en SQL, `camelCase` solo en TS local.
- Tablas sin prefijo (`app.venta`, el esquema ya agrupa). PK `id bigint generated always as identity`
  (excepción: `sesion.jti uuid`, tablas puente con PK compuesta). FK `<entidad>_id`. Nombres de
  restricción: `ck_`, `uq_`, `fk_`, `idx_`. Fechas `timestamptz not null default now()` con nombre
  `*_en`; día de negocio `date`. Vocabularios cerrados con `CHECK (x IN (...))`, nunca `enum`.
- **Dinero**: `numeric(12,2)`, siempre **precio final** (lo que paga el cliente; no hay IVA/IEPS
  separados en ninguna tabla ni reporte). Costo por pieza: `numeric(14,6)`. Coordenadas: `numeric(9,6)`.
  **Toda aritmética de dinero en SQL**; `pg` entrega `numeric` como string y la API lo pasa tal cual.
  En JSON el dinero viaja como string `"1234.50"`; cantidades como entero.
- **Cantidades de inventario siempre en piezas (unidad base, `integer`)**. Una presentación (six, caja)
  es `factor` piezas. Nunca se guarda existencia en cajas.
- Día de negocio = `(ts at time zone 'America/Mexico_City')::date` vía `app.fn_fecha_local(ts)`.
  Filtros `desde/hasta` de la API son fechas locales inclusivas.
- La lógica que mueve dinero, inventario o estados de pedido/ruta vive en funciones PL/pgSQL (`app.fn_*`)
  que corren en una sola transacción. La API valida forma (zod), permisos y llama la función; no
  recalcula nada. **Única excepción**: el orden de paradas de una ruta se calcula en TS (§2.7.1, cálculo
  puro sin dinero ni inventario) y se guarda con una función SQL que valida.
- Errores de negocio desde SQL: `RAISE EXCEPTION '<CODIGO>' USING ERRCODE = 'P0001', DETAIL = <json>`.
  La API traduce `CODIGO` a HTTP con la tabla de §4.3 y pasa `DETAIL` como `detalles`.
- Toda transacción de escritura de la API empieza con `select set_config('app.usuario_id', $1, true)`
  (vacío `''` si no hay usuario; quien lo lea usa `nullif(current_setting('app.usuario_id', true), '')::bigint`,
  nunca `::bigint` directo, que falla con cadena vacía)
  (helper `conUsuario` de F1; en rutas de cliente, `app.usuario_id` queda vacío y se fija
  `app.cliente_id`). Lo lee el disparador de auditoría.
- Migraciones: `apps/api/db/migraciones/NNN_nombre.sql`, nunca se edita una aplicada; cambio = archivo
  nuevo. `CREATE OR REPLACE FUNCTION` con firma distinta crea sobrecarga: cambio de firma = `DROP` +
  `CREATE`. `000_base.sql` (F0, ya existe) crea el esquema y las extensiones `citext` y `pgcrypto`.
- Permiso nuevo en una migración: `INSERT INTO app.permiso`; el disparador lo concede solo al rol de
  sistema (dueño). Concederlo a otros roles semilla en la misma migración.
- **Textos al usuario final nunca en código**: mensajes de WhatsApp, títulos y cuerpos de push y textos
  de las páginas públicas salen de `app.plantilla` (§2.1). El código solo conoce la clave.
- Nunca se loguean teléfonos completos, tokens de enlace, tokens de push, JWT, PIN ni contenido de comprobantes.
- **REGLA MAYOR: el sistema nunca le quita el acceso a un cliente por sí solo.** Detecta y avisa
  (notificación + marca en `/clientes`); **una persona del personal decide**. Solo estas acciones
  explícitas cambian el acceso: generar o revocar el enlace (`fn_generar_enlace`, `fn_revocar_enlace`),
  quitar un dispositivo (`fn_quitar_dispositivo`), restablecer el PIN (`fn_restablecer_pin`) y desactivar
  al cliente (`PATCH /api/clientes/:id {activo:false}`). Las esperas automáticas (PIN, límites por IP) son
  temporales (≤ 15 min) y nunca permanentes. Ningún proceso automático escribe `revocado_en`,
  `quitado_en` ni `cliente.activo`.

## 1. Glosario

| Término | Significado |
|---|---|
| Cliente | Negocio que compra: tienda de abarrotes, miscelánea, depósito (`tipo_negocio`). Tiene lista de precio, ubicación, zona, días de visita, crédito y un enlace personal. Es la única entidad de cliente del sistema. |
| Público en general | Venta de mostrador sin `cliente_id`; usa la lista predeterminada; no puede ir a crédito. |
| Enlace personal | URL secreta del cliente (`/p/<token>`), sin contraseña: catálogo para pedir, seguimiento de sus pedidos, respuesta a faltantes y su saldo. Se busca por hash; el token va cifrado para poder incluirlo en cada aviso. Regenerarlo invalida el anterior. |
| Pedido | Lo que pide un cliente (por enlace o capturado por el personal desde WhatsApp). No mueve inventario ni dinero; al **entregarse** genera una venta. |
| Despacho | Revisar, confirmar y ajustar pedidos, fijar fecha de entrega y asignarlos a rutas. |
| Faltante | Línea de pedido que no se puede surtir completa (sin existencia, el distribuidor no tenía). El personal propone opciones (sustituto, reducir) y el cliente elige desde su enlace; mientras, el pedido está `esperando_cliente`. |
| Equivalente | Producto que se ofrece como sustituto de otro (configurado por producto). |
| Aviso al cliente | Mensaje de WhatsApp pendiente de enviar: lo crea un evento, el personal lo abre como `wa.me`, lo envía y lo marca enviado. |
| Modo de surtido | Por producto: `inventario` (hay existencia en bodega) o `contra_pedido` (se compra al distribuidor después de recibir pedidos, «dropshipping»). |
| Lista de surtido | Para una fecha de entrega: piezas que faltan comprar (pedidos confirmados − disponible), agrupadas por proveedor. Se calcula al vuelo, no se guarda. |
| Comprometido | Piezas de pedidos confirmados/cargados aún no entregados. No es un apartado físico: es una vista. |
| Ruta | Salida de un vehículo con un repartidor en una fecha: paradas ordenadas, orden de carga, turno de cobro y liquidación. |
| Parada | Visita a un cliente dentro de una ruta: `entrega` (con pedido) o `cobro` (solo abono). |
| Orden de carga | Inverso del orden de entrega (LIFO): se sube primero lo de la última parada para que la primera quede en la puerta. |
| Liquidación | Cierre del turno de ruta del repartidor: efectivo esperado (SQL) vs entregado = diferencia. Es un turno de caja `tipo = 'ruta'`. |
| Producto | Lo que se cuenta en inventario, en piezas. Ej. «Corona 355 ml lata». |
| Pieza | Unidad base: una lata o botella. `existencia.cantidad` está en piezas. |
| Presentación | Forma de comprar/vender un producto: Pieza (factor 1), Six (6), Caja 12, Caja 24… Tiene código de barras y precio por lista. Todo producto tiene la de factor 1 (puede no venderse suelta) [P1]. Puede haber dos presentaciones con el mismo factor (nombre distinto). |
| Factor | Piezas por presentación. Inmutable una vez creada la presentación. |
| Lista de precio | Juego de precios finales por presentación: Menudeo (predeterminada), Mayoreo, … Cada cliente tiene una [P4]. |
| Movimiento de inventario | Fila inmutable del kárdex. Toda variación de existencia es un movimiento. |
| Costo promedio | Costo ponderado por pieza y sucursal (`existencia.costo_promedio`), recalculado en cada entrada. |
| Costo de venta | Costo promedio vigente al vender, congelado en `venta_linea.costo_unitario`. Utilidad = importe − costo. |
| Merma | Salida sin venta con causa: `caducado`, `danado`, `faltante`, `regalo`, `otro`. Pega a utilidad. |
| Turno de caja | Periodo de cobro de un usuario: `mostrador` (una caja física) o `ruta` (el repartidor durante su ruta). Fondo → cobros/abonos/movimientos → corte o liquidación. |
| Cuenta por cobrar (CxC) | Cargo a un cliente (parte a crédito de una venta o saldo inicial). Tiene saldo y vencimiento. |
| Abono | Pago de un cliente contra sus CxC (en mostrador o en ruta); FIFO por vencimiento o a cuentas elegidas. |
| Devolución | Regreso parcial o total de piezas de una venta; reduce primero el saldo de su CxC y el resto se reembolsa en efectivo. |
| Cancelación | Anula una venta completa (sin devoluciones ni abonos). Revierte inventario, CxC y efectivo. |
| Clave de idempotencia | UUID que genera el navegador (también dentro del cascarón) por operación (pedido, venta, entrega, compra, abono, devolución). Repetirla devuelve la misma operación. |
| Cascarón Android | `apps/mobile`: app Expo que muestra el panel web en un WebView (misma URL, misma cookie) y agrega solo push, enlace profundo desde el push, cámara/archivos, ubicación, pantalla encendida y su propia actualización (§4.6). No tiene pantallas propias de negocio. |
| Folio | Consecutivo por sucursal y serie: `P-` pedido, `R-` ruta, `V-` venta, `C-` compra, `D-` devolución, `A-` abono. |
| Plantilla | Texto editable con variables `{{nombre}}` para WhatsApp, push o pantallas públicas. |
| Seguimiento | Vista del pedido en el enlace del cliente: etapa, línea de tiempo, faltantes por responder y, en ruta, «eres la parada 4 de 9» con hora estimada. |
| Notificación | Aviso a un usuario del personal (lista en panel/app) con envío push opcional por dispositivo (outbox). |
| Envase retornable | Caja/botella que se presta y se cobra con depósito. **Diferido** (F10) [P7]. `producto.tipo_envase = 'retornable'` solo lo marca. |

## 2. Esquema

Plan de migraciones (`apps/api/db/migraciones/`). Número fijo por fase: fases en paralelo no chocan
(F5 y F6 son paralelas: 006 no depende de 007 ni al revés).

| Archivo | Fase | Contenido |
|---|---|---|
| `000_base.sql` | 0 | ya existe: esquema `app`, `citext`, `pgcrypto` |
| `001_auth.sql` | 1 | sucursal, rol, permiso, rol_permiso, usuario, sesion, configuracion, auditoria, folio, plantilla, notificacion, notificacion_preferencia; `fn_fecha_local`, `fn_siguiente_folio`, `fn_tiene_permiso`, `fn_auditar`, `fn_render_plantilla`, `fn_notificar`; disparadores de rol de sistema y último dueño; semilla |
| `002_catalogo_inventario.sql` | 2 | proveedor, categoria, marca, producto, presentacion, lista_precio, precio, precio_oferta (§2.12 A8), existencia, movimiento_inventario; `fn_normalizar`, `fn_buscar_productos`, `fn_precio`, `fn_margen_objetivo` (A1), `fn_aplicar_movimiento`, `fn_ajustar_inventario`, `fn_contar_inventario`; `v_precio_bajo_costo`; protecciones; semilla |
| `003_compras.sql` | 2 | compra, compra_linea (con caducidad); `fn_registrar_compra`, `fn_cancelar_compra`, `fn_margenes_compra` (A1); `v_por_caducar` |
| `004_clientes_pedidos.sql` | 3 | zona, cliente (+ `sugerir_pedido`, B5), cliente_enlace, cliente_dispositivo, cliente_pin_espera, cliente_visita, cliente_favorito, cliente_alias (B6), producto_equivalente, pedido, pedido_linea, propuesta_faltante, propuesta_opcion, pedido_evento, aviso_cliente; `v_comprometido`, `v_cadencia_cliente` (B5); funciones de enlace, PIN, alertas, pedido, faltantes, seguimiento, avisos, `fn_vista_borrador`, `fn_sugerir_pedidos`, `fn_aceptar_propuesto` (B5) |
| `005_push.sql` | 4 | dispositivo, notificacion_envio; disparadores de encolado y revocación; `fn_registrar_dispositivo` (las actualizaciones del cascarón no usan tablas: son archivos, §4.6) |
| `006_surtido.sql` | 5 | promocion_proveedor, fecha_demanda (B7); `fn_lista_surtido`, `fn_publicar_surtido` |
| `007_rutas.sql` | 6 | vehiculo, ruta, ruta_parada; funciones de ruta (asignar, ordenar, cargar, no entregado, terminar) |
| `008_ventas_cobro.sql` | 7 | caja, turno_caja, movimiento_caja, venta, venta_linea, venta_pago, cuenta_por_cobrar, devolucion, devolucion_linea, abono, abono_aplicacion; `pedido.recibio`/`foto_entrega` (B11); `v_saldo_cliente`, `v_semaforo_cliente` (B10); funciones de turno, venta, entrega de pedido, inicio y liquidación de ruta, cancelación, devolución, abono, saldo inicial, `fn_estado_cuenta` (A3), `fn_resumen_dia` (B12, usa `fn_lista_surtido` de 006) |
| `009_reportes.sql` | 9 | vistas `v_*` y `fn_cxc_antiguedad` de §2.9; `v_ganancia_ruta` (B13) |
| `010_envases.sql` | 10 | diferida (§2.10) |
| `011_crecimiento.sql` | 11 | lealtad y sugerencias por zona (§2.12, F11) |

F8 (POS de mostrador) no tiene migración: sus tablas y funciones llegan en 008. 008 depende de 006
(`fn_resumen_dia`): F7 requiere F5 cerrada.

Las funciones del lote 2026-11-23 (margen, ofertas, «lo de siempre», intérprete de WhatsApp, compra
inteligente, semáforo de fiado, etc.) se describen juntas en §2.12, indicando a qué migración van; su DDL
va dentro de esa migración. **Ninguna usa IA ni APIs de pago**: son reglas en SQL/TS con pruebas.

Abajo, DDL de contrato (columnas, tipos, restricciones). La migración puede reordenar, pero no cambiar
nombres, tipos ni reglas sin editar este archivo. `creado_en timestamptz not null default now()` se
abrevia `creado_en`.

### 2.1 Migración 001 — auth, configuración, auditoría, folios, plantillas, notificaciones

```sql
create table app.sucursal (
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) > 0),
  direccion text, telefono text,
  lat numeric(9,6), lng numeric(9,6),              -- bodega: inicio y fin de toda ruta
  activa boolean not null default true,
  creado_en,
  constraint ck_sucursal_coordenadas check ((lat is null) = (lng is null))
);

create table app.rol (
  id bigint generated always as identity primary key,
  nombre text not null constraint uq_rol_nombre unique,
  descripcion text,
  es_sistema boolean not null default false,   -- true solo el rol "Dueño"
  creado_en
);
create unique index uq_rol_un_sistema on app.rol (es_sistema) where es_sistema;

create table app.permiso (
  codigo text primary key check (codigo ~ '^[a-z_]+\.[a-z_]+$'),
  modulo text not null,
  descripcion text not null
);

create table app.rol_permiso (
  rol_id bigint not null references app.rol(id) on delete cascade,
  permiso_codigo text not null references app.permiso(codigo) on delete cascade,
  primary key (rol_id, permiso_codigo)
);

create table app.usuario (
  id bigint generated always as identity primary key,
  usuario text not null constraint uq_usuario_usuario unique
    check (usuario ~ '^[a-z0-9._-]{3,30}$'),            -- la API lo baja a minúsculas
  nombre text not null check (length(trim(nombre)) > 0),
  telefono text,
  contrasena_hash text not null,                         -- bcryptjs costo 12
  rol_id bigint not null references app.rol(id),
  sucursal_id bigint not null references app.sucursal(id),
  activo boolean not null default true,
  debe_cambiar_contrasena boolean not null default true,
  intentos_fallidos integer not null default 0 check (intentos_fallidos >= 0),
  bloqueado_hasta timestamptz,
  creado_en, actualizado_en timestamptz not null default now()
);
create index idx_usuario_rol on app.usuario (rol_id);

create table app.sesion (
  jti uuid primary key default gen_random_uuid(),
  usuario_id bigint not null references app.usuario(id),
  origen text not null default 'web' check (origen in ('web','app')),    -- app = panel dentro del cascarón Android
  creada_en timestamptz not null default now(),
  expira_en timestamptz not null,                        -- web 12 h, app 30 días
  cerrada_en timestamptz,
  ultima_actividad_en timestamptz not null default now(),
  user_agent text,
  ip_hash text                                           -- sha256(ip + JWT_SECRET), nunca la IP
);
create index idx_sesion_viva on app.sesion (usuario_id) where cerrada_en is null;

create table app.configuracion (
  clave text primary key check (clave ~ '^[a-z_]+$'),
  valor jsonb not null,
  actualizado_en timestamptz not null default now(),
  actualizado_por bigint references app.usuario(id)
);

create table app.auditoria (
  id bigint generated always as identity primary key,
  usuario_id bigint references app.usuario(id),          -- nullif(current_setting('app.usuario_id', true), '')::bigint
  cliente_id bigint,                                      -- nullif(current_setting('app.cliente_id', true), '')::bigint; sin FK (cliente llega en 004)
  tabla text not null,
  registro_id text not null,
  accion text not null check (accion in ('insertar','actualizar','borrar')),
  antes jsonb, despues jsonb,
  creado_en
);
create index idx_auditoria_registro on app.auditoria (tabla, registro_id, creado_en desc);
create index idx_auditoria_fecha on app.auditoria (creado_en desc);

create table app.folio (
  sucursal_id bigint not null references app.sucursal(id),
  serie text not null check (serie in ('P','R','V','C','D','A')),
  siguiente bigint not null check (siguiente > 0),
  primary key (sucursal_id, serie)
);

create table app.plantilla (            -- auditada. Ningún texto al usuario final vive en código
  clave text primary key check (clave ~ '^[a-z_]+$'),
  canal text not null check (canal in ('whatsapp','push','pantalla')),
  titulo text,                                           -- solo push
  texto text not null check (length(texto) between 1 and 1000),
  variables text[] not null default '{}',                -- lista blanca; documentada en §2.1.1
  actualizado_en timestamptz not null default now(),
  actualizado_por bigint references app.usuario(id),
  constraint ck_plantilla_titulo check ((canal = 'push') = (titulo is not null))
);

create table app.notificacion (         -- bandeja del personal (panel y app)
  id bigint generated always as identity primary key,
  usuario_id bigint not null references app.usuario(id),
  evento text not null check (evento in ('pedido_nuevo','pedido_modificado','pedido_cancelado_cliente',
    'faltante_respondido','surtido_listo','ruta_asignada','entrega_fallida','ubicacion_propuesta',
    'dispositivo_nuevo','visitas_sin_pedido','cliente_inactivo')),
  titulo text not null, cuerpo text not null,
  datos jsonb not null default '{}',                     -- {ruta:'/pedidos/123', …}: ruta del panel que abre el push; nunca teléfonos
  clave text not null,                                   -- '<evento>:<entidad>:<version>' → idempotente
  creado_en, leida_en timestamptz,
  constraint uq_notificacion_clave unique (usuario_id, clave)
);
create index idx_notificacion_usuario on app.notificacion (usuario_id, id desc);

create table app.notificacion_preferencia (
  usuario_id bigint not null references app.usuario(id) on delete cascade,
  evento text not null,                                  -- mismo CHECK que notificacion.evento (lista copiada)
  push boolean not null default true,                    -- false = solo bandeja, sin push
  primary key (usuario_id, evento)
);
```

Funciones y disparadores 001:

| Objeto | Regla |
|---|---|
| `fn_fecha_local(timestamptz) returns date` (stable) | `(ts at time zone 'America/Mexico_City')::date`. |
| `fn_siguiente_folio(p_sucursal_id bigint, p_serie text) returns text` | `INSERT … VALUES (s, serie, 2) ON CONFLICT DO UPDATE SET siguiente = folio.siguiente + 1 RETURNING siguiente - 1` → `serie || '-' || lpad(n::text, 6, '0')`. El candado de fila serializa folios. |
| `fn_tiene_permiso(p_usuario_id bigint, p_codigo text) returns boolean` | Usuario activo y su rol tiene el permiso. Lo usan las funciones de negocio para permisos finos. |
| `fn_render_plantilla(p_clave text, p_vars jsonb) returns table(titulo text, texto text)` (stable) | Reemplaza cada `{{k}}` por `p_vars->>k` (solo claves de `variables`; las demás se dejan vacías). Plantilla inexistente → `PLANTILLA_NO_EXISTE`. |
| `fn_notificar(p_evento text, p_clave text, p_vars jsonb, p_usuario_id bigint default null) returns integer` | Destinatarios: `p_usuario_id` si viene; si no, usuarios activos con el permiso del evento (tabla fija en la función: `pedido_*`, `faltante_respondido` y `entrega_fallida` → `pedidos.gestionar`; `surtido_listo` → `compras.registrar`; `ubicacion_propuesta` → `clientes.editar`; `dispositivo_nuevo`, `visitas_sin_pedido` y `cliente_inactivo` → `clientes.enlace` (quien puede dar de baja el link); `ruta_asignada` solo con `p_usuario_id`). Pone `datos.ruta` (pantalla del panel que abre el push: `/pedidos/<id>`, `/surtido?fecha=`, `/reparto`, `/clientes/<id>` para `dispositivo_nuevo` y `ubicacion_propuesta`, `/clientes?alerta=visitas|inactivo` para las alertas de cliente…), renderiza `push_<evento>` y hace `INSERT … ON CONFLICT (usuario_id, clave) DO NOTHING`. Devuelve filas insertadas. Se llama **dentro** de la transacción de negocio (outbox: si la operación se revierte, no hay aviso). |
| `trg_auditar` → `fn_auditar()` AFTER INSERT/UPDATE/DELETE | Inserta en `auditoria` con `to_jsonb(old/new)` quitando las llaves `contrasena_hash`, `token_hash`, `token_cifrado` y `pin_hash`; no escribe si `UPDATE` solo cambió `actualizado_en`, `ultimo_uso_en`, `intentos_fallidos` o `bloqueado_hasta` (o nada). `registro_id` = valores de las columnas llave que recibe el disparador en `TG_ARGV` unidos por `:` (sin argumentos: `id`; `rol_permiso` → `rol_id, permiso_codigo`; `configuracion` y `plantilla` → `clave`; `precio` → `presentacion_id, lista_precio_id`). Se adjunta a: `sucursal, usuario, rol, rol_permiso, configuracion, plantilla` (y en migraciones siguientes a las tablas marcadas «auditada»). |
| `trg_permiso_a_sistema` AFTER INSERT ON `permiso` | Concede el permiso nuevo al rol `es_sistema`. |
| `trg_rol_sistema_protegido` | BEFORE DELETE/UPDATE ON `rol` donde `es_sistema` → `ROL_SISTEMA`; BEFORE DELETE ON `rol_permiso` de rol de sistema → `ROL_SISTEMA` salvo en cascada por borrar el permiso (se detecta porque el `permiso` ya no existe). |
| `trg_ultimo_dueno` AFTER UPDATE/DELETE ON `usuario` (constraint trigger, deferred) | Debe quedar ≥ 1 usuario activo con rol `es_sistema`, si no `ULTIMO_DUENO`. |

Semilla 001: sucursal «Bodega principal»; roles `Dueño` (`es_sistema`, se inserta **antes** que los permisos para que `trg_permiso_a_sistema` se los conceda), `Administrador`, `Repartidor`,
`Cajero`, `Almacenista` (cada migración concede a estos roles los permisos de §5 que crea); permisos 001 (abajo); configuración `negocio_nombre`, `negocio_telefono`, `negocio_direccion`,
`negocio_whatsapp` (dígitos con lada de país, ej. `"5215512345678"`), `ticket_pie`,
`credito_dias_predeterminado` (0), `pedido_minimo` (`"0.00"`), `hora_corte` (`"18:00"`, informativa en la
página del cliente) [P31], `dias_aviso_caducidad` (30), `url_publica` (origen https de `apps/web`, para armar
el enlace del cliente en los avisos), `faltante_minutos_respuesta` (60), `faltante_accion_predeterminada`
(`"quitar"` | `"reducir"`; §2.4.1), `reparto_minutos_por_parada` (10), `reparto_velocidad_kmh` (25), `transferencia_banco`, `transferencia_titular`, `transferencia_clabe` (texto vacío hasta que el dueño los capture), `margen_objetivo` (`"0.15"`), `precio_redondeo` (`"5.00"`), `sugerencia_dias_tolerancia` (1), `sugerencia_vigencia_horas` (24), `sugerencia_hora` (`"08:00"`), `compra_cobertura_dias` (7), `compra_promedio_dias` (28), `semaforo_dias_rojo` (15), `visitas_umbral` (5), `visitas_dias` (14), `inactividad_dias` (30), `enlace_tras_primera_compra` (true), `respaldo_ultima_prueba` (`null`; §3.2); las llaves de lealtad las siembra 011 (§2.12 B14); plantillas de §2.1.1.
Permisos 001: `usuarios.gestionar, auditoria.ver, configuracion.editar`.
**El primer usuario dueño NO va en migración** (lleva contraseña): script `apps/api/scripts/crear-dueno.mjs`.

#### 2.1.1 Plantillas semilla

Todas las `wa_*` hacia el cliente llevan `{{enlace}}` (su enlace personal: ahí ve el detalle, el
seguimiento y responde faltantes). La API lo agrega al renderizar; nunca se guarda en el aviso.

| Clave | Canal | Variables |
|---|---|---|
| `wa_enlace_cliente` | whatsapp | `cliente, negocio, enlace` |
| `wa_pedido_recibido` | whatsapp | `cliente, folio, total, enlace` (pedidos capturados por llamada) |
| `wa_pedido_confirmado` | whatsapp | `cliente, folio, fecha_entrega, total, enlace` |
| `wa_pedido_faltante` | whatsapp | `cliente, folio, productos, limite, enlace` («revisa tu pedido») |
| `wa_pedido_ajustado` | whatsapp | `cliente, folio, cambios, total, enlace` (`cambios` = una línea por ajuste, armada en SQL) |
| `wa_pedido_en_ruta` | whatsapp | `cliente, folio, parada, paradas, enlace` |
| `wa_entrega_fallida` | whatsapp | `cliente, folio, motivo, enlace` |
| `wa_nota_entrega` | whatsapp | `cliente, folio, total, pagado, saldo, enlace` |
| `wa_recordatorio_saldo` | whatsapp | `cliente, saldo, vencido, enlace` |
| `wa_lo_de_siempre` | whatsapp | `cliente, enlace` (enlace con `?ir=pedido-<id>`). **Sin precios ni totales** (pueden estar viejos cuando lo lea): «¿Te mando lo de siempre? Revisa precios y confirma aquí: {{enlace}}» |
| `wa_estado_cuenta` | whatsapp | `cliente, saldo, vencido, enlace` (enlace con `?ir=estado-cuenta`) |
| `wa_resumen_dia` | whatsapp | `fecha, vendido, ganancia, cobrado, fiado_nuevo, por_cobrar, por_comprar` (al teléfono del dueño, no de un cliente) |
| `wa_datos_transferencia` | whatsapp | `cliente, monto, banco, titular, clabe, referencia, enlace` (banco/titular/CLABE de configuración [P42]) |
| `wa_cliente_avisa_pedido` | whatsapp | `cliente, folio` (lo manda el cliente al negocio desde la confirmación; sentido cliente → negocio) |
| `wa_surtido_proveedor` | whatsapp | `proveedor, fecha, lineas` |
| `push_pedido_nuevo`, `push_pedido_modificado`, `push_pedido_cancelado_cliente` | push | `cliente, folio, total` |
| `push_surtido_listo` | push | `fecha, num_productos` |
| `push_ruta_asignada` | push | `ruta, fecha, num_paradas` |
| `push_entrega_fallida` | push | `cliente, folio, motivo` |
| `push_ubicacion_propuesta` | push | `cliente` |
| `push_dispositivo_nuevo` | push | `cliente, dispositivo` («Abrieron el enlace de {{cliente}} en un dispositivo nuevo») |
| `push_visitas_sin_pedido` | push | `cliente, aperturas, dias` |
| `push_cliente_inactivo` | push | `cliente, dias` («{{cliente}} lleva {{dias}} días sin pedir») |
| `wa_cliente_olvide_pin` | whatsapp | `cliente` (del cliente al negocio: «Olvidé mi PIN») |
| `pantalla_elegir_pin`, `pantalla_pedir_pin`, `pantalla_pin_espera` | pantalla | `cliente?, minutos?` |
| `push_faltante_respondido` | push | `cliente, folio, respuesta` |
| `pantalla_pedido_enviado`, `pantalla_enlace_invalido` («Este link ya no está activo. Escríbenos para pedir uno nuevo», con botón wa.me a la bodega; misma página para enlace dado de baja o desconocido), `pantalla_aviso_ubicacion`, `pantalla_bienvenida`, `pantalla_faltante` | pantalla | `cliente, folio?, negocio, limite?` |
| `estado_recibido`, `estado_esperando_cliente`, `estado_confirmado`, `estado_surtiendo`, `estado_cargado`, `estado_en_ruta`, `estado_entregado`, `estado_no_entregado`, `estado_cancelado` | pantalla | — (etiquetas del seguimiento en el enlace) |

### 2.2 Migración 002 — proveedores, catálogo, precios, inventario

```sql
create extension if not exists pg_trgm;
create extension if not exists unaccent;
-- fn_normalizar(text) immutable: lower(unaccent(x)) con el diccionario fijo; la usan índices y búsquedas.

create table app.proveedor (            -- auditada. Distribuidores donde se surte [P36]
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) > 0),
  telefono text, contacto text, notas text,
  activo boolean not null default true, creado_en
);
create unique index uq_proveedor_nombre on app.proveedor (lower(nombre));

create table app.categoria (            -- auditada. Cerveza, Refresco, Botana, Cigarros, Licores… [P23]; se surte en caliente [R10]
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) > 0),
  orden smallint not null default 0,                    -- orden en el catálogo del cliente
  margen_objetivo numeric(5,4) check (margen_objetivo between 0 and 0.9),   -- null = config `margen_objetivo`
  activa boolean not null default true, creado_en
);
create unique index uq_categoria_nombre on app.categoria (lower(nombre));

create table app.marca (                -- auditada
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) > 0),
  activa boolean not null default true, creado_en
);
create unique index uq_marca_nombre on app.marca (lower(nombre));

create table app.producto (             -- auditada
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) > 0),
  categoria_id bigint not null references app.categoria(id),
  marca_id bigint references app.marca(id),
  sku text,
  descripcion text,
  alias text[] not null default '{}',                    -- cómo lo piden: 'caguama', 'cartón', 'lite' (búsqueda, §7)
  contenido_ml integer check (contenido_ml > 0),        -- 355, 473, 940, 1200
  tipo_envase text check (tipo_envase in ('lata','botella','retornable')),
  imagen text check (imagen ~ '^[0-9a-f]{64}\.(jpg|png|webp)$'),   -- sha256 del archivo (§4.5)
  modo_surtido text not null default 'inventario' check (modo_surtido in ('inventario','contra_pedido')),
  margen_objetivo numeric(5,4) check (margen_objetivo between 0 and 0.9),   -- null = el de su categoría (§2.12 A1)
  proveedor_id bigint references app.proveedor(id),     -- proveedor habitual (agrupa la lista de surtido)
  existencia_minima integer not null default 0 check (existencia_minima >= 0),   -- piezas; ignorado en contra_pedido
  activo boolean not null default true,
  creado_en, actualizado_en timestamptz not null default now()
);
create unique index uq_producto_sku on app.producto (sku) where sku is not null;
create index idx_producto_nombre on app.producto (lower(nombre) text_pattern_ops);
create index idx_producto_categoria on app.producto (categoria_id);
create index idx_producto_busqueda on app.producto using gin
  (app.fn_normalizar(nombre || ' ' || array_to_string(alias, ' ')) gin_trgm_ops);

create table app.presentacion (         -- auditada
  id bigint generated always as identity primary key,
  producto_id bigint not null references app.producto(id),
  nombre text not null check (length(trim(nombre)) > 0),   -- como lo dice el cliente: 'Caja de 24', 'Six', 'Charola de 24', 'Pieza'
  factor integer not null check (factor > 0),
  codigo_barras text,
  se_vende boolean not null default true,
  se_compra boolean not null default true,
  activa boolean not null default true,
  creado_en
);
-- Sin unicidad por factor: caja 24 de botella y charola 24 pueden convivir [P2]
create unique index uq_presentacion_codigo on app.presentacion (codigo_barras) where codigo_barras is not null;
create unique index uq_presentacion_nombre on app.presentacion (producto_id, lower(nombre));

create table app.lista_precio (         -- auditada. Semilla: 'Menudeo' (predeterminada), 'Mayoreo'
  id bigint generated always as identity primary key,
  nombre text not null constraint uq_lista_precio_nombre unique,
  es_predeterminada boolean not null default false,
  activa boolean not null default true, creado_en,
  constraint ck_lista_predeterminada_activa check (not es_predeterminada or activa)
);
create unique index uq_lista_una_predeterminada on app.lista_precio (es_predeterminada) where es_predeterminada;

create table app.precio (               -- auditada (historial de precios = auditoria)
  presentacion_id bigint not null references app.presentacion(id),
  lista_precio_id bigint not null references app.lista_precio(id),
  precio numeric(12,2) not null check (precio >= 0),        -- precio final
  actualizado_en timestamptz not null default now(),
  actualizado_por bigint references app.usuario(id),
  primary key (presentacion_id, lista_precio_id)
);

create table app.existencia (           -- SOLO la escribe trg_movimiento_aplicar
  sucursal_id bigint not null references app.sucursal(id),
  producto_id bigint not null references app.producto(id),
  cantidad integer not null default 0 check (cantidad >= 0),               -- piezas [P17]
  costo_promedio numeric(14,6) not null default 0 check (costo_promedio >= 0),
  actualizado_en timestamptz not null default now(),
  primary key (sucursal_id, producto_id)
);

create table app.movimiento_inventario (   -- kárdex, inmutable
  id bigint generated always as identity primary key,
  sucursal_id bigint not null references app.sucursal(id),
  producto_id bigint not null references app.producto(id),
  tipo text not null check (tipo in (
    'inventario_inicial','compra','cancelacion_venta','devolucion_venta','ajuste_entrada','traspaso_entrada',
    'venta','cancelacion_compra','ajuste_salida','merma','traspaso_salida')),
  cantidad integer not null,                  -- piezas con signo
  costo_unitario numeric(14,6) not null check (costo_unitario >= 0),
  existencia_resultante integer not null,
  costo_promedio_resultante numeric(14,6) not null,
  referencia_tabla text check (referencia_tabla in ('compra_linea','venta_linea','devolucion_linea')),
  referencia_id bigint,
  causa_merma text check (causa_merma in ('caducado','danado','faltante','regalo','otro')),
  motivo text,
  usuario_id bigint not null references app.usuario(id),
  creado_en,
  constraint ck_movimiento_signo check (
    (tipo in ('inventario_inicial','compra','cancelacion_venta','devolucion_venta','ajuste_entrada','traspaso_entrada') and cantidad > 0)
    or (tipo in ('venta','cancelacion_compra','ajuste_salida','merma','traspaso_salida') and cantidad < 0)),
  constraint ck_movimiento_referencia check ((referencia_tabla is null) = (referencia_id is null)),
  constraint ck_movimiento_causa check ((tipo = 'merma') = (causa_merma is not null))
);
create index idx_movimiento_kardex on app.movimiento_inventario (sucursal_id, producto_id, id desc);
create index idx_movimiento_referencia on app.movimiento_inventario (referencia_tabla, referencia_id);
create index idx_movimiento_fecha on app.movimiento_inventario (creado_en);
```

Funciones, vistas y disparadores 002:

| Objeto | Regla |
|---|---|
| `trg_producto_con_pieza` (constraint trigger AFTER INSERT ON producto, deferrable initially deferred) | Al commit debe existir una presentación `factor = 1`, si no `PRODUCTO_SIN_PIEZA`. |
| `trg_presentacion_factor_inmutable` BEFORE UPDATE OF factor, producto_id | `FACTOR_INMUTABLE`. Presentaciones no se borran: `activa = false`. |
| `fn_precio(p_presentacion_id, p_lista_precio_id) returns numeric` | Si hay `precio_oferta` vigente para esa presentación (y esa lista o todas), el menor de oferta y precio (§2.12 A8). Si no: precio de esa lista; si no hay, el de la lista predeterminada; si tampoco, `null`. |
| `trg_movimiento_aplicar` → `fn_aplicar_movimiento()` BEFORE INSERT ON movimiento_inventario | 1) `INSERT … ON CONFLICT DO NOTHING` existencia y `SELECT … FOR UPDATE`. 2) `nueva = cantidad_actual + NEW.cantidad`; `< 0` → `STOCK_INSUFICIENTE` (detalle `{producto_id, disponible, solicitado}`). **No hay existencia negativa, tampoco para `contra_pedido`**: la compra se registra antes de cargar la ruta (§2.7). 3) Costo: **entrada** → `NEW.costo_unitario` obligatorio; `promedio = round((q·p + c·cu)/(q + c), 6)`. **`cancelacion_compra`** → usa el `costo_unitario` dado; `promedio = nueva = 0 ? p : greatest(0, round((q·p + c·cu)/nueva, 6))` (c negativo). **Otras salidas** → `NEW.costo_unitario := p`, promedio sin cambio. 4) Llena `existencia_resultante`, `costo_promedio_resultante`; actualiza `existencia`. |
| `trg_movimiento_inmutable` BEFORE UPDATE/DELETE | `MOVIMIENTO_INMUTABLE`. Corregir = movimiento contrario. |
| `trg_existencia_protegida` BEFORE INSERT/UPDATE/DELETE ON existencia | Si `pg_trigger_depth() < 2` → `EXISTENCIA_SOLO_POR_MOVIMIENTO`. |
| `fn_ajustar_inventario(p_usuario_id, p_sucursal_id, p_producto_id, p_tipo text, p_piezas integer, p_costo_unitario numeric default null, p_motivo text default null, p_causa_merma text default null) returns bigint` | `p_tipo ∈ ('inventario_inicial','ajuste_entrada','ajuste_salida','merma')`, `p_piezas > 0`. Entrada sin costo → costo promedio vigente; `inventario_inicial` exige costo. `merma` exige causa. `motivo` obligatorio salvo `inventario_inicial`. |
| `fn_contar_inventario(p_usuario_id, p_sucursal_id, p_producto_id, p_piezas_contadas integer, p_motivo text) returns bigint` | Crea `ajuste_entrada`/`ajuste_salida` por la diferencia a costo promedio; `null` si no hay diferencia. |
| `fn_buscar_productos(p_texto text, p_limite int default 30) returns table(producto_id, puntaje)` (stable) | Tolerante (§7): `fn_normalizar` del texto; coincide por palabra en nombre, marca y `alias` con `%` / `word_similarity` de `pg_trgm` (umbral 0.3) y ordena por puntaje. La usa `?buscar` del panel. |
| `v_precio_bajo_costo` | Por `precio ⋈ presentacion ⋈ existencia (sucursal 1)` activos: `presentacion_id, lista_precio_id, producto, presentacion, lista, precio, costo_presentacion = round(costo_promedio·factor, 2), diferencia = precio − costo_presentacion` donde `precio < costo_presentacion` y `costo_promedio > 0`. Solo se expone con `costos.ver`. |

Permisos 002: `catalogo.ver, catalogo.editar, precios.editar, costos.ver, inventario.ver, inventario.ajustar, proveedores.gestionar`.

**Costeo: promedio ponderado por sucursal.** La cerveza es fungible, no hay lotes [P18], se compra a
precios que cambian por promoción; PEPS exigiría capas por lote sin beneficio para un negocio que no
factura. Cada venta congela su costo → utilidad real por línea. Producto gratis del proveedor = línea de
compra a costo 0 [P11]. **Precio bajo costo no se bloquea**: `PUT /api/precios` devuelve `advertencias`
y hay reporte (§2.9).

### 2.3 Migración 003 — compras

```sql
create table app.compra (
  id bigint generated always as identity primary key,
  sucursal_id bigint not null references app.sucursal(id),
  folio text not null,
  proveedor_id bigint not null references app.proveedor(id),
  folio_proveedor text,                                   -- remisión/ticket del distribuidor
  fecha date not null,
  condicion_pago text not null check (condicion_pago in ('contado','credito')),  -- informativa [P12]
  estado text not null default 'registrada' check (estado in ('registrada','cancelada')),
  total numeric(12,2) not null default 0 check (total >= 0),
  fecha_surtido date,                                     -- informativa: lista de surtido que la originó
  notas text,
  clave_idempotencia uuid not null constraint uq_compra_clave unique,
  hash_solicitud text not null,
  usuario_id bigint not null references app.usuario(id),
  creado_en,
  cancelada_en timestamptz, cancelada_por bigint references app.usuario(id), motivo_cancelacion text,
  constraint uq_compra_folio unique (sucursal_id, folio),
  constraint ck_compra_cancelada check ((estado = 'cancelada') = (cancelada_en is not null))
);
create index idx_compra_fecha on app.compra (sucursal_id, fecha desc);
create index idx_compra_proveedor on app.compra (proveedor_id, fecha desc);

create table app.compra_linea (
  id bigint generated always as identity primary key,
  compra_id bigint not null references app.compra(id),
  presentacion_id bigint not null references app.presentacion(id),
  producto_id bigint not null references app.producto(id),
  factor integer not null check (factor > 0),
  cantidad integer not null check (cantidad > 0),         -- en presentaciones
  piezas integer generated always as (cantidad * factor) stored,
  costo_presentacion numeric(12,2) not null check (costo_presentacion >= 0),   -- lo pagado
  importe numeric(12,2) generated always as (round(cantidad * costo_presentacion, 2)) stored,
  costo_unitario numeric(14,6) not null,                  -- round(importe / piezas, 6), lo pone la función
  caduca_el date                                          -- opcional [P18]
);
create index idx_compra_linea_compra on app.compra_linea (compra_id);
create index idx_compra_linea_producto on app.compra_linea (producto_id);
```

| Objeto | Regla |
|---|---|
| `fn_registrar_compra(p_usuario_id bigint, p_sucursal_id bigint, p_datos jsonb, p_hash text) returns table(compra_id bigint, repetida boolean)` | `pg_advisory_xact_lock(hashtext(clave))`; clave existente: mismo hash → `(id, true)`, distinto → `IDEMPOTENCIA_CONFLICTO`. Proveedor activo; ≥ 1 línea (`COMPRA_VACIA`); presentación activa con `se_compra` (`PRESENTACION_NO_VALIDA`). Inserta compra (folio `C`), líneas y un movimiento `compra` por línea **ordenado por `producto_id`**. `total = Σ importe`. `p_datos`: `{clave_idempotencia, proveedor_id, folio_proveedor?, fecha, condicion_pago, fecha_surtido?, notas?, lineas:[{presentacion_id, cantidad, costo_presentacion, caduca_el?}]}`. |
| `fn_cancelar_compra(p_usuario_id, p_compra_id, p_motivo text) returns void` | `COMPRA_YA_CANCELADA`; movimiento `cancelacion_compra` por línea. Sin existencia suficiente → `STOCK_INSUFICIENTE` y no se cancela nada. |
| `v_por_caducar` | Sin lotes, se **supone PEPS físico**: la existencia actual corresponde a las compras más recientes. Por producto, líneas de compras `registrada` con `caduca_el` ordenadas de la más nueva a la más vieja; `acumulado = sum(piezas) over (… desc)`; se queda cada línea mientras `acumulado − piezas < existencia`, con `piezas_estimadas = least(piezas, existencia − (acumulado − piezas))`. Columnas: `producto_id, producto, compra_folio, caduca_el, piezas_estimadas, dias_restantes = caduca_el − hoy local`. El reporte filtra `dias_restantes ≤ dias_aviso_caducidad`. |

Sin estado «borrador»: la compra registrada es mercancía recibida. El borrador vive en el cliente.
Permisos 003: `compras.ver, compras.registrar, compras.cancelar`.

### 2.4 Migración 004 — clientes, enlace de pedido, pedidos

```sql
create table app.zona (                 -- auditada. Colonia/sector de reparto [P34]
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) > 0),
  activa boolean not null default true, creado_en
);
create unique index uq_zona_nombre on app.zona (lower(nombre));

create table app.cliente (               -- auditada (crédito y ubicación incluidos)
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) > 0),        -- nombre del establecimiento
  tipo_negocio text not null default 'tienda'
    check (tipo_negocio in ('tienda','miscelanea','deposito','restaurante','otro')),
  contacto text,
  telefono_whatsapp text check (telefono_whatsapp ~ '^[0-9]{12,13}$'),   -- con lada de país: 52 + 10
  direccion text, referencias text, notas text,
  zona_id bigint references app.zona(id),
  dias_visita smallint[] not null default '{}'
    check (dias_visita <@ '{1,2,3,4,5,6,7}'::smallint[]),       -- ISO: 1 = lunes
  lat numeric(9,6), lng numeric(9,6),
  ubicacion_fuente text check (ubicacion_fuente in ('mapa','app','cliente')),
  ubicacion_en timestamptz,
  lat_propuesta numeric(9,6), lng_propuesta numeric(9,6), propuesta_en timestamptz,  -- de la página del cliente
  lista_precio_id bigint not null references app.lista_precio(id),
  limite_credito numeric(12,2) not null default 0 check (limite_credito >= 0),   -- 0 = sin crédito
  dias_credito integer not null default 0 check (dias_credito between 0 and 365),
  ya_compro boolean not null default false,               -- true al importar de Eleventa o al primer pedido entregado
  activo boolean not null default true,
  creado_en, actualizado_en timestamptz not null default now(),
  constraint ck_cliente_ubicacion check ((lat is null) = (lng is null) and (lat is null) = (ubicacion_fuente is null)),
  constraint ck_cliente_propuesta check ((lat_propuesta is null) = (lng_propuesta is null) and (lat_propuesta is null) = (propuesta_en is null)),
  constraint ck_cliente_en_mexico check ((lat is null or (lat between 14 and 33 and lng between -119 and -86))
    and (lat_propuesta is null or (lat_propuesta between 14 and 33 and lng_propuesta between -119 and -86)))
);
create index idx_cliente_nombre on app.cliente (lower(nombre) text_pattern_ops);
create index idx_cliente_zona on app.cliente (zona_id);

create table app.cliente_enlace (       -- auditada (sin token_hash ni token_cifrado: fn_auditar los quita)
  id bigint generated always as identity primary key,
  cliente_id bigint not null references app.cliente(id),
  token_hash text not null constraint uq_enlace_hash unique check (token_hash ~ '^[0-9a-f]{64}$'),  -- sha256 hex: búsqueda
  token_cifrado bytea not null,          -- AES-256-GCM (iv‖tag‖cifrado) con SECRETO_ENLACES: para incluirlo en avisos
  creado_por bigint not null references app.usuario(id),
  creado_en,
  revocado_en timestamptz, revocado_por bigint references app.usuario(id),
  motivo_revocacion text check (motivo_revocacion in ('reenviado','ya_no_es_cliente','solo_cotiza','reemplazado','otro')),
  nota_revocacion text,                                    -- obligatoria si motivo = 'otro'
  ultimo_uso_en timestamptz,
  pin_hash text,                                           -- bcryptjs costo 10; null = el cliente lo elige al abrir
  constraint ck_enlace_revocado check ((revocado_en is null) = (motivo_revocacion is null))
);
create unique index uq_enlace_vigente on app.cliente_enlace (cliente_id) where revocado_en is null;

create table app.cliente_dispositivo (  -- navegadores recordados del cliente (auditada sin token_hash)
  id bigint generated always as identity primary key,
  cliente_enlace_id bigint not null references app.cliente_enlace(id),
  token_hash text not null constraint uq_dispositivo_cliente unique check (token_hash ~ '^[0-9a-f]{64}$'),
  navegador text,                                          -- resumen del User-Agent: «Chrome Android», «WhatsApp iOS»
  primer_uso_en timestamptz not null default now(),
  ultimo_uso_en timestamptz not null default now(),
  quitado_en timestamptz, quitado_por bigint references app.usuario(id)   -- solo por acción del personal
);
create index idx_dispositivo_enlace on app.cliente_dispositivo (cliente_enlace_id) where quitado_en is null;

create table app.cliente_pin_espera (   -- intentos de PIN por enlace + IP; nunca bloqueo permanente
  cliente_enlace_id bigint not null references app.cliente_enlace(id),
  ip_hash text not null,
  fallos smallint not null default 0,
  espera_hasta timestamptz,
  primary key (cliente_enlace_id, ip_hash)
);

create table app.cliente_visita (       -- conteo diario para «visitas sin pedido»
  cliente_id bigint not null references app.cliente(id),
  fecha date not null,
  aperturas integer not null default 0,
  vistas_catalogo integer not null default 0,
  primary key (cliente_id, fecha)
);

create table app.cliente_favorito (
  cliente_id bigint not null references app.cliente(id),
  presentacion_id bigint not null references app.presentacion(id),
  creado_en,
  primary key (cliente_id, presentacion_id)
);

create table app.producto_equivalente (   -- auditada. Sustitutos sugeridos al marcar un faltante
  producto_id bigint not null references app.producto(id),
  equivalente_id bigint not null references app.producto(id),
  orden smallint not null default 1,
  primary key (producto_id, equivalente_id),
  constraint ck_equivalente_distinto check (producto_id <> equivalente_id)
);

create table app.pedido (
  id bigint generated always as identity primary key,
  sucursal_id bigint not null references app.sucursal(id),
  folio text not null,
  cliente_id bigint not null references app.cliente(id),
  origen text not null check (origen in ('enlace','captura','sugerido')),   -- captura = personal; sugerido = «lo de siempre» (§2.12 B5)
  estado text not null default 'recibido' check (estado in
    ('propuesto','recibido','esperando_cliente','confirmado','cargado','en_ruta','entregado','no_entregado','cancelado')),
  propuesto_vence_en timestamptz,                          -- solo estado propuesto
  respuesta_limite_en timestamptz,                         -- esperando_cliente: después se aplica la acción predeterminada
  entrega_tipo text not null default 'reparto' check (entrega_tipo in ('reparto','recoge')),
  fecha_solicitada date,                                   -- lo que pidió el cliente
  fecha_entrega date,                                      -- la que fija despacho al confirmar
  lista_precio_id bigint not null references app.lista_precio(id),
  total numeric(12,2) not null default 0 check (total >= 0),   -- Σ importe de líneas vigentes
  notas text check (length(notas) <= 500),                 -- del cliente (o el texto del WhatsApp)
  notas_internas text,
  version integer not null default 1,                      -- sube con cada edición o ajuste
  ruta_id bigint,                                          -- FK en 007: ruta actual
  venta_id bigint constraint uq_pedido_venta unique,       -- FK en 008: venta de la entrega
  clave_idempotencia uuid not null constraint uq_pedido_clave unique,
  hash_solicitud text not null,
  creado_por bigint references app.usuario(id),            -- null si origen = enlace
  creado_en, actualizado_en timestamptz not null default now(),
  confirmado_en timestamptz, confirmado_por bigint references app.usuario(id),
  entregado_en timestamptz,
  cancelado_en timestamptz, cancelado_por bigint references app.usuario(id),   -- null + cancelado_en = el cliente
  motivo text,                                             -- de cancelación o de no entrega
  constraint uq_pedido_folio unique (sucursal_id, folio),
  constraint ck_pedido_origen check ((origen = 'captura') = (creado_por is not null)),
  constraint ck_pedido_propuesto check ((estado = 'propuesto') = (propuesto_vence_en is not null)),
  constraint ck_pedido_fecha check (estado in ('propuesto','recibido','cancelado') or fecha_entrega is not null),
  constraint ck_pedido_espera check ((estado = 'esperando_cliente') = (respuesta_limite_en is not null)),
  constraint ck_pedido_venta check ((estado = 'entregado' and venta_id is not null)
    or (estado <> 'entregado' and (venta_id is null or estado = 'cancelado'))),   -- cancelado con venta = venta cancelada
  constraint ck_pedido_cancelado check ((estado = 'cancelado') = (cancelado_en is not null))
);
create index idx_pedido_bandeja on app.pedido (sucursal_id, estado, fecha_entrega);
create index idx_pedido_cliente on app.pedido (cliente_id, creado_en desc);

create table app.pedido_linea (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references app.pedido(id),
  numero smallint not null,
  presentacion_id bigint not null references app.presentacion(id),
  producto_id bigint not null references app.producto(id),
  factor integer not null check (factor > 0),
  cantidad_pedida integer not null check (cantidad_pedida > 0),   -- lo que pidió el cliente (última versión)
  cantidad integer not null check (cantidad >= 0),                -- vigente tras ajuste; 0 = no hubo
  piezas integer generated always as (cantidad * factor) stored,
  precio_lista numeric(12,2) not null,                            -- fn_precio al recibir/editar
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  importe numeric(12,2) generated always as (round(cantidad * precio_unitario, 2)) stored,
  motivo_ajuste text,
  estado text not null default 'activa' check (estado in ('activa','faltante','sustituida','quitada')),
  sustituye_linea_id bigint references app.pedido_linea(id),      -- línea agregada al aceptar un sustituto
  cantidad_entregada integer check (cantidad_entregada between 0 and cantidad),   -- null hasta entregar
  constraint uq_pedido_linea_numero unique (pedido_id, numero),
  constraint ck_pedido_linea_ajuste check (cantidad = cantidad_pedida or motivo_ajuste is not null),
  constraint ck_pedido_linea_estado check (estado not in ('sustituida','quitada') or cantidad = 0)
);
-- Sin unicidad por presentación: un sustituto puede ser una presentación que ya estaba en el pedido.
create index idx_pedido_linea_producto on app.pedido_linea (producto_id);

create table app.propuesta_faltante (    -- una por línea faltante; historial completo
  id bigint generated always as identity primary key,
  pedido_linea_id bigint not null references app.pedido_linea(id),
  causa text not null check (causa in ('sin_existencia','proveedor_sin_producto','danado','otro')),
  nota text,                                                      -- se muestra al cliente
  estado text not null default 'pendiente'
    check (estado in ('pendiente','aceptada','rechazada','vencida','cancelada')),
  opcion_elegida_id bigint,                                       -- FK abajo; null = rechazó todo (se quita)
  limite_en timestamptz not null,
  creada_por bigint not null references app.usuario(id), creado_en,
  respondida_en timestamptz,
  respondida_por bigint references app.usuario(id),               -- null + respondida = el cliente desde su enlace
  constraint ck_propuesta_respuesta check ((estado = 'pendiente') = (respondida_en is null))
);
create unique index uq_propuesta_pendiente on app.propuesta_faltante (pedido_linea_id) where estado = 'pendiente';

create table app.propuesta_opcion (
  id bigint generated always as identity primary key,
  propuesta_id bigint not null references app.propuesta_faltante(id),
  tipo text not null check (tipo in ('sustituto','reducir')),     -- «quitar» siempre está implícita
  presentacion_id bigint not null references app.presentacion(id),   -- reducir = la misma de la línea
  cantidad integer not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),   -- fn_precio de la lista del cliente
  importe numeric(12,2) generated always as (round(cantidad * precio_unitario, 2)) stored,
  orden smallint not null default 1
);
alter table app.propuesta_faltante add constraint fk_propuesta_opcion
  foreign key (opcion_elegida_id) references app.propuesta_opcion(id);

create table app.aviso_cliente (         -- cola de WhatsApp por enviar (wa.me manual)
  id bigint generated always as identity primary key,
  cliente_id bigint references app.cliente(id),                  -- null = aviso al personal (resumen del día)
  usuario_id bigint references app.usuario(id),                  -- destinatario del personal; usa usuario.telefono
  pedido_id bigint references app.pedido(id),
  plantilla text not null references app.plantilla(clave),        -- solo canal whatsapp
  vars jsonb not null default '{}',                               -- sin enlace ni teléfono: se ponen al renderizar
  clave text not null constraint uq_aviso_clave unique,           -- ver §2.4 «Claves de aviso»
  estado text not null default 'pendiente' check (estado in ('pendiente','enviado','descartado')),
  creado_en,
  enviado_en timestamptz, enviado_por bigint references app.usuario(id),
  constraint ck_aviso_enviado check ((estado = 'enviado') = (enviado_en is not null)),
  constraint ck_aviso_destino check ((cliente_id is null) <> (usuario_id is null))
);
create index idx_aviso_pendiente on app.aviso_cliente (creado_en) where estado = 'pendiente';

create table app.pedido_evento (        -- historial inmutable
  id bigint generated always as identity primary key,
  pedido_id bigint not null references app.pedido(id),
  tipo text not null check (tipo in ('recibido','editado_cliente','editado','confirmado','ajustado',
    'faltante_propuesto','faltante_respondido','faltante_vencido','asignado_ruta','quitado_ruta','cargado',
    'en_ruta','entregado','no_entregado','reprogramado','cancelado')),
  publico boolean not null default true,                  -- false = no sale en el seguimiento del cliente
  usuario_id bigint references app.usuario(id),           -- null = el cliente
  detalle jsonb not null default '{}',
  creado_en
);
create index idx_pedido_evento on app.pedido_evento (pedido_id, id);
```

**Ciclo del pedido** (`ESTADO_NO_VALIDO` para cualquier otra transición):

```
recibido ─confirmar─► confirmado ─cargar ruta─► cargado ─iniciar ruta─► en_ruta ─entregar─► entregado
   │ (cliente edita/cancela)  │  ▲                  │ (ajustar: solo bajar)    └─no entregado─► no_entregado
   │                 faltantes│  │cliente responde  │                                              │
   └─faltantes─► esperando_cliente ─(o vence el plazo: acción predeterminada)                       │
   └──────────── cancelar ◄── (recibido, esperando_cliente, confirmado, no_entregado) ◄─ reprogramar ─┘
recoge en bodega: confirmado ─entregar (turno de mostrador)─► entregado
«lo de siempre»: propuesto ─cliente acepta─► recibido;  propuesto ─rechaza o vence─► cancelado
```

«Surtiendo» no es un estado: es `requiere_surtido = true` (la línea cabe en la lista de surtido de su
fecha, §2.6) y el seguimiento del cliente lo muestra como etapa. Entrega parcial = `entregado` con alguna `cantidad_entregada <
cantidad`; lo no entregado nunca salió del inventario. `requiere_surtido` se calcula con `fn_lista_surtido`
(006): hasta F5 vale `false`.

Funciones 004 (las de cliente reciben `p_cliente_id` resuelto por la API desde el token):

| Objeto | Regla |
|---|---|
| `fn_generar_enlace(p_usuario_id, p_cliente_id, p_token_hash text, p_token_cifrado bytea, p_forzar boolean default false) returns bigint` | Cliente activo. Con `enlace_tras_primera_compra` y sin `ya_compro` ni pedido entregado → `SIN_PRIMERA_COMPRA` salvo `p_forzar` (queda en auditoría). Revocar invalida también sus dispositivos y su PIN (son del enlace). Revoca el vigente (`revocado_en/por`) e inserta el nuevo. El token lo genera la API (32 bytes aleatorios, base64url) y lo cifra en Node (AES-256-GCM, llave = `SECRETO_ENLACES`, env de ≥ 32 caracteres, la API no arranca en producción sin él). SQL nunca ve el token en claro. Crea el aviso `wa_enlace_cliente`. |
| `fn_revocar_enlace(p_usuario_id, p_cliente_ids bigint[], p_motivo text, p_nota text default null) returns integer` | «Dar de baja link», uno o varios. `clientes.enlace`. Por cliente con enlace vigente: `revocado_en/por`, `motivo_revocacion` (`otro` exige nota, `VALIDACION`); los que no tienen enlace se saltan. Devuelve cuántos se dieron de baja. Auditado (tabla auditada). El enlace dado de baja **nunca vuelve**: reactivar = `fn_generar_enlace` (enlace nuevo; el anterior queda `reemplazado` si seguía vigente). Única vía, junto con generar, que revoca (C21). |
| `fn_cliente_por_token(p_token_hash text, p_dispositivo_hash text) returns table(cliente_id, cliente_enlace_id, lista_precio_id, dispositivo_ok boolean, tiene_pin boolean)` | Enlace vigente y cliente activo; `dispositivo_ok` = el hash es un dispositivo no quitado de ese enlace (actualiza su `ultimo_uso_en`). Sin `dispositivo_ok`, la API solo permite las rutas de PIN y responde `401 PIN_REQUERIDO {tiene_pin}` a las demás. Actualiza `ultimo_uso_en` del enlace como mucho una vez por minuto. Sin fila = la API responde `401 ENLACE_INVALIDO`. |
| `fn_elegir_pin(p_cliente_enlace_id, p_pin_hash text, p_dispositivo_hash text, p_navegador text) returns bigint` | Solo si `pin_hash is null` (`PIN_YA_DEFINIDO`). Guarda el PIN (el hash bcrypt lo hace la API; el PIN son exactamente 4 dígitos) y registra el dispositivo. Primer PIN del enlace: sin alerta; PIN elegido tras un restablecimiento en un dispositivo nuevo: alerta `dispositivo_nuevo`. |
| `fn_entrar_con_pin(p_cliente_enlace_id, p_ip_hash, p_pin_ok boolean, p_dispositivo_hash, p_navegador) returns jsonb` | La API compara el PIN con bcrypt y pasa el resultado. Con `espera_hasta > now()` → `PIN_EN_ESPERA {segundos}` (sin comparar). Fallo → `fallos + 1`; al 5.º, `espera_hasta = now() + 15 min` y `fallos = 0` → `PIN_EN_ESPERA`; antes → `PIN_INCORRECTO {intentos_restantes}`. Acierto → borra la fila de espera, registra el dispositivo y `fn_notificar('dispositivo_nuevo', 'dispositivo:<id>', …)`. **El cliente sigue entrando**: la alerta no bloquea nada. |
| `fn_restablecer_pin(p_usuario_id, p_cliente_id) returns void` | `clientes.enlace`. `pin_hash = null` del enlace vigente (el enlace no cambia; los dispositivos recordados siguen); la próxima vez que abra en un navegador desconocido elige uno nuevo. |
| `fn_quitar_dispositivo(p_usuario_id, p_dispositivo_id) returns void` | `clientes.enlace`. `quitado_en/por`. Ese navegador vuelve a pedir PIN. |
| `fn_registrar_visita(p_cliente_id, p_tipo text) returns void` | `apertura` (en `GET /api/publico/cliente`, una vez cada 30 min por dispositivo, lo controla la API) o `catalogo`; upsert en `cliente_visita`. |
| `fn_alertas_clientes() returns integer` | Tarea diaria. **Visitas sin pedido**: aperturas en los últimos `visitas_dias` ≥ `visitas_umbral` y 0 pedidos (no `propuesto`) en ese plazo → `fn_notificar('visitas_sin_pedido', 'visitas:<cliente>:<semana ISO>', …)`. **Inactividad** («N días sin pedir»): su último pedido no `propuesto` se creó hace ≥ `inactividad_dias` (clientes que nunca han pedido: cuenta desde la creación del enlace vigente) → `fn_notificar('cliente_inactivo', 'inactivo:<cliente>:<id del último pedido o e<id del enlace>>', …)`. Solo clientes activos con enlace vigente. **Solo avisa**: no cambia enlace, dispositivos ni `activo`. Las mismas reglas alimentan `alertas` en `GET /api/clientes` (más `dispositivo_nuevo` = dispositivo no quitado con `primer_uso_en` en los últimos `visitas_dias` que no es el primero del enlace). Decisión del dueño: la alerta abre `/clientes?alerta=…` y cada fila marcada tiene **«Dar de baja link»**: un toque abre la confirmación con ese cliente seleccionado (motivo sugerido `ya_no_es_cliente`, editable); confirmar llama `fn_revocar_enlace`. Una persona decide (§0, C21). «Lo de siempre» (B5) usa su propia regla de cadencia, no esta. |
| `fn_proponer_ubicacion(p_cliente_id, p_lat, p_lng) returns void` | Llena `*_propuesta` y `fn_notificar('ubicacion_propuesta', 'ubicacion:<cliente>:<epoch>', …)`. Nunca toca `lat/lng`. |
| `fn_fijar_ubicacion(p_usuario_id, p_cliente_id, p_lat, p_lng, p_fuente text) returns void` | `p_fuente ∈ ('mapa','app')`, o `'cliente'` = aceptar la propuesta (copia y limpia `*_propuesta`). |
| `fn_registrar_pedido(p_cliente_id bigint, p_usuario_id bigint, p_datos jsonb, p_hash text) returns table(pedido_id bigint, repetida boolean)` | `p_usuario_id` null = enlace (origen `enlace`), si no `captura` (requiere `pedidos.capturar`). Idempotencia como compra. Cliente activo (`CLIENTE_INACTIVO`). Sin líneas → `PEDIDO_VACIO`; presentación activa, `se_vende`, producto activo (`PRESENTACION_NO_VALIDA`); `precio_lista = precio_unitario = fn_precio(…, cliente.lista_precio_id)`, null → `PRECIO_NO_DEFINIDO`. `fecha_solicitada` ≥ hoy local (`FECHA_NO_VALIDA`). `total < pedido_minimo` → `PEDIDO_MINIMO` (detalle `{minimo, total}`). Folio `P`; evento `recibido`; origen enlace → `fn_notificar('pedido_nuevo', 'pedido_nuevo:<id>', …)`; origen captura (llamada) → aviso `wa_pedido_recibido` (así el cliente recibe su enlace y puede seguir el pedido). `p_datos`: `{clave_idempotencia, cliente_id? (solo captura), lineas:[{presentacion_id, cantidad}] (1–100), notas?, entrega_tipo?, fecha_solicitada?}`. |
| `fn_editar_pedido_cliente(p_cliente_id, p_pedido_id, p_datos jsonb) returns void` | Pedido de ese cliente (`NO_ENCONTRADO`) en `recibido` (`PEDIDO_NO_EDITABLE`) [P32]. Reemplaza líneas, notas, entrega (mismas validaciones), recalcula precios y total, `version + 1`, evento `editado_cliente`, `fn_notificar('pedido_modificado', 'pedido_modificado:<id>:<version>', …)`. |
| `fn_cancelar_pedido_cliente(p_cliente_id, p_pedido_id, p_motivo text) returns void` | Solo `recibido` o `propuesto`. Notifica `pedido_cancelado_cliente`. |
| `fn_confirmar_pedido(p_usuario_id, p_pedido_id, p_datos jsonb) returns jsonb` | `recibido` → `confirmado` (crea aviso `wa_pedido_confirmado`). `p_datos.version` ≠ actual → `PEDIDO_CAMBIO` (el cliente lo editó mientras tanto). Fija `fecha_entrega` (≥ hoy) y `entrega_tipo`; aplica ajustes opcionales `lineas:[{pedido_linea_id, cantidad, precio_unitario?, motivo_ajuste?}]` y `agregar:[{presentacion_id, cantidad}]` (agregar = `cantidad_pedida = cantidad`, motivo «agregado por despacho»). Precio distinto del de lista → `pedidos.cambiar_precio` (`SIN_PERMISO_PRECIO`). Devuelve `{pedido, advertencias:[{producto_id, producto, requeridas, disponibles}]}` para líneas sin disponible suficiente (no bloquea: se compran con la lista de surtido). |
| `fn_ajustar_pedido(p_usuario_id, p_pedido_id, p_datos jsonb) returns jsonb` | En `confirmado` o `cargado` («no hay producto»). Mismo formato de `lineas`/`agregar`; `version + 1`; evento `ajustado` con el antes/después. En `cargado` solo puede bajar cantidades (`AJUSTE_NO_VALIDO`): lo cargado ya pasó el control de existencia. Crea aviso `wa_pedido_ajustado`. Para que el cliente **elija**, usar faltantes (§2.4.1); ajustar es para cambios que no necesitan respuesta. |
| `fn_cancelar_pedido(p_usuario_id, p_pedido_id, p_motivo text) returns void` | Desde `recibido`, `esperando_cliente` (cancela sus propuestas), `confirmado` o `no_entregado`. Si está en una ruta `planeada`, borra su parada; en ruta cargada → `PEDIDO_EN_RUTA` (primero se ajusta a 0 o se marca no entregado). |
| `fn_reprogramar_pedido(p_usuario_id, p_pedido_id, p_fecha date) returns void` | `no_entregado` → `confirmado` con nueva `fecha_entrega`, `ruta_id = null`. |
| `fn_aviso_cliente(p_cliente_id, p_pedido_id, p_plantilla text, p_clave text, p_vars jsonb) returns bigint` | Inserta en `aviso_cliente` (`ON CONFLICT (clave) DO NOTHING`) y pasa a `descartado` los pendientes **del mismo pedido** (el aviso nuevo lleva el estado vigente y el enlace muestra el resto). Cliente sin `telefono_whatsapp`: se crea igual y la cola lo marca «sin teléfono». La llaman las funciones de negocio en su transacción; también `POST /api/avisos` para avisos manuales (recordatorio de saldo, reenviar enlace). |
| Claves de aviso | De pedido: `<plantilla>:p<pedido_id>:v<version>` (`wa_pedido_en_ruta` y `wa_nota_entrega` usan además `:r<ruta_id>`). Sin pedido, por evento: `wa_enlace_cliente:c<cliente>:e<cliente_enlace.id>` (uno por enlace generado), `wa_recordatorio_saldo:c<cliente>:<fecha local>` (uno por día). Manuales (`POST /api/avisos`): `manual:<clave_idempotencia uuid del cuerpo>` (reintento seguro, cada envío pedido a mano es nuevo). **Descartar pendientes**: aviso nuevo con `pedido_id` descarta los pendientes de ese `pedido_id`; sin pedido, los pendientes del mismo `cliente_id` y misma `plantilla`. |
| `fn_marcar_aviso(p_usuario_id, p_aviso_id, p_estado text) returns void` | `pendiente` → `enviado` (o `descartado`); otro estado → `AVISO_NO_PENDIENTE`. Marcar enviado es confianza: WhatsApp no confirma nada. |
| `trg_pedido_total` AFTER INSERT/UPDATE/DELETE ON pedido_linea | `pedido.total = Σ importe` de sus líneas. Único lugar donde se calcula el total. |
| `fn_frecuentes(p_cliente_id, p_limite int default 12) returns table(presentacion_id, veces, ultima_cantidad)` (stable) | Presentaciones de sus pedidos entregados o en curso de los últimos 90 días, por número de pedidos en que aparecen y luego por recencia. Si no hay historial: favoritos y luego las más vendidas de su zona. |
| `v_comprometido` | Por `sucursal_id, producto_id`: `confirmadas` = Σ piezas de pedidos `confirmado`; `cargadas` = Σ piezas de pedidos `cargado`/`en_ruta`. |

Permisos 004: `clientes.ver, clientes.editar, clientes.credito, clientes.enlace, pedidos.ver, pedidos.capturar, pedidos.gestionar, pedidos.cambiar_precio, avisos.enviar`.

**Precio del pedido**: se congela cuando el cliente confirma (enviar, editar o aceptar un propuesto) con el total que vio; antes de eso, todo borrador muestra precios de la base en ese momento (§2.12 B5). Si la lista cambia antes de
entregar, el pedido conserva su precio; despacho puede reajustarlo con `pedidos.cambiar_precio` [P33].
**Qué ve el cliente**: su nombre, su lista de precios, imágenes, sus favoritos, sus pedidos (últimos 20) con
seguimiento (§2.4.2), los faltantes por responder y
su saldo/crédito disponible [P35]. **No** ve existencias, costos, otros clientes ni datos del personal.

#### 2.4.1 Faltantes y sustituciones

| Objeto | Regla |
|---|---|
| `fn_proponer_faltantes(p_usuario_id, p_pedido_id, p_datos jsonb) returns jsonb` | Pedido `recibido` o `confirmado` (`ESTADO_NO_VALIDO`; en `cargado` solo se ajusta). `p_datos`: `{version, fecha_entrega?, lineas:[{pedido_linea_id, causa, nota?, opciones:[{tipo, presentacion_id?, cantidad}]}]}`. `version` distinta → `PEDIDO_CAMBIO`; desde `recibido` exige `fecha_entrega` (proponer faltantes confirma lo demás). Cada línea `activa` (`LINEA_NO_VALIDA`) → `faltante`; propuesta `pendiente` con `limite_en = now() + faltante_minutos_respuesta`; opciones con precio `fn_precio(presentación, lista del cliente)` (null → `PRECIO_NO_DEFINIDO`); `reducir` exige la misma presentación y `cantidad < cantidad de la línea`. Pedido → `esperando_cliente`, `respuesta_limite_en` = el límite mayor, `version + 1`; evento `faltante_propuesto`; aviso `wa_pedido_faltante`. Devuelve `{pedido, sugerencias}`. |
| Sugerencias (lectura) | `GET /api/pedidos/:id/sugerencias?pedido_linea_id`: presentaciones activas `se_vende` de `producto_equivalente` (por `orden`) con el mismo factor primero, precio de la lista del cliente y `disponible_piezas`. El personal elige; no se proponen solas. |
| `fn_responder_faltante(p_cliente_id bigint, p_usuario_id bigint, p_propuesta_id bigint, p_opcion_id bigint) returns jsonb` | El cliente desde su enlace (`p_usuario_id` null; propuesta de su pedido) o el personal por él (llamada; `pedidos.gestionar`). Propuesta `pendiente` (`PROPUESTA_CERRADA`). `p_opcion_id` null = rechazar → línea `quitada` (cantidad 0, motivo). `reducir` → línea `activa` con la cantidad nueva. `sustituto` → línea original `sustituida` (0) y línea nueva `activa` con `sustituye_linea_id`, `cantidad_pedida = cantidad` de la opción, precio de la opción. Evento `faltante_respondido`; `fn_notificar('faltante_respondido', 'faltante:<propuesta>', …)`. Si ya no quedan propuestas pendientes en el pedido → `confirmado`, `respuesta_limite_en = null`. Total por `trg_pedido_total`. |
| `fn_vencer_faltantes() returns integer` | Tarea de la API cada minuto. Propuestas `pendiente` con `limite_en < now()` → `vencida` y se aplica `faltante_accion_predeterminada`: `quitar` (línea `quitada`) o `reducir` (la opción `reducir` si existe; si no, quitar). Nunca acepta un sustituto por el cliente. Evento `faltante_vencido`; si no quedan pendientes, pedido → `confirmado` y aviso `wa_pedido_ajustado`. |
| `fn_cancelar_faltante(p_usuario_id, p_propuesta_id) returns void` | El personal retira la propuesta (llegó el producto): línea vuelve a `activa` con su cantidad; propuesta `cancelada`. |

Carga: un pedido `esperando_cliente` se puede asignar a una ruta, pero `fn_cargar_ruta` lo rechaza
(`PEDIDO_ESPERANDO_CLIENTE`). Lista de surtido: las líneas `faltante` no cuentan; las sustitutas sí.

#### 2.4.2 Seguimiento del cliente (lectura del enlace)

`fn_seguimiento_pedido(p_cliente_id, p_pedido_id) returns jsonb` (stable), pedido de ese cliente:
`{folio, etapa, etiqueta, total, fecha_entrega, entrega_tipo, lineas:[{producto, presentacion, cantidad_pedida, cantidad, cantidad_entregada, estado, motivo_ajuste, precio_unitario, importe}], faltantes:[{propuesta_id, linea, causa, nota, limite_en, opciones:[{id, tipo, producto, presentacion, imagen, cantidad, precio_unitario, importe}]}], linea_tiempo:[{etapa, en}], reparto:{parada, paradas, antes_que_tu, llegada_estimada_desde, llegada_estimada_hasta}|null, editable}`.

- `etapa` ∈ `propuesto, recibido, esperando_cliente, confirmado, surtiendo, cargado, en_ruta, entregado, no_entregado, cancelado`
  (`surtiendo` = confirmado con `requiere_surtido`); `etiqueta` = plantilla `estado_<etapa>`.
- `linea_tiempo` sale de `pedido_evento` con `publico = true` (primera vez de cada etapa).
- `reparto` solo en `en_ruta`: «eres la parada `parada` de `paradas`», `antes_que_tu` = paradas
  `pendiente` con menor `orden`. Hora estimada = `now() + Σ km_desde_anterior (de las pendientes hasta la
  suya) / reparto_velocidad_kmh + antes_que_tu · reparto_minutos_por_parada`, mostrada como rango de ±30
  min. `shortcut`: sin GPS del repartidor; la estimación avanza conforme él marca paradas.
- Nunca incluye notas internas, nombre/teléfono del repartidor ni otras paradas.

### 2.5 Migración 005 — dispositivos y envío push

```sql
create table app.dispositivo (
  id bigint generated always as identity primary key,
  usuario_id bigint not null references app.usuario(id),
  sesion_jti uuid not null references app.sesion(jti) on delete cascade,   -- solo sesiones origen 'app'
  token_push text not null constraint uq_dispositivo_token unique,         -- token FCM del aparato; nunca se loguea
  plataforma text not null check (plataforma = 'android'),   -- solo Android; iPhone usa la web sin push
  app_version text,
  creado_en, ultimo_uso_en timestamptz not null default now(),
  revocado_en timestamptz
);
create index idx_dispositivo_usuario on app.dispositivo (usuario_id) where revocado_en is null;

create table app.notificacion_envio (   -- outbox: un renglón por notificación × dispositivo
  id bigint generated always as identity primary key,
  notificacion_id bigint not null references app.notificacion(id),
  dispositivo_id bigint not null references app.dispositivo(id),
  estado text not null default 'pendiente' check (estado in ('pendiente','enviada','fallida','descartada')),
  intentos smallint not null default 0,
  siguiente_intento_en timestamptz not null default now(),
  ultimo_error text,                                       -- código de FCM, sin token ni cuerpo
  enviada_en timestamptz,
  constraint uq_envio unique (notificacion_id, dispositivo_id)
);
create index idx_envio_pendiente on app.notificacion_envio (siguiente_intento_en) where estado = 'pendiente';
```

| Objeto | Regla |
|---|---|
| `trg_notificacion_encolar` AFTER INSERT ON notificacion | Un `notificacion_envio` por dispositivo activo del usuario (`revocado_en is null`, sesión viva) salvo `notificacion_preferencia.push = false` para ese evento. |
| `trg_sesion_cerrada_revoca` AFTER UPDATE OF cerrada_en ON sesion | Revoca sus dispositivos y descarta sus envíos pendientes. |
| `fn_registrar_dispositivo(p_usuario_id, p_jti uuid, p_token text, p_plataforma text, p_version text) returns bigint` | Upsert por token: si el token estaba en otra sesión/usuario, se reasigna (un teléfono, un dueño). Sesión `app` (`SOLO_APP`). |
| Envío (TS, `apps/api/src/modulos/notificaciones/envio.ts`) | Cada 15 s: `SELECT … FOR UPDATE SKIP LOCKED LIMIT 50` pendientes vencidos; **FCM HTTP v1** (token OAuth firmado con `jose` desde la cuenta de servicio; sin dependencia nueva); éxito → `enviada`; error temporal → `intentos + 1`, espera 1, 5, 30, 120 min, al 5.º → `fallida`; `UNREGISTERED`/`INVALID_ARGUMENT` → dispositivo revocado y `descartada`. Envíos con > 24 h → `descartada` (un aviso viejo no sirve). Mensaje `data` con `{notificacion_id, evento, datos}` + `notification` con título y cuerpo ya renderizados; `channel_id: 'avisos'`. Sin `FCM_CUENTA_SERVICIO` el envío está apagado y la bandeja sigue funcionando. `shortcut`: un solo proceso de API; con réplicas, `SKIP LOCKED` ya evita dobles envíos. |

**Decisión FCM directo, no Expo Push**: igual que RefaccionPro (`apps/mobile/src/push/push.ts` usa
`getDevicePushTokenAsync`): sin intermediario externo con los textos, sin llave de Expo, costo cero.
iPhone usa el panel en Safari/PWA sin push (bandeja y campana sí); web push queda como mejora opcional [R8].

### 2.6 Migración 006 — lista de surtido (compra contra pedido)

| Objeto | Regla |
|---|---|
| `fn_lista_surtido(p_sucursal_id bigint, p_fecha date, p_ruta_id bigint default null) returns table(proveedor_id, proveedor, producto_id, producto, modo_surtido, piezas_pedidas, existencia, comprometido_previo, disponible, piezas_a_comprar, reponer_minimo, presentacion_id, presentacion, factor, cantidad_sugerida, ultimo_costo, costo_estimado, sugerido_demanda, promocion_id, costo_promocion, ahorro)` (stable; las cuatro últimas son la compra inteligente, §2.12 B7) | `piezas_pedidas` = Σ piezas de pedidos `confirmado` con `fecha_entrega = p_fecha` (y de esa ruta si viene). `comprometido_previo` = Σ piezas `cargado`/`en_ruta` (cualquier fecha) + `confirmado` con `fecha_entrega < p_fecha`. `disponible = existencia − comprometido_previo`. **`piezas_a_comprar = greatest(0, piezas_pedidas − greatest(0, disponible))`** — igual para ambos modos: un producto de inventario que se acabó aparece solo. `reponer_minimo` (solo `inventario`) = `greatest(0, existencia_minima − greatest(0, disponible − piezas_pedidas))`. Presentación sugerida = la de mayor `factor` con `se_compra` activa; `cantidad_sugerida = ceil((piezas_a_comprar + reponer_minimo) / factor)`. `ultimo_costo` = `costo_presentacion` de la última compra de esa presentación. Solo filas con algo que comprar. Orden: proveedor (sin proveedor al final), producto. |
| `fn_publicar_surtido(p_usuario_id, p_sucursal_id, p_fecha date) returns integer` | `fn_notificar('surtido_listo', 'surtido:<fecha>:<hash de la lista>', {fecha, num_productos})`: publicar dos veces la misma lista no duplica; si la lista cambió, avisa de nuevo. |

Permiso 006: `surtido.ver`. **Decisiones**: el modo de surtido es **por producto, sin excepción por
línea** (la fórmula ya cubre cualquier faltante; lo que cambia el modo es si cuenta el mínimo y si sale
en «bajo mínimo»). La lista **no se guarda**: comprar contra ella es registrar compras normales (con
`fecha_surtido` informativa, precargadas desde la lista en `/compras/nueva?surtido=<fecha>`); al
recalcular, lo comprado desaparece. Kárdex: `compra` entra, `venta` sale al entregar; nada de existencia
negativa. Costos (`ultimo_costo`, `costo_estimado`) solo con `costos.ver`.

### 2.7 Migración 007 — rutas y orden de carga

```sql
create table app.vehiculo (             -- auditada. Camionetas [P30]
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) > 0),
  placas text,
  capacidad_cajas integer check (capacidad_cajas > 0),     -- informativa: aviso si la carga la pasa
  activo boolean not null default true, creado_en
);
create unique index uq_vehiculo_nombre on app.vehiculo (lower(nombre));

create table app.ruta (
  id bigint generated always as identity primary key,
  sucursal_id bigint not null references app.sucursal(id),
  folio text not null,
  fecha date not null,
  nombre text,                                             -- 'Norte mañana'
  vehiculo_id bigint not null references app.vehiculo(id),
  repartidor_id bigint not null references app.usuario(id),
  estado text not null default 'planeada' check (estado in
    ('planeada','cargada','en_curso','terminada','liquidada','cancelada')),
  distancia_km numeric(8,2),                               -- de la última optimización/orden
  optimizada_en timestamptz,
  turno_caja_id bigint,                                    -- FK en 008: turno de cobro del repartidor
  creado_por bigint not null references app.usuario(id),
  creado_en, cargada_en timestamptz, iniciada_en timestamptz, terminada_en timestamptz,
  constraint uq_ruta_folio unique (sucursal_id, folio)
);
create index idx_ruta_fecha on app.ruta (sucursal_id, fecha desc);
create index idx_ruta_repartidor on app.ruta (repartidor_id, fecha desc);

create table app.ruta_parada (
  id bigint generated always as identity primary key,
  ruta_id bigint not null references app.ruta(id),
  orden smallint not null check (orden > 0),
  tipo text not null check (tipo in ('entrega','cobro')),
  cliente_id bigint not null references app.cliente(id),
  pedido_id bigint references app.pedido(id),
  estado text not null default 'pendiente' check (estado in ('pendiente','visitada','fallida','omitida')),
  km_desde_anterior numeric(8,2),
  visitada_en timestamptz, nota text,
  constraint uq_parada_orden unique (ruta_id, orden) deferrable initially deferred,
  constraint uq_parada_pedido unique (ruta_id, pedido_id),
  constraint ck_parada_pedido check ((tipo = 'entrega') = (pedido_id is not null))
);
create index idx_parada_pedido on app.ruta_parada (pedido_id);

alter table app.pedido add constraint fk_pedido_ruta foreign key (ruta_id) references app.ruta(id);
```

Funciones 007 (todas con `FOR UPDATE` sobre la ruta):

| Objeto | Regla |
|---|---|
| `fn_crear_ruta(p_usuario_id, p_sucursal_id, p_datos jsonb) returns bigint` | `{fecha, nombre?, vehiculo_id, repartidor_id}`; vehículo activo; repartidor activo con `rutas.operar` (`REPARTIDOR_NO_VALIDO`). Folio `R`. |
| `fn_asignar_pedidos(p_usuario_id, p_ruta_id, p_pedido_ids bigint[]) returns void` | Ruta `planeada` (`RUTA_NO_EDITABLE`). Cada pedido `confirmado` o `esperando_cliente`, `entrega_tipo = 'reparto'`, sin ruta (`PEDIDO_EN_OTRA_RUTA`) y `fecha_entrega = ruta.fecha` (`PEDIDO_NO_ASIGNABLE`). Parada `entrega` al final; `pedido.ruta_id`; evento `asignado_ruta`. Si el cliente no tiene ubicación, se asigna igual (la optimización la deja al final y avisa). |
| `fn_agregar_cobro(p_usuario_id, p_ruta_id, p_cliente_id) returns bigint` | Parada `cobro` para un cliente con saldo y sin pedido en la ruta (`PARADA_DUPLICADA`). |
| `fn_quitar_parada(p_usuario_id, p_parada_id) returns void` | Ruta `planeada`. Libera el pedido (`ruta_id = null`, evento `quitado_ruta`) y recorre los `orden`. |
| `fn_ordenar_ruta(p_usuario_id, p_ruta_id, p_paradas bigint[], p_km numeric[] default null, p_optimizada boolean default false) returns void` | Ruta `planeada`. `p_paradas` debe ser exactamente el conjunto de paradas de la ruta (`PARADAS_NO_CUADRAN`). Asigna `orden` 1..n; `km_desde_anterior` y `distancia_km` (Σ + regreso, en `p_km[n+1]`) si vienen; `optimizada_en = now()` si `p_optimizada`. Lo usan «Optimizar» (§2.7.1) y el reordenamiento manual (sin km: se borran). |
| `fn_cargar_ruta(p_usuario_id, p_ruta_id) returns jsonb` | `planeada` → `cargada`, ≥ 1 parada `entrega` (`RUTA_VACIA`). **Control de existencia**: por producto, Σ piezas de los pedidos de la ruta ≤ `existencia − cargadas` de `v_comprometido` (otras rutas ya cargadas); si no → `FALTA_SURTIR` (detalle `[{producto_id, producto, faltan}]`): se compra o se ajusta antes de cargar. Pedido `esperando_cliente` → `PEDIDO_ESPERANDO_CLIENTE`. Pedidos → `cargado`; evento; `fn_notificar('ruta_asignada', 'ruta:<id>:cargada', …, repartidor_id)`. Devuelve la orden de carga. |
| `fn_orden_carga(p_ruta_id) returns jsonb` (stable) | `{paradas:[{carga_n = n − orden + 1, orden, cliente, zona, pedido_folio, lineas:[{cantidad, presentacion, producto}]}] ordenado por carga_n, totales:[{producto, presentacion, cantidad, piezas}], cajas_totales}`. **LIFO**: `carga_n = 1` es la última parada (va al fondo); la primera parada se sube al final y queda en la puerta. |
| `fn_marcar_no_entregado(p_usuario_id, p_parada_id, p_motivo text) returns void` | Ruta `en_curso`, ruta propia (`RUTA_AJENA`) o `rutas.planear`. Parada `fallida`; pedido `no_entregado` con motivo; `fn_notificar('entrega_fallida', 'fallida:<pedido>', …)`; aviso `wa_entrega_fallida`. El producto vuelve en la camioneta: nunca salió del kárdex. **Idempotente**: parada ya `fallida` → no hace nada y devuelve sin error (notificación y aviso ya deduplicados por clave). |
| `fn_terminar_ruta(p_usuario_id, p_ruta_id) returns void` | `en_curso` → `terminada`. Paradas `pendiente` → `omitida`; sus pedidos → `no_entregado` (motivo «no visitada») con notificación. |
| `fn_cancelar_ruta(p_usuario_id, p_ruta_id) returns void` | Solo `planeada` o `cargada`: pedidos vuelven a `confirmado` sin ruta. |
| `fn_iniciar_ruta(p_usuario_id, p_ruta_id, p_fondo_inicial numeric default 0) returns bigint` | Ruta `cargada`, del repartidor (`RUTA_AJENA`). Ruta → `en_curso`, `iniciada_en`; pedidos → `en_ruta` (evento) y un aviso `wa_pedido_en_ruta` por pedido (con su número de parada). En 007 devuelve `null` e ignora el fondo; **008 la reemplaza con la misma firma** (`CREATE OR REPLACE`, sin sobrecarga) para abrir además el turno de ruta y devolver su id. Así F6 opera la ruta completa (iniciar, no entregado, terminar, «parada N de M») antes de que exista el cobro. |

`fn_liquidar_ruta` llega en 008 (necesita el turno de caja).
Permisos 007: `rutas.ver, rutas.planear, rutas.operar, rutas.liquidar`. Sin `rutas.ver`, el repartidor
(`rutas.operar`) solo ve las rutas donde `repartidor_id` = él (filtro en la API).

#### 2.7.1 Optimización de paradas (TS en la API)

- `apps/api/src/modulos/rutas/optimizar.ts`, función pura `ordenarParadas(bodega, paradas) → {orden, km}`
  con pruebas unitarias. Sin servicios de pago ni llaves.
- Distancia: **haversine** en km (radio 6371). Recorrido cerrado bodega → paradas → bodega.
- Heurística: **vecino más cercano** desde la bodega, luego **2-opt** hasta que ninguna inversión mejore
  (o 2000 iteraciones). Con ≤ 60 paradas tarda milisegundos.
- Paradas de un mismo cliente quedan juntas (distancia 0). Paradas sin ubicación van al final en su orden
  actual y la respuesta las lista en `sin_ubicacion`. Bodega sin coordenadas → `409 BODEGA_SIN_UBICACION`.
- La API guarda con `fn_ordenar_ruta(…, p_optimizada = true)`. El personal puede reordenar a mano después.
- `shortcut`: haversine ignora calles y sentidos; mejora futura: cambiar solo la función de distancias por
  la matriz de **OSRM autoalojado** (`/table`, contenedor con el mapa de OSM de México) o por **Google
  Routes / Route Optimization** (de pago) si el recorrido real difiere mucho.
- Navegación (sin API ni costo): por parada `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`
  y `https://waze.com/ul?ll=<lat>,<lng>&navigate=yes`; ruta completa en Google Maps en tramos de 9
  `waypoints` (límite de la URL).

### 2.8 Migración 008 — caja, ventas, entrega de pedidos, liquidación, cobranza

```sql
create table app.caja (                 -- auditada. Semilla: 'Mostrador' en sucursal 1 [P15]
  id bigint generated always as identity primary key,
  sucursal_id bigint not null references app.sucursal(id),
  nombre text not null,
  activa boolean not null default true, creado_en,
  constraint uq_caja_nombre unique (sucursal_id, nombre)
);

create table app.turno_caja (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('mostrador','ruta')),
  caja_id bigint references app.caja(id),                  -- mostrador
  ruta_id bigint references app.ruta(id),                  -- ruta: el repartidor cobra en su turno
  usuario_id bigint not null references app.usuario(id),   -- quien opera (cajero o repartidor)
  estado text not null default 'abierto' check (estado in ('abierto','cerrado')),
  fondo_inicial numeric(12,2) not null check (fondo_inicial >= 0),   -- en ruta: el cambio que se lleva
  abierto_en timestamptz not null default now(),
  cerrado_en timestamptz, cerrado_por bigint references app.usuario(id),
  efectivo_esperado numeric(12,2), efectivo_contado numeric(12,2) check (efectivo_contado >= 0),
  diferencia numeric(12,2), notas_cierre text,
  constraint ck_turno_tipo check ((tipo = 'mostrador' and caja_id is not null and ruta_id is null)
                               or (tipo = 'ruta' and ruta_id is not null and caja_id is null)),
  constraint ck_turno_cierre check ((estado = 'cerrado') =
    (cerrado_en is not null and efectivo_esperado is not null and efectivo_contado is not null and diferencia is not null))
);
create unique index uq_turno_abierto_caja on app.turno_caja (caja_id) where estado = 'abierto';
create unique index uq_turno_abierto_usuario on app.turno_caja (usuario_id) where estado = 'abierto';
create unique index uq_turno_ruta on app.turno_caja (ruta_id) where ruta_id is not null;
create index idx_turno_fecha on app.turno_caja (abierto_en desc);

alter table app.ruta add constraint fk_ruta_turno foreign key (turno_caja_id) references app.turno_caja(id);

create table app.movimiento_caja (
  id bigint generated always as identity primary key,
  turno_caja_id bigint not null references app.turno_caja(id),
  tipo text not null check (tipo in ('entrada','salida','retiro','reembolso')),
  monto numeric(12,2) not null check (monto > 0),
  motivo text not null,
  referencia_tabla text check (referencia_tabla in ('venta','devolucion','abono')),
  referencia_id bigint,
  usuario_id bigint not null references app.usuario(id),
  creado_en
);
create index idx_movimiento_caja_turno on app.movimiento_caja (turno_caja_id);

create table app.venta (
  id bigint generated always as identity primary key,
  sucursal_id bigint not null references app.sucursal(id),
  folio text not null,
  origen text not null check (origen in ('mostrador','pedido')),
  pedido_id bigint constraint uq_venta_pedido unique references app.pedido(id),
  turno_caja_id bigint not null references app.turno_caja(id),
  cliente_id bigint references app.cliente(id),             -- null = público en general (solo mostrador)
  lista_precio_id bigint not null references app.lista_precio(id),
  usuario_id bigint not null references app.usuario(id),
  estado text not null default 'completada' check (estado in ('completada','cancelada')),
  total numeric(12,2) not null default 0 check (total >= 0),   -- precio final
  efectivo_recibido numeric(12,2), cambio numeric(12,2) check (cambio >= 0),
  notas text,
  clave_idempotencia uuid not null constraint uq_venta_clave unique,
  hash_solicitud text not null,
  creado_en,
  cancelada_en timestamptz, cancelada_por bigint references app.usuario(id), motivo_cancelacion text,
  constraint uq_venta_folio unique (sucursal_id, folio),
  constraint ck_venta_origen check ((origen = 'pedido') = (pedido_id is not null)
                                and (origen = 'mostrador' or cliente_id is not null)),
  constraint ck_venta_cancelada check ((estado = 'cancelada') = (cancelada_en is not null))
);
create index idx_venta_fecha on app.venta (sucursal_id, creado_en desc);
create index idx_venta_turno on app.venta (turno_caja_id);
create index idx_venta_cliente on app.venta (cliente_id, creado_en desc);
create index idx_venta_usuario on app.venta (usuario_id, creado_en desc);

alter table app.pedido add constraint fk_pedido_venta foreign key (venta_id) references app.venta(id);

create table app.venta_linea (
  id bigint generated always as identity primary key,
  venta_id bigint not null references app.venta(id),
  numero smallint not null,
  presentacion_id bigint not null references app.presentacion(id),
  producto_id bigint not null references app.producto(id),
  factor integer not null check (factor > 0),
  cantidad integer not null check (cantidad > 0),          -- presentaciones
  piezas integer generated always as (cantidad * factor) stored,
  precio_lista numeric(12,2) not null,
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  importe numeric(12,2) not null,                          -- round(cantidad * precio_unitario, 2)
  costo_unitario numeric(14,6) not null,                   -- por pieza, del movimiento
  costo_total numeric(12,2) not null,                      -- round(costo_unitario * piezas, 2)
  piezas_devueltas integer not null default 0,
  constraint uq_venta_linea_numero unique (venta_id, numero),
  constraint ck_venta_linea_devuelto check (piezas_devueltas between 0 and cantidad * factor)
);
create index idx_venta_linea_producto on app.venta_linea (producto_id);

create table app.venta_pago (
  id bigint generated always as identity primary key,
  venta_id bigint not null references app.venta(id),
  metodo text not null check (metodo in ('efectivo','transferencia','tarjeta','credito')),
  monto numeric(12,2) not null check (monto > 0),          -- efectivo: lo aplicado, sin cambio
  referencia text,                                         -- transferencia: clave/folio que dice el cliente
  comprobante text check (comprobante ~ '^[0-9a-f]{64}\.(jpg|png|webp)$'),   -- foto opcional (§4.5)
  verificado_en timestamptz, verificado_por bigint references app.usuario(id),   -- transferencia vista en el banco
  constraint uq_venta_pago_metodo unique (venta_id, metodo),
  constraint ck_pago_comprobante check (comprobante is null or metodo = 'transferencia')
);

create table app.cuenta_por_cobrar (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references app.cliente(id),
  origen text not null default 'venta' check (origen in ('venta','saldo_inicial')),
  venta_id bigint constraint uq_cxc_venta unique references app.venta(id),
  concepto text,                                           -- saldo_inicial: «Saldo de libreta al …»
  monto numeric(12,2) not null check (monto > 0),
  saldo numeric(12,2) not null check (saldo >= 0 and saldo <= monto),
  vence_el date not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','saldada','cancelada')),
  creado_por bigint not null references app.usuario(id),
  creado_en,
  constraint ck_cxc_origen check ((origen = 'venta') = (venta_id is not null)),
  constraint ck_cxc_estado check ((estado = 'pendiente' and saldo > 0) or (estado in ('saldada','cancelada') and saldo = 0))
);
create index idx_cxc_cliente_pendiente on app.cuenta_por_cobrar (cliente_id, vence_el) where estado = 'pendiente';

create table app.devolucion (
  id bigint generated always as identity primary key,
  sucursal_id bigint not null references app.sucursal(id),
  folio text not null,
  venta_id bigint not null references app.venta(id),
  turno_caja_id bigint references app.turno_caja(id),      -- obligatorio si reembolso_efectivo > 0
  usuario_id bigint not null references app.usuario(id),
  motivo text not null,
  total numeric(12,2) not null check (total > 0),
  abono_credito numeric(12,2) not null check (abono_credito >= 0),
  reembolso_efectivo numeric(12,2) not null check (reembolso_efectivo >= 0),
  clave_idempotencia uuid not null constraint uq_devolucion_clave unique,
  hash_solicitud text not null,
  creado_en,
  constraint uq_devolucion_folio unique (sucursal_id, folio),
  constraint ck_devolucion_reparto check (total = abono_credito + reembolso_efectivo),
  constraint ck_devolucion_turno check (reembolso_efectivo = 0 or turno_caja_id is not null)
);
create index idx_devolucion_venta on app.devolucion (venta_id);

create table app.devolucion_linea (
  id bigint generated always as identity primary key,
  devolucion_id bigint not null references app.devolucion(id),
  venta_linea_id bigint not null references app.venta_linea(id),
  producto_id bigint not null references app.producto(id),
  piezas integer not null check (piezas > 0),
  importe numeric(12,2) not null,      -- round(vl.importe * piezas / vl.piezas, 2)
  costo_total numeric(12,2) not null,  -- round(vl.costo_unitario * piezas, 2)
  regresa_a_inventario boolean not null  -- false = dañada: entra y sale como merma causa 'danado'
);
create index idx_devolucion_linea_vl on app.devolucion_linea (venta_linea_id);

create table app.abono (
  id bigint generated always as identity primary key,
  sucursal_id bigint not null references app.sucursal(id),
  folio text not null,
  cliente_id bigint not null references app.cliente(id),
  turno_caja_id bigint references app.turno_caja(id),      -- en ruta: el turno del repartidor
  ruta_parada_id bigint references app.ruta_parada(id),    -- si se cobró en una visita
  metodo text not null check (metodo in ('efectivo','transferencia','tarjeta')),
  monto numeric(12,2) not null check (monto > 0),
  referencia text,
  comprobante text check (comprobante ~ '^[0-9a-f]{64}\.(jpg|png|webp)$'),
  estado text not null default 'aplicado' check (estado in ('aplicado','cancelado')),
  usuario_id bigint not null references app.usuario(id),
  clave_idempotencia uuid not null constraint uq_abono_clave unique,
  hash_solicitud text not null,
  creado_en,
  cancelado_en timestamptz, cancelado_por bigint references app.usuario(id), motivo_cancelacion text,
  constraint uq_abono_folio unique (sucursal_id, folio),
  constraint ck_abono_efectivo_turno check (metodo <> 'efectivo' or turno_caja_id is not null),
  constraint ck_abono_cancelado check ((estado = 'cancelado') = (cancelado_en is not null))
);
create index idx_abono_cliente on app.abono (cliente_id, creado_en desc);
create index idx_abono_turno on app.abono (turno_caja_id);

create table app.abono_aplicacion (
  abono_id bigint not null references app.abono(id),
  cuenta_por_cobrar_id bigint not null references app.cuenta_por_cobrar(id),
  monto numeric(12,2) not null check (monto > 0),
  primary key (abono_id, cuenta_por_cobrar_id)
);
create index idx_abono_aplicacion_cxc on app.abono_aplicacion (cuenta_por_cobrar_id);
```

Funciones 008 (todas reciben `p_usuario_id` y validan el permiso fino con `fn_tiene_permiso`):

| Función | Regla |
|---|---|
| `fn_abrir_turno(p_usuario_id, p_caja_id, p_fondo_inicial numeric) returns bigint` | Turno `mostrador`. Caja activa; `TURNO_YA_ABIERTO` o `CAJA_OCUPADA`. |
| `fn_iniciar_ruta(…)` (reemplazo, misma firma que 007) | Lo de 007 y además abre turno `ruta` del repartidor con el fondo (`TURNO_YA_ABIERTO` si tiene otro), lo guarda en `ruta.turno_caja_id` y devuelve su id. |
| `fn_movimiento_caja(p_usuario_id, p_turno_id, p_tipo text, p_monto numeric, p_motivo text) returns bigint` | `p_tipo ∈ ('entrada','salida','retiro')`; turno abierto y propio (`TURNO_NO_ABIERTO`, `TURNO_AJENO`). En ruta, `salida` = gasto en camino (gasolina, caseta) con motivo. |
| `fn_resumen_turno(p_turno_id) returns jsonb` | `{tipo, fondo_inicial, ventas:{num, canceladas, efectivo, transferencia, tarjeta, credito}, abonos:{efectivo, transferencia, tarjeta}, entradas, salidas, retiros, reembolsos, efectivo_esperado, efectivo_contado, diferencia}` + en ruta `{transferencias:[{folio, cliente, monto, referencia, comprobante?, verificado}], devoluciones_producto:[{producto, piezas}]}` (cargado − entregado por producto, para revisar la camioneta al regresar). **`efectivo_esperado = fondo + Σ venta_pago efectivo (ventas del turno, aunque se cancelaran después) + Σ abono efectivo del turno (aunque se cancelaran) + entradas − salidas − retiros − reembolsos`**. |
| `fn_cerrar_turno(p_usuario_id, p_turno_id, p_efectivo_contado numeric, p_notas text) returns jsonb` | Turno `mostrador` abierto; propio o `caja.supervisar` (`TURNO_AJENO`). Congela esperado, contado, diferencia = contado − esperado. |
| `fn_liquidar_ruta(p_usuario_id, p_ruta_id, p_efectivo_contado numeric, p_notas text) returns jsonb` | Ruta `terminada` (`RUTA_NO_TERMINADA`); requiere `rutas.liquidar` (el repartidor no se liquida a sí mismo salvo que lo tenga). Cierra el turno `ruta` como `fn_cerrar_turno` (`cerrado_por` = quien liquida); ruta → `liquidada`. Devuelve el resumen. |
| `fn_registrar_venta(p_usuario_id bigint, p_datos jsonb, p_hash text, p_pedido_id bigint default null) returns table(venta_id bigint, repetida boolean)` | Ver §2.8.1. |
| `fn_entregar_pedido(p_usuario_id bigint, p_pedido_id bigint, p_datos jsonb, p_hash text) returns table(venta_id bigint, repetida boolean)` | Ver §2.8.2. |
| `fn_cancelar_venta(p_usuario_id, p_venta_id, p_motivo text) returns jsonb` | `VENTA_YA_CANCELADA`; con devoluciones → `VENTA_CON_DEVOLUCIONES`; CxC con `saldo < monto` → `VENTA_CON_ABONOS`. Movimiento `cancelacion_venta` por línea (+piezas, costo de la línea, orden `producto_id`); CxC → `cancelada`; pago en efectivo → `reembolso` en el turno abierto de quien cancela (`TURNO_NO_ABIERTO`). Venta de pedido: el pedido pasa a `cancelado` (motivo = el de la venta). Devuelve `{reembolso_efectivo, reembolso_otros}`. |
| `fn_registrar_devolucion(p_usuario_id, p_venta_id, p_datos jsonb, p_hash text) returns table(devolucion_id bigint, repetida boolean)` | Por línea `piezas ≤ piezas − piezas_devueltas` (`DEVOLUCION_EXCEDE_VENDIDO`); movimiento `devolucion_venta` y, si dañada, `merma` causa `danado`; `abono_credito = least(total, saldo CxC de esa venta)`; resto → `reembolso` en turno abierto del usuario (el repartidor en ruta puede recibir devolución en la siguiente visita). |
| `fn_saldo_inicial(p_usuario_id, p_cliente_id, p_monto numeric, p_vence_el date, p_concepto text) returns bigint` | CxC `origen = 'saldo_inicial'` (fiado de libreta al arrancar el sistema) [P26]. Requiere `clientes.credito`. No cuenta contra nada más que el límite ya visible. |
| `v_saldo_cliente` | `cliente_id, saldo = Σ saldo pendiente, vencido = Σ saldo con vence_el < hoy local, cuentas_pendientes, disponible = greatest(0, limite_credito − saldo)`. |
| `fn_registrar_abono(p_usuario_id, p_datos jsonb, p_hash text) returns table(abono_id bigint, repetida boolean)` | Idempotencia igual. `p_datos`: `{clave_idempotencia, cliente_id, metodo, monto, referencia?, comprobante?, ruta_parada_id?, cuentas?:[{cuenta_por_cobrar_id, monto}]}`. Efectivo → turno abierto propio (`TURNO_NO_ABIERTO`; en ruta, el del repartidor). Con `ruta_parada_id`: parada de una ruta propia `en_curso` de ese cliente, y si es tipo `cobro` queda `visitada`. CxC `FOR UPDATE` en orden `id`; sin `cuentas` FIFO por `(vence_el, id)`; `monto > Σ saldo` → `ABONO_EXCEDE_SALDO`; con `cuentas`: `CUENTA_NO_VALIDA`, `APLICACION_NO_CUADRA`. Folio `A`. |
| `fn_cancelar_abono(p_usuario_id, p_abono_id, p_motivo) returns void` | `ABONO_YA_CANCELADO`; devuelve cada aplicación al saldo; efectivo → `reembolso` en turno abierto de quien cancela. |
| `fn_verificar_pago(p_usuario_id, p_tabla text, p_id bigint) returns void` | `p_tabla ∈ ('venta_pago','abono')`, método `transferencia`; marca `verificado_*` (requiere `cobranza.verificar`). Solo informativo: no cambia saldos. |

#### 2.8.1 `fn_registrar_venta` paso a paso

`p_datos`: `{clave_idempotencia, cliente_id?, lista_precio_id?, lineas:[{presentacion_id, cantidad, precio_unitario?}], pagos:[{metodo, monto, referencia?, comprobante?}], efectivo_recibido?, notas?}`

1. `pg_advisory_xact_lock(hashtext(clave))`; clave existente: mismo `p_hash` → `(id, true)`; distinto → `IDEMPOTENCIA_CONFLICTO`.
2. Turno abierto del usuario → si no, `TURNO_NO_ABIERTO`. `p_pedido_id` null exige turno `mostrador` (`TURNO_NO_VALIDO`). `sucursal_id` = la de la caja o la ruta.
3. Cliente (si viene): activa, `FOR UPDATE` (serializa el control de crédito). Lista = enviada ?? la del cliente ?? la predeterminada. Lista distinta a la que toca → `ventas.cambiar_precio` (`SIN_PERMISO_PRECIO`).
4. Sin líneas → `VENTA_VACIA`. Por línea: presentación activa, `se_vende`, producto activo (`PRESENTACION_NO_VALIDA`); `precio_lista = fn_precio(...)`, null → `PRECIO_NO_DEFINIDO`; `precio_unitario` distinto → `ventas.cambiar_precio`. **Con `p_pedido_id`** el precio viene del pedido y no se pide permiso (ya lo autorizó despacho). `importe = round(cantidad·precio, 2)`.
5. **Mostrador**: por producto, `piezas ≤ existencia − cargadas` de `v_comprometido`, si no `STOCK_INSUFICIENTE` con `{disponible, comprometido}` (no se vende lo que va en una camioneta). Pedido: solo el control del disparador.
6. Inserta venta (folio `V`, `origen`) y líneas; un movimiento `venta` por línea **en orden de `producto_id`**; copia `costo_unitario` y `costo_total`. Totales = Σ líneas.
7. Pagos: uno por método; `Σ monto = total` (`PAGOS_NO_CUADRAN`). `credito` requiere cliente (`CREDITO_SIN_CLIENTE`), `ventas.credito` y `saldo + monto ≤ limite_credito` (`LIMITE_CREDITO_EXCEDIDO`, detalle `{limite, saldo, disponible}`) → CxC con `vence_el = hoy local + dias_credito`. `efectivo`: `efectivo_recibido ≥ monto` (`EFECTIVO_INSUFICIENTE`), `cambio = recibido − monto`.

Precio por debajo del costo no se bloquea. Crédito vencido no bloquea [P6b].

#### 2.8.2 `fn_entregar_pedido`

`p_datos`: `{clave_idempotencia, lineas:[{pedido_linea_id, cantidad_entregada}], pagos:[…], efectivo_recibido?, notas?, recibio?, foto_entrega?}`
(`recibio` y `foto_entrega` = prueba de entrega opcional, §2.12 B11)
(líneas omitidas = se entregó completo).

1. Idempotencia por la clave de la venta. Pedido `FOR UPDATE`.
2. Reparto: pedido `en_ruta`, ruta propia (`RUTA_AJENA`) y turno abierto = el de esa ruta. Recoge en
   bodega: pedido `confirmado` con `entrega_tipo = 'recoge'` y turno `mostrador` abierto. Otro caso →
   `ESTADO_NO_VALIDO`.
3. `cantidad_entregada ≤ cantidad` (`ENTREGA_EXCEDE_PEDIDO`); todas en 0 → `ENTREGA_VACIA` (usar no entregado).
4. Llama `fn_registrar_venta(p_usuario_id, {lineas entregadas con precio del pedido, pagos, cliente_id, lista_precio_id del pedido}, p_hash, p_pedido_id)`.
5. Pedido → `entregado`, `venta_id`, `entregado_en`, `cantidad_entregada` por línea; `cliente.ya_compro = true`; parada → `visitada`;
   evento `entregado` (con las diferencias si fue parcial); aviso `wa_nota_entrega` (total, pagado, saldo
   del cliente). La respuesta trae ese aviso ya renderizado para que el repartidor lo envíe en la parada.

Permisos 008: `ventas.crear, ventas.ver, ventas.ver_todas, ventas.cambiar_precio, ventas.credito, ventas.cancelar, ventas.devolver, caja.operar, caja.supervisar, cobranza.ver, cobranza.abonar, cobranza.cancelar_abono, cobranza.verificar`.

### 2.9 Migración 009 — reportes (vistas)

| Vista / función | Definición |
|---|---|
| `v_ventas_lineas` | `UNION ALL` de líneas de ventas `completada` (signo +, `fecha = fn_fecha_local(v.creado_en)`) y `devolucion_linea` (signo −, fecha de la devolución). Columnas: `fecha, sucursal_id, venta_id, folio, origen, ruta_id (del pedido), usuario_id, cliente_id, zona_id, producto_id, categoria_id, marca_id, piezas, importe, costo_total, utilidad = importe − costo_total`. Ventas canceladas no aparecen. |
| `v_ventas_pagos` | Pagos de ventas `completada` con `fecha, origen, metodo, monto, usuario_id, cliente_id`. |
| `v_compras_lineas` | Líneas de compras `registrada`: `fecha, proveedor_id, producto_id, categoria_id, piezas, importe`. |
| `v_ajustes_valor` | Movimientos `merma, ajuste_salida, ajuste_entrada`: `fecha, producto_id, tipo, causa_merma, piezas, valor = cantidad · costo_unitario`. |
| `v_inventario_valorizado` | `existencia ⋈ producto`: `producto, categoria, modo_surtido, cantidad, costo_promedio, valor, cajas = cantidad / factor_mayor, sueltas = cantidad % factor_mayor`. |
| `v_bajo_minimo` | Productos activos `modo_surtido = 'inventario'` con `cantidad ≤ existencia_minima` y `existencia_minima > 0`; `agotado = cantidad = 0`. |
| `v_entregas` | Por pedido con ruta o entregado: `fecha_entrega, ruta_id, repartidor_id, zona_id, cliente_id, estado, piezas_pedidas = Σ cantidad_pedida·factor, piezas_confirmadas = Σ piezas, piezas_entregadas = Σ cantidad_entregada·factor, importe_pedido, importe_entregado`. Faltantes = pedidas − confirmadas (demanda perdida por no tener producto). |
| `fn_cxc_antiguedad(p_al date) returns table(cliente_id, nombre, zona, corriente, d1_30, d31_60, d61_90, d90_mas, total)` | Saldo pendiente por cliente en cubetas según `p_al − vence_el`. |

Permiso 009: `reportes.ver`.

### 2.10 Migración 010 — envases retornables (diferida, boceto)

No se crea hasta que el dueño responda [P7]. Boceto: `envase(id, nombre, deposito numeric(12,2))`;
`ALTER TABLE producto ADD envase_id, ADD piezas_por_envase`; `movimiento_envase(id, sucursal_id,
cliente_id null, envase_id, cantidad con signo, tipo in ('prestado','devuelto','compra','baja'), venta_id
null, ruta_parada_id null, deposito numeric(12,2), usuario_id, creado_en)`; `v_saldo_envase_cliente`. En
reparto, el repartidor captura envases recibidos en la parada. Permiso `envases.gestionar`.

### 2.11 Qué hace cumplir SQL y qué la capa de servicio

| Invariante | Dónde |
|---|---|
| Existencia nunca negativa (también contra pedido); existencia = suma del kárdex; costo promedio | SQL (`ck`, `trg_movimiento_aplicar`, `trg_existencia_protegida`) |
| Kárdex inmutable | SQL (`trg_movimiento_inmutable`) |
| Totales, costo de venta, utilidad, totales de pedido | SQL (funciones, columnas generadas; la API no suma) |
| Transiciones de pedido y ruta; versión del pedido; no cargar sin existencia | SQL (funciones 004/007/008) |
| No vender en mostrador lo que va cargado en una ruta | SQL (`fn_registrar_venta` paso 5) |
| Pagos cuadran; cambio; límite de crédito; CxC por venta a crédito | SQL (`fn_registrar_venta`) |
| Un turno abierto por caja, por usuario y por ruta; esperado del corte/liquidación | SQL (índices parciales, `fn_resumen_turno`) |
| Devuelto ≤ vendido; entregado ≤ confirmado; saldo CxC entre 0 y monto | SQL (`ck`, funciones) |
| Idempotencia (unicidad, mismo hash) | SQL (`uq_*_clave`, advisory lock); el hash lo calcula la API |
| Notificación (personal) y aviso (cliente) idempotentes y atómicos con la operación | SQL (`uq_notificacion_clave`, `uq_aviso_clave`, en la misma transacción) |
| Total del pedido tras ajustes y sustituciones; un faltante pendiente por línea; plazo y acción predeterminada | SQL (`trg_pedido_total`, `uq_propuesta_pendiente`, `fn_vencer_faltantes`) |
| Folios consecutivos | SQL (`fn_siguiente_folio`) |
| Permisos finos dentro de la operación | SQL (`fn_tiene_permiso`) |
| Último dueño activo; rol de sistema con todos los permisos | SQL (disparadores 001) |
| Auditoría de catálogo, precios, clientes, enlaces, usuarios, roles, config, plantillas | SQL (`trg_auditar`) |
| Orden de paradas (cálculo) | API (`optimizar.ts`); SQL valida el conjunto (`fn_ordenar_ruta`) |
| Autenticación de personal y de cliente, sesión viva, permiso por ruta, límites por IP/token | API (plugin `permisos`, `@fastify/rate-limit`) |
| Forma de los datos (zod), tamaños, `desde ≤ hasta`, paginación, tipo y tamaño de imagen | API |
| Campos por permiso (costos sin `costos.ver`; crédito solo con `clientes.credito`) | API |
| Alcance «solo lo mío» (ventas propias, rutas del repartidor, pedidos del cliente del token) | API (filtro por token) |
| CSRF (Origin), cookies httpOnly; token del enlace fuera de la URL tras el primer acceso | BFF |

### 2.12 Lote de funciones aprobadas (2026-11-23) — sin IA ni APIs de pago

Cada punto dice en qué migración va su DDL. Pantalla dueña de cada ruta: «Mapa de pantallas» de PLAN.

**A1 · Margen al registrar compra (002/003, F2).** `margen_objetivo` en `producto` y `categoria` (§2.2) y
config `margen_objetivo`. `fn_margen_objetivo(p_producto_id) returns numeric` = producto ?? categoría ??
config. `fn_margenes_compra(p_compra_id) returns table(producto_id, producto, costo_anterior, costo_nuevo,
presentacion_id, presentacion, lista_precio_id, lista, precio, costo_presentacion, margen, objetivo, alerta,
precio_sugerido)`: `costo_anterior/nuevo` = `costo_promedio_resultante` del movimiento anterior / del de la
compra; `costo_presentacion = round(costo_nuevo·factor, 2)`; `margen = (precio − costo_presentacion) /
precio` (null si precio 0); `alerta ∈ ('bajo_costo','margen_bajo', null)`; **`precio_sugerido =
ceil(costo_presentacion / (1 − objetivo) / precio_redondeo) · precio_redondeo`**. Solo con `costos.ver`.
No cambia precios: el dueño los confirma en `/precios` («Aplicar sugeridos» = `PUT /api/precios` con
los que marque). `GET /api/precios/sugeridos?producto_ids=` da lo mismo para `/precios`.

**A2 · Respaldos.** Ver §3.2.

**A3 · Mostrador y estado de cuenta (008, F7/F8).** Ventas en espera: varios carritos abiertos en `/pos`
guardados en el navegador (por caja), cada uno con su `clave_idempotencia`; no hay tabla (`shortcut`: se
pierden si se borra el navegador; tabla `venta_espera` si se necesita entre equipos). Reimprimir:
`GET /api/ventas/:id/ticket` desde `/ventas/[id]`. Estado de cuenta: `fn_estado_cuenta(p_cliente_id,
p_desde, p_hasta) returns jsonb` (`{saldo_inicial, movimientos:[{fecha, tipo, folio, cargo, abono, saldo}],
saldo_final, vencido}`) — una sola función para `GET /api/clientes/:id/estado-cuenta` (panel, imprimible
80 mm con la hoja de impresión del ticket) y `GET /api/publico/estado-cuenta` (enlace, últimos 90 días).
Se comparte con el aviso `wa_estado_cuenta`.

**A4 · Mayoreo por cantidad (diferido hasta [P4]) y sin conexión ([P49]).** Boceto, no se crea hasta que
[P4] diga que hay escalones: `precio_escala(presentacion_id, lista_precio_id, desde_cantidad integer
check (> 1), precio numeric(12,2), primary key (presentacion_id, lista_precio_id, desde_cantidad))`;
`fn_precio_cantidad(p_presentacion_id, p_lista_precio_id, p_cantidad)` = precio de la escala con mayor
`desde_cantidad ≤ p_cantidad`, si no `fn_precio`; venta y pedido la usarían en lugar de `fn_precio`.
**No se diseña modo sin conexión**: si se cae el internet de la bodega, el respaldo es compartir datos
móviles del teléfono.

**A8 · Ofertas por caducar (002 + vista de 003, F2; se muestran en el enlace desde F3).**
```sql
create table app.precio_oferta (        -- auditada
  id bigint generated always as identity primary key,
  presentacion_id bigint not null references app.presentacion(id),
  lista_precio_id bigint references app.lista_precio(id),    -- null = todas las listas
  precio numeric(12,2) not null check (precio >= 0),
  desde date not null, hasta date not null check (hasta >= desde),
  motivo text not null check (motivo in ('por_caducar','promocion')),
  creado_por bigint not null references app.usuario(id), creado_en
);
create index idx_oferta_vigente on app.precio_oferta (presentacion_id, hasta);
```
Vigente = `hoy local between desde and hasta`. Se crea, cambia y quita solo en `/precios` (la sección «por caducar»
de `/inventario` enlaza a `/precios?oferta=<presentacion>`). El pedido congela el precio con oferta como cualquier precio.

**B5 · «¿Te mando lo de siempre?» (004, F3).** `cliente.sugerir_pedido boolean not null default true`
(opt-out). `v_cadencia_cliente`: de los últimos 10 pedidos `entregado`, `mediana_dias` entre pedidos
(`percentile_cont(0.5)`), `dias_desde_ultimo`, `atrasado = dias_desde_ultimo > mediana_dias +
sugerencia_dias_tolerancia`; requiere ≥ 3 pedidos. Canasta típica: presentaciones que aparecen en ≥ la
mitad de sus últimos 5 pedidos entregados, cantidad = mediana de lo entregado. `fn_sugerir_pedidos()
returns integer` (tarea diaria a `sugerencia_hora`): por cliente activo con `sugerir_pedido`, atrasado,
con teléfono y sin pedido abierto ni propuesto → pedido `origen = 'sugerido'`, `estado = 'propuesto'`,
`propuesto_vence_en = now() + sugerencia_vigencia_horas`; **las líneas guardan solo producto y
cantidad**: `precio_lista`/`precio_unitario` de un `propuesto` son provisionales, nunca se muestran ni se
usan; aviso `wa_lo_de_siempre` (clave `wa_lo_de_siempre:p<id>:v1`).

**Precios al día (regla del dueño, aplica a «lo de siempre» y a «Repetir mi último pedido»)**: el borrador
copia productos y cantidades, **nunca precios viejos**. `fn_vista_borrador(p_cliente_id, p_lineas jsonb)
returns jsonb` (stable) recibe `[{presentacion_id, cantidad}]` y devuelve `{lineas:[{presentacion_id,
producto, presentacion, cantidad, precio_actual = fn_precio(…, lista del cliente) (con oferta vigente),
precio_anterior (precio_unitario de esa presentación en su último pedido entregado, o null),
cambio:'sube'|'baja'|null}], quitadas:[{producto, motivo:'ya_no_se_vende'|'sin_precio'}], total_actual,
hay_cambios}`. Productos inactivos, no vendibles o sin precio se quitan del borrador y se listan en
`quitadas`. La usan `fn_seguimiento_pedido` (pedido `propuesto`) y `GET /api/publico/catalogo`
(`ultimo_pedido`). `fn_aceptar_propuesto(p_cliente_id, p_pedido_id, p_total_visto numeric) returns void`:
`propuesto` vigente (si no `PEDIDO_VENCIDO`); recalcula con `fn_vista_borrador`, borra las líneas
`quitadas`, escribe `precio_lista = precio_unitario = precio_actual`; si el total recalculado ≠
`p_total_visto` → `PRECIOS_CAMBIARON` (detalle = la vista nueva; nada se guarda) para que el cliente vea
los precios nuevos y vuelva a confirmar; si coincide → `recibido` (**aquí empieza el congelamiento de
precio, [P33]**), sigue el flujo normal y notifica `pedido_nuevo`. Rechazar = `fn_cancelar_pedido_cliente` (permitida también en `propuesto`). Tarea
`vencer-propuestos` (cada 15 min): vencidos → `cancelado` con motivo «sin respuesta». `propuesto` no
cuenta en `v_comprometido` ni en la lista de surtido. `/p/<token>?ir=pedido-<id>` y `?ir=estado-cuenta`
redirigen tras el canje a esa pantalla (lista blanca de destinos).

**B6 · Pegar mensaje de WhatsApp → borrador (004, F3).**
```sql
create table app.cliente_alias (        -- lo que aprende al corregir
  cliente_id bigint references app.cliente(id),             -- null = vale para todos
  texto text not null,                                      -- fn_normalizar del fragmento
  presentacion_id bigint not null references app.presentacion(id),
  veces integer not null default 1,
  actualizado_en timestamptz not null default now(),
  constraint uq_cliente_alias unique nulls not distinct (cliente_id, texto)
);
```
Intérprete puro en TS `apps/api/src/modulos/pedidos/interpretar.ts` (con pruebas de mensajes reales):
1) parte el texto por salto de línea, coma, «;» y « y » entre productos; 2) cantidad al inicio o al final:
dígitos, palabras (`un/una/uno`=1 … `doce`, `media`=0.5 de la presentación mayor → se redondea y se marca
amarillo) y unidades (`caja(s)`, `cartón`, `six`, `pieza(s)`, `lata(s)`) que eligen la presentación;
3) producto: `cliente_alias` del cliente → `cliente_alias` global → `fn_buscar_productos` (alias +
`pg_trgm`). **Verde** = alias exacto, o un candidato con puntaje ≥ 0.6 y ≥ 0.15 sobre el segundo;
**amarillo** = lo demás, con los 3 mejores candidatos; sin candidato = línea roja con el texto. El
vocabulario de cantidades/unidades vive en una constante del módulo (no es texto al usuario).
`POST /api/pedidos` acepta `correcciones:[{texto, presentacion_id}]` y hace upsert en `cliente_alias`
(`veces + 1`) en la misma transacción.

**B7 · Compra inteligente (006, F5).**
```sql
create table app.promocion_proveedor (  -- auditada
  id bigint generated always as identity primary key,
  proveedor_id bigint not null references app.proveedor(id),
  presentacion_id bigint not null references app.presentacion(id),
  costo_presentacion numeric(12,2) not null check (costo_presentacion >= 0),
  minimo_cantidad integer not null default 1 check (minimo_cantidad > 0),
  desde date not null, hasta date not null check (hasta >= desde),
  notas text, creado_por bigint not null references app.usuario(id), creado_en
);
create table app.fecha_demanda (        -- auditada. Calendario editable
  fecha date primary key,
  nombre text not null,                                     -- 'Quincena', 'Puente', 'Final de futbol', 'Semana Santa'
  factor numeric(4,2) not null check (factor between 0.1 and 5)
);
```
Semilla: días 14–16 y del 29 al 1 de cada mes del año en curso con factor 1.3 (quincena) y Semana Santa;
el dueño agrega puentes y partidos. En `fn_lista_surtido`: `venta_diaria` = Σ piezas de movimientos
`venta` de los últimos `compra_promedio_dias` ÷ `compra_promedio_dias` (0 hasta que haya ventas, F7);
`sugerido_demanda = greatest(0, ceil(venta_diaria · Σ factor de los próximos compra_cobertura_dias días
(1 si la fecha no está) − greatest(0, disponible − piezas_pedidas)))` solo para `inventario`; promoción vigente de
ese producto (mejor costo por pieza) → `costo_promocion`, `ahorro = (ultimo_costo − costo_promocion) ·
cantidad_sugerida`. `costo_promocion` y `ahorro` solo con `costos.ver`. Promociones se editan en `/surtido/promociones`;
el calendario en `/configuracion`.

**B9 · La ruta también cobra (008, F7).** `GET /api/rutas/:id/sugerencias-cobro`: clientes de las zonas
de las paradas, con `vencido > 0` en `v_saldo_cliente` y sin parada en la ruta, ordenados por vencido
desc (máx. 10). Se agregan con `POST /api/rutas/:id/cobros` (ya existe) desde `/rutas/[id]`.

**B10 · Semáforo de fiado (008, F7).** `v_semaforo_cliente`: `dias_promedio_pago` = promedio de
(fecha del último abono que la saldó − creación) de sus CxC saldadas de 180 días; `max_dias_vencido`;
`color` = **rojo** si `max_dias_vencido > semaforo_dias_rojo` o `saldo > limite_credito`; **amarillo** si
`vencido > 0` o `dias_promedio_pago > dias_credito`; si no **verde** (sin historial = verde).
`limite_sugerido` = `round(compra semanal a crédito promedio de 8 semanas · (dias_credito/7 + 1) ·
(verde 1.5 | amarillo 1.0), -2)`; rojo = el saldo actual (no crecer). Solo sugiere: el límite lo cambia
quien tiene `clientes.credito` en `/clientes/[id]`. `/cobrar` muestra el color junto a «Fiado» (lectura).

**B11 · Prueba de entrega (008, F7).** `pedido.recibio text`, `pedido.foto_entrega text` (mismo formato
que comprobante, privado). Opcionales en `fn_entregar_pedido`; se capturan en `/cobrar?pedido=`. El
seguimiento del cliente muestra «Recibió: <nombre>», nunca la foto.

**B12 · Resumen del día (008, F7).** `fn_resumen_dia(p_sucursal_id, p_fecha) returns jsonb` =
`{vendido, ganancia (null sin costos.ver), cobrado:{efectivo, transferencia}, fiado_nuevo, por_cobrar,
por_comprar:{productos, costo_estimado}}` (ventas, abonos y CxC del día; lista de surtido de mañana).
`/cierre` lo muestra y «Mandar al dueño» abre la bandeja con `?nuevo=wa_resumen_dia` → aviso con
`usuario_id` del dueño (clave `wa_resumen_dia:<fecha>`).

**B13 · Ganancia por cliente y por ruta (009, F9).** `v_ganancia_ruta`: por ruta, `Σ utilidad` de sus
ventas − `Σ salidas` (gastos) de su turno de ruta. Ganancia por cliente = `v_ventas_lineas` agrupado.

**B14 · Lealtad simple (011, F11).** Config `lealtad_activa` (false), `lealtad_cada` (10),
`lealtad_presentacion_regalo_id`; `presentacion.cuenta_lealtad boolean default false` (qué cuenta como
«caja»). `lealtad_movimiento(id, cliente_id, venta_id, cantidad integer con signo, tipo in
('acumula','canje'), creado_en)`; `fn_registrar_venta` acumula las presentaciones marcadas; al llegar a
`lealtad_cada` la siguiente entrega/venta agrega sola una línea de la presentación regalo a **precio 0
y costo normal** (la utilidad negativa es el costo del programa) y un `canje`. Avance en `GET
/api/publico/cliente` (`lealtad:{llevas, meta}`).

**B15 · Sugerencias en el enlace (011, F11).** `fn_sugerencias_zona(p_cliente_id) returns table(presentacion_id,
clientes)`: presentaciones que compraron ≥ 3 clientes distintos de su zona en 60 días y él no en 60 días;
máximo 3, por número de clientes. Van en `GET /api/publico/catalogo` (`sugerencias_zona`).

## 3. Autenticación

Dos sujetos, nunca mezclados: **personal** (cookie `chv_jwt`, en navegador o en el WebView del cascarón) y **cliente** (enlace). No hay Bearer del lado del cliente HTTP: nadie fuera del BFF ve un JWT.

- **Personal**: `POST /api/auth/login` valida con bcryptjs; 5 fallos → `bloqueado_hasta = now() + 15 min`.
  Éxito: fila en `sesion` (`origen` web o app), JWT HS256 (jose) con `sub`, `jti`, `exp` (web 12 h,
  app 30 días). **Los permisos no van en el token**: se leen de la base en cada petición (sesión viva +
  usuario activo + permisos del rol). `sesion.cerrada_en` o expirada → `401 SESION_CERRADA` (el chequeo
  responde, no lanza).
- **Cascarón Android**: el login es la misma pantalla `/login` dentro del WebView. El WebView agrega
  `ChevecheveApp/<versión>` al User-Agent; si el BFF lo ve, pide `origen:'app'` (30 días, para no
  reingresar a diario en la camioneta). Falsificar el User-Agent solo alarga la sesión de quien ya tiene
  contraseña. Rutas `/api/movil/push/*` exigen sesión `app` (`403 SOLO_APP`). Sin renovación: a los 30
  días se vuelve a entrar.
- **Cliente**: headers `X-Cliente-Token` y `X-Cliente-Dispositivo` (solo los pone el BFF, desde las cookies).
  La API calcula `sha256` de ambos y llama `fn_cliente_por_token`. **Enlace + dispositivo recordado** = entra
  directo; enlace sin dispositivo reconocido (borró cookies, teléfono nuevo, navegador interno de WhatsApp
  que en iOS no comparte cookies con Safari) = pide el PIN de 4 dígitos (o lo elige si aún no hay), y ese
  navegador queda recordado. Así un enlace reenviado a otra persona no sirve sin el PIN, y el personal se
  entera de cada dispositivo nuevo. 5 PIN malos → espera de 15 min por enlace + IP, luego otra vez. Fallo → `401 ENLACE_INVALIDO`; 10 fallos por IP en 15 min → `429
  ENLACE_BLOQUEADO` (temporal). Un token válido solo abre `/api/publico/*` y solo datos de ese cliente.
  **Token cifrado, no solo hash** (aprobado por el dueño 2026-11-23): cada aviso de WhatsApp debe llevar el enlace del cliente, así que la API
  necesita recuperarlo; se guarda `sha256` para buscar y AES-256-GCM (`SECRETO_ENLACES`) para incluirlo
  en avisos. Una copia de la base sola no abre enlaces. Si se cambia `SECRETO_ENLACES`, los enlaces siguen
  funcionando (por hash) pero los avisos ya no pueden incluirlos: hay que regenerarlos. Riesgo aceptado:
  quien tenga base + secreto puede abrir pedidos de cualquier cliente (lo mismo que hoy con el JWT).
- Sin recuperación por correo [P25]: el dueño restablece contraseñas; el usuario queda con
  `debe_cambiar_contrasena` y solo puede usar `/api/auth/*` (`403 CAMBIO_CONTRASENA_REQUERIDO`).
- Nunca se loguean contraseñas, JWT, tokens de enlace o push, hash ni IP en claro. El logger censura
  `authorization`, `cookie`, `set-cookie`, `x-cliente-token`, `x-cliente-dispositivo`, `token`, `token_push`,
  `dispositivo_token`, `contrasena`, `actual`, `nueva` y `pin`; cualquier ruta `/p/*` se registra como `/p/***`.

### 3.1 Variables de entorno (infra)

| Variable | Servicio | Obligatoria en prod | Valor / formato |
|---|---|---|---|
| `JWT_SECRET` | api | sí (≥ 32, rechaza ejemplos) | ya existe |
| `SESION_WEB_HORAS` | api | no (def. 12) | reemplaza a `JWT_EXPIRES_IN`; `exp` del JWT y `sesion.expira_en` web |
| `SESION_APP_DIAS` | api | no (def. 30) | sesiones `origen = 'app'` |
| `SECRETO_ENLACES` | api | sí (≥ 32) | llave AES-256-GCM del token de enlace; cambiarla obliga a regenerar enlaces (§3) |
| `FCM_CUENTA_SERVICIO` | api | no | **ruta** a un JSON de cuenta de servicio montado de solo lectura (ej. `/run/secrets/fcm.json`); sin ella no hay push. El `project_id` se lee del JSON |
| `ARCHIVOS_DIR` | api | no (def. `/datos/archivos`) | volumen Docker `archivos` montado ahí (imágenes y comprobantes) |
| `API_INTERNAL_URL` | web | sí | ya existe |
| `COOKIE_SECURE` | web | no (def. `true` en producción) | `false` solo en `docker-compose.dev.yml` (sin HTTPS); reemplaza a `SESSION_COOKIE_SECURE` |
| `DATABASE_URL_PRUEBAS` | pruebas (local) | no | base `chevechevepos_pruebas` del Postgres de `docker-compose.dev.yml` (`127.0.0.1:5436`); el script de pruebas rechaza otra base u otro host |
| `RESPALDO_DESTINO` | respaldo | sí antes de producción | remoto de rclone (ej. `drive:chevecheve-respaldos`) [P54] |
| `RESPALDO_RCLONE_CONF` | respaldo | sí antes de producción | ruta a `rclone.conf` montado de solo lectura; volumen `respaldos` en `/respaldos` |
| `ACTUALIZACIONES_DIR` | api | no (def. `/datos/actualizaciones`) | volumen Docker `actualizaciones` (F4): manifiestos firmados, recursos y APK del cascarón (§4.6). La API solo lee; sin archivos responde «sin actualización» |
| `EXPO_PUBLIC_URL_PANEL` | build de `apps/mobile` | sí para compilar | `https://` del dominio de `apps/web` (= configuración `url_publica`); el cascarón rechaza `http` fuera de desarrollo. También arma `updates.url` (§4.6) |
| `CHV_APK_ALMACEN`, `CHV_APK_ALMACEN_CLAVE`, `CHV_APK_ALIAS`, `CHV_APK_LLAVE_CLAVE` | build de release de `apps/mobile` (en el servidor) | sí para compilar release | llave de firma de la APK (`~/.chevecheve-actualizaciones/android-release.p12` + su `.env`); sin ellas la compilación de release **falla** (nunca se firma con la llave de depuración) |
| `google-services.json` | build de `apps/mobile` | sí para compilar | archivo de Firebase fuera del repo |

Se quitan `SESSION_SECRET`, `SESSION_MAX_AGE`, `SESSION_COOKIE_SECURE` y `JWT_EXPIRES_IN` (la cookie dura lo que `sesion.expira_en`).
`url_publica` vive en la tabla `configuracion` (la edita el dueño); debe coincidir con el dominio del compose.

### 3.2 Respaldos (requisito antes de producción)

- Servicio `respaldo` en `docker-compose.yml` (imagen `postgres` misma versión): cada día a las 03:00
  `pg_dump -Fc` a `/respaldos/diario/AAAA-MM-DD.dump` y `tar` del volumen `archivos`; retención 14
  diarios + 8 semanales (domingos); al terminar (bien o mal) escribe
  `respaldo_estado.json` (`{ultimo, ok, error?}`; `ok = false` también si falta la copia remota) en el volumen `respaldos` (montado de solo lectura en la API en `/respaldos`; la API lee `/respaldos/respaldo_estado.json`, sin archivo = `null`) y la API lo expone en `GET /health` como `respaldo:{ultimo, ok}|null`; `/` Hoy lo muestra en rojo al dueño si tiene > 26 h (bloque `respaldo` de `GET /api/despacho`, F3).
- Copia fuera del servidor con `rclone` (gratuito) al destino `RESPALDO_DESTINO` (remoto de rclone:
  otra máquina por SFTP o una carpeta de Google Drive del dueño) [P54]. Variables: `RESPALDO_DESTINO`,
  `RESPALDO_RCLONE_CONF` (ruta a archivo montado de solo lectura), volumen `respaldos`.
- **Prueba de restauración** (documentada aquí, se hace antes de producción y luego cada mes): bajar el
  último `.dump` a una base vacía con `pg_restore --clean --if-exists -d <base_prueba>`, correr el
  migrador (no debe aplicar nada) y comparar conteos de `pedido`, `venta`, `cliente`, `movimiento_inventario`
  y `Σ saldo` de CxC con producción. Se anota fecha y resultado en `configuracion.respaldo_ultima_prueba`.

## 4. API HTTP (`apps/api`, prefijo `/api`)

### 4.1 Regla BFF

- El navegador y la app **nunca** llaman a `apps/api`. Llaman a `apps/web` (`/api/*` de Next), que
  reenvía a `${API_INTERNAL_URL}/api/*` por la red interna. En producción la API no tiene ruta pública.
- `apps/web/src/app/api/auth/login/route.ts`: recibe `{token, expira_en, usuario}`, pone cookie `chv_jwt`
  (`httpOnly`, `Secure` en prod, `SameSite=Lax`, `Path=/`) y responde **solo** `{usuario}`.
  `logout/route.ts` llama a la API y borra la cookie.
- `apps/web/src/app/api/[...ruta]/route.ts` (proxy del personal): reenvía método, query y cuerpo; pone
  `Authorization: Bearer <chv_jwt>` tomado **solo** de la cookie; descarta `Authorization`, `Cookie` y
  `X-Cliente-Token` del cliente; agrega `X-Visitante-Ip`. Métodos no GET exigen `Origin` = host propio
  (`403 ORIGEN_INVALIDO`; el WebView manda el `Origin` del panel). En `401` borra la cookie. Nunca
  reenvía a `/api/publico/*`.
- **Cascarón Android**: no tiene token. Carga `url_publica` en un WebView con cookies persistentes; todas
  sus llamadas de negocio son las del panel. Única ruta de BFF propia:
  `apps/web/src/app/api/movil/actualizaciones/[...ruta]/route.ts` (F4), que sirve sus actualizaciones
  (§4.6): solo `GET`, solo `/api/movil/actualizaciones/*`, sin cookie ni `Authorization` hacia la API,
  reenvía solo las cabeceras `expo-*` y `X-Visitante-Ip`, devuelve el cuerpo **en flujo** (binario, sin
  `text()`) con `content-type`, `content-length`, `content-disposition`, `cache-control`,
  `expo-protocol-version` y `expo-sfv-version`; el tiempo límite cubre hasta recibir cabeceras, no la
  descarga de la APK. Decisión (frente a RefaccionPro, que tiene
  app nativa con `/api/movil/*` y Bearer): con 2 usuarios y una sola interfaz, una app nativa obligaría a
  construir cada pantalla dos veces y rompería N1; el WebView reutiliza el panel completo y la API sigue
  privada detrás del BFF. Contrato del cascarón en §4.6.
- **Enlace de cliente**: `apps/web/src/app/p/[token]/route.ts` (GET) llama `GET /api/publico/cliente` con
  `X-Cliente-Token` (+ `X-Cliente-Dispositivo` si hay cookie); si el token es válido pone cookie
  `chv_cliente` = token (`httpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, 400 días = máximo que aceptan los
  navegadores) y redirige `303` a `/pedido` (o al destino `?ir=`) si el dispositivo es conocido, o a
  `/pedido/pin` si la API respondió `PIN_REQUERIDO`; token inválido → `/pedido/invalido`. Rutas BFF propias
  `apps/web/src/app/api/publico/pin/{elegir,entrar}/route.ts`: llaman a la API, reciben
  `{dispositivo_token}` y lo ponen en la cookie `chv_dispositivo` (`httpOnly`, `Secure`, `SameSite=Lax`,
  400 días); el token del dispositivo nunca llega al JS del navegador. Así el token sale de la
  barra de direcciones y del historial tras el primer clic. Respuesta con `Referrer-Policy: no-referrer`
  y `Cache-Control: no-store`. `apps/web/src/app/api/publico/[...ruta]/route.ts` (proxy de cliente): solo
  `/api/publico/*`, pone `X-Cliente-Token` desde `chv_cliente`, **nunca** `Authorization`; Origin igual que el
  del personal. En `401 ENLACE_INVALIDO` borra `chv_cliente` y `chv_dispositivo`; en `401 PIN_REQUERIDO` manda a `/pedido/pin`.
- **Cookies**: solo tres, `chv_jwt` (personal), `chv_cliente` (enlace) y `chv_dispositivo` (navegador recordado del cliente); todas `httpOnly`, `Secure` en
  producción, `SameSite=Lax`, y toda escritura exige `Origin` = host propio. **No existe `chv_sesion` ni
  `SESSION_SECRET`**: `apps/web/src/proxy.ts` (el antiguo `middleware.ts`) solo mira si la cookie
  `chv_jwt`/`chv_cliente` **existe** para redirigir a `/login` o `/pedido/invalido`; no la valida ni la
  firma. La autoridad es la API en cada petición.
- Server components leen con `apps/web/src/lib/api-servidor.ts` (personal) y `lib/api-publico.ts` (cliente).
- Imágenes: `apps/web/src/app/img/[archivo]/route.ts` sirve `GET /api/imagenes/:archivo` con
  `Cache-Control: public, max-age=31536000, immutable` (el nombre es el hash). Comprobantes: por el proxy
  del personal (con permiso).
- `config.permiso` de cada ruta API: código de §5 (o arreglo = cualquiera), `'sesion'` (cualquier personal
  con sesión), `'cliente'` (token de enlace; solo bajo `/api/publico/`) o `'publica'` (solo `GET /health`, `GET /ready`,
  `POST /api/auth/login`, `GET /api/imagenes/:archivo` y los 4 `GET /api/movil/actualizaciones/*` de §4.6). Un hook `onRoute` **aborta el arranque** si una
  ruta `/api` no declara ninguno, si una ruta `'cliente'` está fuera de `/api/publico/` o si una ruta de
  `/api/publico/` no es `'cliente'`: ruta nueva nace cerrada.

### 4.2 Formato

- Éxito: el recurso tal cual. Listas: `{ items: [...], total, pagina, por_pagina }` (`?pagina=1&por_pagina=50`, máx 200).
- Error: `{ "error": { "codigo": "STOCK_INSUFICIENTE", "mensaje": "texto para humano", "detalles": {...} } }`.
- Dinero string `"123.45"`; cantidades entero; coordenadas string `"19.432600"`; fechas de negocio
  `YYYY-MM-DD`; marcas de tiempo ISO-8601 UTC.
- Alta idempotente: `201` la primera vez, `200` con el mismo cuerpo si se repite la clave. Hash = `sha256`
  del JSON canónico del cuerpo (llaves ordenadas) sin `clave_idempotencia`.
- Validación zod antes que permiso fino; `400` antes que `409`.
- Advertencias no bloqueantes viajan en `advertencias: [...]` junto al recurso (precio bajo costo,
  pedido sin disponible, parada sin ubicación, carga mayor a capacidad).

### 4.3 Códigos de error → HTTP

| HTTP | Códigos |
|---|---|
| 400 | `VALIDACION` (detalles = issues de zod), `IMAGEN_NO_VALIDA` |
| 401 | `NO_AUTENTICADO`, `SESION_CERRADA`, `CREDENCIALES_INVALIDAS`, `ENLACE_INVALIDO`, `PIN_REQUERIDO` (detalle `{tiene_pin}`), `PIN_INCORRECTO` (detalle `{intentos_restantes}`) |
| 403 | `SIN_PERMISO` (detalle `{permiso}`), `SIN_PERMISO_PRECIO`, `CAMBIO_CONTRASENA_REQUERIDO`, `ORIGEN_INVALIDO`, `TURNO_AJENO`, `RUTA_AJENA`, `SOLO_APP` |
| 404 | `NO_ENCONTRADO` |
| 409 | `IDEMPOTENCIA_CONFLICTO`, `STOCK_INSUFICIENTE`, `PRECIO_NO_DEFINIDO`, `PRESENTACION_NO_VALIDA`, `VENTA_VACIA`, `COMPRA_VACIA`, `PEDIDO_VACIO`, `PEDIDO_MINIMO`, `PEDIDO_NO_EDITABLE`, `PEDIDO_CAMBIO`, `PEDIDO_EN_RUTA`, `PEDIDO_EN_OTRA_RUTA`, `PEDIDO_ESPERANDO_CLIENTE`, `PROPUESTA_CERRADA`, `LINEA_NO_VALIDA`, `PEDIDO_VENCIDO`, `PRECIOS_CAMBIARON`, `SIN_PRIMERA_COMPRA`, `PIN_YA_DEFINIDO`, `SIN_PROPUESTA`, `AVISO_NO_PENDIENTE`, `PEDIDO_NO_ASIGNABLE`, `AJUSTE_NO_VALIDO`, `ESTADO_NO_VALIDO`, `FECHA_NO_VALIDA`, `CLIENTE_INACTIVO`, `RUTA_NO_EDITABLE`, `RUTA_VACIA`, `RUTA_NO_TERMINADA`, `PARADAS_NO_CUADRAN`, `PARADA_DUPLICADA`, `REPARTIDOR_NO_VALIDO`, `BODEGA_SIN_UBICACION`, `FALTA_SURTIR`, `ENTREGA_EXCEDE_PEDIDO`, `ENTREGA_VACIA`, `PAGOS_NO_CUADRAN`, `EFECTIVO_INSUFICIENTE`, `CREDITO_SIN_CLIENTE`, `LIMITE_CREDITO_EXCEDIDO`, `TURNO_NO_ABIERTO`, `TURNO_NO_VALIDO`, `TURNO_YA_ABIERTO`, `CAJA_OCUPADA`, `VENTA_YA_CANCELADA`, `VENTA_CON_DEVOLUCIONES`, `VENTA_CON_ABONOS`, `DEVOLUCION_EXCEDE_VENDIDO`, `COMPRA_YA_CANCELADA`, `ABONO_EXCEDE_SALDO`, `CUENTA_NO_VALIDA`, `APLICACION_NO_CUADRA`, `ABONO_YA_CANCELADO`, `DUPLICADO` (violación `uq_`), `ROL_EN_USO`, `ROL_SISTEMA`, `ULTIMO_DUENO`, `FACTOR_INMUTABLE`, `PRODUCTO_SIN_PIEZA`, `PLANTILLA_NO_EXISTE`, `MOVIMIENTO_INMUTABLE`, `EXISTENCIA_SOLO_POR_MOVIMIENTO` (estas dos solo si un bug escribe directo; se loguean) |
| 413 | `ARCHIVO_GRANDE` (también el BFF si el cuerpo pasa de 1 MB) |
| 429 | `USUARIO_BLOQUEADO` (detalle `{reintentar_en}`), `ENLACE_BLOQUEADO`, `PIN_EN_ESPERA` (detalle `{segundos}`), `DEMASIADAS_PETICIONES` |
| 500 | `ERROR_INTERNO` (cualquier otro; sin detalles al cliente) |
| 502 / 504 | `API_NO_DISPONIBLE` / `TIEMPO_AGOTADO` (solo el BFF, cuando no llega a la API) |

Tabla única en `apps/api/src/comun/errores.ts`. Código SQL no listado → 500 y se loguea. Violaciones de
Postgres: `23505` → 409 `DUPLICADO`; `23503`/`23514`/`23502` → 500 (la API valida antes; si llegan es un bug).

### 4.4 Rutas

Permiso «sesion» = cualquier personal autenticado. «propio» = sin el permiso amplio se filtra por el
usuario del token.

**Auth, usuarios, configuración, plantillas, notificaciones (F1)**

| Método y ruta | Permiso | Cuerpo / query | Respuesta | Errores |
|---|---|---|---|---|
| POST `/api/auth/login` | publica | `{usuario, contrasena, origen?:'web'|'app'}` (lo pone el BFF) | `{token, expira_en, usuario:Yo}` (solo al BFF) | 400, 401 `CREDENCIALES_INVALIDAS`, 429 |
| POST `/api/auth/logout` | sesion | — | 204 | — |
| GET `/api/auth/yo` | sesion | — | `Yo = {id, usuario, nombre, rol:{id,nombre}, permisos:[codigo], sucursal:{id,nombre}, debe_cambiar_contrasena, turno_abierto:{id, tipo, caja_id, ruta_id}|null (siempre `null` hasta F7), notificaciones_sin_leer}` | 401 |
| POST `/api/auth/contrasena` | sesion | `{actual, nueva}` (nueva ≥ 8) | 204 (cierra las otras sesiones) | 400, 401 |
| GET `/api/usuarios` | usuarios.gestionar | `?buscar&rol_id&activo&pagina` | lista `Usuario = {id, usuario, nombre, telefono, rol:{id,nombre}, activo, debe_cambiar_contrasena, bloqueado_hasta, creado_en}` | — |
| POST `/api/usuarios` | usuarios.gestionar | `{usuario, nombre, telefono?, contrasena, rol_id}` (contraseña ≥ 8; nace con `debe_cambiar_contrasena`; sucursal 1) | 201 `Usuario` | 400, 409 `DUPLICADO` |
| PATCH `/api/usuarios/:id` | usuarios.gestionar | `{nombre?, telefono?, rol_id?, activo?}` (desactivar cierra sus sesiones) | `Usuario` | 409 `ULTIMO_DUENO` |
| POST `/api/usuarios/:id/contrasena` | usuarios.gestionar | `{nueva}` (restablece; queda `debe_cambiar_contrasena`; cierra sus sesiones) | 204 | 400 |
| POST `/api/usuarios/:id/cerrar-sesiones` | usuarios.gestionar | — | 204 | — |
| GET `/api/roles` | usuarios.gestionar | — | `[{id, nombre, descripcion, es_sistema, permisos:[codigo], num_usuarios}]` | — |
| GET `/api/permisos` | usuarios.gestionar | — | `[{codigo, modulo, descripcion}]` | — |
| POST `/api/roles`, PATCH `/api/roles/:id` | usuarios.gestionar | `{nombre, descripcion?, permisos:[codigo]}` (PATCH: parcial; `permisos` reemplaza) | rol | 409 `DUPLICADO`, `ROL_SISTEMA` |
| DELETE `/api/roles/:id` | usuarios.gestionar | — | 204 | 409 `ROL_SISTEMA`, `ROL_EN_USO` (tiene usuarios) |
| GET `/api/configuracion` | sesion | — | claves de §2.1 + `sucursal:{lat, lng}` | — |
| PATCH `/api/configuracion` | configuracion.editar | subconjunto (incl. ubicación de la bodega) | igual | 400 |
| GET `/api/plantillas` | configuracion.editar | `?canal` | `[{clave, canal, titulo, texto, variables}]` | — |
| PATCH `/api/plantillas/:clave` | configuracion.editar | `{titulo?, texto}` | plantilla (no se crean ni borran claves desde la API) | 400, 404 |
| POST `/api/plantillas/:clave/vista-previa` | configuracion.editar | `{vars}` | `{titulo, texto}` | 404 |
| GET `/api/auditoria` | auditoria.ver | `?tabla&registro_id&usuario_id&desde&hasta&pagina` | lista | — |
| GET `/api/notificaciones` | sesion (propias) | `?no_leidas&pagina` | lista `{id, evento, titulo, cuerpo, datos, creado_en, leida_en}` | — |
| POST `/api/notificaciones/leer` | sesion | `{ids?:[…]}` (sin ids = todas) | `{sin_leer}` | — |
| GET/PUT `/api/notificaciones/preferencias` | sesion | `{preferencias:[{evento, push}]}` | igual | — |
| GET `/api/tablero` (F9) | sesion (pantalla `/reportes`) | — | KPIs de dinero e inventario, sin contadores operativos (esos son de `/despacho`): `{ventas_hoy?, utilidad_mes?, cxc_total?, cxc_vencido?, bajo_minimo?, por_caducar?, precios_bajo_costo?}`, cada campo solo con el permiso de su reporte | — |

El panel consulta `GET /api/auth/yo` cada 30 s para el contador de la campana (`shortcut`: sondeo, sin
WebSocket; subir a SSE si se vuelve lento).

**Catálogo, inventario, proveedores, compras (F2)**

| Método y ruta | Permiso | Cuerpo / query | Respuesta | Errores |
|---|---|---|---|---|
| GET/POST `/api/categorias`, PATCH `/api/categorias/:id` | ver: catalogo.ver; escribir: catalogo.editar | `{nombre, orden?, activa?}` | categoría | 409 `DUPLICADO` |
| GET/POST `/api/marcas`, PATCH `/api/marcas/:id` | igual | `{nombre, activa?}` | marca | 409 |
| GET `/api/productos` | catalogo.ver | `?buscar&categoria_id&marca_id&proveedor_id&modo_surtido&activo&bajo_minimo&pagina` | lista `Producto = {id, nombre, sku, categoria, marca, contenido_ml, tipo_envase, imagen, modo_surtido, proveedor, existencia_minima, activo, existencia, comprometido, costo_promedio?, ultimo_costo?, presentaciones:[{id, nombre, factor, codigo_barras, se_vende, se_compra, activa, precios:[{lista_precio_id, precio}]}]}` (`costo_*` solo con costos.ver) | — |
| GET `/api/productos/:id` | catalogo.ver | — | `Producto` | 404 |
| POST `/api/productos` | catalogo.editar | `{nombre, categoria_id, marca_id?, sku?, descripcion?, contenido_ml?, tipo_envase?, modo_surtido?, proveedor_id?, existencia_minima, presentaciones:[{nombre, factor, codigo_barras?, se_vende?, se_compra?}]}` (incluye factor 1) | 201 `Producto` | 409 `PRODUCTO_SIN_PIEZA`, `DUPLICADO` |
| PATCH `/api/productos/:id` | catalogo.editar | campos del producto | `Producto` | — |
| PUT `/api/productos/:id/imagen` | catalogo.editar | multipart `imagen` (≤ 800 px) y `miniatura` (240 px, ≤ 30 KB) (§4.5; jpg/png/webp por firma de bytes, ≤ 1 MB; el navegador reduce antes de subir) | `{imagen}` | 400 `IMAGEN_NO_VALIDA`, 413 |
| GET `/api/imagenes/:archivo` | publica | — (nombre validado con la regex de `producto.imagen`, o su `-240`) | imagen (`Cache-Control: public, max-age=31536000, immutable`) | 404 |
| DELETE `/api/productos/:id/imagen` | catalogo.editar | — | 204 | — |
| POST `/api/productos/:id/presentaciones`, PATCH `/api/presentaciones/:id` | catalogo.editar | `{nombre, factor, codigo_barras?, se_vende?, se_compra?}`; PATCH sin `factor`, con `activa?` | presentación | 409 `DUPLICADO`, `FACTOR_INMUTABLE` |
| GET `/api/presentaciones/codigo/:codigo` | ventas.crear, compras.registrar o pedidos.capturar | `?lista_precio_id` | `ArticuloPos` | 404 |
| GET/POST `/api/listas-precio`, PATCH `/api/listas-precio/:id` | ver: sesion; escribir: precios.editar | | lista | 409 |
| PUT `/api/precios` | precios.editar | `{precios:[{presentacion_id, lista_precio_id, precio}]}` (≤ 500) | `{actualizados, advertencias?:[{presentacion_id, lista_precio_id, precio, costo_presentacion}]}` (advertencias solo con costos.ver) | 400 |
| GET `/api/precios/bajo-costo` | costos.ver | `?lista_precio_id` | `{filas: v_precio_bajo_costo}` | — |
| GET `/api/catalogo-venta` | ventas.crear o pedidos.capturar | `?lista_precio_id` | `[ArticuloPos = {presentacion_id, producto_id, producto, presentacion, factor, codigo_barras, categoria_id, marca, imagen, precio, existencia_piezas, disponible_piezas}]` | — |
| GET `/api/inventario/existencias` | inventario.ver | `?buscar&categoria_id&modo_surtido&bajo_minimo&pagina` | lista `{producto_id, producto, categoria, modo_surtido, cantidad, confirmadas, cargadas, cajas, sueltas, existencia_minima, costo_promedio?, valor?}` | — |
| GET `/api/inventario/movimientos` | inventario.ver | `?producto_id&tipo&causa_merma&desde&hasta&pagina` | lista | — |
| POST `/api/inventario/ajustes` | inventario.ajustar | `{producto_id, tipo, piezas, costo_unitario?, motivo?, causa_merma?}` | 201 movimiento | 409 `STOCK_INSUFICIENTE` |
| POST `/api/inventario/conteos` | inventario.ajustar | `{producto_id, piezas_contadas, motivo}` | 201 o 200 `{sin_diferencia:true}` | — |
| GET `/api/inventario/por-caducar` | inventario.ver | `?dias` (def. config) | `{filas: v_por_caducar}` | — |
| GET `/api/proveedores` | proveedores.gestionar, compras.ver o surtido.ver | `?buscar&activo` | lista | — |
| POST `/api/proveedores`, PATCH `/api/proveedores/:id` | proveedores.gestionar | `{nombre, telefono?, contacto?, notas?, activo?}` | proveedor | 409 |
| GET `/api/compras`, GET `/api/compras/:id` | compras.ver | `?desde&hasta&proveedor_id&estado&fecha_surtido&pagina` | lista / detalle con `caduca_el` | 404 |
| POST `/api/compras` | compras.registrar | `{clave_idempotencia, proveedor_id, folio_proveedor?, fecha, condicion_pago, fecha_surtido?, notas?, lineas:[{presentacion_id, cantidad, costo_presentacion, caduca_el?}]}` (1–200) | 201/200 `{id, folio, total}` | 409 |
| POST `/api/compras/:id/cancelar` | compras.cancelar | `{motivo}` | compra | 409 |

**Clientes, enlaces y pedidos — personal (F3)**

| Método y ruta | Permiso | Cuerpo / query | Respuesta | Errores |
|---|---|---|---|---|
| GET/POST `/api/zonas`, PATCH `/api/zonas/:id` | ver: clientes.ver; escribir: clientes.editar | `{nombre, activa?}` | zona | 409 |
| GET `/api/clientes` | clientes.ver | `?buscar&zona_id&dia_visita&sin_ubicacion&con_propuesta&con_saldo&alerta=visitas|inactivo|dispositivo_nuevo&enlace=activo|sin_activar|dado_de_baja|sin_link&activo&pagina` (cada fila trae `alertas:[…]` (marca amarilla) y `enlace:{estado, baja:{en, motivo, nota, por}|null}`: `activo` = vigente con PIN, `sin_activar` = vigente sin PIN, `dado_de_baja` = el último fue revocado, `sin_link` = nunca tuvo) | lista `{id, nombre, tipo_negocio, zona, telefono_whatsapp, dias_visita, tiene_ubicacion, tiene_propuesta, tiene_enlace, lista_precio, limite_credito, saldo?, vencido?, activo}` (saldo desde F7) | — |
| GET `/api/clientes/:id` | clientes.ver | — | cliente + `{enlace:{creado_en, ultimo_uso_en}|null, saldo?, vencido?, disponible?, frecuentes:[fn_frecuentes], ultimo_pedido:{id, folio, fecha, lineas:[{presentacion_id, cantidad}]}|null}` (P3) | 404 |
| POST `/api/clientes`, PATCH `/api/clientes/:id` | clientes.editar (+ clientes.credito para lista, límite y días) | `{nombre, tipo_negocio?, contacto?, telefono_whatsapp?, direccion?, referencias?, notas?, zona_id?, dias_visita?, lista_precio_id?, limite_credito?, dias_credito?, activo?}` | cliente | 403 |
| PUT `/api/clientes/:id/ubicacion` | clientes.editar | `{lat, lng, fuente:'mapa'|'app'}` o `{texto}` (pegado de Google Maps: `@lat,lng`, `q=lat,lng`, `lat,lng`; la API extrae; enlaces cortos `maps.app.goo.gl` se resuelven siguiendo **un** redireccionamiento solo a `*.google.com`) | cliente | 400 |
| POST `/api/clientes/:id/ubicacion/aceptar` | clientes.editar | — | cliente | 409 `SIN_PROPUESTA` |
| POST `/api/clientes/:id/enlace` | clientes.enlace | `{forzar?}` (409 `SIN_PRIMERA_COMPRA` si aún no compra y no se fuerza) | `{aviso}` (crea el aviso `wa_enlace_cliente`; el enlace viejo deja de servir). El token solo viaja dentro del texto del aviso; nunca se loguea | — |
| POST `/api/clientes/enlaces/revocar` | clientes.enlace | `{cliente_ids:[…] (1–200), motivo:'reenviado'|'ya_no_es_cliente'|'solo_cotiza'|'otro', nota?}` | `{dados_de_baja}` | 400 |
| GET `/api/clientes/:id/dispositivos` | clientes.enlace | — | `[{id, navegador, primer_uso_en, ultimo_uso_en}]` (no quitados) | 404 |
| DELETE `/api/clientes/:id/dispositivos/:dispositivo_id` | clientes.enlace | — | 204 | 404 |
| POST `/api/clientes/:id/pin/restablecer` | clientes.enlace | — | 204 | 404 |
| GET `/api/pedidos` | pedidos.ver | `?estado&fecha_entrega&desde&hasta&cliente_id&zona_id&ruta_id&sin_ruta&origen&pagina` | lista `{id, folio, cliente, zona, origen, estado, entrega_tipo, fecha_solicitada, fecha_entrega, total, num_lineas, requiere_surtido, ruta?, creado_en, version}` | — |
| GET `/api/pedidos/:id` | pedidos.ver | — | pedido + `lineas` (+ `disponible_piezas` por línea) + `eventos` + cliente (teléfono, saldo) | 404 |
| POST `/api/pedidos` | pedidos.capturar | `{clave_idempotencia, cliente_id, lineas, notas?, entrega_tipo?, fecha_solicitada?}` | 201/200 pedido | 409 |
| POST `/api/pedidos/:id/confirmar` | pedidos.gestionar | `{version, fecha_entrega, entrega_tipo?, lineas?, agregar?, notas_internas?}` | `{pedido, advertencias}` | 409 `PEDIDO_CAMBIO`, `ESTADO_NO_VALIDO`, 403 `SIN_PERMISO_PRECIO` |
| POST `/api/pedidos/:id/ajustar` | pedidos.gestionar | `{version, lineas?, agregar?}` | `{pedido, aviso}` | 409 |
| GET `/api/pedidos/:id/sugerencias` | pedidos.gestionar | `?pedido_linea_id` | `[{presentacion_id, producto, presentacion, factor, precio, disponible_piezas, imagen}]` (§2.4.1) | 404 |
| POST `/api/pedidos/:id/faltantes` | pedidos.gestionar | `{version, fecha_entrega?, lineas:[{pedido_linea_id, causa, nota?, opciones}]}` | `{pedido, aviso}` | 409 `PEDIDO_CAMBIO`, `LINEA_NO_VALIDA`, `ESTADO_NO_VALIDO` |
| POST `/api/propuestas/:id/responder` | pedidos.gestionar | `{opcion_id|null}` (el cliente llamó) | pedido | 409 `PROPUESTA_CERRADA` |
| POST `/api/propuestas/:id/cancelar` | pedidos.gestionar | — | pedido | 409 |
| POST `/api/pedidos/:id/cancelar` | pedidos.gestionar | `{motivo}` | pedido | 409 `PEDIDO_EN_RUTA` |
| POST `/api/pedidos/:id/reprogramar` | pedidos.gestionar | `{fecha_entrega}` | pedido | 409 |
| GET `/api/avisos` | avisos.enviar (sin `pedidos.ver`: solo los de pedidos de sus rutas) | `?estado=pendiente&cliente_id&pedido_id&pagina` | lista `Aviso = {id, cliente, pedido_folio, plantilla, estado, creado_en, telefono_completo:boolean, texto, url}` con `texto` renderizado al momento (vars + `enlace` = `url_publica/p/<token descifrado>`) y `url = https://wa.me/<telefono>?text=<texto codificado>` | — |
| POST `/api/avisos` | avisos.enviar | `{clave_idempotencia, cliente_id, plantilla:'wa_recordatorio_saldo'|'wa_enlace_cliente'|'wa_datos_transferencia', pedido_id?}` | 201/200 `Aviso` | 400 |
| POST `/api/avisos/:id/enviado`, POST `/api/avisos/:id/descartar` | avisos.enviar | — | 204 (repetir el mismo estado = 204) | 409 `AVISO_NO_PENDIENTE` |
| GET/PUT `/api/productos/:id/equivalentes` | ver: catalogo.ver; escribir: catalogo.editar | `{equivalentes:[{producto_id, orden}]}` (reemplaza) | `[{producto_id, producto, orden}]` | 400 |
| GET `/api/despacho` | sesion (cada bloque con su permiso; pantallas `/` «Hoy» y `/cierre`) | `?fecha` (def. hoy local) | **Única fuente de contadores operativos**: `{fecha, pedidos?:{por_confirmar, esperando_cliente, faltantes_vencen_1h, confirmados_sin_ruta, recoge, por_zona:[{zona, pedidos, sin_ruta, total}]}, surtido?:{productos_por_comprar} (F5), rutas?:[{id, folio, estado, paradas, entregadas}] + {por_cargar, en_curso, por_liquidar} (F6/F7), avisos_pendientes?, cierre?:{transferencias_por_verificar, turnos_mostrador_abiertos} (F7), respaldo?:{ultimo, ok, vencido} (configuracion.editar)}`. Un bloque aparece cuando existe su fase y el usuario tiene su permiso (`pedidos.ver`, `surtido.ver`, `rutas.ver`/`rutas.operar` propio, `avisos.enviar`, `rutas.liquidar`/`cobranza.verificar`/`caja.supervisar`). | — |

**Página del cliente — `/api/publico/*` (F3), permiso `cliente`**

Límites (`@fastify/rate-limit`, llave = hash del token): 120 peticiones/min; `POST/PATCH` de pedidos 20/h;
ubicación 5/día. Token inválido: 10/15 min por `X-Visitante-Ip`. PIN: 5 fallos → 15 min por enlace + IP
(en SQL, `cliente_pin_espera`). Todo es temporal.

| Método y ruta | Cuerpo / query | Respuesta | Errores |
|---|---|---|---|
| POST `/api/publico/pin/elegir` (solo vía BFF) | `{pin}` (4 dígitos) | `{dispositivo_token}` al BFF → cookie | 409 `PIN_YA_DEFINIDO`, 400 |
| POST `/api/publico/pin/entrar` (solo vía BFF) | `{pin}` | `{dispositivo_token}` al BFF → cookie | 401 `PIN_INCORRECTO`, 429 `PIN_EN_ESPERA` |
| GET `/api/publico/cliente` | — | `{nombre, negocio:{nombre, whatsapp}, pedido_minimo, hora_corte, dias_visita, proxima_visita, tiene_ubicacion, credito:{limite, saldo, disponible}|null, textos:{bienvenida, aviso_ubicacion}}` | 401 `ENLACE_INVALIDO` |
| GET `/api/publico/catalogo` | — | `{categorias:[{id, nombre}], articulos:[{presentacion_id, producto, presentacion, factor, categoria_id, marca, contenido_ml, tipo_envase, miniatura, imagen, precio, favorito, buscar}], frecuentes:[{presentacion_id, ultima_cantidad}], ultimo_pedido:{folio, fecha, vista: fn_vista_borrador(sus líneas)}|null, version}` (sin existencias ni costos). `buscar` = nombre + marca + alias normalizados para filtrar en el teléfono sin ir al servidor. `ETag` = `version` (cambia con precios/catálogo): la segunda visita en 3G no baja nada. | 304 |
| PUT/DELETE `/api/publico/favoritos/:presentacion_id` | — | 204 | 404 |
| GET `/api/publico/pedidos` | — | últimos 20 `{id, folio, etapa, etiqueta, total, fecha_entrega, creado_en, editable, faltantes_pendientes, reparto:{parada, paradas}|null}` (en curso primero) | — |
| GET `/api/publico/pedidos/:id` | — | `fn_seguimiento_pedido` (§2.4.2) | 404 (también si es de otro cliente) |
| POST `/api/publico/propuestas/:id/responder` | `{opcion_id|null}` (null = no lo quiero) | seguimiento del pedido | 409 `PROPUESTA_CERRADA` (venció o ya respondió) |
| POST `/api/publico/pedidos` | `{clave_idempotencia, lineas:[{presentacion_id, cantidad}], total_visto, notas?, entrega_tipo?, fecha_solicitada?}` (precios siempre de la base al enviar; total distinto al visto → `PRECIOS_CAMBIARON` con la vista nueva) | 201/200 `{id, folio, total, estado, texto_confirmacion, avisar_negocio:{url}}` (wa.me opcional al negocio con `wa_cliente_avisa_pedido`) | 409 `PEDIDO_MINIMO`, `PEDIDO_VACIO`, `PRECIO_NO_DEFINIDO`, `PRECIOS_CAMBIARON`, 429 |
| PATCH `/api/publico/pedidos/:id` | `{lineas, notas?, entrega_tipo?, fecha_solicitada?}` | pedido | 409 `PEDIDO_NO_EDITABLE` |
| POST `/api/publico/pedidos/:id/cancelar` | `{motivo?}` | pedido | 409 `PEDIDO_NO_EDITABLE` |
| POST `/api/publico/ubicacion` | `{lat, lng, precision_m}` (rechaza `precision_m > 100`) | 202 | 400, 429 |

**Surtido (F5)**

| Método y ruta | Permiso | Query / cuerpo | Respuesta |
|---|---|---|---|
| GET `/api/surtido` | surtido.ver | `?fecha&ruta_id` | `{fecha, proveedores:[{proveedor_id, proveedor, telefono, lineas:[fn_lista_surtido], costo_estimado?}], totales}` |
| GET `/api/surtido/mensaje` | surtido.ver | `?fecha&proveedor_id` | `{telefono, texto}` (`wa_surtido_proveedor`) |
| POST `/api/surtido/publicar` | surtido.ver | `{fecha}` | `{notificados}` |

**Rutas y reparto (F6; entregas y liquidación en F7)**

| Método y ruta | Permiso | Cuerpo / query | Respuesta | Errores |
|---|---|---|---|---|
| GET/POST `/api/vehiculos`, PATCH `/api/vehiculos/:id` | ver: rutas.ver; escribir: configuracion.editar | `{nombre, placas?, capacidad_cajas?, activo?}` | vehículo | 409 |
| GET `/api/rutas` | rutas.ver / rutas.operar (propio) | `?fecha&estado&repartidor_id&pagina` | lista `{id, folio, fecha, nombre, vehiculo, repartidor, estado, paradas, entregadas, distancia_km}` | — |
| GET `/api/rutas/:id` | rutas.ver / rutas.operar (propio) | — | ruta + `paradas:[{id, orden, tipo, estado, cliente:{id, nombre, direccion, referencias, telefono_whatsapp, lat, lng, saldo?, vencido?}, pedido:{id, folio, total, lineas}|null, km_desde_anterior, navegar:{google, waze}}]` + `navegar_ruta:[url…]` | 404 |
| POST `/api/rutas` | rutas.planear | `{fecha, nombre?, vehiculo_id, repartidor_id}` | 201 ruta | 409 |
| POST `/api/rutas/:id/pedidos` | rutas.planear | `{pedido_ids}` | ruta | 409 |
| POST `/api/rutas/:id/cobros` | rutas.planear | `{cliente_id}` | ruta | 409 |
| DELETE `/api/rutas/paradas/:id` | rutas.planear | — | ruta | 409 |
| POST `/api/rutas/:id/optimizar` | rutas.planear | — | `{ruta, distancia_km, sin_ubicacion:[parada_id]}` | 409 `BODEGA_SIN_UBICACION`, `RUTA_NO_EDITABLE` |
| PUT `/api/rutas/:id/orden` | rutas.planear | `{paradas:[id…]}` | ruta | 409 `PARADAS_NO_CUADRAN` |
| POST `/api/rutas/:id/cargar` | rutas.planear | — | `{ruta, carga, advertencias}` | 409 `FALTA_SURTIR`, `RUTA_VACIA` |
| GET `/api/rutas/:id/carga` | rutas.ver / rutas.operar (propio) | — | `fn_orden_carga` | 404 |
| POST `/api/rutas/:id/cancelar` | rutas.planear | — | ruta | 409 |
| POST `/api/rutas/:id/iniciar` (F6; desde F7 abre el turno) | rutas.operar (propio) | `{fondo_inicial}` | `{ruta, turno}` | 409, 403 `RUTA_AJENA` |
| POST `/api/rutas/paradas/:id/no-entregado` | rutas.operar (propio) | `{motivo}` | parada (repetir sobre una parada ya `fallida` devuelve 200 con la misma parada: idempotente por estado) | 409 |
| POST `/api/rutas/:id/terminar` | rutas.operar (propio) | — | ruta | 409 |
| POST `/api/pedidos/:id/entregar` (F7) | rutas.operar (reparto) o ventas.crear (recoge) | `{clave_idempotencia, lineas?, pagos, efectivo_recibido?, notas?}` | 201/200 `{venta:{id, folio, total}, pedido, saldo_cliente, aviso}` | 409 de §2.8.1–2 |
| GET `/api/rutas/:id/liquidacion` (F7) | rutas.liquidar / rutas.operar (propio, solo lectura) | — | `fn_resumen_turno` del turno de ruta + movimientos | 404 |
| POST `/api/rutas/:id/liquidar` (F7) | rutas.liquidar | `{efectivo_contado, notas?}` | resumen final | 409 `RUTA_NO_TERMINADA` |

**Caja, ventas, cobranza (F7 crea todas; F8 agrega las pantallas `/pos` y la parte de mostrador de `/caja`)**

| Método y ruta | Permiso | Cuerpo / query | Respuesta | Errores |
|---|---|---|---|---|
| GET `/api/cajas`, POST `/api/cajas`, PATCH `/api/cajas/:id` | ver: caja.operar; escribir: configuracion.editar | `{nombre, activa?}` | caja `{id, nombre, activa, turno_abierto:{id, usuario}|null}` | 409 `DUPLICADO` |
| GET `/api/turnos/actual`, GET `/api/turnos`, POST `/api/turnos`, POST `/api/turnos/:id/movimientos`, GET `/api/turnos/:id/resumen`, POST `/api/turnos/:id/cerrar` | caja.operar (propio) / caja.supervisar; `actual`, `resumen` y movimientos de un turno de ruta propio también con rutas.operar. Pantalla dueña: `/caja` (también para gastos de ruta) | `actual` → turno abierto propio o `null`; GET `?desde&hasta&usuario_id&caja_id&tipo&estado&pagina`; POST `{caja_id, fondo_inicial}` (`fn_abrir_turno`); movimientos `{tipo:'entrada'|'salida'|'retiro', monto, motivo}`; cerrar `{efectivo_contado, notas?}` (`fn_cerrar_turno`, solo mostrador) | turno `{id, tipo, caja_id, ruta_id, usuario, estado, fondo_inicial, abierto_en, cerrado_en, …}`; resumen y cierre = `fn_resumen_turno` | 409, 403 |
| POST `/api/ventas` | ventas.crear | `{clave_idempotencia, cliente_id?, lista_precio_id?, lineas, pagos, efectivo_recibido?, notas?}` (mostrador) | 201/200 `Ticket` | 409 de §2.8.1 |
| GET `/api/ventas`, GET `/api/ventas/:id` | ventas.ver (propio) / ventas.ver_todas | `?desde&hasta&usuario_id&cliente_id&origen&estado&folio&pagina` | lista / detalle (+ costo y utilidad con costos.ver) | 404 |
| GET `/api/ventas/:id/ticket` | ventas.ver (propio) / ventas.ver_todas | — | `Ticket = {negocio, folio, fecha, usuario, cliente, lineas:[{cantidad, presentacion, producto, precio_unitario, importe}], total, pagos, efectivo_recibido, cambio, saldo_credito?}` (sin desglose de impuestos) | 404 |
| POST `/api/ventas/:id/cancelar` | ventas.cancelar | `{motivo}` | `{venta, reembolso_efectivo, reembolso_otros}` | 409 |
| POST `/api/ventas/:id/devoluciones` | ventas.devolver | `{clave_idempotencia, motivo, lineas:[{venta_linea_id, piezas, regresa_a_inventario}]}` | 201/200 | 409 |
| POST `/api/comprobantes` | ventas.crear, rutas.operar o cobranza.abonar (pantalla dueña: `/cobrar`) | multipart `imagen` (≤ 1 MB, jpg/png/webp) | `{comprobante}` (nombre; se manda luego en el pago o abono) | 400, 413 |
| GET `/api/comprobantes/:archivo` | cobranza.ver o rutas.liquidar | — | imagen (`Cache-Control: private, no-store`) | 404 |
| GET `/api/cuentas-por-cobrar` | cobranza.ver | `?cliente_id&zona_id&estado&vencidas&pagina` | lista `{id, cliente, origen, venta_folio, concepto, creado_en, vence_el, monto, saldo, estado, dias_vencida}` | — |
| POST `/api/clientes/:id/saldo-inicial` | clientes.credito | `{monto, vence_el, concepto}` | 201 CxC | 400 |
| GET `/api/clientes/:id/estado-cuenta` | cobranza.ver; repartidor con rutas.operar si el cliente está en su ruta en curso | `?desde&hasta` | `{saldo_inicial, movimientos:[{fecha, tipo, folio, cargo, abono}], saldo_final}` | 404 |
| GET `/api/abonos` | cobranza.ver | `?cliente_id&desde&hasta&estado&metodo&verificado&pagina` | lista | — |
| POST `/api/abonos` | cobranza.abonar | `{clave_idempotencia, cliente_id, metodo, monto, referencia?, comprobante?, ruta_parada_id?, cuentas?}` | 201/200 `{id, folio, aplicaciones, saldo_cliente}` | 409 |
| POST `/api/abonos/:id/cancelar` | cobranza.cancelar_abono | `{motivo}` | abono | 409 |
| GET `/api/transferencias` | cobranza.verificar | `?verificado&desde&hasta` | pagos y abonos por transferencia `{tabla, id, folio, cliente, monto, referencia, comprobante, ruta, verificado_en}` | — |
| POST `/api/transferencias/verificar` | cobranza.verificar | `{tabla, id}` | 204 | 409 |

**Cascarón Android (F4)** — `/api/movil/push/*` exigen sesión `app`; la página del panel las llama con su cookie por el proxy normal, con el token FCM que le pasa el cascarón (§4.6).

| Método y ruta | Permiso | Cuerpo | Respuesta | Errores |
|---|---|---|---|---|
| POST `/api/movil/push/registrar` | sesion | `{token, plataforma, app_version?}` | `{registrado:true}` | 403 `SOLO_APP` |
| DELETE `/api/movil/push/registrar` | sesion | `{token?}` | `{quitados}` (solo «Desactivar avisos en este teléfono» en `/notificaciones`; cerrar sesión no la llama: `trg_sesion_cerrada_revoca` ya revoca) | — |
| GET `/api/movil/actualizaciones/manifiesto` | publica (60/min por IP) | cabeceras `expo-protocol-version` (1), `expo-platform` (`android`), `expo-runtime-version` (`^[A-Za-z0-9._-]{1,64}$`), `expo-current-update-id` | protocolo Expo Updates v1: `multipart/mixed` con partes `manifest` (con su `expo-signature`) y `extensions`; **204** sin cuerpo si no hay actualización para ese runtime o el teléfono ya la tiene; `cache-control: private, max-age=0` | 400 `VALIDACION` |
| GET `/api/movil/actualizaciones/recursos/:hash` | publica (300/min) | `hash` = 64 hex | archivo del paquete, `cache-control: public, max-age=31536000, immutable` | 404 |
| GET `/api/movil/actualizaciones/apk` | publica (60/min) | — | `{version_code, version_name, runtime, sha256, tamano_bytes, notas, obligatoria, publicada_en, url}` o `null` | — |
| GET `/api/movil/actualizaciones/apk/:archivo` | publica (6/min) | `archivo` = `^chevecheve-[0-9]{1,6}\.apk$` | APK (`application/vnd.android.package-archive`, `content-disposition: attachment`) | 404 |

Todo lo demás del cascarón son las rutas del panel; no existe API «de la app» de negocio. Las 4 de
actualizaciones solo leen archivos publicados (§4.6) y no tocan la base.

**Lote 2026-11-23 (§2.12)** — pantalla dueña entre paréntesis

| Método y ruta | Permiso | Cuerpo / query | Respuesta | Errores |
|---|---|---|---|---|
| GET `/api/compras/:id/margenes` (F2, `/compras/[id]`) | compras.ver + costos.ver | — | `fn_margenes_compra` | 404 |
| GET `/api/precios/sugeridos` (F2, `/precios`) | precios.editar + costos.ver | `?producto_ids` | `[{presentacion_id, lista_precio_id, precio, precio_sugerido, margen, objetivo}]` | — |
| GET/POST `/api/ofertas`, PATCH/DELETE `/api/ofertas/:id` (F2, `/precios`) | ver: catalogo.ver; escribir: precios.editar | `{presentacion_id, lista_precio_id?, precio, desde, hasta, motivo}` | oferta | 400 |
| POST `/api/pedidos/interpretar` (F3, `/pedidos/nuevo`) | pedidos.capturar | `{cliente_id, texto}` (≤ 2000) | `{lineas:[{texto, cantidad, presentacion_id?, color:'verde'|'amarillo'|'rojo', candidatos:[{presentacion_id, producto, presentacion, precio, puntaje}]}]}` | 400 |
| POST `/api/publico/pedidos/:id/aceptar` (F3, `/pedido/mis-pedidos/[id]`) | cliente | `{total_visto}` | seguimiento | 409 `PEDIDO_VENCIDO`, `PRECIOS_CAMBIARON`, `ESTADO_NO_VALIDO` |
| GET/POST `/api/promociones`, PATCH/DELETE `/api/promociones/:id` (F5, `/surtido/promociones`) | ver: surtido.ver; escribir: compras.registrar | `{proveedor_id, presentacion_id, costo_presentacion, minimo_cantidad?, desde, hasta, notas?}` | promoción | 400 |
| GET/PUT `/api/fechas-demanda` (F5, `/configuracion`) | ver: surtido.ver; escribir: configuracion.editar | `{fechas:[{fecha, nombre, factor}]}` (reemplaza el año) | lista | 400 |
| GET `/api/rutas/:id/sugerencias-cobro` (F7, `/rutas/[id]`) | rutas.planear | — | `[{cliente_id, nombre, zona, vencido, saldo}]` | 404 |
| GET `/api/publico/estado-cuenta` (F7, `/pedido/estado-cuenta`) | cliente | — | `fn_estado_cuenta` 90 días | — |
| GET `/api/cierre/resumen` (F7, `/cierre`) | reportes.ver (ganancia con costos.ver) | `?fecha` | `fn_resumen_dia` | — |

Cambios a rutas existentes: `GET /api/clientes/:id` agrega `semaforo:{color, dias_promedio_pago,
max_dias_vencido, limite_sugerido}` (F7) y `sugerir_pedido`; `PATCH /api/clientes/:id` acepta
`sugerir_pedido`; `POST /api/pedidos` acepta `correcciones`; `GET /api/publico/catalogo` agrega
`oferta:{precio_normal, hasta}` por artículo y `ofertas` primero (F2/F3), `sugerencias_zona` (F11);
`GET /api/publico/cliente` agrega `pedido_propuesto:{id}|null` y `lealtad` (F11); `POST /api/avisos`
acepta `wa_estado_cuenta` y `wa_resumen_dia` (con `usuario_id`); `POST /api/pedidos/:id/entregar`
acepta `recibio`, `foto_entrega`.

**Reportes (F9)** — todos `?desde&hasta` (fechas locales, máx 366 días) salvo indicado. CSV en el navegador.

| Método y ruta | Permiso | Query | Respuesta (fuente en §6) |
|---|---|---|---|
| GET `/api/reportes/ventas` | reportes.ver | `agrupar=dia|mes|usuario|cliente|zona|ruta|origen|producto|categoria|metodo` | `{filas:[{clave, etiqueta, num_ventas, piezas, importe}], totales}` |
| GET `/api/reportes/compras` | reportes.ver | `agrupar=dia|mes|proveedor|producto|categoria` | `{filas:[{clave, etiqueta, num_compras, piezas, importe}], totales}` |
| GET `/api/reportes/utilidad` | reportes.ver + costos.ver | `agrupar=dia|mes|producto|categoria|origen` | `{filas:[{clave, etiqueta, importe, costo, utilidad, margen}], ajustes:{mermas_por_causa, ajustes_netos}, utilidad_neta}` |
| GET `/api/reportes/entregas` | reportes.ver | `agrupar=dia|ruta|repartidor|zona|cliente` | `{filas:[{clave, etiqueta, pedidos, entregados, fallidos, parciales, piezas_faltantes, importe_pedido, importe_entregado}]}` |
| GET `/api/reportes/faltantes` | reportes.ver | `agrupar=producto|proveedor` | demanda perdida de `v_entregas` |
| GET `/api/reportes/inventario-valorizado` | costos.ver | `?categoria_id` | `{filas, valor_total}` |
| GET `/api/reportes/bajo-minimo` | inventario.ver | — | `{filas:[{producto, categoria, cantidad, existencia_minima, faltante, agotado}]}` |
| GET `/api/reportes/ganancia` | reportes.ver + costos.ver | `agrupar=cliente|ruta|zona` | `{filas:[{clave, etiqueta, importe, costo, utilidad, gastos_ruta?, ganancia}]}` (B13) |
| GET `/api/reportes/cuentas-por-cobrar` | cobranza.ver | `?al&zona_id` | `{filas: fn_cxc_antiguedad, totales}` |
| GET `/api/reportes/cortes` | caja.supervisar o rutas.liquidar | `?tipo&usuario_id&caja_id` | `{filas:[Turno + ventas y abonos por método]}` |

### 4.5 Archivos (imágenes y comprobantes)

- Volumen Docker `archivos` montado en la API en `/datos/archivos` (`imagenes/` y `comprobantes/`). No
  vive en la imagen ni en la base. Respaldo junto con la base.
- Producto: el cliente sube **dos** archivos en la misma petición, `imagen` (≤ 800 px) y `miniatura`
  (240 px, ≤ 30 KB); se guardan como `<hash>.<ext>` y `<hash>-240.<ext>` (`producto.imagen` guarda el
  primero; la miniatura se deriva del nombre). El catálogo del cliente usa miniaturas con carga diferida.
- Nombre = `sha256(contenido).<ext>`; la extensión sale de la firma de bytes (JPEG `FF D8 FF`, PNG
  `89 50 4E 47`, WebP `RIFF….WEBP`), nunca del nombre ni del `Content-Type` del cliente. ≤ 1 MB. El
  navegador reduce a 800 px y 240 px con canvas (también dentro del cascarón) — sin `sharp` en el servidor.
- `GET /api/imagenes/:archivo` es pública (fotos de catálogo, nada privado) y valida el nombre con la
  regex de `producto.imagen`; comprobantes **solo** por `GET /api/comprobantes/:archivo` con permiso.
- Archivos huérfanos (imagen reemplazada) se quedan; `shortcut`: limpieza manual si el volumen crece.

### 4.6 Cascarón Android (`apps/mobile`) y PWA

- Expo (~58, como RefaccionPro) + `react-native-webview` + `expo-notifications` (token **FCM del aparato**,
  canal `avisos`) + `expo-keep-awake` + `expo-linking` + `expo-updates` + `expo-application` +
  `expo-intent-launcher` + `expo-file-system`. Sin `expo-router` ni pantallas propias salvo: «sin conexión»
  (reintentar), «actualiza la app» (bloqueante) y los diálogos nativos de actualización de abajo. Android solamente.
- WebView: carga `url_publica`; `sharedCookiesEnabled`, almacenamiento persistente; `geolocationEnabled`
  (para «guardar ubicación aquí» con `navigator.geolocation`); selector de archivos con cámara habilitado
  (para `<input type="file" accept="image/*" capture>`: comprobantes y fotos; la reducción a 800/240 px la
  hace el navegador con canvas). Botón atrás de Android = atrás del WebView.
- **Navegación permitida** solo al origen de `url_publica`. `https://wa.me/*`, `whatsapp:`, Google Maps,
  `waze.com`, `tel:` se abren **fuera** con `Linking.openURL`; cualquier otro origen se bloquea.
- **Puente** (`window.ReactNativeWebView.postMessage` ↔ `injectJavaScript`), mensajes JSON con `tipo` y
  aceptados solo si la página es del origen permitido:
  | De | `tipo` | Datos | Efecto |
  |---|---|---|---|
  | panel → cascarón | `pedir_push` | — | pide permiso de notificaciones y responde `push_token` |
  | cascarón → panel | `push_token` | `{token, plataforma:'android', version}` | el panel llama `POST /api/movil/push/registrar` con su cookie |
  | panel → cascarón | `pantalla_encendida` | `{activa}` | `/reparto` la activa mientras hay ruta en curso |
  | panel → cascarón | `sin_guardar` | `{activo}` | la pantalla tiene captura sin guardar (formulario con cambios, `/cobrar` a medias, carrito de `/pos`, borrador de compra); mientras esté activo el cascarón **no se reinicia** para actualizarse. Lo manda `lib/cascaron.ts` |
  | panel → cascarón | `buscar_actualizacion` | — | revisa OTA y APK ahora (botón en `/notificaciones` › «Esta app») |
  | cascarón → panel | `estado_app` | `{version, version_code, ota_id, ota_fecha, resultado:'al_dia'|'lista'|'apk'|'sin_red', novedades:[{version, fecha, items}]}` | `/notificaciones` lo muestra (solo lectura) |
  El panel detecta el cascarón por el User-Agent y solo entonces muestra «Activar avisos» y «Esta app». Ambos
  lados ignoran mensajes con `tipo` desconocido (un panel nuevo convive con un cascarón viejo y al revés).
- **Enlace profundo**: al tocar un push, el cascarón carga `url_publica + datos.ruta`; `datos.ruta` debe
  cumplir `^/[a-z0-9/_-]*(\?[a-z0-9_=&-]*)?$` o se abre `/`. Con la app cerrada, igual al arrancar.
- **PWA** (iPhone, PC): `apps/web/src/app/manifest.ts` + íconos; sin service worker (`shortcut`: sin
  caché fuera de línea; agregarlo con web push si hace falta).

#### 4.6.1 Actualizaciones del cascarón (F4; mecanismo copiado de chachaplancha y adaptado)

**Qué se actualiza cómo.** Las pantallas de negocio son el panel web: se actualizan con cada despliegue de
`apps/web` (push a `main`), sin tocar el teléfono. Lo de abajo solo cubre el **JS del cascarón** (WebView,
puente, push, diálogos) y su parte nativa. Costo $0: sin EAS ni Play Store.

| Cambió… | Se publica | El teléfono |
|---|---|---|
| Solo JS de `apps/mobile/src/` | **OTA interna** (`expo-updates`, servidor propio) | nada: la baja y la aplica sola |
| Paquete nativo, plugin o permiso (`apps/mobile/package.json`, `app.json`, `app.config.ts`), SDK, ícono o nombre | **APK nueva** | diálogo «Hay una versión nueva» → Instalar (Android pide confirmar) |

En duda, APK nueva (una OTA con código nativo faltante truena al abrir).

- **Runtime**: `runtimeVersion: {policy: 'appVersion'}` = `version` de `apps/mobile/app.json`. Una OTA solo
  llega a APK con el mismo runtime: OTA no toca `version`; APK nueva sube `version` **y** `android.versionCode`.
- **Firma de manifiestos**: RSA-SHA256 (`expo-signature`, `keyid="main"`, `alg="rsa-v1_5-sha256"`). La
  llave privada vive **solo en el servidor** (`~/.chevecheve-actualizaciones/llave-privada.pem`, permiso
  600; nunca en git, en el contenedor ni en la API). El certificado público va en
  `apps/mobile/certs/certificado.pem` (en git). La app rechaza manifiestos sin firma válida. Perder la llave
  = APK nueva con certificado nuevo instalada a mano en cada teléfono: se respalda fuera del servidor.
- **`app.config.ts`**: `updates.url = ${EXPO_PUBLIC_URL_PANEL}/api/movil/actualizaciones/manifiesto` (solo
  si es `https://`; sin ella `expo-updates` queda apagado en desarrollo), `checkAutomatically: 'ON_LOAD'`,
  `fallbackToCacheTimeout: 0`, `codeSigningCertificate`, `codeSigningMetadata`. Permiso
  `REQUEST_INSTALL_PACKAGES`.
- **Ruta de red**: la API es privada; el teléfono llega por el dominio público de `apps/web` a la ruta de
  BFF de §4.1, que reenvía a los 4 `GET /api/movil/actualizaciones/*` (§4.4). Son públicos porque
  `expo-updates` no manda cookie y la app los usa antes del login; solo leen archivos publicados.
- **Almacenamiento** (`ACTUALIZACIONES_DIR`, volumen `actualizaciones` montado en la API; la API solo lee):
  ```
  android/<runtime>/actual.json                      {"update_id":"<uuid>"}   (puntero; regresar = cambiarlo)
  android/<runtime>/updates/<uuid>/manifest.json     manifiesto Expo Updates v1 ya armado
  android/<runtime>/updates/<uuid>/firma             valor completo de la cabecera expo-signature
  recursos/<sha256 hex>  (+ <sha256 hex>.tipo)       bundle e imágenes, inmutables; .tipo = contentType
  apk/ultima.json                                    {version_code, version_name, runtime, archivo, sha256,
                                                      tamano_bytes, notas, obligatoria, publicada_en}
  apk/chevecheve-<versionCode>.apk
  ```
  Sin `ACTUALIZACIONES_DIR` o vacío: manifiesto 204, `apk` = `null`, archivos 404; nunca 500. No entra al
  respaldo diario (se vuelve a publicar desde git; lo que no se puede perder son las llaves).
- **Publicar** (en el servidor, desde el repo, nunca por HTTP ni pantalla de administración): scripts
  `apps/api/scripts/ota-publicar.mjs` (`--dist <expo export> --runtime <rv> --llave <pem> --expo-config
  <json> --url-base <url_publica> --salida <dir>`: arma el manifiesto con `id` uuid, `createdAt`,
  `launchAsset` y `assets` con `hash` base64url SHA-256, `key`, `contentType`, `fileExtension` y `url`
  absoluta `<url_publica>/api/movil/actualizaciones/recursos/<sha256 hex>`; firma; actualiza `actual.json`;
  imprime el id), `ota-publicar-apk.mjs` (`--apk --version-code --version-name --runtime --notas
  [--obligatoria] --salida`; calcula sha256 y tamaño; nunca repite un `versionCode` ya publicado) y
  `ota-regresar.mjs` (`--runtime --a <uuid bueno> --llave --salida`: vuelve a emitir esa versión con id
  nuevo, así también regresan los teléfonos que ya bajaron la mala). Se publica en una carpeta local y se
  copia al volumen con `docker cp`. **Siempre después** de que el despliegue de la web/API esté verde.
- **Aplicar la OTA** (lógica pura con pruebas en `apps/mobile/src/actualizaciones/logica.ts`): al abrir, si
  hay OTA se baja y se aplica de inmediato (un reinicio); con la app abierta se baja en segundo plano
  (revisión como mucho cada 30 min) y se aplica cuando la app vuelve al frente tras **≥ 5 min** en segundo
  plano. **Nunca reinicia con `sin_guardar` activo**: muestra el diálogo «Hay una actualización lista» con
  «Reiniciar y aplicar» y se aplica en la siguiente oportunidad segura.
- **Regreso (rollback)**: `expo-updates` vuelve sola a la anterior o a la incrustada si la nueva falla al
  arrancar; además `ota-regresar.mjs` (arriba).
- **APK nueva**: al abrir y con «Buscar actualización», el cascarón consulta
  `GET /api/movil/actualizaciones/apk`; si `version_code` > el instalado (`Application.nativeBuildVersion`)
  → diálogo nativo «Hay una versión nueva» con notas, «Instalar» y «Más tarde» (24 h). Instalar: descarga a
  caché con progreso, verifica `sha256` (si no coincide no instala y lo dice) y abre el instalador de
  Android. Con `obligatoria` y `version_code` mayor → pantalla «Actualiza la app para seguir» sin «Después».
  **Sin red o con error del servidor nunca bloquea.** Solo cuenta la última APK publicada.
- **Novedades obligatorias**: `apps/mobile/src/actualizaciones/novedades.ts` (la más nueva primero, en
  palabras del negocio). Cada publicación agrega su entrada; `novedades.test.ts` falla si la primera no es
  la `version` de `app.json`, si una entrada no tiene fecha `AAAA-MM-DD` o novedades, o si no van de la más
  nueva a la más vieja. `--notas` de la APK = resumen de esa entrada. Se muestran en `/notificaciones` ›
  «Esta app» vía `estado_app`.
- **Firma de la APK**: llave propia `android-release.p12` (variables `CHV_APK_*`, §3.1) con un plugin de
  configuración que hace fallar la compilación de release si faltan; nunca la llave de depuración. Respaldo
  de `~/.chevecheve-actualizaciones/` completo fuera del servidor (gestor de contraseñas o USB cifrada).
- Guía paso a paso para el dueño: `docs/deploy/actualizar-app.md` (entregable de F4).

## 5. Roles × permisos

Hoy el personal son **2 personas que hacen todo** (despacho, surtir, reparto, cobro): el dueño con rol
**Dueño** y su socio con **Administrador**, que por eso trae también reparto, entrega y mostrador. Los
demás roles quedan sembrados para cuando crezcan.

Semilla de roles: **Dueño** (`es_sistema`, todo), **Administrador** (opera todo menos usuarios/roles, costos, precios
(`precios.editar`, `pedidos.cambiar_precio`, `ventas.cambiar_precio`), cancelar venta/compra/abono y envases), **Repartidor** (su ruta, entregar y cobrar), **Cajero** (mostrador), **Almacenista**
(opcional: inventario, compras, carga). El dueño crea roles y marca casillas en `/roles`.
✓ = concedido en la semilla.

| Permiso | Qué abre | Dueño | Admin | Repart. | Cajero | Almac. |
|---|---|---|---|---|---|---|
| `usuarios.gestionar` | usuarios, roles, permisos | ✓ | | | | |
| `auditoria.ver` | bitácora | ✓ | ✓ | | | |
| `configuracion.editar` | datos del negocio, bodega, plantillas, cajas, vehículos | ✓ | ✓ | | | |
| `catalogo.ver` | productos, categorías, marcas | ✓ | ✓ | ✓ | ✓ | ✓ |
| `catalogo.editar` | alta/edición de productos, presentaciones, imágenes | ✓ | ✓ | | | ✓ |
| `precios.editar` | listas y precios | ✓ | | | | |
| `costos.ver` | costo promedio, último costo, utilidad, valorizado, precio bajo costo | ✓ | | | | |
| `inventario.ver` | existencias, kárdex, bajo mínimo, por caducar | ✓ | ✓ | | ✓ | ✓ |
| `inventario.ajustar` | ajustes, mermas, conteos, inventario inicial | ✓ | ✓ | | | ✓ |
| `proveedores.gestionar` | proveedores | ✓ | ✓ | | | ✓ |
| `compras.ver` | listado y detalle (con costos de la compra) | ✓ | ✓ | | | ✓ |
| `compras.registrar` | registrar compra; recibe aviso `surtido_listo` | ✓ | ✓ | | | ✓ |
| `compras.cancelar` | cancelar compra | ✓ | | | | |
| `clientes.ver` | clientes, zonas | ✓ | ✓ | ✓ | ✓ | |
| `clientes.editar` | alta/edición, ubicación, zonas | ✓ | ✓ | | | |
| `clientes.credito` | lista de precio, límite, días, saldo inicial | ✓ | ✓ | | | |
| `clientes.enlace` | generar/revocar enlace de pedido | ✓ | ✓ | | | |
| `pedidos.ver` | bandeja, detalle, despacho | ✓ | ✓ | | ✓ | ✓ |
| `pedidos.capturar` | capturar pedido a nombre de un cliente | ✓ | ✓ | | ✓ | |
| `pedidos.gestionar` | confirmar, ajustar, faltantes, cancelar, reprogramar; push de pedido | ✓ | ✓ | | | |
| `avisos.enviar` | cola de avisos por WhatsApp (repartidor: solo los de sus rutas) | ✓ | ✓ | ✓ | ✓ | |
| `pedidos.cambiar_precio` | precio distinto al de lista en un pedido | ✓ | | | | |
| `surtido.ver` | lista de surtido, publicar | ✓ | ✓ | | | ✓ |
| `rutas.ver` | todas las rutas y órdenes de carga | ✓ | ✓ | | | ✓ |
| `rutas.planear` | crear, asignar, optimizar, ordenar, cargar, cancelar | ✓ | ✓ | | | |
| `rutas.operar` | su ruta: iniciar, entregar, no entregado, terminar, gastos | ✓ | ✓ | ✓ | | |
| `rutas.liquidar` | liquidación del repartidor, comprobantes | ✓ | ✓ | | | |
| `ventas.crear` | POS de mostrador; entregar pedido que recoge | ✓ | ✓ | | ✓ | |
| `ventas.ver` | ventas propias | ✓ | ✓ | ✓ | ✓ | |
| `ventas.ver_todas` | ventas de todos | ✓ | ✓ | | | |
| `ventas.cambiar_precio` | precio manual o lista distinta en POS | ✓ | | | | |
| `ventas.credito` | vender/entregar a crédito (dentro del límite) | ✓ | ✓ | ✓ | ✓ | |
| `ventas.cancelar` | cancelar venta | ✓ | | | | |
| `ventas.devolver` | devoluciones | ✓ | ✓ | ✓ | | |
| `caja.operar` | abrir/cerrar su turno de mostrador, movimientos | ✓ | ✓ | | ✓ | |
| `caja.supervisar` | turnos ajenos, reporte de cortes | ✓ | ✓ | | | |
| `cobranza.ver` | CxC, estados de cuenta, antigüedad | ✓ | ✓ | | ✓ | |
| `cobranza.abonar` | registrar abono (mostrador o en ruta) | ✓ | ✓ | ✓ | ✓ | |
| `cobranza.cancelar_abono` | cancelar abono | ✓ | | | | |
| `cobranza.verificar` | marcar transferencias vistas en el banco | ✓ | ✓ | | | |
| `reportes.ver` | reportes de ventas, compras, entregas, faltantes | ✓ | ✓ | | | |
| `envases.gestionar` | F10 | ✓ | | | | |

Supuestos de esta matriz: el administrador no ve costos ni cambia precios [P37]; quien tiene `rutas.liquidar` puede liquidar su propia ruta (con 2 personas no hay otro que lo haga); el repartidor puede dar
crédito dentro del límite y recibir devoluciones en la visita.

Chequeo real: plugin `apps/api/src/comun/permisos.ts` (preHandler global) lee `config.permiso` y lo
compara con los permisos cargados de la base para el `jti`; sin permiso → `403 SIN_PERMISO`. Los finos
los repite SQL con `fn_tiene_permiso`. El menú del panel (en navegador y en el cascarón) usa `/api/auth/yo`, solo
para ocultar.

## 6. Reportes y su fuente SQL

| Reporte | Fuente | Cálculo |
|---|---|---|
| Ventas por periodo | `v_ventas_lineas` (+ `v_ventas_pagos` para `metodo`) | `GROUP BY` la columna permitida; `num_ventas = count(distinct venta_id) filter (where signo +)`; importes netos de devoluciones; importes finales (sin impuestos separados). |
| Compras | `v_compras_lineas` | `GROUP BY` fecha/proveedor/producto/categoría. |
| Utilidad | `v_ventas_lineas` + `v_ajustes_valor` | `utilidad_bruta = Σ importe − Σ costo_total`; `margen = utilidad / importe`; `utilidad_neta = bruta + Σ valor ajustes` (mermas restan, desglosadas por causa). Sin gastos de operación (los gastos de ruta solo están en la liquidación). |
| Entregas y faltantes | `v_entregas` | Tasa de entrega = entregados / con ruta; faltantes = demanda que no se surtió. |
| Inventario valorizado | `v_inventario_valorizado` | `Σ round(cantidad · costo_promedio, 2)`; existencia actual. |
| Bajo mínimo | `v_bajo_minimo` | Solo `inventario`; `faltante = existencia_minima − cantidad`. |
| Por caducar (F2) | `v_por_caducar` | Estimado PEPS (§2.3). |
| Precio bajo costo (F2) | `v_precio_bajo_costo` | `precio < costo_promedio · factor`. |
| Cuentas por cobrar | `fn_cxc_antiguedad(p_al)`, `v_saldo_cliente` | Cubetas por días vencidos. |
| Cortes y liquidaciones | `fn_resumen_turno` por turno en rango | Fórmula de §2.8. |
| Kárdex | `movimiento_inventario` | `existencia_resultante` evita recalcular saldos. |
| Tablero (F9) | `v_ventas_lineas`, `v_saldo_cliente`, `v_bajo_minimo`, `v_por_caducar`, `v_precio_bajo_costo`, `turno_caja` | Cada KPI con el permiso de su reporte. |

El agrupador llega como palabra de una lista blanca que la API mapea a columna; nunca se interpola texto
del cliente en SQL.

## 7. Principios de UX (reglas comprobables)

Los clientes no son de tecnología y se resisten a «hacer algo tecnológico». **Facilidad de uso es el
objetivo número uno** del enlace del cliente y también del panel y la app del personal. Estas reglas son
criterios de aceptación (PLAN), no diseño visual; la UI la implementa otro agente con las skills de
frontend/UX. Si una regla choca con una decisión técnica, gana la regla y se cambia la decisión aquí.

### 7.1 Enlace del cliente (`/p/<token>`, `/pedido/*`)

| # | Regla | Cómo se comprueba | Dato/API que la sostiene |
|---|---|---|---|
| C1 | Abre directo en **su** catálogo: sin usuario, sin registro, sin instalar nada. Lo único: **una vez por navegador**, 4 números («Elige 4 números que recuerdes» la primera vez, «Escribe tus 4 números» en un navegador nuevo), con teclado numérico grande y «Olvidé mis números» (wa.me al negocio). | Del clic en el WhatsApp al catálogo: 0 toques en un navegador recordado; 4 dígitos en uno nuevo. | `/p/[token]` → cookie → `/pedido` (§4.1) |
| C2 | Primera pantalla: botón grande **«Repetir mi último pedido»** (con su total de hoy) y debajo sus productos frecuentes. | Visible sin desplazar en un teléfono de 360×640. | `ultimo_pedido`, `frecuentes` en `GET /api/publico/catalogo` |
| C3 | Pedido repetido en **≤ 3 toques**: Repetir → Enviar pedido → (listo). Sin diálogo de «¿estás seguro?»: confirmar es un toque. | Prueba manual cronometrada. | fecha de entrega por omisión = `proxima_visita`; notas opcionales y plegadas |
| C4 | Tarjeta de producto: foto, nombre, presentación en palabras («Caja de 24 latas»), precio y botones − / +; agregar es un toque en +. | Revisión. | `miniatura`, `presentacion.nombre` escrito para el cliente, `contenido_ml`, `tipo_envase` |
| C5 | Áreas tocables ≥ 48×48 px; texto base ≥ 16 px; precios y totales ≥ 18 px; contraste WCAG AA (4.5:1). | Auditoría de accesibilidad (Lighthouse a11y ≥ 95). | — |
| C6 | Cero jerga: nunca «SKU», «presentación», «factor», «folio» a secas, «estado»; se dice «caja de 24», «tu pedido #123», «va en camino». | Lista de textos revisada; todos salen de plantillas. | `app.plantilla` (`pantalla_*`, `estado_*`) |
| C7 | Carrito y total siempre visibles (barra fija abajo) en el catálogo. | Revisión. | — |
| C8 | **Nunca se pierde el carrito**: se guarda en el teléfono al cambiar algo y sobrevive cerrar el navegador o quedarse sin señal; al enviar con señal mala, reintentar no duplica. | Cerrar la pestaña y volver; cortar red al enviar. | `localStorage` por `cliente_id`; `clave_idempotencia` creada al abrir el carrito |
| C9 | Teléfonos Android baratos y 3G lenta: JS de las páginas del cliente ≤ 100 KB gzip; catálogo usable en ≤ 5 s con el perfil «Slow 3G» de Chrome; miniaturas ≤ 30 KB con carga diferida; segunda visita sin volver a bajar el catálogo. | Lighthouse móvil, rendimiento ≥ 80; medición con throttling. | Server Components + una isla para el carrito; `ETag` del catálogo; miniaturas 240 px |
| C10 | Búsqueda tolerante: sin acentos, con errores de una letra y por cómo lo piden. Casos fijos: «caguama», «tecate light» y «tecate lite», «kerona» → Corona, «six indio», «xx». | Prueba con esos casos. | `producto.alias`, campo `buscar` del catálogo, `fn_buscar_productos` en el panel |
| C11 | Seguimiento con palabras simples e ícono por etapa («Recibimos tu pedido», «Lo estamos surtiendo», «Va en camino: eres la parada 4 de 9, llega aprox. 11:30–12:30», «Entregado»). | Revisión. | `fn_seguimiento_pedido`, plantillas `estado_*` |
| C12 | Faltante = **una pregunta por línea**: «No hay Corona caja de 24. ¿Te mando Victoria caja de 24 a $410?» con **Sí** / **Otra opción** (si hay más) / **Quítalo**; se dice hasta qué hora puede contestar y qué pasa si no contesta. | Revisión con un pedido con dos faltantes. | `propuesta_opcion.orden`, `limite_en`, `faltante_accion_predeterminada` |
| C13 | Errores en lenguaje llano con salida: «Tu pedido mínimo es $500, te faltan $120», nunca un código. Enlace dado de baja o inválido → «Este link ya no está activo. Escríbenos para pedir uno nuevo» con botón de WhatsApp al negocio. | Revisión de cada 4xx de `/api/publico/*`. | `detalles` de los errores; `pantalla_enlace_invalido` |
| C14 | Pedir ubicación solo una vez, explicando para qué, y nunca bloquear el pedido por no darla. | Revisión. | `tiene_ubicacion`, `pantalla_aviso_ubicacion` |
| C15 | Su saldo de crédito a la vista en una línea («Debes $1,250 · te quedan $750 de crédito»); el detalle está en «Mi cuenta» (`/pedido/estado-cuenta`, lista simple de cargos y abonos), nunca en la primera pantalla. | Revisión. | `credito` en `GET /api/publico/cliente` |
| C16 | «Lo de siempre»: del WhatsApp al pedido confirmado en **1 toque** («Sí, mándamelo»), con «Cambiar algo» y «No, gracias» al lado; vence solo. | Prueba cronometrada. | `?ir=pedido-<id>`, `POST /api/publico/pedidos/:id/aceptar` |
| C17 | Ofertas por caducar arriba del catálogo, con precio normal tachado y «hasta el <fecha>». | Revisión. | `oferta` en `GET /api/publico/catalogo` |
| C18 | Sugerencias «en tu zona también piden»: máximo 3, debajo de los frecuentes, sin ventanas emergentes. | Revisión. | `sugerencias_zona` (F11) |
| C19 | Lealtad: una línea con el avance («Llevas 7 de 10 cajas para una gratis»), sin reglas largas. | Revisión. | `lealtad` en `GET /api/publico/cliente` (F11) |
| C20 | **Precios siempre al día**: «Repetir» y «lo de siempre» muestran el precio actual; si cambió, por línea «antes $310 → ahora $315» (resaltado) y arriba «Algunos precios cambiaron»; el total nuevo se ve antes de confirmar; lo que ya no se vende se quita con «Ya no tenemos: X». El WhatsApp nunca trae precios. Si el precio cambia entre ver y tocar «Sí», se muestra de nuevo y se vuelve a confirmar. | Cambiar un precio con un propuesto abierto y revisar. | `fn_vista_borrador`, `total_visto`, `PRECIOS_CAMBIARON` |
| C21 | **Nunca se le quita el acceso a un cliente sin que una persona lo decida** (§0). Las esperas por PIN dicen cuántos minutos faltan; un dispositivo nuevo, muchas visitas sin pedido o inactividad solo generan avisos al personal. | Pruebas de F3 + búsqueda en el código: solo `fn_revocar_enlace`, `fn_generar_enlace`, `fn_quitar_dispositivo`, `fn_restablecer_pin` y `PATCH` de cliente tocan acceso. | `cliente_pin_espera`, `fn_alertas_clientes` |

### 7.2 Personal (panel web y app)

| # | Regla | Cómo se comprueba | Dato/API que la sostiene |
|---|---|---|---|
| P1 | Despacho: tablero del día con tarjetas por pedido y **como mucho 3 acciones grandes** por tarjeta (Confirmar · Faltante · WhatsApp); lo raro va en «Más». | Revisión. | `GET /api/despacho`, `GET /api/pedidos` con `requiere_surtido` y `faltantes_pendientes` |
| P2 | Enviar un aviso = **un toque** (abre WhatsApp con el texto listo) y al volver, un toque «Enviado». Contador de pendientes siempre visible. | Revisión. | `GET /api/avisos` con `url` ya armada |
| P3 | Capturar un pedido por llamada en ≤ 1 min: buscar cliente por nombre o teléfono, «repetir último» y ajustar. | Prueba cronometrada. | `fn_frecuentes`, último pedido en `GET /api/clientes/:id` |
| P4 | Reparto con una mano en la camioneta (en el cascarón o el navegador): una parada por pantalla, acción principal abajo al alcance del pulgar, botones ≥ 56 px, Navegar en un toque, entrega completa pagada en efectivo exacto en ≤ 3 toques (Entregar → Efectivo → Listo). | Prueba en teléfono real con una mano. | `GET /api/rutas/:id` con `navegar`; `POST /api/pedidos/:id/entregar` con líneas omitidas = completo |
| P5 | Señal mala en ruta: toda acción del repartidor se puede reintentar sin duplicar y la pantalla dice claro si se guardó o no. | Cortar red y reintentar. | `clave_idempotencia` en entregar y abono; no entregado, iniciar y terminar son idempotentes por estado (repetir no falla) |
| P6 | Los mismos textos llanos que el cliente: nada de códigos de error en pantalla. | Revisión. | `mensaje` de cada error |
| P7 | Pegar un WhatsApp en «Nuevo pedido» llena el borrador en un paso; cada línea en verde (segura) o amarillo (elige entre 3 candidatos con un toque). Corregir una vez enseña al sistema para ese cliente. | Prueba con 10 mensajes reales. | `POST /api/pedidos/interpretar`, `cliente_alias` |
| P8 | Después de registrar una compra se ve en rojo todo producto con margen bajo o precio menor al costo, con un botón a `/precios` ya filtrado. | Revisión. | `GET /api/compras/:id/margenes` |
| P9 | «Mandar por WhatsApp» en cualquier pantalla abre la bandeja de avisos ya llenada (`?nuevo=<plantilla>&cliente=`); la bandeja es la única que crea avisos manuales. | Revisión (N1). | `POST /api/avisos` |

### 7.3 Flujos y navegación (regla del dueño: «flujos claros, nada de tener una herramienta en distintos módulos»)

| # | Regla | Cómo se comprueba |
|---|---|---|
| N1 | **Cada acción vive en exactamente una pantalla** de cada interfaz: el panel (uno solo, en navegador o en el cascarón) y el enlace del cliente. Las demás pantallas **enlazan** a ella (con `?volver=` para regresar), nunca la reimplementan ni la embeben. Ej.: todo cobro (entrega o abono) y su comprobante solo en `/cobrar`; gastos y movimientos de turno solo en `/caja`; editar cliente solo en `/clientes/[id]`; marcar faltante solo en `/pedidos/[id]`; entregar y cobrar una entrega solo en `/cobrar?pedido=`; cambiar precios solo en `/precios`. | Tabla «Mapa de pantallas» de `docs/PLAN.md`: cada ruta API de escritura tiene **una** pantalla dueña por aplicación; revisión de código: ningún componente llama una ruta de escritura que su pantalla no posee. |
| N2 | Menú principal = **la operación del día, en orden**: 1 Pedidos entrantes → 2 Surtir y comprar → 3 Cargar y rutas → 4 Entregar y cobrar → 5 Cierre del día. Catálogo, inventario, clientes, proveedores, usuarios, configuración y reportes van en un menú secundario **Ajustes** (y Reportes). Mostrador es un grupo aparte para quien tiene `ventas.crear`. | Revisión del menú (`lib/navegacion.ts` con `grupo`). |
| N3 | Cada paso es lineal y termina con **un botón «Siguiente: …»** que lleva al paso que sigue (ej. al confirmar el último pedido del día → «Siguiente: ver lista de surtido»; al registrar la compra → «Volver a la lista»; al cargar la ruta → «Siguiente: hoja de carga»; al terminar la ruta → «Siguiente: liquidar»). | Recorrer el día completo sin usar el menú, solo botones «Siguiente». |
| N4 | `/` («Hoy») muestra los 5 pasos con su contador de pendientes y un toque lleva al paso. No tiene acciones propias. | Revisión. |
| N5 | Bandejas globales accesibles desde cualquier pantalla (un solo lugar cada una): **Avisos por enviar** (panel lateral) y **Notificaciones** (campana → `/notificaciones`). | Revisión. |
| N6 | **Una sola interfaz del personal**: el cascarón Android no tiene pantallas de negocio; lo nativo se limita a push, enlace profundo, cámara/archivos, ubicación, pantalla encendida, abrir wa.me/mapas fuera y su propia actualización (§4.6). Ninguna pantalla se construye dos veces. | Revisión de `apps/mobile`: solo WebView + puente + «sin conexión» + «actualiza» + diálogos de actualización. |



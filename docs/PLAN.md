# ChevechevePOS — Plan por fases

Contratos: `docs/CONTRATOS.md` (manda). Supuestos abiertos: `docs/PREGUNTAS-NEGOCIO.md`.

**Revisión 2026-11-23.** El centro pasa a **pedidos de clientes por enlace personal + despacho + reparto
por rutas**. El POS de mostrador sigue, pero baja de prioridad. Precios finales, sin impuestos separados.
El único canal hacia el cliente es `wa.me` manual (cola de avisos). El push es solo para el personal.
**Una sola interfaz del personal**: el panel web, usado en navegador (PC, iPhone, PWA) y dentro del
cascarón Android `apps/mobile` (WebView + push, cámara, ubicación); el personal son 2 personas que hacen
todo y usan el Android como herramienta principal. **Facilidad de uso es el objetivo número uno** (CONTRATOS §7): cada fase con pantallas cierra con sus
reglas C/P/N comprobadas.

## Orden y paralelismo

```
F0 infra ─► F1 auth+plantillas ─► F2 catálogo+inventario+compras ─► F3 clientes+enlace+pedidos ─► F4 cascarón Android+push ─┬─► F5 surtido ──────────────────┐
                                                                                                                            └─► F6 rutas+carga+reparto ─────┴─► F7 entrega+cobro+liquidación ─► F8 POS mostrador ─► F9 reportes
F10 envases: cuando el dueño responda [P7]   ·   F11 crecimiento (lealtad, sugerencias por zona): después de F9
```

Por qué este orden (y no el sugerido tal cual):

- **Compras sube a F2** (antes iba junto con surtido): sin compras no hay existencia ni costo promedio, y
  F6 no puede cargar una ruta sin existencia (`FALTA_SURTIR`). La compra es simple; la lista de surtido
  (F5) es solo una consulta encima.
- **F5 surtido y F6 rutas en paralelo** después de F3: migraciones 006 y 007 independientes. F7 espera a
  las dos (008 usa `fn_lista_surtido` en `fn_resumen_dia`).
- **Valor desde F3**: con catálogo + enlace + bandeja de pedidos + avisos `wa.me`, el negocio ya deja de
  sumar mensajes de WhatsApp a mano aunque siga entregando con papel. F5 le da la lista de compra del
  día; F6, el orden de visita y de carga. Entre F6 y F7 los pedidos quedan `en_ruta` y se cobra en
  papel: aceptable porque son fases seguidas.
- **Cascarón + push justo después de F3 (F4)**: los 2 usuarios trabajan desde el teléfono; con el
  cascarón, todo lo que ya existe del panel funciona en el Android y el «pedido nuevo» suena desde el
  primer día del enlace. Es chico porque no tiene pantallas propias (CONTRATOS §4.6). F5 y F6 pueden
  arrancar en paralelo a F4 (no comparten archivos; 006/007 no dependen de 005).
- Desde F1 cada fase llama `fn_notificar` y deja `datos.ruta`; F4 solo agrega dispositivos, envío FCM y
  el cascarón. Pantallas de fases siguientes se prueban también dentro del cascarón (cámara, ubicación,
  wa.me y mapas abren fuera).

## Estructura y dueños de archivos

API, por módulo: `apps/api/src/modulos/<modulo>/rutas.ts`, `servicio.ts`, `esquemas.ts` (zod);
pruebas `apps/api/test/<modulo>.test.ts` y de invariantes SQL en `apps/api/test/sql/NNN_*.test.ts` (Postgres real,
solo la base `chevechevepos_pruebas`; las de la fase en curso se corren, ver `CLAUDE.md`). Brief ejecutable de
cada fase: `docs/fases/FN.md`.
Web: panel en `apps/web/src/app/(panel)/(operacion)/<ruta>/` (el grupo `(operacion)` tiene un layout que manda a
`/cambiar-contrasena` si `debe_cambiar_contrasena`; solo `cambiar-contrasena/`, `error.tsx`, `loading.tsx` y el
layout del panel viven directo en `(panel)/`), páginas del cliente en `apps/web/src/app/(publico)/`,
componentes en `apps/web/src/componentes/<modulo>/` y el kit compartido en `apps/web/src/componentes/ui/`
(botón, campo, tarjeta, tabla, diálogo, aviso de error, esqueleto, vacío, insignia, paginación). Tipos de
respuesta en `apps/web/src/lib/tipos.ts` (cada fase agrega los suyos). Cascarón: `apps/mobile/` (F4, sin pantallas de negocio).

Convenciones de la API (hechas en F1, obligatorias desde F2): cada ruta declara `config.permiso`; `zod` en el
borde con `<esquema>.parse(req.query|params|body)` (error → 400 `VALIDACION`); ids con `idEsquema`/`paramId` de
`comun/ids.ts` (string en la respuesta); toda escritura en `conUsuario(req.usuario!.id, c => …)` de
`comun/transaccion.ts` (`conCliente` para el enlace); listas con `esquemaPagina` + `count(*) over() as total` +
`listadoDeFilas` de `comun/paginacion.ts`; idempotencia con `hashSolicitud` de `comun/idempotencia.ts`;
imágenes con `guardarImagen`/`extensionPorBytes` de `comun/archivos.ts`; errores con `new AppError(CODIGO,
detalles?)` de `comun/errores.ts` (código nuevo = fila nueva en su tabla y en §4.3). Alta → `reply.code(201)`.

**Validación por fase (regla del dueño): solo lint + typecheck + pruebas** (`npm run prueba --prefix apps/api`
contra la base de pruebas). **Nada de builds** (`next build`, `docker build`, APK/EAS) hasta terminar el plan completo.

> F0 dejó `apps/api/src/modules/salud/salud-routes.ts` (inglés). F1 lo mueve a
> `apps/api/src/modulos/salud/rutas.ts` una sola vez; desde ahí todo usa `modulos/`. `modulos/index.ts` lo crea F1.

**Archivos compartidos** (dueño F1; las fases siguientes solo **agregan una línea** en cada uno):

| Archivo | Qué agrega cada fase |
|---|---|
| `apps/api/src/modulos/index.ts` | `app.register(rutas<Modulo>)` |
| `apps/api/src/tareas.ts` | `programar('<nombre>', ms, fn)` (F3: `vencer-faltantes` 60 s, `vencer-propuestos` 15 min, `alertas-clientes` diaria, `sugerir-pedidos` diaria a `sugerencia_hora`; F4: `envio-push` 15 s, con la purga diaria dentro; F5: `sembrar-fechas-demanda` cada hora; F7: ninguna) |
| `apps/web/src/lib/navegacion.ts` | entradas de menú `{ruta, titulo, permiso, grupo}` |

El resto de `apps/api/src/comun/*`, `apps/web/src/lib/*`, `apps/web/src/componentes/ui/*`, layouts y
`apps/web/src/proxy.ts` son de F1 (F3 crea `lib/api-publico.ts`, el layout de `(publico)` y su proxy; F4 crea solo
`app/api/movil/actualizaciones/[...ruta]/route.ts` (público, solo GET, en flujo); `/api/movil/push/*` pasa por
el proxy del personal, CONTRATOS §4.1). Otra fase que necesite cambiar un archivo ajeno lo pide, no lo edita.

Dentro de una fase grande se puede repartir en agentes paralelos por carpeta: **API** (migración +
`modulos/*` + pruebas, dueño de la migración), **web panel** y **web cliente**/**app**. Primero se cierra
la API contra el contrato; las UIs trabajan contra las formas de §4.4.

Cierre de cada fase: contratos usados = los de `CONTRATOS.md` (si cambió algo, se editó ahí), migración
revisada a ojo, pruebas de API escritas, lint + typecheck de `apps/api` y `apps/web` en verde (y
`apps/mobile` desde F4; pantallas con cámara/ubicación/wa.me probadas también en el cascarón), reglas UX de la fase comprobadas.

## Mapa de pantallas (una acción, una pantalla)

Regla N1–N6 de CONTRATOS §7.3. **Dueña** = la única pantalla que llama esa ruta de escritura en esa
aplicación. Las lecturas compartidas (selectores) se listan al final. Agregar una ruta o pantalla =
agregar su fila aquí en el mismo cambio. Rutas sin prefijo `/api` por brevedad.

### Panel web (`apps/web/src/app/(panel)`)

**Inicio**

| Pantalla | Responsabilidad única | Acciones propias (rutas) | Enlaza a |
|---|---|---|---|
| Layout del panel (menú, campana, usuario) | Navegar; contador de la campana; salir | `GET /auth/yo` (cada 30 s), `POST /auth/logout` (BFF) | `/notificaciones`, `/cambiar-contrasena` |
| `/` Hoy | Ver los 5 pasos del día y qué falta (contadores del paso 1, avisos y respaldo desde F3; paso 2 en F5, paso 3 en F6, pasos 4–5 en F7) | `GET /despacho` (única fuente de contadores) | cada paso |
| `/notificaciones` | Leer avisos internos; preferencias; en el cascarón: «Activar avisos» y «Esta app» (versión, novedades, «Buscar actualización» por el puente, sin ruta de API) | `GET /notificaciones`, `POST /notificaciones/leer`, `GET/PUT /notificaciones/preferencias`, `POST/DELETE /movil/push/registrar` | la entidad de cada aviso |
| Bandeja «Avisos por enviar» (panel lateral del layout) | Mandar WhatsApp; **único lugar que crea avisos manuales** (otras pantallas la abren con `?nuevo=<plantilla>&cliente=`) | `GET/POST /avisos`, `POST /avisos/:id/enviado`, `POST /avisos/:id/descartar` | `/pedidos/[id]`, `/clientes/[id]` |

**1. Pedidos entrantes**

| Pantalla | Responsabilidad única | Acciones propias | Enlaza a |
|---|---|---|---|
| `/pedidos` | Bandeja: qué pedidos hay y en qué etapa (pestañas Por confirmar · Esperando cliente · Confirmados por fecha); filtros zona/fecha/origen | `GET /pedidos` | `/pedidos/[id]`, `/pedidos/nuevo`, bandeja de avisos filtrada, Siguiente: `/surtido` (botón desde F5) |
| `/pedidos/nuevo` | Capturar un pedido por llamada | `POST /pedidos`, `POST /pedidos/interpretar` (pegar WhatsApp → borrador, F3) | `/pedidos/[id]` |
| `/pedidos/[id]` | Decidir sobre un pedido | `GET /pedidos/:id`, `POST /pedidos/:id/{confirmar,ajustar,faltantes,cancelar,reprogramar}`, `GET /pedidos/:id/sugerencias`, `POST /propuestas/:id/{responder,cancelar}` | `/clientes/[id]`, `/cobrar?pedido=` (si recoge), bandeja de avisos, Siguiente: pedido siguiente por confirmar |

**2. Surtir y comprar**

| Pantalla | Responsabilidad única | Acciones propias | Enlaza a |
|---|---|---|---|
| `/surtido` | Qué comprar para una fecha (def. mañana; ruta opcional) | `GET /surtido`, `GET /surtido/mensaje` (con `telefono_invalido`: avisa y no abre `wa.me`), `POST /surtido/publicar` (incluye compra inteligente: sugerido por demanda y promociones, F5); costos solo con `costos.ver` o `compras.registrar` | `/compras/nueva?surtido=<fecha>&proveedor_id=[&ruta_id=]`, `/surtido/promociones`, `/rutas?fecha=` (si falta comprar para una ruta), Siguiente: `/rutas` |
| `/compras/nueva` | Registrar lo que se compró; con `?surtido=<fecha>&proveedor_id=[&ruta_id=]` precarga la lista (borrador propio con llave `chv:compra-borrador:<usuario>:surtido:<fecha>:<proveedor>[:ruta:<id>]`: precargar nunca pisa el borrador normal ni otro) | `POST /compras` | Volver: `/surtido`; al guardar: `/compras/[id]` (margen) |
| `/compras` · `/compras/[id]` | Historial (`?proveedor_id=&estado=&desde=&hasta=`) y cancelar compra | `GET /compras`, `GET /compras/:id`, `POST /compras/:id/cancelar`, `GET /compras/:id/margenes` (tabla de margen tras registrar) | `/proveedores`, `/precios?producto_ids=&volver=/compras/<id>` (corregir precios); con `COMPRA_CON_SALIDAS`: `/inventario/ajustes?modo=costo&producto_id=&volver=/compras/<id>` |
| `/surtido/promociones` | Promociones del distribuidor (F5; solo cuentan las del proveedor habitual del producto) | `GET/POST /promociones`, `PATCH/DELETE /promociones/:id` | Volver: `/surtido` |

**3. Cargar y rutas**

| Pantalla | Responsabilidad única | Acciones propias | Enlaza a |
|---|---|---|---|
| `/rutas` | Rutas de una fecha (`?fecha=`, def. hoy); crear ruta aquí mismo | `GET /rutas`, `POST /rutas`, `GET /rutas/repartidores` (selector) | `/rutas/[id]`; F7: «Liquidar» en rutas `terminada` → `/cierre/ruta/[id]` |
| `/rutas/[id]` | Armar una ruta: candidatos por zona, paradas con ↑/↓, Optimizar (km antes → después), avisos de sin ubicación y capacidad (`cajas_totales` aproximadas), Cargar | `GET /rutas/:id`, `GET /rutas/:id/candidatos`, `POST /rutas/:id/{pedidos,optimizar,cargar,cancelar}`, `DELETE /rutas/paradas/:id`, `PUT /rutas/:id/orden`; F7: `POST /rutas/:id/cobros` y `GET /rutas/:id/sugerencias-cobro` («Pasar a cobrar»: clientes con saldo vencido de esas zonas) | `/pedidos/[id]`, `/surtido?fecha=` (si `FALTA_SURTIR`), Siguiente: `/rutas/[id]/carga` |
| `/rutas/[id]/carga` | Hoja de carga LIFO imprimible (80 mm y carta; «Sube primero» = `carga_n 1`; totales por producto y cajas) | `GET /rutas/:id/carga` | Siguiente: `/rutas` |

**4. Entregar y cobrar**

| Pantalla | Responsabilidad única | Acciones propias | Enlaza a |
|---|---|---|---|
| `/reparto` (repartidor) | Su ruta de hoy: iniciar (F7: con fondo opcional), una parada por pantalla, No entregado con motivos de un toque (`motivos_no_entregado` de plantillas + «Otro» con nota), terminar con la lista de pendientes; pantalla encendida en el cascarón (lee `GET /rutas?fecha=hoy` propio y `GET /rutas/:id`) | `POST /rutas/:id/iniciar`, `POST /rutas/paradas/:id/no-entregado`, `POST /rutas/:id/terminar` | Google Maps/Waze, `tel:`, bandeja de avisos (solo los de reparto de sus rutas abiertas, F6); desde F7: `/cobrar?pedido=&volver=/reparto` (entregar), `/cobrar?cliente=&parada=&volver=/reparto` (abono o parada de cobro), `/caja?volver=/reparto` (gasto); al terminar, Siguiente: `/cierre/ruta/[id]` si tiene `rutas.liquidar` |
| `/cobrar` | **Único lugar donde entra dinero de un cliente**: `?pedido=` entrega y cobra un pedido (reparto o recoge; paso 1 cantidades, paso 2 pago: efectivo con cambio, transferencia con referencia y foto, fiado con disponible y semáforo, mixto); `?cliente=[&parada=]` registra un abono (FIFO o a cuentas elegidas). Captura el comprobante de transferencia y la prueba de entrega opcional (recibió + foto). Lee `GET /pedidos/:id`, `GET /clientes/:id` (saldo, semáforo), `GET /turnos/actual` | `POST /pedidos/:id/entregar`, `POST /abonos`, `POST /comprobantes` | Volver: `?volver=` (`/reparto`, `/pedidos`, `/cobranza`, `/clientes/[id]`); tras entregar, «Mandar nota» (aviso `wa_nota_entrega` ya creado, un toque) y, si debe, «Cobrar saldo anterior» → `/cobrar?cliente=`; «Mandar datos de transferencia» abre la bandeja con `?nuevo=wa_datos_transferencia&cliente=` (solo con `pedidos.ver`); sin turno → `/caja` |
| `/cobranza` | Quién debe y cuánto (filtros zona, vencidas; semáforo por fila); abonos recientes y cancelar abono (solo `cobranza.cancelar_abono`) | `GET /cuentas-por-cobrar`, `GET /abonos`, `POST /abonos/:id/cancelar` | `/cobrar?cliente=&volver=/cobranza`, `/clientes/[id]`, bandeja con `?nuevo=wa_recordatorio_saldo&cliente=` |

**5. Cierre del día**

| Pantalla | Responsabilidad única | Acciones propias | Enlaza a |
|---|---|---|---|
| `/cierre` | Lista de lo que falta cerrar (rutas terminadas por liquidar, turnos de mostrador abiertos, transferencias por verificar, avisos) y resumen del día | (lee `GET /despacho`), `GET /cierre/resumen` (resumen del día; «Mandar al dueño» abre la bandeja con `?nuevo=wa_resumen_dia`) | `/cierre/ruta/[id]`, `/cierre/transferencias`, `/caja` (cerrar mostrador), `/ventas` |
| `/cierre/ruta/[id]` | Liquidar al repartidor: esperado (fórmula de §2.8) vs contado, ventas por método, abonos, gastos, transferencias con foto, producto que regresa (cargado − entregado) | `GET /rutas/:id/liquidacion`, `POST /rutas/:id/liquidar`, `GET /comprobantes/:archivo` | `/cierre/transferencias`, Siguiente: `/cierre` |
| `/cierre/transferencias` | Verificar transferencias en el banco | `GET /transferencias`, `POST /transferencias/verificar` | — |
| `/ventas` · `/ventas/[id]` | Revisar ventas; cancelar (solo `ventas.cancelar`, el dueño [P21]) o devolver (F7); reimprimir ticket 80 mm (F8) | `GET /ventas`, `GET /ventas/:id`, `GET /ventas/:id/ticket`, `POST /ventas/:id/{cancelar,devoluciones}` | `/pedidos/[id]`, `/clientes/[id]` |

**Mostrador** (grupo aparte)

| Pantalla | Responsabilidad única | Acciones propias | Enlaza a |
|---|---|---|---|
| `/pos` | Vender en mostrador (F8): escáner y buscador tolerante, mosaicos por categoría, cliente con su lista (mayoreo) y crédito, pagos mixtos, cambio, ticket 80 mm; varias ventas en espera (en el navegador, por caja y usuario) | `POST /ventas` (lee `GET /catalogo-venta`, `GET /presentaciones/codigo/:codigo`, `GET /clientes?buscar`, `GET /turnos/actual`) | `/caja` si no hay turno, `/ventas/[id]` (última venta) |
| `/caja` | Mi turno (mostrador o ruta): abrir mostrador, **movimientos y gastos** (único dueño), resumen, cerrar mostrador con corte esperado vs contado (F7); turnos ajenos y corte supervisado `?turno=` con `caja.supervisar`, hoja de corte 80 mm (F8) | `GET /cajas`, `GET/POST /turnos`, `GET /turnos/actual`, `POST /turnos/:id/movimientos`, `GET /turnos/:id/resumen`, `POST /turnos/:id/cerrar` | `/pos`, Volver: `?volver=` (`/reparto`) |

**Ajustes** (secundario)

| Pantalla | Responsabilidad única | Acciones propias | Enlaza a |
|---|---|---|---|
| `/clientes` · `/clientes/nuevo` | Buscar y dar de alta clientes; marcas amarillas (visitas sin pedido, inactivo, dispositivo nuevo; la notificación de la alerta abre `?alerta=`); estado del link (Activo / Sin activar / Dado de baja con fecha, motivo y quién / Sin link) y filtro; **dar de baja links** (uno o varios seleccionados, con motivo y confirmación; cada fila con alerta tiene «Dar de baja link» de un toque que abre esa confirmación; nunca automático, C21) | `GET /clientes`, `POST /clientes`, `POST /clientes/enlaces/revocar` | `/clientes/[id]` |
| `/clientes/[id]` | Todo lo del cliente salvo cobrar; semáforo de fiado y límite sugerido (F7); estado de cuenta imprimible 80 mm; «lo de siempre» sí/no; enlace: dispositivos, restablecer PIN, generar (tras primera compra o forzado) | `GET/PATCH /clientes/:id`, `PUT /clientes/:id/ubicacion`, `POST /clientes/:id/ubicacion/aceptar`, `POST /clientes/:id/enlace`, `POST /clientes/:id/saldo-inicial`, `GET /clientes/:id/estado-cuenta`, `GET /clientes/:id/dispositivos`, `DELETE /clientes/:id/dispositivos/:id`, `POST /clientes/:id/pin/restablecer` | `/cobrar?cliente=`, `/pedidos/nuevo?cliente_id`, bandeja con `?nuevo=wa_estado_cuenta|wa_recordatorio_saldo|wa_enlace_cliente&cliente=`, «Dar de baja link» → `/clientes?revocar=<id>` (abre la confirmación ya seleccionada; la acción es de `/clientes`) |
| `/productos` · `/productos/nuevo` · `/productos/[id]` | Producto, presentaciones, foto, alias, equivalentes (F3; precios solo se ven) | `GET/POST /productos`, `GET/PATCH /productos/:id`, `PUT/DELETE /productos/:id/imagen`, `POST /productos/:id/presentaciones`, `PATCH /presentaciones/:id`, `GET/PUT /productos/:id/equivalentes` (F3) | `/precios?producto_ids=<id>&volver=/productos/<id>`, `/inventario?producto_id=` |
| `/precios` | Cambiar precios; ofertas (por caducar / promoción); margen y precio sugerido. Parámetros: `?producto_ids=` (filtra), `?oferta=<presentacion_id>` (abre el alta de oferta `por_caducar`), `?volver=` (solo rutas internas) | `GET/POST /listas-precio`, `PATCH /listas-precio/:id`, `PUT /precios`, `GET /precios/bajo-costo`, `GET /precios/sugeridos`, `GET/POST /ofertas`, `PATCH/DELETE /ofertas/:id` | `/productos/[id]`, Volver: `?volver=` |
| `/inventario` | Existencias, kárdex (`?producto_id=`), por caducar (solo lectura) | `GET /inventario/existencias`, `GET /inventario/movimientos`, `GET /inventario/por-caducar` | `/inventario/ajustes`, `/precios?oferta=<presentacion>&producto_ids=&volver=/inventario` (poner oferta a lo que caduca) |
| `/inventario/ajustes` | Ajuste, merma, conteo, inventario inicial y **«Corregir costo»** (revaluación; solo con `precios.editar` + `costos.ver`). `?modo=costo&producto_id=` abre «Corregir costo» con el producto puesto; `?volver=` (solo rutas internas) | `POST /inventario/ajustes`, `POST /inventario/conteos`, `POST /inventario/revaluaciones` | `/inventario` o `?volver=` |
| `/proveedores` | Proveedores | `GET/POST /proveedores`, `PATCH /proveedores/:id` | `/compras?proveedor_id=<id>` |
| `/catalogos` | Categorías y marcas (con margen objetivo por categoría) | `GET/POST /categorias`, `PATCH /categorias/:id`, `GET/POST /marcas`, `PATCH /marcas/:id` | — |
| `/configuracion` | Negocio, bodega, reglas, zonas, vehículos, cajas, calendario de demanda, lealtad (F11), respaldos (última prueba) | `GET/PATCH /configuracion`, `GET/POST /zonas`, `PATCH /zonas/:id`, `GET/POST /vehiculos`, `PATCH /vehiculos/:id`, `POST /cajas`, `PATCH /cajas/:id`, `GET/PUT /fechas-demanda` | `/configuracion/plantillas` |
| `/configuracion/plantillas` | Textos de WhatsApp, push y pantallas: lista por canal, editar con vista previa (solo `{{variables}}` de su lista) | `GET /plantillas`, `PATCH /plantillas/:clave`, `POST /plantillas/:clave/vista-previa` | Volver: `/configuracion` |
| `/usuarios` · `/roles` | Personal y permisos | `GET/POST /usuarios`, `PATCH /usuarios/:id`, `POST /usuarios/:id/{contrasena,cerrar-sesiones}`, `GET /roles`, `GET /permisos`, `POST /roles`, `PATCH/DELETE /roles/:id` | — |
| `/auditoria` | Bitácora: filtros tabla, usuario, registro y fechas; cada fila con quién (`usuario_nombre`) y antes/después | `GET /auditoria` | — |
| `/reportes` · `/reportes/*` | KPIs de dinero e inventario (portada, F9) y cada reporte (ventas, compras, utilidad, entregas, faltantes, inventario valorizado, bajo mínimo, cuentas por cobrar, cortes, ganancia por cliente/zona/ruta); CSV en el navegador; cada uno con su permiso | `GET /tablero`, `GET /reportes/*` | `/inventario` (por caducar), `/precios` (bajo costo), `/cobranza` |
| `/login` | Entrar (fuera del panel; errores llanos, «Espera N minutos» si está bloqueado) | `POST /auth/login` (BFF) | `/` |
| `/cambiar-contrasena` | Cambiar la propia contraseña; única pantalla abierta con `debe_cambiar_contrasena` (fuera de `(operacion)`) | `POST /auth/contrasena` (400 `CONTRASENA_INCORRECTA` si la actual está mal) | `/` |

### Enlace del cliente (`apps/web/src/app/(publico)`)

| Pantalla | Responsabilidad única | Acciones propias | Enlaza a |
|---|---|---|---|
| `/p/[token]` (route handler) | Canjear el token por la cookie; `?ir=pedido-<id>|estado-cuenta` lleva directo ahí | `GET /publico/cliente` | `/pedido` o `/pedido/invalido` |
| `/pedido/pin` | Elegir o escribir los 4 números en un navegador nuevo (funciona sin JS) | `POST /publico/pin/elegir`, `POST /publico/pin/entrar` (vía BFF); lee `GET /publico/negocio` | `/pedido`; «Olvidé mis números» → wa.me al negocio |
| `/pedido` | Elegir productos (repetir, frecuentes, buscar, favoritos); ofertas arriba; banner «¿Te mando lo de siempre?» si hay propuesto; sugerencias de zona (F11) | `GET /publico/cliente`, `GET /publico/catalogo`, `PUT/DELETE /publico/favoritos/:id` | barra de carrito → `/pedido/carrito` |
| `/pedido/carrito` | Revisar y enviar (o guardar la edición de un pedido «recibido») | `POST /publico/pedidos`, `PATCH /publico/pedidos/:id` | `/pedido/enviado/[id]` |
| `/pedido/enviado/[id]` | Confirmación | — | `/pedido/mis-pedidos/[id]`, wa.me al negocio |
| `/pedido/mis-pedidos` | Mis pedidos y mi saldo | `GET /publico/pedidos` | `/pedido/mis-pedidos/[id]` |
| `/pedido/mis-pedidos/[id]` | Seguimiento; contestar faltantes; cancelar; aceptar «lo de siempre» | `GET /publico/pedidos/:id`, `POST /publico/propuestas/:id/responder`, `POST /publico/pedidos/:id/cancelar`, `POST /publico/pedidos/:id/aceptar` | «Cambiar» y «Repetir» → `/pedido/carrito` precargado |
| `/pedido/estado-cuenta` | Mi cuenta: cargos, abonos y saldo (F7) | `GET /publico/estado-cuenta` | `/pedido/mis-pedidos` |
| `/pedido/ubicacion` | Compartir ubicación | `POST /publico/ubicacion` | Volver |
| `/pedido/invalido` | Enlace no válido (mismo texto para dado de baja o desconocido) | lee `GET /publico/negocio` | wa.me al negocio |

### Cascarón Android (`apps/mobile`, F4) — solo piezas nativas

No hay tabla de pantallas: el cascarón muestra **las mismas pantallas del panel** de arriba (N1, N6). Lo
único nativo, cada pieza con un solo dueño:

| Pieza nativa | Responsabilidad | Ruta / contrato | La usa (pantalla del panel) |
|---|---|---|---|
| WebView + lista de orígenes | Mostrar el panel; abrir wa.me, mapas, Waze y `tel:` fuera | CONTRATOS §4.6 | todas |
| Push FCM | Pedir permiso, obtener token, recibir avisos | puente `pedir_push`/`push_token`; `/notificaciones` llama `POST/DELETE /movil/push/registrar` (cerrar sesión no la llama: el disparador de sesión revoca el dispositivo) | `/notificaciones` |
| Enlace profundo | Al tocar un push, abrir `datos.ruta` | §4.6 | la pantalla de `datos.ruta` |
| Cámara / archivos | Selector con cámara para `<input capture>` | permiso del WebView | `/cobrar`, `/productos/[id]`, `/compras/nueva` |
| Ubicación | `navigator.geolocation` dentro del WebView | `geolocationEnabled` | `/clientes/[id]` («guardar ubicación aquí») |
| Pantalla encendida | Mientras hay ruta en curso | puente `pantalla_encendida` | `/reparto` |
| Sin conexión | Pantalla nativa con «Reintentar» | — | — |
| Actualizaciones (OTA + APK) | Bajar y aplicar la OTA sin reiniciar sobre trabajo sin guardar; diálogo «Hay una versión nueva» / pantalla «Actualiza la app para seguir» | `GET /movil/actualizaciones/{manifiesto,recursos/:hash,apk,apk/:archivo}` (§4.6.1); puente `sin_guardar`, `buscar_actualizacion`, `estado_app` | `/notificaciones` («Esta app») |

### Lecturas compartidas (selectores; no son acciones)

`GET /auth/yo` (layout), `GET /configuracion` (layout), `GET /catalogo-venta` (selector de productos en
`/pedidos/nuevo`, `/pedidos/[id]` y `/pos`), `GET /clientes?buscar` (selector de cliente),
`GET /productos?buscar` (selector en `/compras/nueva` y `/inventario/ajustes`), `GET /presentaciones/codigo/:codigo`
(escáner en `/pos`, `/compras/nueva` y `/pedidos/nuevo`), `GET /proveedores`,
`GET /listas-precio`, `GET /zonas`, `GET /vehiculos`, `GET /categorias`, `GET /marcas`, `GET /imagenes/:archivo`;
en el enlace del cliente, `GET /publico/negocio` (pública: nombre, WhatsApp y textos de `/pedido/pin` y `/pedido/invalido`).

## F0 — Infra (andamiaje hecho)

Hecho: compose dev/prod, `apps/api` Fastify con `/health` y `/ready`, config, helper `pg`, migrador (aplica
cualquier archivo no registrado aunque haya uno mayor ya aplicado: F5/F6 en paralelo), `000_base.sql`,
esqueleto Next. **Lo que F0 no alcanzó pasa a F1** (`docs/fases/F1.md`, paquete A): volumen
`archivos`, `SECRETO_ENLACES`/`FCM_CUENTA_SERVICIO`, servicio `respaldo` (CONTRATOS §3.2) y `/health` con
`respaldo`.

**Compuerta antes de producción** (antes de publicar el enlace a clientes, F3): un respaldo real copiado
fuera del servidor y una **prueba de restauración** hecha y anotada (CONTRATOS §3.2).

## F1 — Auth, usuarios, roles, configuración, plantillas, notificaciones

Brief ejecutable por paquetes (archivos, orden, pruebas, comandos): `docs/fases/F1.md`.
**Estado: implementada y en `main`** (`dac9d30`). Lo que la implementación fijó está en `docs/fases/F1.md`
(«Hechos de la implementación»).

- **Alinear el andamiaje con CONTRATOS §3.1 y §4.1** (primer paso de F1):
  - En `.env.example`, `env.ts`, los dos compose y `README.md`: quitar `SESSION_SECRET`,
    `SESSION_MAX_AGE` y `JWT_EXPIRES_IN`; agregar `SESION_WEB_HORAS`, `SESION_APP_DIAS`,
    `SECRETO_ENLACES`, `FCM_CUENTA_SERVICIO`, `ARCHIVOS_DIR`, `COOKIE_SECURE` y el volumen `archivos`.
  - Borrar `src/lib/sesion.ts` y la cookie `chv_sesion`.
  - Renombrar `middleware.ts` a `proxy.ts`.
  - Mover `src/db/errores.ts` a `src/comun/errores.ts`, con la tabla de §4.3 y la respuesta `{error:{…}}`.

- Migración `001_auth.sql` (con `plantilla`, `notificacion`, `notificacion_preferencia`, `fn_notificar`,
  `fn_render_plantilla`, sucursal con lat/lng, `sesion.origen`). Script `apps/api/scripts/crear-dueno.mjs`.
- API: `comun/{permisos.ts (modos: código, 'sesion', 'cliente', 'publica'; reglas onRoute de §4.1),
  errores.ts, transaccion.ts (conUsuario / conCliente), idempotencia.ts, paginacion.ts, archivos.ts
  (firma de bytes, hash, volumen)}`, `tareas.ts`; módulos `auth`, `usuarios`, `roles`,
  `configuracion`, `plantillas`, `notificaciones` (bandeja, leer, preferencias), `auditoria` (`tablero` llega en F9).
- Web: `app/api/auth/{login,logout}/route.ts`, `app/api/[...ruta]/route.ts` (solo cookie; nunca
  a `/api/publico/*`), `lib/{api-servidor.ts, api-cliente.ts, navegacion.ts, dinero.ts}`, `proxy.ts` (el `middleware.ts` de F0
  renombrado, Next 16),
  `app/(panel)/layout.tsx` (menú por permisos, campana con contador), `componentes/ui/*`.
- Pantallas: `/login`, `/cambiar-contrasena`, `/` Hoy, `/usuarios`, `/roles`, `/configuracion`
  (negocio, bodega con coordenadas, pedido mínimo, hora de corte, faltantes: minutos y acción
  predeterminada, reparto: minutos por parada y velocidad), `/configuracion/plantillas` (editar con
  vista previa), `/notificaciones`, `/auditoria`; layout con menú por pasos del día + Ajustes (N2) y la
  campana. `/` Hoy se llena conforme llegan las fases.
- **Salida**: dueño entra; `chv_jwt` httpOnly y el token no aparece en ninguna respuesta al navegador;
  cajero → `403 SIN_PERMISO` en `/api/usuarios`; ruta sin `config.permiso` o `'cliente'` fuera de
  `/api/publico/` impide arrancar; desactivar usuario → `401 SESION_CERRADA`; último dueño protegido; 5
  fallos bloquean 15 min; `fn_notificar` dos veces con la misma clave inserta una vez; editar una plantilla
  queda en auditoría; ningún texto al usuario final hardcodeado (búsqueda en el código). **UX**: N2, N4, N5
  (campana) y P6 en las pantallas de F1.

## F2 — Catálogo, inventario, proveedores, compras

Brief ejecutable por paquetes (archivos, orden, pruebas, comandos): `docs/fases/F2.md`.
**Estado: implementada y en `main`** (`edca44f`). Lo que la implementación fijó está en `docs/fases/F2.md`
(«Hechos de la implementación») y ya en CONTRATOS.

- Migraciones `002_catalogo_inventario.sql`, `003_compras.sql`.
- API: módulos `categorias`, `marcas`, `productos` (presentaciones, imagen + miniatura, alias,
  `fn_buscar_productos`, `presentaciones/codigo/:codigo`; `catalogo-venta` pasa a F3), `precios` (listas, ofertas) (con advertencias bajo costo), `inventario` (por
  caducar), `proveedores`, `compras`, `imagenes` (pública).
- Web: `app/img/[archivo]/route.ts` (caché inmutable).
- Pantallas: `/productos`, `/productos/nuevo`, `/productos/[id]` (presentaciones con nombre para el
  cliente, foto, alias, modo de surtido, proveedor habitual; precios y kárdex solo de lectura, enlazan a `/precios` e
  `/inventario`), `/precios` (matriz;
  celdas bajo costo marcadas; listas de precio), `/catalogos` (categorías con orden, marcas),
  `/inventario` (existencias, kárdex y por caducar), `/inventario/ajustes` (merma con causa; «Corregir costo»),
  `/proveedores`, `/compras`, `/compras/nueva` (escáner, caducidad opcional
  por línea, borrador local, clave al abrir), `/compras/[id]`.
- **Lote (CONTRATOS §2.12 A1, A8)**: margen objetivo en producto/categoría/config; `/compras/[id]` muestra
  la tabla de margen (costo anterior → nuevo, precio, margen, rojo si bajo objetivo o bajo costo) con botón a
  `/precios` filtrado; `/precios` con precio sugerido (redondeo configurable) y «Aplicar» que el dueño
  confirma; ofertas con vigencia en `/precios`. **Salida extra**: compra que sube el costo deja en rojo las
  presentaciones bajo objetivo y el sugerido coincide con `ceil(costo/(1−m)/paso)·paso` a mano; oferta
  vigente cambia `fn_precio` solo entre `desde` y `hasta`.
- **Salida**: «Corona lata» con Pieza/Six/Caja de 24 y precios en dos listas; dos presentaciones de 24
  (caja y charola) conviven; compra de 10 cajas a $300 sobre 0 deja 240 a 12.5; segunda compra recalcula
  el promedio (números exactos); misma clave → 200 misma compra, otro cuerpo → 409; cancelar sin existencia
  → 409; merma sin causa → 400; `v_por_caducar` con dos compras da las piezas estimadas a mano; precio por
  debajo de costo se guarda y devuelve advertencia (sin `costos.ver`, sin advertencia ni costo);
  `UPDATE app.existencia` directo falla; búsqueda: «caguama», «tecate lite», «kerona», «xx» encuentran lo
  esperado; imagen con extensión falsa → `IMAGEN_NO_VALIDA`. **UX**: P6, P8, N1–N3.

## F3 — Clientes, enlace personal, pedidos, faltantes, avisos, despacho

Brief ejecutable por paquetes (archivos, orden, pruebas, comandos): `docs/fases/F3.md` (incluye el script
de Eleventa como paquete E). **Estado: implementada y en `main`** (`53d496a`, 457 pruebas, dos corridas
seguidas en verde). Lo que la implementación fijó está en `docs/fases/F3.md` («Hechos de la implementación»)
y ya en CONTRATOS. Pendiente del dueño: prueba manual de F3 y la importación real de Eleventa.

El corazón. Tres agentes en paralelo tras fijar la migración: API, panel, páginas del cliente.

- Migración `004_clientes_pedidos.sql`.
- API: módulos `zonas`, `clientes` (ubicación por texto pegado/coordenadas, aceptar propuesta, enlace con
  token cifrado, equivalentes en `productos`; `GET /catalogo-venta` en `productos`, movido de F2), `pedidos` (captura, confirmar, ajustar, faltantes,
  sugerencias, propuestas, cancelar, reprogramar), `avisos`, `despacho`, `publico` (cliente, catálogo con
  frecuentes y `ETag`, favoritos, pedidos, seguimiento, responder faltante, ubicación; límites de
  `@fastify/rate-limit`); tarea `vencer-faltantes`.
- Web cliente (`app/(publico)/`, mobile-first, Server Components + una isla de carrito):
  - `app/p/[token]/route.ts` (canje del token → cookie `chv_cliente` → `/pedido` o `/pedido/pin`),
    `app/api/publico/pin/{elegir,entrar}/route.ts` (ponen `chv_dispositivo`),
    `app/api/publico/[...ruta]/route.ts`, `lib/api-publico.ts`.
  - `/pedido` (inicio: «Repetir mi último pedido», frecuentes, buscador tolerante, categorías, barra de
    carrito), `/pedido/carrito` (cantidades, notas plegadas, entrega por omisión = próxima visita, Enviar),
    `/pedido/enviado/[id]` (confirmación, botón opcional «Avisar por WhatsApp» al negocio),
    `/pedido/mis-pedidos` (en curso primero, saldo arriba), `/pedido/mis-pedidos/[id]` (seguimiento con
    línea de tiempo, preguntas de faltantes, editar/cancelar mientras se pueda, repetir),
    `/pedido/ubicacion` (una vez, con explicación), `/pedido/invalido`.
- Panel: `/clientes`, `/clientes/nuevo`, `/clientes/[id]` (datos, días de visita, zona, ubicación:
  pegar enlace de Google Maps o aceptar propuesta; enlace: generar/reenviar por aviso; frecuentes),
  zonas en `/configuracion`, `/pedidos` (bandeja con pestañas por etapa), `/pedidos/nuevo` (captura por llamada: buscar cliente por
  nombre/teléfono, «repetir último», pegar el texto del WhatsApp en notas), `/pedidos/[id]` (detalle,
  historial, confirmar con fecha, marcar faltante con sugerencias de equivalentes, responder por el
  cliente, ajustar, cancelar), `/` Hoy (pasos con contadores), bandeja lateral «Avisos por enviar»
  (en el layout, contador), sección «Equivalentes» de `/productos/[id]` (componente de F3 montado con una
  línea).
- **Lote (§2.12 B5, B6, A8)**: «¿Te mando lo de siempre?» (cadencia, canasta, tareas `sugerir-pedidos` y
  `vencer-propuestos`, aviso `wa_lo_de_siempre`, aceptar en 1 toque); «Pegar mensaje de WhatsApp» dentro
  de `/pedidos/nuevo` (intérprete por reglas + `cliente_alias`); ofertas arriba en el enlace. **Salida
  extra**: cliente con 4 pedidos cada ~7 días y 9 sin pedir recibe propuesta y aviso; aceptar la pasa a
  `recibido`; a las 24 h sin respuesta queda cancelada; opt-out la evita; el aviso no trae precios; subir un precio con el propuesto abierto muestra «antes → ahora»
  y aceptar con el total viejo da `PRECIOS_CAMBIARON` sin guardar nada; un producto desactivado sale del
  borrador con «Ya no tenemos»; lo mismo en «Repetir mi último pedido» (C20). Con 10 mensajes reales el
  intérprete deja ≥ 80 % de líneas en verde y corregir una línea la deja en verde la siguiente vez.
- **Enlace ligado al cliente (§3, §2.4)**: PIN de 4 dígitos por navegador, dispositivos recordados,
  espera de 15 min tras 5 fallos, «Olvidé mis números», restablecer y quitar dispositivo en `/clientes/[id]`,
  alertas de dispositivo nuevo, visitas sin pedido e inactividad (tarea diaria `alertas-clientes`),
  enlace solo tras la primera compra (configurable, con «forzar»). **Pruebas obligatorias de salida**:
  borrar cookies → pide PIN → entra; mismo enlace en navegador interno de WhatsApp, Chrome y Safari (cada
  uno pide PIN una vez y luego entra directo); 5 PIN malos → «espera 15 min» y después entra con el
  correcto; olvidó PIN → el personal restablece → elige uno nuevo y entra; segundo dispositivo → alerta
  push + bandeja y el cliente **no** queda bloqueado; 6 aperturas en 14 días sin pedido → marca amarilla
  y aviso, acceso intacto; prueba + búsqueda en el código: **ningún camino deja inactivo el enlace, quita
  un dispositivo o desactiva un cliente salvo las acciones explícitas del personal** (C21). Dar de baja 3 links filtrados por «visitas sin pedido» pide motivo y confirmación,
  los tres abren «Este link ya no está activo» y generar uno nuevo da un enlace distinto (el viejo no vuelve). Un cliente
  con 30 días sin pedir genera la alerta, su link sigue activo, y desde la alerta (`/clientes?alerta=inactivo`)
  «Dar de baja link» es un toque + confirmación.
- **Salida (negocio)**: enlace generado → el texto del aviso lo trae y abre el catálogo con la lista del
  cliente; regenerar → el anterior da `401 ENLACE_INVALIDO` y la página muestra cómo pedir otro; 10 tokens
  falsos desde una IP → 429; con el token de A, `GET /api/publico/pedidos/<id de B>` → 404; la base no
  guarda el token en claro; pedido bajo el mínimo → 409 con faltante en `detalles`; misma clave → mismo
  pedido; el cliente edita en `recibido` y despacho confirmando con la versión vieja recibe
  `PEDIDO_CAMBIO`; faltante con sustituto aceptado deja la línea original en 0, la nueva con su precio y el
  total correcto (calculado en SQL); faltante sin respuesta al vencer aplica la acción configurada y nunca
  acepta un sustituto; al responder el último faltante el pedido vuelve a `confirmado`; cada evento de
  §2.4 crea su aviso y uno nuevo descarta el pendiente anterior del mismo pedido; `pedido_nuevo` llega a
  la bandeja de quien tiene `pedidos.gestionar`.
- **Salida (UX)**: C1–C14, C16, C17, C20, C21, P1–P3, P6, P7, P9 y N1–N5 de CONTRATOS §7 comprobadas (ninguna ruta de escritura llamada
  fuera de su pantalla dueña del Mapa de pantallas) (Lighthouse móvil, Slow 3G, prueba de
  3 toques, búsqueda con los casos fijos, carrito que sobrevive cerrar la pestaña).

## Importar desde Eleventa (durante F3, antes de que el enlace salga a producción)

Hoy usan Eleventa (versión vieja) [R11, P46–P48]. No es pantalla: script
`apps/api/scripts/importar-eleventa.mjs` (dueño: agente de F3; necesita las migraciones 002–004).

- Entrada: los Excel/CSV que exporta Eleventa (Productos, Clientes, Inventario). Plan B: **copia** del
  `.fdb` leída en solo lectura (Firebird); el archivo original de Eleventa nunca se abre ni se toca.
- Mapeo: código de barras → `presentacion.codigo_barras` (presentación «Pieza», factor 1; cajas y six se
  agregan después a mano o con una columna de factor si la exportación la trae); descripción →
  `producto.nombre`; departamento → `categoria`; precio de venta → lista Menudeo; precio de mayoreo →
  lista Mayoreo; mínimo → `existencia_minima`; costo + existencia → `inventario_inicial`; cliente
  (nombre, teléfono a `telefono_whatsapp` normalizado a 52 + 10 dígitos, dirección, `ya_compro = true`); saldo → saldo inicial de
  fiado (`fn_saldo_inicial`, requiere 008).
- Por partes (`--parte catalogo|clientes|existencias|saldos`) y con `--simulacro` (corre todo y hace
  `ROLLBACK`): reporte de rechazados (sin nombre, precio vacío, código repetido, teléfono inválido; el teléfono
  inválido **no** rechaza: el cliente entra sin teléfono y va al reporte) y duplicados. Otras banderas:
  `--corte` (obligatoria para `existencias` y `saldos`: confirma que es el día del cambio), `--mapeo <json>`
  (ajusta nombres de columnas al archivo real) y `--reporte <json>` (guarda el reporte; teléfonos
  enmascarados). Hecho en F3: `apps/api/scripts/importar-eleventa.mjs` + `scripts/eleventa/{leer,mapeo}.mjs`;
  pruebas en `apps/api/test/eleventa/` (`unit/{leer,mapeo}.test.ts` sin base, `importar.test.ts` contra la
  base de pruebas, fixtures en `test/eleventa/fixtures/`). `saldos` sale con código 2 hasta F7. Idempotente:
  llave = código de barras (productos) o nombre normalizado + teléfono (clientes); volver a correr
  actualiza, no duplica. `existencias` y `saldos` se corren **una sola vez, el día del cambio** (antes
  cambian a diario en Eleventa).
- **Salida**: el dueño valida conteos (productos, clientes, suma de saldos) contra Eleventa, una muestra
  de 20 productos (nombre, código, precios, existencia) y **todos** los saldos uno por uno.

### Paridad y transición

- **Paridad** (antes de dejar Eleventa debe existir y estar probado): ticket impreso (F8), corte de caja
  (F8), lector de código de barras en mostrador y compras (F2/F8), crédito de clientes con abonos y
  estado de cuenta (F7), precio de mayoreo (listas, F2), departamentos (categorías, F2), más lo que diga
  [P48]. Por eso **F8 Mostrador no se puede quitar ni posponer después del cambio**.
- **Transición**: (1) desde F3, pedidos por enlace en el sistema nuevo y ventas/crédito en Eleventa;
  (2) con F7 y F8 listos, N días en paralelo (supuesto 7) capturando en ambos y comparando el corte
  diario; (3) fecha de corte fijada con el dueño: al cierre del día anterior se congelan los saldos de
  Eleventa, se corren `existencias` y `saldos`, y desde esa mañana solo se usa el sistema nuevo;
  (4) Eleventa queda de consulta (solo lectura) 30 días.

## F4 — Cascarón Android + push del personal

Brief ejecutable por paquetes: `docs/fases/F4.md`. **Estado: escrita en `main` (`ebb0d0a`) con la revisión aplicada**; sin builds: llaves, primera APK y la «Salida» en teléfono real quedan para la validación final. Lo que fijó la implementación: `docs/fases/F4.md` «Hechos».

- Migración `005_push.sql`. API: módulo `movil` (registrar/quitar dispositivo, versión),
  `notificaciones/envio.ts` (FCM HTTP v1 con `jose`) y tarea `envio-push`.
- Web: detección del cascarón por User-Agent (login pide `origen:'app'`), botón «Activar avisos» en
  `/notificaciones`, puente en `lib/cascaron.ts` (dueño F4; las pantallas que lo usan solo importan
  `pantallaEncendida()`), `app/manifest.ts` + íconos (PWA para iPhone/PC).
- `apps/mobile/`: Expo ~58 + `react-native-webview` + `expo-notifications` + `expo-keep-awake` +
  `expo-linking` + `expo-updates` + `expo-application` + `expo-intent-launcher` + `expo-file-system`
  (CONTRATOS §4.6). `google-services.json` y llaves fuera del repo. La primera APK se instala a mano en los
  2 teléfonos; desde ahí se actualiza sola.
- **Actualizaciones (CONTRATOS §4.6.1, copia adaptada de chachaplancha)**: API `modulos/movil/actualizaciones.ts`
  (4 `GET` públicos que leen `ACTUALIZACIONES_DIR`; volumen `actualizaciones` en `docker-compose.yml`),
  scripts `apps/api/scripts/ota-{publicar,publicar-apk,regresar}.mjs` (+ `npm run ota:*`), ruta BFF
  `app/api/movil/actualizaciones/[...ruta]/route.ts`; en `apps/mobile`: `app.config.ts`, `certs/certificado.pem`,
  `src/actualizaciones/{logica.ts, logica.test.ts, novedades.ts, novedades.test.ts, …}`, plugin de firma de
  release; en el panel: mensajes `sin_guardar` en `lib/cascaron.ts` y sección «Esta app» en
  `/notificaciones`. **Entregable de documentación**: `docs/deploy/actualizar-app.md` (guía para el dueño:
  OTA o APK, comandos, regresar, firma y respaldo de llaves, problemas comunes).
- **Salida**: el panel completo de F1–F3 funciona dentro del cascarón sin una sola pantalla nativa de
  negocio; pedido por enlace → push en < 30 s y al tocarlo abre `/pedidos/<id>`; con la app cerrada
  también; preferencia apagada → solo bandeja; cerrar sesión revoca el dispositivo; token FCM inválido →
  revocado; sin `FCM_CUENTA_SERVICIO` la API arranca y la bandeja funciona; un enlace a otro dominio no se
  abre dentro del WebView; wa.me y Google Maps abren sus apps; la sesión sobrevive cerrar y reabrir la app
  (cookie persistente, 30 días); sin red sale «Sin conexión · Reintentar»; ningún JWT accesible desde JS ni
  desde el código nativo. **Actualizaciones**: OTA publicada → el teléfono la aplica al abrir; con la app
  abierta, al volver tras ≥ 5 min; con `sin_guardar` activo no reinicia y muestra «Hay una actualización
  lista»; manifiesto sin firma válida → rechazado; `ota-regresar` devuelve a la versión buena también a quien
  ya bajó la mala; APK nueva → diálogo, descarga, sha256 correcto instala y uno alterado no; `--obligatoria`
  bloquea un `versionCode` viejo y sin red no bloquea; la descarga de la APK pasa completa por el BFF;
  `novedades.test.ts` y `logica.test.ts` en verde; un despliegue de la web cambia las pantallas sin
  publicar nada en el teléfono. **UX**: P1–P3 y N1–N6 en el cascarón; Safari en iPhone usa el mismo panel.

## F5 — Lista de surtido (paralela a F6)

Brief ejecutable por paquetes: `docs/fases/F5.md` (migración 006, en paralelo con F6). **Estado: escrita en `main` (`ebb0d0a`); correcciones de la revisión aplicándose** (decisiones ya en CONTRATOS §2.6 y en F5.md «Hechos»).

- Migración `006_surtido.sql`. API: módulo `surtido`.
- Pantallas: `/surtido` (fecha y ruta opcional; agrupado por proveedor con piezas y cajas sugeridas;
  imprimir; WhatsApp al proveedor con `wa_surtido_proveedor`; «Registrar compra» abre
  `/compras/nueva?surtido=<fecha>&proveedor_id=` precargada; «Publicar» avisa a compras).
- **Lote (§2.12 B7)**: promociones del distribuidor (`/surtido/promociones`) y calendario de demanda
  (`/configuracion`); la misma `/surtido` muestra «sugerido por demanda» y ahorro por promoción. **Salida
  extra**: con ventas fijas y una quincena en el calendario el sugerido coincide con el cálculo a mano;
  promoción vencida no aparece.
- **Salida**: con pedidos de dos fechas y existencia fija, `piezas_a_comprar` coincide con el cálculo a
  mano (incluye producto de inventario agotado y uno contra pedido); líneas `faltante` no cuentan y las
  sustitutas sí; registrar la compra sugerida deja la fila en 0; publicar dos veces la misma lista notifica
  una vez; sin `costos.ver` no viajan costos.

## F6 — Rutas, orden de carga, vista del repartidor (paralela a F5)

Brief ejecutable por paquetes: `docs/fases/F6.md` (migración 007, en paralelo con F5). **Estado: escrita en `main` (`ebb0d0a`, suite F1–F6 574 pruebas); correcciones de la revisión aplicándose** (decisiones ya en CONTRATOS §2.7 y en F6.md «Hechos»). Paradas de cobro
(`fn_agregar_cobro`, `POST /rutas/:id/cobros`) pasan a F7: «con saldo» no existe sin 008.

- Migración `007_rutas.sql`. API: módulos `vehiculos`, `rutas` (incl. `optimizar.ts` puro con pruebas
  unitarias de vecino más cercano + 2-opt); `fn_iniciar_ruta` vive aquí (sin turno: F7 la reemplaza con la misma firma).
- Pantallas: `/rutas` (por fecha; «Nueva ruta» aquí mismo), `/rutas/[id]` (asignar pedidos del día por zona,
  Optimizar, reordenar con flechas/arrastre, km, avisos de sin ubicación y de capacidad,
  Cargar → Siguiente: hoja de carga), `/rutas/[id]/carga` (hoja imprimible LIFO + totales por producto),
  vehículos en `/configuracion`, `/reparto` (repartidor, mobile-first: su ruta de hoy, una parada por
  pantalla, Navegar en Google Maps/Waze, ruta completa en tramos, No entregado con motivo, Terminar).
- **Salida**: con 6 paradas de coordenadas fijas el optimizador da un recorrido ≤ al del orden de
  captura y la prueba fija el orden esperado; paradas sin coordenadas quedan al final y se listan;
  reordenar con un conjunto distinto → `PARADAS_NO_CUADRAN`; cargar sin existencia → `FALTA_SURTIR` con lo
  que falta; pedido `esperando_cliente` → `PEDIDO_ESPERANDO_CLIENTE`; orden de carga = inverso del de
  entrega; repartidor sin `rutas.ver` no ve rutas ajenas (`404`/`RUTA_AJENA`); `ruta_asignada` llega al
  repartidor; el seguimiento del cliente muestra «parada N de M». **UX**: P4 y P5 en teléfono real.

## F7 — Entrega, cobro, crédito, liquidación

Brief ejecutable por paquetes: `docs/fases/F7.md` (migración 008; requiere F5 y F6 cerradas con su revisión). Incluye la parte
`saldos` del importador de Eleventa y las paradas de solo cobro movidas desde F6.

- Migración `008_ventas_cobro.sql`. API: módulos `cajas`, `turnos`, `ventas` (cancelar, devolver,
  ticket), `entregas` (`/pedidos/:id/entregar`, liquidación; `fn_iniciar_ruta` se reemplaza con la misma firma para abrir el turno de ruta), `cobranza` (CxC,
  abonos, saldo inicial, estado de cuenta, transferencias), `comprobantes`.
- Pantallas: `/cobrar` (única pantalla de dinero: `?pedido=` entrega completa por omisión o ajustar
  cantidades, luego cobro efectivo / transferencia con referencia y foto / crédito con disponible a la
  vista, deja `wa_nota_entrega` en la bandeja y, si el cliente debe, ofrece «Cobrar saldo anterior» en el
  mismo `/cobrar?cliente=`; botón «Mandar datos de transferencia» crea el aviso `wa_datos_transferencia`),
  fondo al iniciar ruta en `/reparto`, `/caja` muestra el turno de ruta para gastos, `/cobranza`, `/cierre`, `/cierre/ruta/[id]` (esperado vs
  entregado, transferencias, producto que regresa), `/cierre/transferencias`, `/ventas`, `/ventas/[id]`;
  en `/clientes/[id]`: «Estado de cuenta» (lectura), «Saldo inicial» y botón «Abonar» → `/cobrar?cliente=`.
- **Lote (§2.12 A3, B9–B12)**: estado de cuenta (panel imprimible 80 mm y `/pedido/estado-cuenta` en el
  enlace, aviso `wa_estado_cuenta`); sugerencias de cobro al armar ruta; semáforo de fiado y límite
  sugerido en `/clientes/[id]`; prueba de entrega (recibió + foto) en `/cobrar`; resumen del día en
  `/cierre` al dueño por la bandeja. **Salida extra**: semáforo con tres clientes de prueba (al corriente,
  vencido 5 días, vencido 20) da verde/amarillo/rojo; estado de cuenta del panel y del enlace dan el mismo
  saldo; resumen del día cuadra con ventas, abonos y CxC del día.
- **Salida**: entrega parcial genera venta solo por lo entregado y el resto sigue en existencia; reintento
  con la misma clave no duplica venta ni movimiento; crédito arriba del límite → 409; abono en ruta en
  efectivo entra al turno del repartidor; liquidación: esperado = fondo + efectivo de ventas + abonos −
  gastos − reembolsos (prueba con números); sin `rutas.liquidar` no se liquida; mostrador no puede vender
  piezas que van cargadas (`STOCK_INSUFICIENTE` con `comprometido`); saldo inicial aparece en el saldo y en
  la página del cliente; cancelar venta de pedido deja el pedido cancelado y regresa inventario. **UX**: P4
  completo (Entregar → Efectivo → Listo en 3 toques), P5, C15.

## F8 — POS de mostrador (requisito del cambio desde Eleventa: no se pospone)

Brief ejecutable: `docs/fases/F8.md` (sin migración; requiere F7 cerrada). Contiene la lista de paridad con Eleventa.

- Sin migración (tablas de 008). Pantallas: `/pos` (buscador tolerante y escáner, mosaicos por categoría,
  elegir presentación, carrito, cliente con su lista y crédito, pagos mixtos, cambio, ticket 80 mm sin
  desglose, clave por carrito), `/caja` (abrir turno, movimientos, corte propio o supervisado); pedidos
  `recoge` se entregan en `/cobrar?pedido=` (F7) con el turno de mostrador, no en `/pos`.
- **Lote (§2.12 A3)**: varias ventas en espera en `/pos` (en el navegador) y reimprimir desde
  `/ventas/[id]`. **Salida extra**: tres ventas en espera, cobrar la segunda no toca las otras; reimprimir
  da el mismo ticket.
- **Salida**: sin turno no se vende; venta mixta efectivo + crédito crea CxC; dos ventas concurrentes por
  la última caja: una pasa; cajero que cambia precio → `403 SIN_PERMISO_PRECIO`; corte con la fórmula de
  §2.8; pedido «recoge» entregado en mostrador genera venta `origen = 'pedido'`.

## F9 — Reportes

Brief ejecutable: `docs/fases/F9.md` (migración 009; requiere F8 cerrada).

- Migración `009_reportes.sql` (F8 no tiene migración: F9 toma 009, CONTRATOS §2). API: módulo `reportes`; crea el módulo `tablero` (`GET /api/tablero`, dueño F9).
- Pantallas: `/reportes/ventas` (por día, cliente, zona, ruta, origen…), `/reportes/compras`,
  `/reportes/utilidad` (mermas por causa), `/reportes/entregas`, `/reportes/faltantes` (demanda perdida),
  `/reportes/inventario`, `/reportes/bajo-minimo`, `/reportes/cuentas-por-cobrar`, `/reportes/cortes`
  (mostrador y liquidaciones); CSV en el navegador.
- **Lote (§2.12 B13)**: `/reportes/ganancia` por cliente, zona y ruta (ruta resta sus gastos). **Salida
  extra**: ruta con $300 de gasolina muestra ganancia = utilidad − 300.
- **Salida**: con un juego de datos fijo cada reporte da el número calculado a mano; ventas canceladas no
  aparecen; devolución resta en su fecha; días en hora de México; utilidad oculta sin `costos.ver`; ningún
  reporte muestra IVA/IEPS.

## F10 — Envases retornables (diferida)

Solo si [P7] dice que se controla. Migración `010_envases.sql` según CONTRATOS §2.10; captura de envases
recibidos en la parada del repartidor y en `/pos`.

## F11 — Crecimiento (después de F9)

- Migración `011_crecimiento.sql`. Lealtad simple y sugerencias por zona (CONTRATOS §2.12 B14, B15).
- Pantallas: configuración de lealtad en `/configuracion`; avance en `/pedido` y sugerencias «en tu zona
  también piden» (máx. 3) en `/pedido`; marcar `cuenta_lealtad` en `/productos/[id]`.
- **Salida**: con `lealtad_cada = 10`, la venta que completa 10 cajas agrega en la siguiente una línea
  regalo a precio 0 con su costo y el reporte de utilidad la refleja; sugerencias nunca incluyen algo que
  el cliente compró en 60 días; con la lealtad apagada nada cambia. **UX**: C18, C19.

## Fuera de alcance (decidido, no olvidado)

**Sin IA ni APIs de pago en ninguna parte** (intérprete, sugerencias, compra inteligente, semáforo: reglas
en SQL/TS con pruebas). Mayoreo por cantidad: boceto hasta [P4]. Modo sin conexión: no; respaldo = datos
móviles [P49].

CFDI (no facturan), WhatsApp Cloud API / SMS / push a clientes (solo `wa.me` manual), GPS en vivo del
repartidor, mapas en pantalla (navegación por enlace a Google Maps/Waze), OSRM o Google Routes (ruta de
mejora en CONTRATOS §2.7.1), cuentas por pagar a proveedores [P12], lotes [P18], traspasos [P22],
recuperación de contraseña por correo [P25], gastos de operación fuera de la ruta, comisiones [P28],
modo sin conexión completo (solo reintentos idempotentes), app nativa (cualquier sistema: el cascarón es solo WebView), web push en iPhone (opcional después), cobro de envío [P39].

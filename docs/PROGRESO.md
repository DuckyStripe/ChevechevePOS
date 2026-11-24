# Progreso del desarrollo

Registro para retomar el trabajo. Cada fase: brief (opus) → B base → C API ∥ D web → revisor (opus) → validación → commit + push.
Reglas del dueño: sin builds hasta terminar todo el plan (solo lint, typecheck y pruebas); push a `main` autorizado (sin Dokploy aún); no dar resúmenes al dueño.

| Fase | Estado | Commit |
|---|---|---|
| Reestructura + diseño | Hecho | `84c3801` |
| F1 A infra | Hecho | `d0947eb` |
| F1 B 001_auth | Hecho | `dc54318` |
| F1 C/D + revisión (12 hallazgos corregidos) | Hecho, 114 pruebas | `dac9d30` |
| F2 | Hecho, 263 pruebas | `edca44f` |
| F3 | Hecho, 457 pruebas (dos corridas en verde) | `53d496a` |
| Docs sincronizados con F3 + briefs F4, F5, F6 | Hecho (sin commit) | — |
| F4 | Brief listo (`docs/fases/F4.md`) | — |
| F5 ∥ F6 | Briefs listos (`docs/fases/F5.md`, `F6.md`; 006 y 007 en paralelo) | — |
| F7, F8, F9 | Briefs listos (`docs/fases/F7.md`, `F8.md`, `F9.md`; 008 F7, F8 sin migración, 009 F9) | — |
| F11 | Brief listo (`docs/fases/F11.md`; 011 sin 010, lealtad y sugerencias por zona) | — |

## Pendientes conocidos
- `apps/web` no tiene pruebas automáticas del BFF (Origin, cookies, 204, `..`): cubrir antes de la validación final.
- Bloqueo de usuarios inexistentes es en memoria por proceso (`shortcut` en el código).
- Respaldos (`infra/respaldo`) sin probar: requiere build y destino rclone.
- F4: llaves (OTA y APK), primera APK, instalación en los 2 teléfonos, `logica.test.ts`/`novedades.test.ts` y la «Salida» de PLAN F4 en teléfono real quedan para la validación final (regla: sin builds; el código móvil se valida solo con tsc + lint).
- `CLAUDE.md` (raíz) aún dice «`X-Real-Ip`, si no la más a la derecha»: desde F3 es **solo** la más a la derecha de XFF (CONTRATOS §4.1). Corregir esa línea (fuera de `docs/`, no la tocó la sincronización).
- ~~Texto sembrado de `push_pin_ataque`~~: resuelto, 004 ya lo siembra con «15 minutos» y 005 no lo toca.
- Importar Eleventa: falta el archivo real (simulacro con conteos del dueño antes de producción; `saldos` en F7).
- Prueba manual del dueño de F3 pendiente.
- Decisiones de contrato de F2 a revisar con el dueño: `GET /catalogo-venta` pasa a F3; `v_por_caducar` cuenta líneas sin caducidad; dependencia nueva `@fastify/multipart`.

## F2 — notas para el paquete C (de D)
- `GET /productos` debe aceptar `producto_ids` (lista, ≤ 50).
- `v_por_caducar` / `GET /inventario/por-caducar` incluye `presentacion_id` (vendible de mayor factor).
- Formas de lista: usar la misma convención de F1 (`comun/paginacion.ts`) en categorías, marcas, listas-precio, proveedores, por-caducar, movimientos, compras, márgenes; `Producto.categoria|marca|proveedor = {id, nombre}`.
- `POST /inventario/ajustes` y `/inventario/conteos` aceptan `clave_idempotencia` (opcional, uuid).
- `PATCH /listas-precio/:id` acepta `{nombre?, es_predeterminada?, activa?}`.
- PLAN: agregar `?volver=` y `?proveedor_id=` al mapa de pantallas.

## F2 — notas de B
- F2.md tenía un error en el caso «precio sugerido» (12.75 → usar caja 312 / promedio 13.00). Corregir F2.md.
- Índice de búsqueda usa `app.fn_texto_busqueda(nombre, alias)` (immutable) en lugar de `array_to_string`. Reflejar en CONTRATOS.
- Proveedor inválido → `ESTADO_NO_VALIDO`. `v_precio_bajo_costo` sin `producto_id`.
- Concurrencia de compras/cancelaciones sin prueba con dos conexiones (lo revisa el revisor).

## F2 — revisión SQL (14 hallazgos, en corrección)
- Decisión del coordinador (hallazgo ALTO): cancelar compra con salidas posteriores → `COMPRA_CON_SALIDAS`; la corrección de costo va por `fn_revaluar_costo` (kárdex `revaluacion`, cantidad 0, solo `precios.editar`) y `POST /api/inventario/revaluaciones` en `/inventario/ajustes`. Nunca se recorta el promedio a 0: `COSTO_INVALIDO`.
- Pendiente para docs: CONTRATOS §2.2/2.3 (revaluación, nuevos códigos, `fn_texto_busqueda`, `p_incluir_inactivos`, protección de compra/compra_linea, TRUNCATE bloqueado), y la pantalla `/inventario/ajustes` debe ofrecer «Corregir costo» (Dueño).
- B corregido: 216 pruebas. Códigos nuevos: COMPRA_CON_SALIDAS, COSTO_INVALIDO, COMPRA_INMUTABLE, PRESENTACION_NO_BORRABLE. Cancelar compras en orden de la más nueva a la más vieja.
- Lección de proceso: nunca dos agentes corriendo `npm run prueba` a la vez (comparten `chevechevepos_pruebas` y se pisan). B y C en serie para las pruebas.
- Falta en D: botón «Corregir costo» (Dueño) en `/inventario/ajustes` → `POST /api/inventario/revaluaciones`; mostrar COMPRA_CON_SALIDAS en llano en `/compras/[id]`.
- Docs sincronizados con F2 (2026-11-23): CONTRATOS §2.2/§2.3/§2.12/§4.2–§4.4/§5, PLAN (mapa y estado), F2.md («Hechos»). Brief de F3 listo: `docs/fases/F3.md` (B 004 → C ∥ D ∥ E; pruebas en serie B → C → E).

## Estado
- F2 hecha (`edca44f`, 263 pruebas). Ninguna base fuera de la de pruebas tiene migraciones aplicadas (dev `chevechevepos` vacía, sin Dokploy): editar 001–003 aún es seguro hasta el primer despliegue. A partir del primer despliegue, solo migraciones nuevas.
- F3 en curso. Decisión: corregir en 003 que la cancelación de una compra POSTERIOR no cuente como salida para cancelar una anterior (así se puede cancelar de la más nueva a la más vieja).

## F3 — requisitos de D para C (API)
- Ruta pública sin sesión (o `detalles` en `ENLACE_INVALIDO`/`PIN_REQUERIDO`) con: nombre del negocio, WhatsApp del negocio, textos `pantalla_*` necesarios para PIN e inválido.
- `GET /publico/cliente`: incluir `id`, `faltante_accion_predeterminada` y su plazo.
- Seguimiento: líneas con `id` y `presentacion_id`; etiquetas de etapas (o códigos estables); `reparto` real cuando exista.
- `GET /pedidos/:id`: `propuestas[]` con `opciones` (forma en `apps/web/src/lib/tipos.ts`).
- `GET /clientes/:id`: incluir `lat`, `lng`, `proxima_visita` (de `fn_proxima_visita`, no calcularla en web).
- Coordenadas entran como string con 6 decimales.
- `catalogo-venta`: `articulo.oferta` define ofertas; `miniatura` = nombre de archivo.
- Fecha de entrega: el carrito manda `proxima_visita` por omisión y «recoger en bodega».
## F3 — pendientes de D
- Mover `<Toaster>` (Sonner) del `app/layout.tsx` raíz al layout del panel para no cargarlo en las páginas del cliente.
- Quitar el cálculo de `proxima_visita` en `estados.ts` cuando la API lo dé.
- Filas del mapa de pantallas de F3 en PLAN.
- Revisión SQL de 004: hallazgos enviados al agente de la API. Decisiones: `v_comprometido` incluye líneas activas de pedidos `esperando_cliente`; los propuestos toman folio P- solo al aceptarse; el Repartidor no marca avisos hasta F6 (rutas); `total_visto` obligatorio en el camino del cliente; pedido que queda sin líneas por faltantes se cancela (`sin_lineas`).
- F6 TODO: en `fn_marcar_aviso`, permitir al Repartidor los avisos de pedidos de sus rutas.
- Paquete E (importador Eleventa) escrito: `scripts/importar-eleventa.mjs` + `scripts/eleventa/`, 10 pruebas unitarias OK. Falta correr `test/eleventa/importar.test.ts` contra la base (coordinador, después de C). Usuario `televenta_*` no se limpia (kárdex). Saldos en F7 (`fn_saldo_inicial`).
- Revisión F3 (API/web): 3 ALTO (avisos manuales del Repartidor con token del link; /p/[token] borraba cookies en 429/5xx; bloqueo por IP antes de validar token → CGNAT), 2 MEDIO (IPv6 /64, X-Real-Ip falsificable → solo XFF más a la derecha). En corrección. Nuevo endpoint `GET /api/publico/negocio` (no cuenta como fallo). Docs: agregar filas F3 al mapa de pantallas, endpoint negocio, umbral global de PIN por enlace con aviso al personal.
- F3 cerrada: 457 pruebas, dos corridas seguidas en verde. Espera automática por ataque distribuido al PIN bajada a 15 min (C21: ninguna espera automática > 15 min). Búsqueda en `productos.test.ts` filtra a productos propios (otras suites dejan productos activos).
- Docs de F3 sincronizados (2026-11-23): CONTRATOS (§2.1 evento/plantilla `pin_ataque`, §2.4 `cliente_pin_fallo`, `fn_entrar_con_pin` jsonb + umbral 20/h, folio al aceptar, `v_comprometido` con `esperando_cliente`, `sin_lineas`, descarte de avisos, `fn_marcar_aviso`; §4.1 IP/XFF//64 y `publica` `GET /publico/negocio`; §4.4 límites, `/publico/cliente`, `total_visto`, permisos de `/avisos`), PLAN (mapa, estados F1–F3, banderas del importador), F3.md «Hechos».
- Decisiones de los briefs F4–F6 (ya en CONTRATOS): 005 agrega `fn_quitar_dispositivos`, `fn_envios_tomar`, `fn_envio_resultado`; `@noble/hashes` en el cascarón; `fn_lista_surtido` cuenta `esperando_cliente` y fija costo estimado/promoción/filtro; paradas de cobro (`fn_agregar_cobro`, `POST /rutas/:id/cobros`) pasan a F7; 007 rehace `fn_seguimiento_pedido` (`surtiendo` + `reparto`) y `fn_marcar_aviso` (Repartidor, TODO F6) con la misma firma, agrega `fn_reparto_pedido`, `fn_requiere_surtido`, `fn_puede_ver_aviso`, `trg_pedido_cancelado_ruta`, `GET /rutas/repartidores`, `GET /rutas/:id/candidatos`; forma de `despacho.rutas`. Paralelo F5∥F6: migración `.borrador` hasta su turno, candado `/tmp/chevechevepos-prueba.lock`, cada agente corre solo sus archivos.
- `043e3df`: docs F3 sincronizados, briefs F4–F6. En paralelo: F4 servidor (005), F4 app móvil, F5 (006), F6 (007). Candado de pruebas `/tmp/chevechevepos-prueba.lock`; migraciones `.borrador` hasta su turno de pruebas. Al terminar: suite completa por el coordinador, revisores (dinero/stock/permisos: F5 compras sugeridas, F6 rutas/avisos; seguridad: F4 push y actualizaciones).
- DETENIDO por el dueño durante F4/F5/F6 en paralelo. Cambios sin commit a medio hacer en el árbol de trabajo (ver `git status`): revisar, completar o descartar antes de seguir.
- F4 móvil escrito (29 pruebas vitest, tsc/lint OK). Pendiente dueño: íconos/splash/ícono de notificación, `certs/certificado.pem`, `google-services.json`. Sin probar hasta el build: WebView real, FCM, plugins tras prebuild, firma, OTA.
- F5 escrita (B/C/D, 33 pruebas propias). Docs pendientes: `fn_mensaje_surtido`, `fn_reemplazar_fechas_demanda` en §2.6; formas de `/fechas-demanda`, `/surtido` (`totales`), `/promociones`; filas de `/surtido`, `/surtido/promociones` y calendario en el mapa. Falta «Siguiente: Rutas» en `/surtido` (quien cierre después de F6).
- F4 servidor y móvil escritos; revisor F4 corriendo.
- Revisión F4: 2 ALTO (texto 004 ya era «15 minutos»: docs F3/F4/CONTRATOS/PROGRESO deben decir que 004 lo siembra bien y 005 no lo toca; FCM JSON sin montar en compose), 5 MEDIO (fallas de OAuth gastaban reintentos; INVALID_ARGUMENT revocaba; reserva de 2 min corta; marca en localStorage de avisos; ota-publicar-apk sin leer el manifiesto). En corrección. Docs: corregir la frase «SKIP LOCKED evita dobles envíos» en §2.5.
- F6 escrita (B/C/D). Suite completa F1–F6: 53 archivos, 574 pruebas verdes. Revisores: F5 y F6 corriendo; F4 corregido.
- Docs pendientes F6: filas `/rutas`, `/rutas/[id]`, `/rutas/[id]/carga`, `/reparto`, Vehículos; `fn_cargar_ruta` con `advertencias`; campos extra de optimizar y ruta; `cajas_totales = ceil(piezas/24)` (supuesto a revisar).
- `ebb0d0a`: checkpoint F4–F6 (574 pruebas). Revisión F5: 1 ALTO (precarga borraba borrador de compra) + 7 MEDIO; decisiones: regla única de líneas comprometidas (vista base en 006 + `v_comprometido` encima), regla única `fn_pedido_requiere_surtido` (F6 debe delegar en ella), promociones solo del proveedor habitual, costo de promoción visible con `costos.ver` o `compras.registrar`, bloquear desactivar producto con pedidos (`PRODUCTO_CON_PEDIDOS`). En corrección.
- Revisión F6: 1 ALTO (carga de rutas sin candado de stock común) + MEDIO (trigger con orden de candados invertido, faltante cambiaba fecha de pedido en ruta, clave `fallida` sin ruta, etapa duplicada lista/detalle, índice `pedido(ruta_id)`, cajas = factor real). En corrección. F6 delega «requiere surtido» en `fn_pedido_requiere_surtido` de 006.
- Docs sincronizados con F4–F6 y sus revisiones (2026-11-23): CONTRATOS §2 (tabla de migraciones), §2.1.1, §2.4, §2.5 (reserva por fila, `permanente`, OAuth sin gastar intentos, JSON de FCM montado), §2.6 (`v_linea_comprometida`, `fn_pedido_requiere_surtido`, costos con `costos.ver` o `compras.registrar`, promociones del proveedor habitual, `PRODUCTO_CON_PEDIDOS`), §2.7 (candado de stock al cargar, disparador sin tocar `ruta`, `fallida:<pedido>:r<ruta>`, `fn_etapa_pedido`, `idx_pedido_ruta`, cajas aproximadas, sucursal, `RUTA_LLENA` 200, motivos como plantillas, avisos del Repartidor), §4.3, §4.4, §5; PLAN (mapa y estados); «Hechos» en F4/F5/F6. Decisiones nuevas de docs (a confirmar por quien corrige F6): faltante en pedido con ruta no cambia fecha (`PEDIDO_EN_RUTA`); `fn_puede_ver_aviso` pasa a 3 argumentos (con plantilla); motivos en `GET /rutas/:id.motivos_no_entregado`.
- Briefs F7, F8, F9 listos (`docs/fases/F7.md`, `F8.md`, `F9.md`). Decisiones: orden de candados de dinero ruta → turno → pedido → líneas → venta → cliente → existencias → CxC → abono; gasto con `clave_idempotencia` (`movimiento_caja`); 008 rehace `fn_iniciar_ruta`/`fn_terminar_ruta` idempotentes, `fn_puede_ver_aviso` (+ `wa_nota_entrega`) y `fn_seguimiento_pedido` (`recibio`); `reportes.ver` se crea en 008 (lo usa `/cierre/resumen`); `/caja` completa en F7, F8 solo supervisión y hoja de corte; F8 sin migración, F9 toma 009; saldos de Eleventa con `--concepto` y vence = corte + `dias_credito`.
- F4–F6 cerradas con revisiones aplicadas: 595 pruebas, dos corridas seguidas en verde; mobile tsc/lint/vitest OK. Briefs F7–F9 escritos. Pendiente menor para F7-B: `fn_mensaje_surtido` (006) tiene la palabra ' piezas ' en código → plantilla; docs dicen `motivo_no_entregado_*` y 007 usa `motivo_<clave>`: alinear docs al código.

## F7 — requisitos de D para C (decisiones del coordinador)
- Una sola lectura para `/cobrar`: `GET /api/cobrar/contexto?pedido=|cliente=[&parada=]` (permiso `ventas.crear`, o `rutas.operar` solo en sus rutas) con líneas (`pedido_linea_id`, presentación, cantidad, precio), saldo, vencido, semáforo, disponible de crédito, métodos permitidos.
- Sin dinero en JS: `POST /api/cobrar/vista` (mismo permiso) recibe cantidades entregadas y pagos y devuelve total, pagado, cambio y saldo calculados en SQL; los pagos aceptan un método con `monto: null` = «el resto».
- Respuesta de entregar incluye `venta.cambio` y `saldo_cliente`.
- `wa_resumen_dia`: la API resuelve al dueño (no pide `usuario_id`). Definir cuerpo de `wa_estado_cuenta`.
- `/cuentas-por-cobrar` trae `semaforo` por fila.
- Documentar formas: `saldo_cliente`, filas de `/ventas`, `/ventas/:id` (`piezas_devueltas`), `/abonos`, movimientos de `/rutas/:id/liquidacion`, `recibio`, tipos del estado de cuenta, `cierre`/`por_liquidar` en `/despacho`.
- BFF nuevo `app/api/comprobantes/[archivo]` (binario). Mapa: `/pedidos/[id]` → `/cobrar` solo si recoge y confirmado; `/clientes?con_saldo`.
- Web D hecha (lint/tsc OK). Cuando C exista: quitar la aritmética de centavos de `/cobrar` y usar `/cobrar/vista`.
- Revisión SQL 008: ALTO (reembolso en turno ya cerrado) + MEDIO (devoluciones parciales con redondeo acumulado, entregar solo el repartidor de la ruta, guardia en venta/cxc/abono/turno_caja). Enviado al agente de la API (dueño de 008 ahora). Plantilla nueva `surtido_linea_piezas` → CONTRATOS §2.1.1. Fondo de ruta: solo en el turno de ruta.
- F8 web (/pos, supervisión de turnos, hoja de corte, reimprimir ticket) escrita. Pendiente: pasar /pos a `/cobrar/vista` cuando la API la acepte para mostrador; documentar `Ticket` y `GET /turnos` en CONTRATOS; filas del mapa (`/pos` «Vender», hoja de corte en `/caja`, ticket en `/ventas`).
- F7 API terminada (674 pruebas, dos corridas en verde). En curso: revisor F7/F8, /pos a /cobrar/vista, sync de docs F7/F8.
- Revisión F7: CRÍTICO 006 editada tras commit (mover plantilla surtido_linea_piezas y fn_mensaje_surtido a 008); ALTO devolución por repartidor ajeno, idempotencia de abono sin renovar; MEDIO entrega recoge ignora cargadas, abono sin fn_puede_ver_cuenta; BAJO regla de transferencia por verificar triplicada, resumen del día congelado, por_cobrar sin sucursal, 401→404 en comprobantes. En corrección.
- F7 cerrada con revisión aplicada y F8 web; Paquete E (saldos Eleventa) hecho. Suite: 59 archivos, 682 pruebas en verde. Pendiente F8-C (pruebas de paridad del mostrador) antes de F9.
- Cuestionario: P30 (1 camioneta, 2+ vueltas) y P34 (por zona) contestadas; coinciden con los supuestos, sin cambios de código.
- F8-C y F9 (009, reportes, tablero, web) cerradas con revisión aplicada. Suite 65 archivos / 752 pruebas en verde (sin contar F11 en curso). F11: brief escrito, web D+P escrita, base 011 en curso.
- F11 cerrada (011 lealtad y sugerencias de zona, API, web) con revisión aplicada: regalo en reparto solo con confirmación del repartidor (con_regalo), regalo no vendible = sin premio, regalo en la parada de mayor carga_n, acumula solo con precio > 0. Suite 68 archivos / 798 pruebas, dos corridas en verde. Plan F1–F9 + F11 escrito; F10 (envases) espera [P7]. Siguiente: validación final con builds (decide el dueño).
- 2026-11-24 Dokploy: compose CheveposAPP (proyecto Chevepos) desplegado y sano; dominio chevepos.codelabs.com.mx → web:3760 (https en Cloudflare). Base en volumen nuevo db_datos (db_data viejo con 004 previa quedó huérfano, sin datos). Usuario dueño `dueno` creado (contraseña temporal entregada al dueño), url_publica fijada. Falta: DNS/túnel de Cloudflare para el dominio, FCM, rclone, APK.

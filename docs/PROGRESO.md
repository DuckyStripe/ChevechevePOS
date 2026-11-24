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

## Pendientes conocidos
- `apps/web` no tiene pruebas automáticas del BFF (Origin, cookies, 204, `..`): cubrir antes de la validación final.
- Bloqueo de usuarios inexistentes es en memoria por proceso (`shortcut` en el código).
- Respaldos (`infra/respaldo`) sin probar: requiere build y destino rclone.
- F4: llaves (OTA y APK), primera APK, instalación en los 2 teléfonos, `logica.test.ts`/`novedades.test.ts` y la «Salida» de PLAN F4 en teléfono real quedan para la validación final (regla: sin builds; el código móvil se valida solo con tsc + lint).
- `CLAUDE.md` (raíz) aún dice «`X-Real-Ip`, si no la más a la derecha»: desde F3 es **solo** la más a la derecha de XFF (CONTRATOS §4.1). Corregir esa línea (fuera de `docs/`, no la tocó la sincronización).
- Texto sembrado de `push_pin_ataque` dice «una hora» (la espera es 15 min): lo corrige 005 (F4.md paquete B).
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

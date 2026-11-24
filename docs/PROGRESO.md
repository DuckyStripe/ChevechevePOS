# Progreso del desarrollo

Registro para retomar el trabajo. Cada fase: brief (opus) → B base → C API ∥ D web → revisor (opus) → validación → commit + push.
Reglas del dueño: sin builds hasta terminar todo el plan (solo lint, typecheck y pruebas); push a `main` autorizado (sin Dokploy aún); no dar resúmenes al dueño.

| Fase | Estado | Commit |
|---|---|---|
| Reestructura + diseño | Hecho | `84c3801` |
| F1 A infra | Hecho | `d0947eb` |
| F1 B 001_auth | Hecho | `dc54318` |
| F1 C/D + revisión (12 hallazgos corregidos) | Hecho, 114 pruebas | `dac9d30` |
| F2 | B hecho (148 pruebas), D hecho; C (API) y revisor SQL corriendo | — |

## Pendientes conocidos
- `apps/web` no tiene pruebas automáticas del BFF (Origin, cookies, 204, `..`): cubrir antes de la validación final.
- Bloqueo de usuarios inexistentes es en memoria por proceso (`shortcut` en el código).
- Respaldos (`infra/respaldo`) sin probar: requiere build y destino rclone.
- F4: compilar APK y llaves de firma quedan para la validación final.
- Importar Eleventa: falta el archivo real.
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
- Pendiente docs F3: filas del mapa de pantallas, `GET /api/publico/negocio`, `pin_ataque`, `cliente_pin_fallo`, umbral 20 fallos/h por enlace, XFF solo el de la derecha.

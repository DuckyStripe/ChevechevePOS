---
name: ux-chevechevepos
description: Úsalo SIEMPRE que crees, modifiques o revises pantallas de ChevechevePOS (link del cliente /p/[token] y /pedido, panel web del personal, app móvil). Skill de DISEÑO e interacción, no de lógica de negocio.
---

# UX/UI de ChevechevePOS

Las reglas comprobables viven en `docs/CONTRATOS.md` §7 y el mapa de pantallas en `docs/PLAN.md` («Mapa de pantallas»). **Léelos antes de diseñar** y cita las reglas por id (C1–C21, P1–P9, N1–N6); aquí no se copian. Si una regla choca con una idea de diseño, gana la regla.

## Quién usa qué

| Superficie | Usuario | Prioridad |
|---|---|---|
| Link del cliente (`/p/[token]` → `/pedido/*`) | Tendero poco tecnológico, teléfono Android barato, 3G | Cero fricción, 3 toques, letra grande (C1–C21) |
| Panel web / app (oficina) | Dueño y socio (2 personas que hacen todo, también reparto) | Un paso del día a la vez, «Siguiente: …» (N1–N5) |
| `/reparto` (repartidor) | Una mano, en la camioneta, sol, señal mala | Una parada por pantalla, acción abajo, botones ≥ 56 px (P4, P5, N6) |

La app móvil es un cascarón Expo (WebView del panel + push FCM, deep links, cámara, ubicación); solo Android. En iPhone se usa la web. El diseño es el de la web: no se diseña una segunda UI nativa.

## Antes de escribir código

1. ¿Qué superficie es y quién la usa? Una frase.
2. ¿Qué regla C/P/N aplica? Escríbelas.
3. Acción primaria: **una** por pantalla. Lo raro va en «Más».
4. ¿Es la pantalla dueña de esa acción (N1)? Si no, **enlaza** con `?volver=`, no la reimplementes.
5. Contenido real: 0, 1, 25 y 300 registros; nombres largos; sin foto.
6. Qué se reutiliza de los componentes y tokens que ya existen en `apps/web`. No crees un segundo kit ni hex sueltos.

## Pantalla de tendero (C)

- Abre directo en su catálogo; nada de login ni bienvenida (C1). Lo primero visible: «Repetir mi último pedido» con total (C2).
- Confirmar es un toque, sin «¿estás seguro?» (C3). Notas y extras plegados.
- Tocables ≥ 48 px, texto ≥ 16 px, precios ≥ 18 px, contraste AA (C5). Barra fija abajo con carrito y total (C7).
- El carrito nunca se pierde y reintentar no duplica (C8): guarda en el teléfono y usa la clave de idempotencia.
- Una pregunta por línea en faltantes (C12). Errores con salida concreta y botón de WhatsApp (C13). Pide ubicación una vez y sin bloquear (C14).

## Pantalla de personal (P, N)

- Tarjetas con como máximo 3 acciones grandes; el resto en «Más» (P1). Avisos: un toque abre WhatsApp, otro «Enviado» (P2).
- Repartidor: acción principal al alcance del pulgar, estado «guardado / no guardado» siempre claro, reintento seguro (P4, P5).
- Menú = operación del día en orden; Ajustes aparte (N2). Cada paso termina en «Siguiente: …» (N3). `/` no tiene acciones propias (N4).
- Una herramienta, un lugar (N1, N6): si te tienta copiar un botón a otra pantalla, enlaza.

## Estados (toda pantalla)

1. **Cargando:** skeleton del tamaño final (sin saltos), nunca spinner en pantalla vacía.
2. **Vacío:** una frase y la acción para salir («Aún no hay pedidos hoy. Captura uno por llamada»).
3. **Error:** palabras llanas, qué pasó y qué hacer, con «Reintentar». Nunca códigos ni «Error 500» (C13, P6). Si un bloque falla, el resto sigue.
4. **Sin red:** decir si se guardó o no. Acciones reintentables sin duplicar (C8, P5).
5. **Con datos** y **límites:** nombre de tienda largo, 1 producto, 300 productos, sin foto, total de 5 cifras.

## Copy en español llano (C6, P6)

- Habla como el vendedor en el mostrador: «caja de 24», «tu pedido #123», «va en camino». Nunca SKU, presentación, factor, folio a secas, estado, payload, token, error.
- Botones con verbo y resultado: «Enviar pedido», «Quitar», «Sí, mándame esa». No «Aceptar»/«OK»/«Submit».
- Dinero con signo y miles: `$1,250`; fechas en español («jueves 12»). Sin mayúsculas gritadas ni signos dobles.
- Todos los textos del cliente salen de plantillas (`app.plantilla`), no hardcodeados en componentes.
- Mensajes de error: qué falta y cuánto («Te faltan $120 para el mínimo de $500»).

## Móvil primero y rendimiento (C9)

- Diseña a 360×640 primero; sube a escritorio después. Sin scroll horizontal. Debe usarse con zoom 200 %.
- Presupuesto del cliente: JS ≤ 100 KB gzip, usable en ≤ 5 s con «Slow 3G», miniaturas ≤ 30 KB con carga diferida, segunda visita sin rebajar el catálogo. Server Components por defecto; una isla para el carrito. Sin librerías de animación ni iconos por fuente en el cliente.
- Fuentes del sistema o una sola con `font-display: swap`. Imágenes con ancho/alto fijos.
- Táctil: sin `:hover` como única señal, `touch-action: manipulation`, inputs ≥ 16 px (sin zoom de iOS/Android), `inputmode` correcto (`numeric`, `tel`), `100dvh` en vez de `100vh`, `env(safe-area-inset-*)`.
- Movimiento solo funcional, 150–200 ms, respeta `prefers-reduced-motion`.

## Accesibilidad

- Un `h1` por página, landmarks, `aria-label` en botones de ícono, foco visible, foco atrapado y devuelto en paneles.
- Nunca solo color: estados con texto o ícono. Etiquetas visibles en campos (el placeholder no es etiqueta).
- Enlaces reales (`<a>`/`Link`) para navegar; botones para acciones.

## Skills relacionadas (cárgalas cuando aplique)

- `mobile-native`: ajustes táctiles y de WebView (tap highlight, 100vh, notch, zoom de inputs).
- `break-ui`: probar con datos del peor caso antes de cerrar.
- `sistema-visual`: tokens, espaciado y jerarquía coherentes.
- `emil-design-eng`: pulido de detalles y microinteracciones.

## Checklist final antes de decir «listo»

- [ ] Reglas C/P/N aplicables nombradas y cumplidas (por id).
- [ ] Una acción primaria; ninguna acción de otra pantalla duplicada (N1); fila nueva en el Mapa de pantallas de `docs/PLAN.md` si hay pantalla o ruta nueva.
- [ ] Estados cargando, vacío, error y sin red resueltos.
- [ ] Probada mentalmente a 360×640 y con datos del peor caso (nombre largo, 300 filas, sin foto).
- [ ] Tocables ≥ 48 px (≥ 56 px en reparto), texto ≥ 16 px, contraste AA.
- [ ] Cero jerga ni códigos de error en pantalla; textos de plantilla.
- [ ] Peso de JS y imágenes dentro del presupuesto (cliente).
- [ ] Reintentar no duplica (idempotencia) en toda acción que mueva dinero o stock.
- [ ] Solo `lint` + `typecheck` de la app tocada; no builds ni servidores. Lo visual lo valida el dueño a mano.

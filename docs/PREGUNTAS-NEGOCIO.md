# Preguntas para el dueño

Cada pregunta puede cambiar el esquema. «Supuesto» = lo que ya está en `docs/CONTRATOS.md` mientras no
haya respuesta. Al responder: anotar la respuesta y la fecha aquí, y si cambia algo, editar CONTRATOS
antes que el código.

## Resueltas (2026-11-23)

Respuestas del dueño que movieron el centro del sistema del mostrador a pedidos + reparto.

| # | Pregunta | Respuesta | Efecto en el diseño |
|---|---|---|---|
| P8 | ¿Facturan (CFDI)? | **No facturan.** Los clientes son tiendas pequeñas (abarrotes, misceláneas), no mayoristas. | Sin CFDI ni RFC; fuera de alcance. |
| P9 | ¿Precios con IVA/IEPS? ¿Desglose? | **Precio final.** Nadie necesita el desglose. | Se quitaron `tasa_iva`, `tasa_ieps`, `base/ieps/iva` de producto, venta, líneas, ticket y reportes. |
| P10 | ¿Acreditan impuestos de las compras? | **No.** Costo = lo pagado. | Utilidad sobre precio final. |
| P13 | ¿Hacen reparto? ¿El repartidor cobra? | **Sí.** Reparto por rutas con camioneta y repartidor; cobra en la entrega (efectivo, transferencia o fiado) y cobra abonos en la siguiente visita. | Rutas, paradas, orden de carga LIFO, turno de ruta y liquidación (CONTRATOS §2.7–2.8). |
| P14 | ¿Levantan pedidos que se surten después? | **Sí, es lo principal.** Hoy piden por llamada o WhatsApp. | Pedido por enlace personal + captura por el personal (llamadas). Pedido → venta al entregar. |
| P2 | ¿Dos presentaciones con el mismo número de piezas? | Puede pasar (caja 24 y charola 24). | Se quitó la unicidad por factor; queda la de nombre por producto. |
| P6 | ¿Dan crédito? | **Sí, fiado** con saldo por cliente, límite y abonos (a menudo en la siguiente visita). | CxC, abonos en ruta, saldo inicial de libreta. Sigue abierto si se bloquea por vencido (abajo). |
| R1 | ¿«Tienda» y «cliente» son lo mismo? | **Sí: cliente.** Un solo término. | Entidad `cliente` con `tipo_negocio` (`tienda`, `miscelanea`, …). No hay entidad «tienda». |
| R2 | ¿Por dónde se avisa al cliente? | **Solo `wa.me`** (WhatsApp abierto a mano por el personal con texto prellenado). Sin WhatsApp Cloud API, sin SMS, sin push a clientes. | Cola de avisos por enviar (`aviso_cliente`) con plantillas; cada aviso lleva el enlace personal. Push solo para el personal. |
| R3 | ¿El cliente puede ver cómo va su pedido? | **Sí**, en el mismo enlace: etapas, línea de tiempo, «eres la parada 4 de 9», totales y saldo. | `fn_seguimiento_pedido`; hora estimada sin GPS. |
| R4 | ¿Qué pasa si falta un producto? | El personal marca faltante y propone sustituto o menos cantidad; **el cliente acepta o rechaza en su enlace**; el pedido espera con plazo y acción predeterminada configurable. | Estado `esperando_cliente`, `propuesta_faltante`/`propuesta_opcion`, `producto_equivalente`. |
| R5 | ¿Qué tan técnicos son los clientes? | **Nada**; se resisten a «hacer algo tecnológico». La facilidad de uso es lo primero. | Reglas UX comprobables (CONTRATOS §7) como criterio de salida de cada fase. |
| R6 | ¿Inventario o compra contra pedido? | **Ambos**: unos productos se tienen en bodega y otros se compran al distribuidor después de recibir los pedidos. | `producto.modo_surtido` y lista de surtido consolidada por proveedor. |
| R7 | ¿Cómo se organiza el sistema para el personal? | **Flujos claros, nada de tener una herramienta en distintos módulos.** | Menú por pasos del día; cada acción en una sola pantalla (CONTRATOS §7.3, «Mapa de pantallas» en PLAN). El repartidor trabaja desde `/reparto`, que enlaza a entregar y abonar. |
| R8 | ¿Quién trabaja y con qué? (P38) | **2 personas** (el dueño y un socio) hacen todo: despacho, surtir, reparto, cobro. Usan **Android** como herramienta principal; quien tenga iPhone usa la web. | Una sola interfaz: panel web + cascarón Android con WebView (push, cámara, ubicación). Roles: Dueño + Administrador con reparto, entrega y mostrador. Fase del cascarón sube a F4. |
| R9 | ¿Se aprueba guardar el token del enlace cifrado (no solo hash)? | **Sí, aprobado.** | `cliente_enlace.token_cifrado` + `SECRETO_ENLACES` (CONTRATOS §3). |
| R10 | ¿Se entrega fría la cerveza? | **No: se surte en caliente** (sin frío); la tienda enfría y revende. | Sin cadena de frío: nada de hielo, refrigeración ni «caliente» como motivo de devolución. Categorías de ejemplo: Cerveza, Refresco, Botana, Cigarros, Licores. |
| R11 | ¿Qué sistema usan hoy? (P26, parcial) | **Eleventa** (BambuCode), versión vieja. | Importación por script antes de que F3 salga a producción, lista de paridad y plan de transición (PLAN «Importar desde Eleventa»). |
| R12 | ¿Cómo evitar que usen el enlace solo para ver precios (o que lo pase a la competencia)? | PIN de 4 dígitos por navegador, alertas al personal (dispositivo nuevo, visitas sin pedido, inactividad) y enlace solo después de la primera compra. **Regla mayor: el sistema nunca quita el acceso solo; avisa y una persona decide.** | CONTRATOS §0, §3, §2.4; C1, C21; pruebas de F3. |

## Nuevas preguntas (operación de pedidos y reparto)

**P30. Repartidores: resuelto, son las mismas 2 personas. Falta confirmar: ¿es 1 camioneta? ¿Hace más de una vuelta al día? ¿Cuántas cajas le caben?**
Supuesto: 1 camioneta, una o dos rutas por día; una persona reparte mientras la otra despacha y surte.
El esquema ya soporta varias. `capacidad_cajas` solo avisa.

**P31. ¿Hay hora de corte? (ej. lo pedido antes de las 6 pm se entrega mañana)**
Supuesto: `hora_corte` solo se muestra en la página del cliente; despacho fija la fecha de entrega al
confirmar. Si debe ser regla, `fn_registrar_pedido` calcularía la fecha.

**P32. ¿El cliente puede cambiar o cancelar su pedido después de enviarlo? ¿Hasta cuándo?**
Supuesto: sí, mientras esté «recibido» (antes de que despacho lo confirme). Después, por llamada y lo
ajusta el personal.

**P33. Si cambia un precio entre que piden y que se entrega, ¿cuál se cobra?**
(Resuelto en parte: el precio se congela **cuando el cliente confirma**; los borradores —«repetir», «lo de
siempre»— nunca traen precios viejos y muestran los cambios.)
Supuesto: el del momento en que pidieron (lo que vieron). Despacho puede cambiarlo con permiso.

**P34. ¿Cómo dividen la ciudad? ¿Por colonia, por día de la semana, por repartidor fijo?**
Supuesto: zonas libres (catálogo) + días de visita por cliente; la ruta se arma por fecha y zona.

**P35. ¿Al cliente le pueden mostrar su saldo de fiado en su enlace?**
Supuesto: sí, en una línea («Debes $1,250 · te quedan $750»). Si no, se oculta con una configuración.

**P36. ¿A qué distribuidores van a surtir (Modelo/Corona, Heineken/Tecate, abarrotera…)? ¿Le mandan la lista por WhatsApp o van en persona?**
Supuesto: un proveedor habitual por producto agrupa la lista; la lista se imprime o se manda por `wa.me`.

**P37. ¿El socio (Administrador) puede ver costos y utilidad, y cambiar precios? ¿O ambos son Dueño?**
Supuesto: no; solo el dueño (`costos.ver`, `precios.editar`, `pedidos.cambiar_precio`). Si son socios
parejos, se le da rol Dueño y listo (sin cambio de esquema).

**P39. ¿Cobran envío o hay pedido mínimo para reparto?**
Supuesto: no hay cobro de envío; `pedido_minimo` existe en configuración (0 = sin mínimo). Cobrar envío
sería una línea de cargo en el pedido y la venta.

**P40. Cuando falta un producto, ¿cuánto tiempo esperan la respuesta del cliente y qué hacen si no contesta?**
Supuesto: 60 min; si no contesta, se quita la línea (`faltante_accion_predeterminada = quitar`); opción
«reducir» si se ofreció. Nunca se manda un sustituto que no aceptó.

**P41. ¿Qué productos se sustituyen entre sí? (Corona ↔ Victoria, Tecate ↔ Indio…)**
Supuesto: el personal los configura por producto (`producto_equivalente`); se sugieren, no se aplican solos.

**P42. ¿Qué datos de pago por transferencia se le dan al cliente (CLABE, banco)? ¿Quién revisa que llegó?**
Supuesto: la CLABE va en una plantilla; el repartidor captura referencia y foto opcional; el
administrador marca «verificada» viendo el banco. No hay conciliación automática.

**P43. ¿El cliente debe ver si un producto está agotado antes de pedirlo?**
Supuesto: no; se pide normal y si falta, se resuelve con faltantes (no se expone existencia).

**P44. ¿Entregan en horario o franja (mañana/tarde)? ¿El cliente puede pedir hora?**
Supuesto: solo fecha; la hora estimada sale del orden de la ruta.

**P45. ¿Quién arma y quién liquida la ruta? ¿El repartidor se lleva fondo de cambio? ¿Gastos en el camino (gasolina, casetas)?**
Supuesto: con 2 personas, quien no reparte arma la ruta y quien tenga `rutas.liquidar` liquida (puede ser
la misma persona que repartió); fondo opcional; gastos como «salida» con motivo en el turno de ruta.

## Lote de funciones aprobadas (2026-11-23) — decisiones abiertas

**P49. ¿Se cae el internet en la bodega? ¿Seguido?**
Supuesto: casi nunca; si pasa, se comparten datos móviles del teléfono. No se diseña modo sin conexión.

**P50. ¿Qué margen quieren ganar? ¿Igual para todo o distinto por categoría (cerveza vs botana)?**
Supuesto: 15 % global; se ajusta por categoría o producto. Precio sugerido redondeado hacia arriba a $5
(`precio_redondeo`); ¿prefieren $1, $0.50?

**P51. «¿Te mando lo de siempre?»: ¿a qué hora mandarlo, cuánto esperar la respuesta y a quién no mandarlo?**
Supuesto: 8:00, vigencia 24 h, tolerancia 1 día sobre su ritmo normal, solo clientes con ≥ 3 pedidos;
cada cliente se puede excluir.

**P52. ¿Qué fechas les suben las ventas? (quincena, puentes, partidos, Semana Santa, fiestas del pueblo)**
Supuesto: quincena ×1.3 y Semana Santa sembradas; el dueño agrega el resto en el calendario. Cobertura de
compra 7 días con promedio de 28 días de ventas.

**P53. ¿Cuándo un fiado es «rojo»?**
Supuesto: más de 15 días vencido o saldo arriba de su límite; amarillo si tiene algo vencido o paga más
lento que sus días de crédito.

**P54. Respaldo fuera del servidor: ¿a dónde? (otra computadora por SFTP, Google Drive del dueño)**
Supuesto: Google Drive del dueño con rclone (gratis). Sin servicios de pago.

**P55. Lealtad (F11): ¿la quieren? ¿Cada cuántas cajas y qué regalan?**
Supuesto: apagada; si se prende, cada 10 cajas de presentaciones marcadas, 1 caja de una presentación
elegida, a precio 0.

**P56. ¿Quién recibe el resumen del día y con qué datos? (¿la ganancia también?)**
Supuesto: solo el dueño, con ganancia; lo genera quien cierra el día.

**P57. Alertas del enlace: ¿con cuántas visitas sin pedido avisamos y después de cuántos días sin pedir?**
Supuesto: 5 aperturas en 14 días sin pedido; inactivo a los 30 días. ¿Mandar el enlace solo a quien ya
compró (supuesto: sí, con opción de forzar)?

## Productos y presentaciones

**P1. ¿Venden pieza suelta o solo six, caja o media caja?**
Supuesto: todo producto tiene presentación «Pieza» (factor 1) para el inventario; `se_vende = false` si
no se vende suelta.

**P3. ¿Venden barril (keg) o algo que no sea por pieza entera?**
Supuesto: no. Todo es pieza entera (`integer`). Si sí, las cantidades pasan a `numeric` en toda la base.

**P23. ¿Venden otras cosas además de cerveza (refresco, botanas, cigarros, licores)?**
Supuesto: sí, mismo catálogo por categoría.

## Precios

**P4. ¿El precio depende del tipo de cliente, de la cantidad, o de ambos?**
Supuesto: listas de precio; cada cliente tiene una. Sin escalones por cantidad. Si hay escalones («desde 10
cajas a $X»), ya está el boceto `precio_escala` (CONTRATOS §2.12 A4) y se crea en una migración nueva.

**P5. ¿Pueden cambiar el precio o dar descuento en el momento?**
Supuesto: solo con permiso (dueño). Sin campo de descuento.

**P27. ¿Con otra sucursal, mismos precios?**
Supuesto: precios globales.

## Compras y costo

**P11. ¿Cómo vienen las promociones del distribuidor?**
Supuesto: producto gratis = línea a costo 0; descuento en factura = costo ya rebajado.

**P12. ¿Compran a crédito al distribuidor y quieren controlar lo que deben?**
Supuesto: no; `condicion_pago` es informativa.

**P18. ¿Les importa la caducidad o el lote?**
Parcial: caducidad **opcional** por línea de compra + reporte «por caducar» (estimado PEPS) + merma con
causa `caducado`. Sigue el supuesto de no llevar lotes.

## Inventario

**P17. ¿Venden mercancía que llegó y no se capturó (en negativo)?**
Supuesto: no, **tampoco en compra contra pedido**: la compra se registra antes de cargar la ruta (la
carga lo exige). Si en la práctica compran en camino y entregan sin pasar por la bodega, habría que
permitir negativo para `contra_pedido` y cambiar el costeo de esas piezas.

**P19. ¿Cada cuánto cuentan la bodega?**
Supuesto: conteo por producto que genera ajuste.

**P22. ¿Segunda sucursal o bodega?**
Supuesto: el esquema separa por `sucursal_id`; sin pantallas de traspaso.

## Ventas de mostrador, caja y devoluciones

**P15. ¿Cuántas cajas cobran a la vez en mostrador?**
Supuesto: una caja «Mostrador», un turno por usuario.

**P16. ¿Aceptan tarjeta con terminal?**
Supuesto: sí, se registra (sin integrar la terminal).

**P20. ¿Los clientes devuelven producto? ¿Efectivo o se abona?**
Supuesto: devolución parcial; baja primero el saldo; el repartidor puede recibirla en la visita.

**P21. ¿Quién puede cancelar una venta y hasta cuándo?**
Supuesto: solo el dueño, sin límite de tiempo, con motivo.

**P24. ¿Imprimen ticket en mostrador?**
Supuesto: ticket HTML de 80 mm. En ruta no se imprime: nota de entrega por `wa.me`.

**P28. ¿Pagan comisión a vendedores o repartidores?**
Supuesto: no se calcula; el reporte de entregas por repartidor da la base.

## Crédito y cobranza

**P6b. ¿Se le sigue fiando a quien ya tiene saldo vencido?**
Supuesto: sí; solo bloquea pasar el límite.

**P29. ¿Pagos por adelantado o saldo a favor?**
Supuesto: no; un abono no puede pasar del saldo.

## Envases

**P7. ¿Manejan envase retornable? ¿Depósito o cambio de vacío por lleno? ¿Cuenta por cliente?**
Supuesto: no se controla (F10 diferida). `producto.tipo_envase = 'retornable'` solo lo marca. Con reparto
es más probable que importe: si cobran o cambian envases en la entrega, sube de prioridad antes de F9.

## Usuarios y datos

**P25. ¿Recuperar contraseña por correo?**
Supuesto: la restablece el dueño.

**P26. Datos del sistema viejo** — parcial: usan Eleventa (R11). Ver P46–P48.
Supuesto: se importan productos, clientes, existencias y saldos de fiado desde Eleventa; lo que no esté
ahí (libreta) se captura como saldo inicial.

**P46. ¿Qué versión exacta de Eleventa? (Ayuda → Acerca de)**
Supuesto: una vieja que exporta Productos y Clientes a Excel/CSV.

**P47. ¿Pueden exportar Productos, Clientes (con saldo) e Inventario a Excel desde Eleventa, o darnos una copia del archivo de la base (Firebird, un `.fdb`, normalmente en la carpeta de datos de Eleventa)?**
Supuesto: exportan a Excel; la copia del `.fdb` es el plan B (se lee una **copia**, nunca el original).

**P48. ¿Qué usan de Eleventa todos los días?** crédito de clientes (abonos, estado de cuenta), corte de
caja, impresión de ticket (¿qué impresora?), lector de código de barras, precio de mayoreo, departamentos,
otra cosa (inventario por proveedor, promociones, kits).
Supuesto: crédito, corte, ticket, escáner, mayoreo y departamentos. Es la lista de paridad (PLAN): nada
de eso puede faltar el día del cambio.

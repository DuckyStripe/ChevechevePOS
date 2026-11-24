/** Formas de CONTRATOS §4.4 (F1). */
export type Yo = {
  id: number | string;
  usuario: string;
  nombre: string;
  rol: { id: number | string; nombre: string };
  permisos: string[];
  sucursal: { id: number | string; nombre: string };
  debe_cambiar_contrasena: boolean;
  turno_abierto: { id: number | string; tipo: string; caja_id: number | string | null; ruta_id: number | string | null } | null;
  notificaciones_sin_leer: number;
};

export type Lista<T> = { items: T[]; total: number; pagina: number; por_pagina: number };

export type Usuario = {
  id: number | string;
  usuario: string;
  nombre: string;
  telefono: string | null;
  rol: { id: number | string; nombre: string };
  activo: boolean;
  debe_cambiar_contrasena: boolean;
  bloqueado_hasta: string | null;
  creado_en: string;
};

export type Rol = {
  id: number | string;
  nombre: string;
  descripcion: string | null;
  es_sistema: boolean;
  permisos: string[];
  num_usuarios: number;
};

export type Permiso = { codigo: string; modulo: string; descripcion: string };

export type Plantilla = { clave: string; canal: "whatsapp" | "push" | "pantalla"; titulo: string | null; texto: string; variables: string[] };

export type Notificacion = {
  id: number | string;
  evento: string;
  titulo: string;
  cuerpo: string;
  datos: { ruta?: string } & Record<string, unknown>;
  creado_en: string;
  leida_en: string | null;
};

export type Preferencia = { evento: string; push: boolean };

/** `GET /auditoria`: el contrato no detalla las filas; se asumen las columnas de `app.auditoria` (+ nombre de usuario opcional). */
export type Auditoria = {
  id: number | string;
  usuario_id: number | string | null;
  usuario_nombre?: string | null;
  tabla: string;
  registro_id: string;
  accion: "insertar" | "actualizar" | "borrar";
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  creado_en: string;
};

/* ---------- F2: catálogo, inventario, proveedores, compras (CONTRATOS §4.4) ---------- */

export type Ref = { id: number | string; nombre: string };

export type PrecioPresentacion = { lista_precio_id: number | string; precio: string };
export type Presentacion = {
  id: number | string;
  nombre: string;
  factor: number;
  codigo_barras: string | null;
  se_vende: boolean;
  se_compra: boolean;
  activa: boolean;
  precios: PrecioPresentacion[];
  /** F11: la presentación suma al programa de lealtad. */
  cuenta_lealtad?: boolean;
};
/** `categoria`, `marca` y `proveedor` se asumen `{id, nombre}`; `formato.ts` tolera también un string. */
export type Producto = {
  id: number | string;
  nombre: string;
  sku: string | null;
  descripcion: string | null;
  alias: string[];
  categoria: Ref | string | null;
  marca: Ref | string | null;
  contenido_ml: number | null;
  tipo_envase: "lata" | "botella" | "retornable" | null;
  imagen: string | null;
  modo_surtido: "inventario" | "contra_pedido";
  margen_objetivo: string | null;
  proveedor: Ref | string | null;
  existencia_minima: number;
  activo: boolean;
  existencia: number;
  comprometido: number;
  costo_promedio?: string | null;
  ultimo_costo?: string | null;
  presentaciones: Presentacion[];
};

export type Categoria = { id: number | string; nombre: string; orden: number; margen_objetivo: string | null; activa: boolean };
export type Marca = { id: number | string; nombre: string; activa: boolean };
export type ListaPrecio = { id: number | string; nombre: string; es_predeterminada: boolean; activa: boolean };
export type Proveedor = { id: number | string; nombre: string; telefono: string | null; contacto: string | null; notas: string | null; activo: boolean };

export type Oferta = {
  id: number | string;
  presentacion_id: number | string;
  producto: string;
  presentacion: string;
  lista_precio_id: number | string | null;
  lista: string | null;
  precio: string;
  precio_normal: string | null;
  desde: string;
  hasta: string;
  motivo: "por_caducar" | "promocion";
  vigente: boolean;
};

export type PrecioSugerido = {
  presentacion_id: number | string;
  lista_precio_id: number | string;
  precio: string | null;
  precio_sugerido: string | null;
  margen: string | null;
  objetivo: string | null;
};
export type PrecioBajoCosto = { presentacion_id: number | string; lista_precio_id: number | string; costo_presentacion: string; diferencia: string };
export type AdvertenciaPrecio = { presentacion_id: number | string; lista_precio_id: number | string; precio: string; costo_presentacion: string };

export type Existencia = {
  producto_id: number | string;
  producto: string;
  categoria: Ref | string | null;
  modo_surtido: "inventario" | "contra_pedido";
  cantidad: number;
  cajas: number;
  sueltas: number;
  existencia_minima: number;
  costo_promedio?: string | null;
  valor?: string | null;
};

export type Movimiento = {
  id: number | string;
  producto_id?: number | string;
  producto?: string;
  tipo: string;
  cantidad: number;
  costo_unitario?: string | null;
  existencia_resultante: number;
  causa_merma: string | null;
  motivo: string | null;
  usuario?: Ref | string | null;
  creado_en: string;
};

export type PorCaducar = {
  producto_id: number | string;
  producto: string;
  presentacion_id?: number | string | null;
  compra_folio: string;
  caduca_el: string;
  piezas_estimadas: number;
  dias_restantes: number;
};

export type CompraResumen = {
  id: number | string;
  folio: string;
  proveedor: Ref | string | null;
  folio_proveedor: string | null;
  fecha: string;
  condicion_pago: "contado" | "credito";
  estado: "registrada" | "cancelada";
  total: string;
};
export type CompraLinea = {
  id?: number | string;
  producto_id?: number | string;
  presentacion_id: number | string;
  producto: string;
  presentacion: string;
  factor: number;
  cantidad: number;
  piezas: number;
  costo_presentacion?: string | null;
  importe?: string | null;
  caduca_el: string | null;
};
export type CompraDetalle = CompraResumen & {
  fecha_surtido: string | null;
  notas: string | null;
  motivo_cancelacion: string | null;
  lineas: CompraLinea[];
};

export type MargenCompra = {
  producto_id: number | string;
  producto: string;
  costo_anterior: string | null;
  costo_nuevo: string | null;
  presentacion_id: number | string;
  presentacion: string;
  lista_precio_id: number | string;
  lista: string;
  precio: string | null;
  costo_presentacion: string | null;
  margen: string | null;
  objetivo: string | null;
  alerta: "bajo_costo" | "margen_bajo" | null;
  precio_sugerido: string | null;
};

/** `GET /presentaciones/codigo/:codigo` */
export type ArticuloPos = { presentacion_id: number | string; producto_id: number | string; producto: string; presentacion: string; factor: number; codigo_barras: string | null; se_compra?: boolean };

/* ---------- F3: clientes, enlace, pedidos, avisos, despacho (CONTRATOS §4.4) ---------- */

export type Zona = { id: number | string; nombre: string; activa: boolean };

export type EstadoEnlace = "activo" | "sin_activar" | "dado_de_baja" | "sin_link";
export type ClienteFila = {
  id: number | string;
  nombre: string;
  tipo_negocio: string;
  zona: Ref | null;
  telefono_whatsapp: string | null;
  dias_visita: number[];
  tiene_ubicacion: boolean;
  tiene_propuesta: boolean;
  tiene_enlace: boolean;
  lista_precio: Ref | string | null;
  limite_credito: string;
  saldo?: string | null;
  vencido?: string | null;
  activo: boolean;
  alertas?: string[];
  enlace?: { estado: EstadoEnlace; baja: { en: string; motivo: string; nota: string | null; por: Ref | string | null } | null };
};

/** `GET /clientes/:id`: el contrato lista solo lo nuevo; el resto se asume de las columnas de §2.4. */
export type ClienteDetalle = Omit<ClienteFila, "enlace"> & {
  contacto?: string | null;
  direccion?: string | null;
  referencias?: string | null;
  notas?: string | null;
  dias_credito?: number;
  sugerir_pedido?: boolean;
  lista_precio_id?: number | string | null;
  lat?: string | null;
  lng?: string | null;
  lat_propuesta?: string | null;
  lng_propuesta?: string | null;
  proxima_visita?: string | null;
  disponible?: string | null; // F7
  semaforo?: Semaforo | null; // F7
  enlace: { creado_en: string; ultimo_uso_en: string | null } | null;
  frecuentes: { presentacion_id: number | string; veces: number; ultima_cantidad: number }[];
  ultimo_pedido: { id: number | string; folio: string; fecha: string; lineas: { presentacion_id: number | string; cantidad: number }[] } | null;
};

export type Dispositivo = { id: number | string; navegador: string | null; primer_uso_en: string; ultimo_uso_en: string };

export type PedidoFila = {
  id: number | string;
  folio: string;
  cliente: Ref;
  zona: Ref | null;
  origen: "enlace" | "captura" | "sugerido";
  estado: string;
  entrega_tipo: "reparto" | "recoge";
  fecha_solicitada: string | null;
  fecha_entrega: string | null;
  total: string;
  num_lineas: number;
  requiere_surtido: boolean;
  faltantes_pendientes?: number;
  ruta?: Ref | null;
  creado_en: string;
  version: number;
};

export type OpcionFaltante = { id: number | string; tipo: "sustituto" | "reducir"; producto: string; presentacion: string; imagen?: string | null; cantidad: number; precio_unitario: string; importe: string };
export type PropuestaFaltante = {
  id: number | string;
  pedido_linea_id?: number | string;
  estado: "pendiente" | "aceptada" | "rechazada" | "vencida" | "cancelada";
  causa?: string;
  nota: string | null;
  limite_en: string;
  opciones: OpcionFaltante[];
};

export type PedidoLinea = {
  id: number | string;
  numero?: number;
  presentacion_id: number | string;
  producto: string;
  presentacion: string;
  factor?: number;
  cantidad_pedida: number;
  cantidad: number;
  precio_unitario: string;
  importe: string;
  estado: "activa" | "faltante" | "sustituida" | "quitada";
  motivo_ajuste: string | null;
  disponible_piezas?: number | null;
};

/** `GET /pedidos/:id`: pedido + lineas + eventos + cliente. Las propuestas no estan detalladas en el contrato: se asumen en `propuestas`. */
export type PedidoDetalle = Omit<PedidoFila, "cliente"> & {
  cliente: Ref & { telefono_whatsapp?: string | null; saldo?: string | null };
  notas: string | null;
  notas_internas: string | null;
  respuesta_limite_en?: string | null;
  lineas: PedidoLinea[];
  eventos: { id?: number | string; tipo: string; detalle?: Record<string, unknown>; usuario?: Ref | string | null; creado_en: string }[];
  propuestas?: PropuestaFaltante[];
};

export type Sugerencia = { presentacion_id: number | string; producto: string; presentacion: string; factor: number; precio: string; disponible_piezas: number; imagen: string | null };

export type LineaInterpretada = {
  texto: string;
  cantidad: number;
  presentacion_id?: number | string | null;
  color: "verde" | "amarillo" | "rojo";
  candidatos: { presentacion_id: number | string; producto: string; presentacion: string; precio: string; puntaje: number }[];
};

export type Aviso = {
  id: number | string;
  cliente: Ref | string | null;
  pedido_folio: string | null;
  plantilla: string;
  estado: "pendiente" | "enviado" | "descartado";
  creado_en: string;
  telefono_completo: boolean;
  texto: string;
  url: string | null;
};

export type Despacho = {
  fecha: string;
  pedidos?: {
    por_confirmar: number;
    esperando_cliente: number;
    faltantes_vencen_1h: number;
    confirmados_sin_ruta: number;
    recoge?: number;
    por_zona?: { zona: string; pedidos: number; sin_ruta: number; total: string }[];
  };
  surtido?: { productos_por_comprar: number }; // F5
  rutas?: { lista: { id: string; folio: string; nombre: string | null; estado: string; repartidor: string; paradas: number; entregadas: number }[]; por_cargar: number; en_curso: number; por_liquidar?: number }; // F6; por_liquidar F7
  cierre?: { transferencias_por_verificar: number; turnos_mostrador_abiertos: number }; // F7
  avisos_pendientes?: number;
  respaldo?: { ultimo: string | null; ok: boolean; vencido: boolean };
};

export type ArticuloVenta = {
  presentacion_id: number | string;
  producto_id: number | string;
  producto: string;
  presentacion: string;
  factor: number;
  codigo_barras: string | null;
  categoria_id?: number | string | null;
  marca?: Ref | string | null;
  imagen: string | null;
  precio: string | null;
  existencia_piezas: number;
  disponible_piezas: number;
};

export type Equivalente = { producto_id: number | string; producto: string; orden: number };

/* ----- Enlace del cliente: /api/publico/* (nunca existencias ni costos) ----- */

export type ClientePublico = {
  id: string;
  nombre: string;
  negocio: { nombre: string; whatsapp: string | null };
  pedido_minimo: string;
  hora_corte: string | null;
  dias_visita: number[];
  proxima_visita: string | null;
  tiene_ubicacion: boolean;
  credito: { limite: string; saldo: string; disponible: string } | null;
  textos: { bienvenida: string; aviso_ubicacion: string };
  pedido_propuesto?: { id: number | string } | null;
  faltante_accion_predeterminada?: "quitar" | "reducir";
  faltante_minutos_respuesta?: number;
  /** F11 (C19): `texto` ya viene armado por la API; `null` con la lealtad apagada. */
  lealtad?: { llevas: number; meta: number; premio: boolean; texto: string } | null;
};

export type LineaVista = {
  presentacion_id: number | string;
  producto: string;
  presentacion: string;
  cantidad: number;
  precio_actual: string;
  precio_anterior: string | null;
  cambio: "sube" | "baja" | null;
};
export type VistaBorrador = { lineas: LineaVista[]; quitadas: { producto: string; motivo: string }[]; total_actual: string; hay_cambios: boolean };

export type ArticuloPublico = {
  presentacion_id: number | string;
  producto: string;
  presentacion: string;
  factor: number;
  categoria_id: number | string | null;
  marca: string | null;
  contenido_ml: number | null;
  tipo_envase: string | null;
  miniatura: string | null;
  imagen: string | null;
  precio: string;
  favorito: boolean;
  buscar: string;
  oferta?: { precio_normal: string; hasta: string } | null;
};

export type CatalogoPublico = {
  categorias: { id: number | string; nombre: string }[];
  articulos: ArticuloPublico[];
  frecuentes: { presentacion_id: number | string; ultima_cantidad: number }[];
  ultimo_pedido: { folio: string; fecha: string; vista: VistaBorrador } | null;
  /** F11 (C18): máximo 3; solo el id de un artículo del mismo catálogo. */
  sugerencias_zona?: { presentacion_id: number | string }[];
  version: string;
};

export type PedidoPublicoFila = {
  id: number | string;
  folio: string;
  etapa: string;
  etiqueta: string;
  total: string;
  fecha_entrega: string | null;
  creado_en: string;
  editable: boolean;
  faltantes_pendientes: number;
  reparto: { parada: number; paradas: number } | null;
};

export type Seguimiento = {
  id: string;
  /** `null` mientras un pedido sugerido esta propuesto (el folio nace al aceptar). */
  folio: string | null;
  etapa: string;
  etiqueta: string;
  /** `null` mientras el pedido esta `propuesto` (la 004 no manda precios de un borrador). */
  total: string | null;
  fecha_entrega: string | null;
  entrega_tipo: "reparto" | "recoge";
  lineas: {
    id: string;
    presentacion_id: string;
    producto: string;
    presentacion: string;
    cantidad_pedida: number;
    cantidad: number;
    cantidad_entregada: number | null;
    estado: string;
    motivo_ajuste: string | null;
    precio_unitario: string | null;
    importe: string | null;
  }[];
  faltantes: { propuesta_id: number | string; linea: string | { producto: string; presentacion: string; cantidad: number }; causa: string; nota: string | null; limite_en: string; opciones: OpcionFaltante[] }[];
  linea_tiempo: { etapa: string; en: string; etiqueta: string }[];
  reparto: { parada: number; paradas: number; antes_que_tu: number; llegada_estimada_desde: string; llegada_estimada_hasta: string } | null;
  editable: boolean;
  /** Quién recibió la entrega (F7, solo en `entregado`; la foto nunca sale al cliente). */
  recibio?: string | null;
  /** Solo `propuesto` (`fn_vista_borrador`); el contrato no da el nombre del campo, la migracion 004 lo llama `borrador`. */
  borrador?: VistaBorrador | null;
};

export type PedidoEnviado = { id: number | string; folio: string; total: string; estado: string; texto_confirmacion: string; avisar_negocio?: { url: string } | null };

// --- Cascarón Android (F4, CONTRATOS §4.6): lo que el cascarón le cuenta a la página por el puente.
export type NovedadApp = { version: string; fecha: string; items: string[] };
export type EstadoApp = {
  version: string;
  version_code: number | null;
  ota_id: string | null;
  ota_fecha: string | null;
  resultado: "al_dia" | "lista" | "apk" | "sin_red";
  novedades: NovedadApp[];
};
export type PushToken = { token: string | null; motivo?: "sin_permiso" | "error"; plataforma?: "android"; version?: string };

// --- F5: lista de surtido y compra inteligente (CONTRATOS §2.6, §4.4). Los costos solo vienen con `costos.ver`.
export type LineaSurtido = {
  producto_id: number | string;
  producto: string;
  modo_surtido: "inventario" | "contra_pedido";
  piezas_pedidas: number;
  existencia: number;
  comprometido_previo: number;
  disponible: number;
  piezas_a_comprar: number;
  reponer_minimo: number;
  presentacion_id: number | string | null;
  presentacion: string | null;
  factor: number | null;
  cantidad_sugerida: number | null;
  sugerido_demanda: number;
  sin_presentacion_compra: boolean;
  promocion_id: number | string | null;
  ultimo_costo?: string | null;
  costo_estimado?: string | null;
  costo_promocion?: string | null;
  ahorro?: string | null;
};
export type GrupoSurtido = {
  proveedor_id: number | string | null;
  proveedor: string | null;
  telefono: string | null;
  lineas: LineaSurtido[];
  costo_estimado?: string | null;
  sin_costo_previo?: number;
};
export type Surtido = { fecha: string; proveedores: GrupoSurtido[]; totales: { productos: number; costo_estimado?: string | null; sin_costo_previo?: number } };
export type MensajeSurtido = { telefono: string | null; texto: string; telefono_invalido: boolean };
export type Promocion = {
  id: number | string;
  proveedor: Ref;
  presentacion: { id: number | string; nombre: string; factor: number };
  producto: Ref;
  costo_presentacion: string;
  minimo_cantidad: number;
  desde: string;
  hasta: string;
  vigente: boolean;
  notas: string | null;
};
export type FechaDemanda = { fecha: string; nombre: string; factor: string };
export type CalendarioDemanda = { anio: number; items: FechaDemanda[]; total: number };

// F6: rutas, orden de carga y reparto (CONTRATOS §4.4 «Rutas y reparto»).
export type Vehiculo = { id: string; nombre: string; placas: string | null; capacidad_cajas: number | null; activo: boolean };
export type RutaEstado = "planeada" | "cargada" | "en_curso" | "terminada" | "liquidada" | "cancelada";
export type RutaResumen = {
  id: string;
  folio: string;
  fecha: string;
  nombre: string | null;
  vehiculo: { id: string; nombre: string };
  repartidor: { id: string; nombre: string };
  estado: RutaEstado;
  paradas: number;
  entregadas: number;
  distancia_km: string | null;
};
export type LineaRuta = { cantidad: number; presentacion: string; producto: string };
export type ParadaRuta = {
  id: string;
  orden: number;
  tipo: "entrega" | "cobro";
  estado: "pendiente" | "visitada" | "fallida" | "omitida";
  km_desde_anterior: string | null;
  nota: string | null;
  cliente: {
    id: string;
    nombre: string;
    direccion: string | null;
    referencias: string | null;
    telefono_whatsapp: string | null;
    lat: string | null;
    lng: string | null;
    zona: { id: string; nombre: string } | null;
    saldo?: string | null; // F7
    vencido?: string | null; // F7
  };
  pedido: { id: string; folio: string; total: string; estado: string; lineas: LineaRuta[] } | null;
  navegar: { google: string; waze: string } | null;
};
export type RutaDetalle = RutaResumen & {
  capacidad_cajas: number | null;
  cajas_totales: number;
  optimizada_en: string | null;
  cargada_en: string | null;
  iniciada_en: string | null;
  terminada_en: string | null;
  paradas: ParadaRuta[];
  navegar_ruta: string[];
  turno?: { id: string; fondo_inicial: string } | null; // F7
};
export type CandidatoRuta = { id: string; folio: string; cliente: { id: string; nombre: string }; estado: string; total: string; tiene_ubicacion: boolean };
export type CandidatosRuta = { zonas: { zona: { id: string; nombre: string } | null; pedidos: CandidatoRuta[] }[] };
export type OrdenCarga = {
  paradas: { carga_n: number; orden: number; cliente: string; zona: string | null; pedido_folio: string | null; lineas: LineaRuta[] }[];
  totales: { producto: string; presentacion: string; cantidad: number; piezas: number }[];
  cajas_totales: number;
  /** F11: regalos de lealtad que deben subir con su parada; `[]` con la lealtad apagada. */
  regalos?: { carga_n: number; cliente: string; producto: string; presentacion: string; cantidad: number }[];
};
export type Repartidor = { id: string; nombre: string };

/* ---------- F7: entrega, cobro, caja, cobranza, cierre (CONTRATOS §2.8, §4.4). Donde el contrato no detalla la fila, se asume y se avisa. ---------- */

export type Semaforo = { color: "verde" | "amarillo" | "rojo"; dias_promedio_pago: string | number | null; max_dias_vencido: string | number; limite_sugerido: string };

export type TurnoCaja = {
  id: string;
  tipo: "mostrador" | "ruta";
  caja_id: string | null;
  ruta_id: string | null;
  usuario?: Ref | string | null;
  caja?: Ref | null;
  estado: "abierto" | "cerrado";
  fondo_inicial: string;
  fondo?: string;
  abierto_en: string;
  cerrado_en?: string | null;
  efectivo_esperado?: string | null;
  efectivo_contado?: string | null;
  diferencia?: string | null;
};
export type Caja = { id: string; nombre: string; activa: boolean; turno_abierto: { id: string; usuario: string } | null };
export type MovimientoCaja = { id: string; tipo: "entrada" | "salida" | "retiro" | "reembolso"; monto: string; motivo: string | null; creado_en: string };

/** `fn_resumen_turno` (+ en ruta `transferencias` y `devoluciones_producto`; la liquidación agrega `movimientos`). */
export type ResumenTurno = {
  tipo: "mostrador" | "ruta";
  fondo_inicial: string;
  ventas: { num: number | string; canceladas: number | string; efectivo: string; transferencia: string; tarjeta: string; credito: string };
  abonos: { efectivo: string; transferencia: string; tarjeta: string };
  entradas: string;
  salidas: string;
  retiros: string;
  reembolsos: string;
  efectivo_esperado: string;
  efectivo_contado: string | null;
  diferencia: string | null;
  transferencias?: { folio: string; cliente: string; monto: string; referencia: string | null; comprobante?: string | null; verificado: boolean }[];
  devoluciones_producto?: { producto: string; piezas: number }[];
  movimientos?: MovimientoCaja[];
};

export type ResultadoEntrega = {
  venta: { id: string; folio: string; total: string; cambio?: string | null };
  pedido?: unknown;
  saldo_cliente: string | { saldo: string; vencido?: string; disponible?: string } | null;
  aviso: Aviso | null;
  /** F11: regalo de lealtad que se entrega además del pedido; `null` si no hay. */
  regalo?: RegaloEntrega;
};
export type ResultadoAbono = { id: string; folio: string; aplicaciones?: unknown; saldo_cliente: string | { saldo: string; vencido?: string; disponible?: string } | null };

export type CuentaPorCobrar = {
  id: string;
  cliente: Ref | string;
  cliente_id?: string;
  origen: string;
  venta_folio: string | null;
  concepto: string | null;
  creado_en: string;
  vence_el: string;
  monto: string;
  saldo: string;
  estado: string;
  dias_vencida: number | string;
};
export type AbonoFila = {
  id: string;
  folio: string;
  cliente: Ref | string;
  metodo: string;
  monto: string;
  estado: "aplicado" | "cancelado";
  creado_en: string;
  verificado?: boolean;
};
export type Transferencia = { tabla: "venta_pago" | "abono"; id: string; folio: string; cliente: string; monto: string; referencia: string | null; comprobante: string | null; ruta: string | null; verificado_en: string | null };

export type VentaFila = { id: string; folio: string; creado_en: string; cliente: Ref | string | null; usuario?: Ref | string | null; origen: string; estado: "completada" | "cancelada"; total: string };
export type VentaDetalle = VentaFila & {
  motivo_cancelacion?: string | null;
  lineas: { id: string; cantidad: number; presentacion: string; producto: string; precio_unitario: string; importe: string; piezas?: number; piezas_devueltas?: number }[];
  pagos: { metodo: string; monto: string; referencia?: string | null }[];
  utilidad?: string | null;
};

export type EstadoCuenta = {
  cliente: { id: string; nombre: string };
  negocio?: { nombre?: string };
  saldo_inicial: string;
  movimientos: { fecha: string; tipo: string; folio: string | null; concepto: string | null; cargo: string | null; abono: string | null; saldo: string }[];
  saldo_final: string;
  vencido: string;
};

export type ResumenDia = {
  vendido: string;
  ganancia: string | null;
  cobrado: { efectivo: string; transferencia: string };
  fiado_nuevo: string;
  por_cobrar: string;
  por_comprar: { productos: number | string; costo_estimado: string | null };
};
export type SugerenciaCobro = { cliente_id: string; nombre: string; zona: string | null; vencido: string; saldo: string };

/* ---------- F8: ticket y vista previa de cobro (apps/api: ventas y cobrar; el contrato no los detalla del todo) ---------- */

/** `POST /ventas` y `GET /ventas/:id/ticket`. */
export type Ticket = {
  venta_id: string;
  folio: string;
  fecha: string;
  estado?: string;
  negocio: { nombre: string | null; direccion: string | null; telefono: string | null; pie: string | null };
  usuario: Ref;
  cliente: Ref | null;
  lineas: { cantidad: number; presentacion: string; producto: string; precio_unitario: string; importe: string; regalo?: boolean }[];
  total: string;
  pagos: { metodo: string; monto: string; referencia: string | null }[];
  efectivo_recibido: string | null;
  cambio: string | null;
  saldo_credito: string | null;
};

/** `POST /cobrar/vista`: todo calculado en SQL; la web solo lo muestra. `saldo` y `limite` son null sin cliente. */
export type VistaCobro = {
  total: string;
  pagos: { metodo: string; monto: string }[];
  pagado: string;
  credito: string;
  falta: string;
  cuadra: boolean;
  cambio: string | null;
  efectivo_insuficiente: boolean;
  saldo: string | null;
  saldo_despues: string | null;
  limite: string | null;
  disponible_despues: string | null;
  excede_limite: boolean | null;
};

/* ---------- F7: `GET /cobrar/contexto` (apps/api/src/modulos/cobrar) ---------- */

export type ClienteCobro = {
  id: string;
  nombre: string;
  saldo: string;
  vencido: string;
  disponible: string;
  limite: string;
  dias_credito: number;
  cuentas_pendientes: number;
  semaforo: Semaforo;
};
type TurnoCobro = { id: string; tipo: "mostrador" | "ruta"; caja_id: string | null; ruta_id: string | null } | null;
export type ContextoEntrega = {
  modo: "entrega";
  pedido: { id: string; folio: string; estado: string; entrega_tipo: string; total: string; ruta_id: string | null; entregable: boolean };
  cliente: ClienteCobro;
  lineas: { id: string; producto: string; presentacion: string; cantidad: number; precio_unitario: string; importe: string }[];
  turno: TurnoCobro;
  metodos: string[];
};
export type ContextoAbono = {
  modo: "abono";
  cliente: ClienteCobro;
  cuentas: { id: string; venta_folio: string | null; concepto: string | null; vence_el: string; saldo: string; dias_vencida: number }[];
  parada: { id: string; ruta_id: string } | null;
  turno: TurnoCobro;
  metodos: string[];
};

// F9 ------------------------------------------------------------------
// Reportes y tablero (CONTRATOS §4.4 «Reportes (F9)»). Todo el dinero llega como string.

/** `GET /api/tablero`: cada llave solo existe si el usuario tiene el permiso de su reporte. */
export type Tablero = {
  ventas_hoy?: string;
  utilidad_mes?: string;
  cxc_total?: string;
  cxc_vencido?: string;
  bajo_minimo?: number | string;
  por_caducar?: number | string;
  precios_bajo_costo?: number | string;
};

/** Fila de un reporte: las columnas dependen del reporte (ver `componentes/reportes/definiciones.ts`). */
export type FilaReporte = Record<string, unknown>;

/** Respuesta común de `GET /api/reportes/*`; `totales`, `ajustes`, `utilidad_neta` y `valor_total` solo en algunos. */
export type RespuestaReporte = {
  filas?: FilaReporte[];
  totales?: FilaReporte;
  ajustes?: { mermas_por_causa?: Record<string, string>; ajustes_netos?: string };
  utilidad_neta?: string;
  valor_total?: string;
};

// F11 -----------------------------------------------------------------
// Lealtad y sugerencias (CONTRATOS §2.12 B14/B15, §4.4 «Cambios F11»). Las adiciones a tipos existentes están marcadas `F11`.

/** `POST /api/pedidos/:id/entregar`: regalo de lealtad que se entrega además del pedido, o `null`. */
export type RegaloEntrega = { producto: string; presentacion: string; cantidad: number } | null;

/** Llaves de lealtad en `GET /api/configuracion`. */
export type ConfigLealtad = { lealtad_activa?: boolean; lealtad_cada?: number | string; lealtad_presentacion_regalo_id?: string | number | null };

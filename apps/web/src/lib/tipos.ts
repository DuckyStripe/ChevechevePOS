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
  rutas?: { lista: { id: string; folio: string; nombre: string | null; estado: string; repartidor: string; paradas: number; entregadas: number }[]; por_cargar: number; en_curso: number }; // F6
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
};
export type Surtido = { fecha: string; proveedores: GrupoSurtido[]; totales: { productos: number; costo_estimado?: string | null } };
export type MensajeSurtido = { telefono: string | null; texto: string };
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
};
export type CandidatoRuta = { id: string; folio: string; cliente: { id: string; nombre: string }; estado: string; total: string; tiene_ubicacion: boolean };
export type CandidatosRuta = { zonas: { zona: { id: string; nombre: string } | null; pedidos: CandidatoRuta[] }[] };
export type OrdenCarga = {
  paradas: { carga_n: number; orden: number; cliente: string; zona: string | null; pedido_folio: string | null; lineas: LineaRuta[] }[];
  totales: { producto: string; presentacion: string; cantidad: number; piezas: number }[];
  cajas_totales: number;
};
export type Repartidor = { id: string; nombre: string };

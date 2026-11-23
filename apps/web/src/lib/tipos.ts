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

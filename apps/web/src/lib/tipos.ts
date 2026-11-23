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

/** Unica fuente de verdad del mapeo codigo de error -> HTTP + mensaje llano (CONTRATOS §4.3). No son plantillas. */

type Fila = readonly [estado: number, mensaje: string];

const TABLA: Record<string, Fila> = {
  VALIDACION: [400, "Hay datos que no son validos. Revisa e intenta de nuevo."],
  CONTRASENA_INCORRECTA: [400, "La contrasena actual no es correcta."],
  IMAGEN_NO_VALIDA: [400, "La imagen no es valida. Usa una foto JPG, PNG o WebP."],

  NO_AUTENTICADO: [401, "Inicia sesion para continuar."],
  SESION_CERRADA: [401, "Tu sesion termino. Inicia sesion de nuevo."],
  CREDENCIALES_INVALIDAS: [401, "Usuario o contrasena incorrectos."],
  ENLACE_INVALIDO: [401, "Este enlace ya no sirve. Pide uno nuevo a la bodega."],
  PIN_REQUERIDO: [401, "Escribe tu PIN para entrar."],
  PIN_INCORRECTO: [401, "El PIN no es correcto."],

  SIN_PERMISO: [403, "No tienes permiso para hacer esto."],
  SIN_PERMISO_PRECIO: [403, "No tienes permiso para ver o cambiar precios."],
  CAMBIO_CONTRASENA_REQUERIDO: [403, "Debes cambiar tu contrasena antes de continuar."],
  ORIGEN_INVALIDO: [403, "La peticion no viene de esta pagina."],
  TURNO_AJENO: [403, "Ese turno es de otra persona."],
  RUTA_AJENA: [403, "Esa ruta es de otra persona."],
  SOLO_APP: [403, "Esto solo se puede hacer desde la app."],

  NO_ENCONTRADO: [404, "No se encontro lo que buscas."],

  IDEMPOTENCIA_CONFLICTO: [409, "Esa operacion ya se hizo con otros datos."],
  STOCK_INSUFICIENTE: [409, "No hay suficiente producto."],
  PRECIO_NO_DEFINIDO: [409, "Falta definir el precio."],
  PRESENTACION_NO_VALIDA: [409, "La presentacion no es valida para este producto."],
  VENTA_VACIA: [409, "La venta no tiene productos."],
  COMPRA_VACIA: [409, "La compra no tiene productos."],
  PEDIDO_VACIO: [409, "El pedido no tiene productos."],
  PEDIDO_MINIMO: [409, "El pedido no llega al minimo."],
  PEDIDO_NO_EDITABLE: [409, "Este pedido ya no se puede cambiar."],
  PEDIDO_CAMBIO: [409, "El pedido cambio. Revisalo de nuevo."],
  PEDIDO_EN_RUTA: [409, "El pedido ya va en una ruta."],
  PEDIDO_EN_OTRA_RUTA: [409, "El pedido ya esta en otra ruta."],
  PEDIDO_ESPERANDO_CLIENTE: [409, "El pedido espera respuesta del cliente."],
  PROPUESTA_CERRADA: [409, "La propuesta ya se cerro."],
  LINEA_NO_VALIDA: [409, "Una linea del pedido no es valida."],
  PEDIDO_VENCIDO: [409, "El pedido ya vencio."],
  PRECIOS_CAMBIARON: [409, "Los precios cambiaron. Revisalos de nuevo."],
  SIN_PRIMERA_COMPRA: [409, "El cliente aun no tiene su primera compra."],
  PIN_YA_DEFINIDO: [409, "El PIN ya estaba definido."],
  SIN_PROPUESTA: [409, "No hay propuesta pendiente."],
  AVISO_NO_PENDIENTE: [409, "El aviso ya no esta pendiente."],
  PEDIDO_NO_ASIGNABLE: [409, "El pedido no se puede asignar a una ruta."],
  AJUSTE_NO_VALIDO: [409, "El ajuste no es valido."],
  ESTADO_NO_VALIDO: [409, "No se puede hacer esto en el estado actual."],
  FECHA_NO_VALIDA: [409, "La fecha no es valida."],
  CLIENTE_INACTIVO: [409, "El cliente esta inactivo."],
  RUTA_NO_EDITABLE: [409, "La ruta ya no se puede cambiar."],
  RUTA_VACIA: [409, "La ruta no tiene paradas."],
  RUTA_NO_TERMINADA: [409, "La ruta aun no termina."],
  PARADAS_NO_CUADRAN: [409, "Las paradas no coinciden con la ruta."],
  PARADA_DUPLICADA: [409, "Hay una parada repetida."],
  REPARTIDOR_NO_VALIDO: [409, "Esa persona no puede ser repartidor."],
  BODEGA_SIN_UBICACION: [409, "Falta la ubicacion de la bodega en Configuracion."],
  FALTA_SURTIR: [409, "Falta surtir producto de este pedido."],
  ENTREGA_EXCEDE_PEDIDO: [409, "Se quiere entregar mas de lo pedido."],
  ENTREGA_VACIA: [409, "La entrega no tiene productos."],
  PAGOS_NO_CUADRAN: [409, "Los pagos no cuadran con el total."],
  EFECTIVO_INSUFICIENTE: [409, "El efectivo no alcanza."],
  CREDITO_SIN_CLIENTE: [409, "Para fiar hay que elegir un cliente."],
  LIMITE_CREDITO_EXCEDIDO: [409, "Se pasa del limite de credito del cliente."],
  TURNO_NO_ABIERTO: [409, "Primero abre tu turno de caja."],
  TURNO_NO_VALIDO: [409, "El turno no es valido."],
  TURNO_YA_ABIERTO: [409, "Ya tienes un turno abierto."],
  CAJA_OCUPADA: [409, "La caja ya la esta usando otra persona."],
  VENTA_YA_CANCELADA: [409, "La venta ya estaba cancelada."],
  VENTA_CON_DEVOLUCIONES: [409, "La venta tiene devoluciones y no se puede cancelar."],
  VENTA_CON_ABONOS: [409, "La venta tiene abonos y no se puede cancelar."],
  DEVOLUCION_EXCEDE_VENDIDO: [409, "Se quiere devolver mas de lo vendido."],
  COMPRA_YA_CANCELADA: [409, "La compra ya estaba cancelada."],
  COMPRA_CON_SALIDAS: [409, "Parte de esta mercancia ya salio del inventario y la compra no se puede cancelar."],
  COMPRA_INMUTABLE: [409, "La compra no se puede modificar."],
  PRESENTACION_NO_BORRABLE: [409, "La presentacion tiene historial y no se puede borrar. Desactivala."],
  COSTO_INVALIDO: [409, "El costo no es valido."],
  ABONO_EXCEDE_SALDO: [409, "El abono es mayor que lo que se debe."],
  CUENTA_NO_VALIDA: [409, "La cuenta no es valida."],
  APLICACION_NO_CUADRA: [409, "La aplicacion del abono no cuadra."],
  ABONO_YA_CANCELADO: [409, "El abono ya estaba cancelado."],
  DUPLICADO: [409, "Ya existe un registro con esos datos."],
  ROL_EN_USO: [409, "Hay usuarios con este rol. Cambialos de rol primero."],
  ROL_SISTEMA: [409, "Este rol es del sistema y no se puede cambiar ni borrar."],
  ULTIMO_DUENO: [409, "Debe quedar al menos un dueno activo."],
  FACTOR_INMUTABLE: [409, "El factor de la presentacion ya no se puede cambiar."],
  PRODUCTO_SIN_PIEZA: [409, "El producto no tiene presentacion por pieza."],
  PLANTILLA_NO_EXISTE: [409, "La plantilla no existe."],
  MOVIMIENTO_INMUTABLE: [409, "Un movimiento de inventario no se puede cambiar."],
  EXISTENCIA_SOLO_POR_MOVIMIENTO: [409, "La existencia solo cambia con movimientos."],

  ARCHIVO_GRANDE: [413, "El archivo es demasiado grande."],

  USUARIO_BLOQUEADO: [429, "Demasiados intentos. Espera un momento antes de volver a intentar."],
  ENLACE_BLOQUEADO: [429, "Demasiados intentos con este enlace. Espera un momento."],
  PIN_EN_ESPERA: [429, "Demasiados intentos con el PIN. Espera un momento."],
  DEMASIADAS_PETICIONES: [429, "Demasiadas peticiones. Espera un momento."],

  ERROR_INTERNO: [500, "Algo salio mal. Intenta de nuevo."],
};

export interface ErrorApi {
  statusCode: number;
  codigo: string;
  mensaje: string;
  detalles?: unknown;
}

export class AppError extends Error {
  constructor(
    public readonly codigo: string,
    public readonly detalles?: unknown,
  ) {
    super(codigo);
    this.name = "AppError";
  }
}

interface ErrorPg extends Error {
  code?: string;
  detail?: string;
}

const interno = (): ErrorApi => ({ statusCode: 500, codigo: "ERROR_INTERNO", mensaje: TABLA.ERROR_INTERNO![1] });

function deTabla(codigo: string, detalles?: unknown): ErrorApi | null {
  const fila = TABLA[codigo];
  if (!fila) return null;
  return { statusCode: fila[0], codigo, mensaje: fila[1], ...(detalles === undefined ? {} : { detalles }) };
}

function jsonODefecto(texto: string | undefined): unknown {
  if (!texto) return undefined;
  try {
    return JSON.parse(texto);
  } catch {
    return undefined;
  }
}

/**
 * Convierte cualquier error en un ErrorApi.
 * - AppError: su codigo en la tabla (codigo desconocido -> 500).
 * - P0001 (RAISE EXCEPTION de PL/pgSQL): message = CODIGO, DETAIL = JSON de detalles.
 * - 23505 -> 409 DUPLICADO. 23503/23514/23502 y todo lo demas -> 500 sin detalles (el handler los loguea).
 */
export function mapearError(err: unknown): ErrorApi {
  if (err instanceof AppError) return deTabla(err.codigo, err.detalles) ?? interno();
  if (!(err instanceof Error)) return interno();
  const e = err as ErrorPg;
  if (e.code === "P0001") return deTabla(e.message, jsonODefecto(e.detail)) ?? interno();
  if (e.code === "23505") return deTabla("DUPLICADO")!;
  return interno();
}

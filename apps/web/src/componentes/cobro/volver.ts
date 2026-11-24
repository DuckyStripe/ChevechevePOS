/** Solo rutas internas: `?volver=` nunca saca al usuario del sitio. */
export const rutaVolver = (v: string | undefined, por: string): string => (v && /^\/(?!\/)[\w\-/?=&%.]*$/.test(v) ? v : por);

/** Enlace a otra pantalla dueña de una acción (N1), con la forma de regresar. */
export const conVolver = (href: string, volver: string): string => `${href}${href.includes("?") ? "&" : "?"}volver=${encodeURIComponent(volver)}`;

/** Importe escrito a mano: positivo, hasta 2 decimales (el servidor decide si alcanza). */
export const MONTO = /^\d{1,10}(\.\d{1,2})?$/;
export const montoValido = (t: string): boolean => MONTO.test(t) && Number(t) > 0;

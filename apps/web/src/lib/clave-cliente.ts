import type { ClientePublico } from "./tipos";

/** Llave del carrito en el telefono: el `id` del cliente. */
export const claveCliente = (c: Pick<ClientePublico, "id">) => String(c.id);

import type { FastifyInstance } from "fastify";
import { rutasAuditoria } from "./auditoria/rutas.js";
import { rutasAuth } from "./auth/rutas.js";
import { rutasCategorias } from "./categorias/rutas.js";
import { rutasCompras } from "./compras/rutas.js";
import { rutasConfiguracion } from "./configuracion/rutas.js";
import { rutasImagenes } from "./imagenes/rutas.js";
import { rutasInventario } from "./inventario/rutas.js";
import { rutasMarcas } from "./marcas/rutas.js";
import { rutasNotificaciones } from "./notificaciones/rutas.js";
import { rutasPlantillas } from "./plantillas/rutas.js";
import { rutasPrecios } from "./precios/rutas.js";
import { rutasProductos } from "./productos/rutas.js";
import { rutasProveedores } from "./proveedores/rutas.js";
import { rutasRoles } from "./roles/rutas.js";
import { rutasUsuarios } from "./usuarios/rutas.js";

/** Un modulo por linea, todos bajo /api. */
export async function modulos(api: FastifyInstance): Promise<void> {
  await api.register(rutasAuth, { prefix: "/auth" });
  await api.register(rutasUsuarios, { prefix: "/usuarios" });
  await api.register(rutasRoles); // /roles y /permisos
  await api.register(rutasConfiguracion, { prefix: "/configuracion" });
  await api.register(rutasPlantillas, { prefix: "/plantillas" });
  await api.register(rutasNotificaciones, { prefix: "/notificaciones" });
  await api.register(rutasAuditoria, { prefix: "/auditoria" });
  await api.register(rutasCategorias, { prefix: "/categorias" });
  await api.register(rutasMarcas, { prefix: "/marcas" });
  await api.register(rutasProveedores, { prefix: "/proveedores" });
  await api.register(rutasProductos); // /productos, /presentaciones
  await api.register(rutasPrecios); // /listas-precio, /precios, /ofertas
  await api.register(rutasInventario, { prefix: "/inventario" });
  await api.register(rutasCompras, { prefix: "/compras" });
  await api.register(rutasImagenes); // /imagenes/:archivo
}

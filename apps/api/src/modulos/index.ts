import type { FastifyInstance } from "fastify";
import { rutasAuditoria } from "./auditoria/rutas.js";
import { rutasAuth } from "./auth/rutas.js";
import { rutasAvisos } from "./avisos/rutas.js";
import { rutasCategorias } from "./categorias/rutas.js";
import { rutasCompras } from "./compras/rutas.js";
import { rutasClientes } from "./clientes/rutas.js";
import { rutasConfiguracion } from "./configuracion/rutas.js";
import { rutasDespacho } from "./despacho/rutas.js";
import { rutasImagenes } from "./imagenes/rutas.js";
import { rutasInventario } from "./inventario/rutas.js";
import { rutasMarcas } from "./marcas/rutas.js";
import { rutasMovil } from "./movil/rutas.js";
import { rutasNotificaciones } from "./notificaciones/rutas.js";
import { rutasPedidos } from "./pedidos/rutas.js";
import { rutasPlantillas } from "./plantillas/rutas.js";
import { rutasPrecios } from "./precios/rutas.js";
import { rutasProductos } from "./productos/rutas.js";
import { rutasProveedores } from "./proveedores/rutas.js";
import { rutasPublico } from "./publico/rutas.js";
import { rutasRoles } from "./roles/rutas.js";
import { rutasUsuarios } from "./usuarios/rutas.js";
import { rutasRutas } from "./rutas/rutas.js"; // F6
import { rutasVehiculos } from "./vehiculos/rutas.js"; // F6
import { rutasFechasDemanda } from "./fechas-demanda/rutas.js";
import { rutasPromociones } from "./promociones/rutas.js";
import { rutasSurtido } from "./surtido/rutas.js";

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
  await api.register(rutasClientes); // /zonas, /clientes
  await api.register(rutasPedidos); // /pedidos, /propuestas
  await api.register(rutasAvisos, { prefix: "/avisos" });
  await api.register(rutasDespacho); // /despacho
  await api.register(rutasPublico, { prefix: "/publico" });
  await api.register(rutasRutas, { prefix: "/rutas" }); // F6
  await api.register(rutasVehiculos, { prefix: "/vehiculos" }); // F6
  await api.register(rutasSurtido, { prefix: "/surtido" }); // F5
  await api.register(rutasPromociones, { prefix: "/promociones" }); // F5
  await api.register(rutasFechasDemanda, { prefix: "/fechas-demanda" }); // F5
  await api.register(rutasMovil, { prefix: "/movil" }); // /movil/push, /movil/actualizaciones
}

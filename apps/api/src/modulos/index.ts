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
import { rutasCajas } from "./cajas/rutas.js"; // F7
import { rutasCierre } from "./cierre/rutas.js"; // F7
import { rutasCobranza } from "./cobranza/rutas.js"; // F7
import { rutasCobrar } from "./cobrar/rutas.js"; // F7
import { rutasComprobantes } from "./comprobantes/rutas.js"; // F7
import { rutasEntregas } from "./entregas/rutas.js"; // F7
import { rutasTurnos } from "./turnos/rutas.js"; // F7
import { rutasVentas } from "./ventas/rutas.js"; // F7
import { rutasReportes } from "./reportes/rutas.js"; // F9
import { rutasTablero } from "./tablero/rutas.js"; // F9

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
  await api.register(rutasCajas, { prefix: "/cajas" }); // F7
  await api.register(rutasTurnos, { prefix: "/turnos" }); // F7
  await api.register(rutasVentas, { prefix: "/ventas" }); // F7
  await api.register(rutasEntregas); // F7: /pedidos/:id/entregar, /rutas/:id/liquidacion, /rutas/:id/liquidar
  await api.register(rutasCobranza); // F7: /cuentas-por-cobrar, /abonos, /transferencias, /clientes/:id/saldo-inicial y estado-cuenta
  await api.register(rutasComprobantes); // F7
  await api.register(rutasCobrar, { prefix: "/cobrar" }); // F7
  await api.register(rutasCierre, { prefix: "/cierre" }); // F7
  await api.register(rutasMovil, { prefix: "/movil" }); // /movil/push, /movil/actualizaciones
  await api.register(rutasReportes, { prefix: "/reportes" }); // F9
  await api.register(rutasTablero, { prefix: "/tablero" }); // F9
}

import type { FastifyInstance } from "fastify";
import { rutasAuditoria } from "./auditoria/rutas.js";
import { rutasAuth } from "./auth/rutas.js";
import { rutasConfiguracion } from "./configuracion/rutas.js";
import { rutasNotificaciones } from "./notificaciones/rutas.js";
import { rutasPlantillas } from "./plantillas/rutas.js";
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
}

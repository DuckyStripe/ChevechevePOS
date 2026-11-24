import type { FastifyInstance, FastifyRequest } from "fastify";
import { paramId } from "../../comun/ids.js";
import { exigirPermiso } from "../../comun/permisos.js";
import {
  CAMPOS_CREDITO, esquemaCrearCliente, esquemaCrearZona, esquemaEditarCliente, esquemaEditarZona, esquemaEnlace, esquemaListaClientes, esquemaListaZonas,
  esquemaRevocar, esquemaUbicacion, paramDispositivo,
} from "./esquemas.js";
import {
  aceptarUbicacion, crearCliente, crearZona, editarCliente, editarZona, fijarUbicacion, generarEnlace, listarClientes, listarDispositivos, listarZonas,
  obtenerCliente, quitarDispositivo, restablecerPin, revocarEnlaces,
} from "./servicio.js";

const ver = { permiso: "clientes.ver" };
const editar = { permiso: "clientes.editar" };
const enlace = { permiso: "clientes.enlace" };
const veCredito = (req: FastifyRequest) => req.usuario!.permisos.includes("clientes.credito");
const tocaCredito = (d: object) => CAMPOS_CREDITO.some((k) => k in d);

export async function rutasClientes(app: FastifyInstance): Promise<void> {
  /* ---- zonas ---- */
  app.get("/zonas", { config: ver }, async (req) => listarZonas(esquemaListaZonas.parse(req.query)));
  app.post("/zonas", { config: editar }, async (req, reply) => reply.code(201).send(await crearZona(req.usuario!.id, esquemaCrearZona.parse(req.body))));
  app.patch("/zonas/:id", { config: editar }, async (req) => editarZona(req.usuario!.id, paramId.parse(req.params).id, esquemaEditarZona.parse(req.body)));

  /* ---- clientes ---- */
  app.get("/clientes", { config: ver }, async (req) => listarClientes(veCredito(req), esquemaListaClientes.parse(req.query)));
  app.get("/clientes/:id", { config: ver }, async (req) => obtenerCliente(paramId.parse(req.params).id, veCredito(req)));

  app.post("/clientes", { config: editar }, async (req, reply) => {
    const d = esquemaCrearCliente.parse(req.body);
    if (tocaCredito(d)) exigirPermiso(req, "clientes.credito");
    return reply.code(201).send(await crearCliente(req.usuario!.id, veCredito(req), d));
  });

  app.patch("/clientes/:id", { config: editar }, async (req) => {
    const { id } = paramId.parse(req.params);
    const d = esquemaEditarCliente.parse(req.body);
    if (tocaCredito(d)) exigirPermiso(req, "clientes.credito");
    return editarCliente(req.usuario!.id, veCredito(req), id, d);
  });

  app.put("/clientes/:id/ubicacion", { config: editar }, async (req) => {
    const { id } = paramId.parse(req.params);
    return fijarUbicacion(req.usuario!.id, veCredito(req), id, esquemaUbicacion.parse(req.body));
  });
  app.post("/clientes/:id/ubicacion/aceptar", { config: editar }, async (req) =>
    aceptarUbicacion(req.usuario!.id, veCredito(req), paramId.parse(req.params).id),
  );

  /* ---- enlace, dispositivos y PIN ---- */
  app.post("/clientes/:id/enlace", { config: enlace }, async (req) => {
    const { id } = paramId.parse(req.params);
    return generarEnlace(req.usuario!.id, id, esquemaEnlace.parse(req.body ?? {}).forzar ?? false);
  });
  app.post("/clientes/enlaces/revocar", { config: enlace }, async (req) => revocarEnlaces(req.usuario!.id, esquemaRevocar.parse(req.body)));
  app.get("/clientes/:id/dispositivos", { config: enlace }, async (req) => listarDispositivos(paramId.parse(req.params).id));
  app.delete("/clientes/:id/dispositivos/:dispositivo_id", { config: enlace }, async (req, reply) => {
    const p = paramDispositivo.parse(req.params);
    await quitarDispositivo(req.usuario!.id, p.id, p.dispositivo_id);
    return reply.code(204).send();
  });
  app.post("/clientes/:id/pin/restablecer", { config: enlace }, async (req, reply) => {
    await restablecerPin(req.usuario!.id, paramId.parse(req.params).id);
    return reply.code(204).send();
  });
}

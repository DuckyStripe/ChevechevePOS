import type { FastifyInstance } from "fastify";
import { paramId } from "../../comun/ids.js";
import { esquemaCrearVehiculo, esquemaEditarVehiculo, esquemaListaVehiculos } from "./esquemas.js";
import { crearVehiculo, editarVehiculo, listarVehiculos } from "./servicio.js";

const ver = { permiso: "rutas.ver" };
const escribir = { permiso: "configuracion.editar" };

export async function rutasVehiculos(app: FastifyInstance): Promise<void> {
  app.get("/", { config: ver }, async (req) => listarVehiculos(esquemaListaVehiculos.parse(req.query)));
  app.post("/", { config: escribir }, async (req, reply) => reply.code(201).send(await crearVehiculo(req.usuario!.id, esquemaCrearVehiculo.parse(req.body))));
  app.patch("/:id", { config: escribir }, async (req) => editarVehiculo(req.usuario!.id, paramId.parse(req.params).id, esquemaEditarVehiculo.parse(req.body)));
}

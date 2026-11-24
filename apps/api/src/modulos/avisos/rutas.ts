import type { FastifyInstance } from "fastify";
import { paramId } from "../../comun/ids.js";
import { exigirPermiso } from "../../comun/permisos.js";
import { esquemaCrearAviso, esquemaListaAvisos } from "./esquemas.js";
import { crearAvisoManual, crearAvisoResumenDia, listarAvisos, marcarAviso } from "./servicio.js";

const config = { permiso: "avisos.enviar" };

export async function rutasAvisos(app: FastifyInstance): Promise<void> {
  app.get("/", { config }, async (req) => listarAvisos(req.usuario!, esquemaListaAvisos.parse(req.query)));

  app.post("/", { config }, async (req, reply) => {
    const d = esquemaCrearAviso.parse(req.body);
    // Solo quien ve pedidos crea avisos (los veria despues); el del enlace ademas exige poder administrar enlaces.
    exigirPermiso(req, "pedidos.ver");
    if (d.plantilla === "wa_resumen_dia") {
      // Con ganancia: lo crea quien ve reportes y costos (SQL lo vuelve a exigir).
      exigirPermiso(req, "reportes.ver");
      exigirPermiso(req, "costos.ver");
      const r = await crearAvisoResumenDia(req.usuario!.id, d.fecha);
      return reply.code(r.repetido ? 200 : 201).send(r.aviso);
    }
    if (d.plantilla === "wa_enlace_cliente") exigirPermiso(req, "clientes.enlace");
    const { aviso, repetido } = await crearAvisoManual(req.usuario!.id, d);
    return reply.code(repetido ? 200 : 201).send(aviso);
  });

  app.post("/:id/enviado", { config }, async (req, reply) => {
    await marcarAviso(req.usuario!, paramId.parse(req.params).id, "enviado");
    return reply.code(204).send();
  });

  app.post("/:id/descartar", { config }, async (req, reply) => {
    await marcarAviso(req.usuario!, paramId.parse(req.params).id, "descartado");
    return reply.code(204).send();
  });
}

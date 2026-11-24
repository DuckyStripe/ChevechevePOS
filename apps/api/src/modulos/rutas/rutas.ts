import type { FastifyInstance } from "fastify";
import { paramId } from "../../comun/ids.js";
import {
  esquemaAsignar, esquemaCrearRuta, esquemaIniciar, esquemaListaRutas, esquemaNoEntregado, esquemaOrden,
} from "./esquemas.js";
import {
  asignarPedidos, cancelarRuta, candidatos, cargarRuta, crearRuta, iniciarRuta, listarRutas, noEntregado, obtenerRuta, optimizar,
  ordenarManual, ordenCarga, quitarParada, repartidores, terminarRuta,
} from "./servicio.js";

const planear = { permiso: "rutas.planear" };
// Con rutas.ver ve todas; solo con rutas.operar, las propias (el servicio filtra y la ajena es 404).
const verOPropias = { permiso: ["rutas.ver", "rutas.operar"] };
const operar = { permiso: "rutas.operar" };

export async function rutasRutas(app: FastifyInstance): Promise<void> {
  app.get("/", { config: verOPropias }, async (req) => listarRutas(req.usuario!, esquemaListaRutas.parse(req.query)));
  app.get("/repartidores", { config: planear }, async (req) => repartidores(req.usuario!.sucursal_id));
  app.get("/:id", { config: verOPropias }, async (req) => obtenerRuta(req.usuario!, paramId.parse(req.params).id));
  app.get("/:id/candidatos", { config: planear }, async (req) => candidatos(req.usuario!, paramId.parse(req.params).id));
  app.get("/:id/carga", { config: verOPropias }, async (req) => ordenCarga(req.usuario!, paramId.parse(req.params).id));

  app.post("/", { config: planear }, async (req, reply) => reply.code(201).send(await crearRuta(req.usuario!, esquemaCrearRuta.parse(req.body))));
  app.post("/:id/pedidos", { config: planear }, async (req) => {
    const { id } = paramId.parse(req.params);
    return asignarPedidos(req.usuario!, id, esquemaAsignar.parse(req.body).pedido_ids);
  });
  app.delete("/paradas/:id", { config: planear }, async (req) => quitarParada(req.usuario!, paramId.parse(req.params).id));
  app.put("/:id/orden", { config: planear }, async (req) => {
    const { id } = paramId.parse(req.params);
    return ordenarManual(req.usuario!, id, esquemaOrden.parse(req.body).paradas);
  });
  app.post("/:id/optimizar", { config: planear }, async (req) => optimizar(req.usuario!, paramId.parse(req.params).id));
  app.post("/:id/cargar", { config: planear }, async (req) => cargarRuta(req.usuario!, paramId.parse(req.params).id));
  app.post("/:id/cancelar", { config: planear }, async (req) => cancelarRuta(req.usuario!, paramId.parse(req.params).id));

  app.post("/:id/iniciar", { config: operar }, async (req) => {
    const { id } = paramId.parse(req.params);
    esquemaIniciar.parse(req.body ?? {});
    return iniciarRuta(req.usuario!, id);
  });
  app.post("/paradas/:id/no-entregado", { config: operar }, async (req) => {
    const { id } = paramId.parse(req.params);
    return noEntregado(req.usuario!, id, esquemaNoEntregado.parse(req.body).motivo);
  });
  app.post("/:id/terminar", { config: operar }, async (req) => terminarRuta(req.usuario!, paramId.parse(req.params).id));
}

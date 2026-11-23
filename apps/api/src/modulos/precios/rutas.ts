import type { FastifyInstance } from "fastify";
import { paramId } from "../../comun/ids.js";
import { esquemaPagina } from "../../comun/paginacion.js";
import { exigirPermiso } from "../../comun/permisos.js";
import {
  esquemaBajoCosto,
  esquemaCrearLista,
  esquemaCrearOferta,
  esquemaEditarLista,
  esquemaEditarOferta,
  esquemaGuardarPrecios,
  esquemaListaOfertas,
  esquemaSugeridos,
} from "./esquemas.js";
import {
  crearLista,
  crearOferta,
  editarLista,
  editarOferta,
  guardarPrecios,
  listarListas,
  listarOfertas,
  precioBajoCosto,
  preciosSugeridos,
  quitarOferta,
} from "./servicio.js";

const editarPrecios = { permiso: "precios.editar" };

export async function rutasPrecios(app: FastifyInstance): Promise<void> {
  app.get("/listas-precio", { config: { permiso: "sesion" } }, async (req) => listarListas(esquemaPagina.parse(req.query)));

  app.post("/listas-precio", { config: editarPrecios }, async (req, reply) => {
    const l = await crearLista(req.usuario!.id, esquemaCrearLista.parse(req.body).nombre);
    return reply.code(201).send(l);
  });

  app.patch("/listas-precio/:id", { config: editarPrecios }, async (req) => {
    const { id } = paramId.parse(req.params);
    return editarLista(req.usuario!.id, id, esquemaEditarLista.parse(req.body));
  });

  app.put("/precios", { config: editarPrecios }, async (req) =>
    guardarPrecios(req.usuario!.id, req.usuario!.sucursal_id, req.usuario!.permisos.includes("costos.ver"), esquemaGuardarPrecios.parse(req.body).precios),
  );

  app.get("/precios/bajo-costo", { config: { permiso: "costos.ver" } }, async (req) =>
    precioBajoCosto(esquemaBajoCosto.parse(req.query).lista_precio_id),
  );

  app.get("/precios/sugeridos", { config: editarPrecios }, async (req) => {
    const { producto_ids } = esquemaSugeridos.parse(req.query);
    exigirPermiso(req, "costos.ver");
    return preciosSugeridos(req.usuario!.sucursal_id, producto_ids);
  });

  app.get("/ofertas", { config: { permiso: "catalogo.ver" } }, async (req) => listarOfertas(esquemaListaOfertas.parse(req.query)));

  app.post("/ofertas", { config: editarPrecios }, async (req, reply) => {
    const o = await crearOferta(req.usuario!.id, esquemaCrearOferta.parse(req.body));
    return reply.code(201).send(o);
  });

  app.patch("/ofertas/:id", { config: editarPrecios }, async (req) => {
    const { id } = paramId.parse(req.params);
    return editarOferta(req.usuario!.id, id, esquemaEditarOferta.parse(req.body));
  });

  app.delete("/ofertas/:id", { config: editarPrecios }, async (req, reply) => {
    const { id } = paramId.parse(req.params);
    await quitarOferta(req.usuario!.id, id);
    return reply.code(204).send();
  });
}

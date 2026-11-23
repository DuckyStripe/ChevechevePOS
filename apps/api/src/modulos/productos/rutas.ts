import multipart from "@fastify/multipart";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { extensionPorBytes, guardarImagen } from "../../comun/archivos.js";
import { AppError } from "../../comun/errores.js";
import { paramId } from "../../comun/ids.js";
import {
  esquemaCodigo,
  esquemaCrearProducto,
  esquemaEditarPresentacion,
  esquemaEditarProducto,
  esquemaListaProductos,
  esquemaPresentacionNueva,
  paramCodigo,
} from "./esquemas.js";
import {
  articuloPorCodigo,
  crearPresentacion,
  crearProducto,
  editarPresentacion,
  editarProducto,
  existeProducto,
  fijarImagen,
  listarProductos,
  obtenerProducto,
} from "./servicio.js";

const ver = { permiso: "catalogo.ver" };
const editar = { permiso: "catalogo.editar" };
const porCodigo = { permiso: ["ventas.crear", "compras.registrar", "pedidos.capturar"] };

const MINIATURA_MAX = 30 * 1024;
const veCostos = (req: FastifyRequest) => req.usuario!.permisos.includes("costos.ver");

/** Lee las partes `imagen` y `miniatura` (CONTRATOS §4.5). El limite de 1 MB lo corta multipart (413). */
async function leerPartes(req: FastifyRequest): Promise<{ imagen: Buffer; miniatura: Buffer }> {
  const partes: Partial<Record<"imagen" | "miniatura", Buffer>> = {};
  try {
    for await (const parte of req.parts()) {
      if (parte.type !== "file" || (parte.fieldname !== "imagen" && parte.fieldname !== "miniatura") || partes[parte.fieldname]) {
        throw new AppError("VALIDACION", [{ path: [parte.fieldname], message: "Parte no esperada" }]);
      }
      partes[parte.fieldname] = await parte.toBuffer();
    }
  } catch (err) {
    // Demasiadas partes, archivos o campos: es un cuerpo mal armado (400), no un archivo grande (413).
    const codigo = (err as { code?: string }).code;
    if (codigo === "FST_FIELDS_LIMIT" || codigo === "FST_FILES_LIMIT" || codigo === "FST_PARTS_LIMIT") throw new AppError("VALIDACION", [{ path: [], message: "Partes no esperadas" }]);
    throw err;
  }
  if (!partes.imagen || !partes.miniatura) throw new AppError("IMAGEN_NO_VALIDA");
  return { imagen: partes.imagen, miniatura: partes.miniatura };
}

export async function rutasProductos(app: FastifyInstance): Promise<void> {
  // Dentro de este plugin: el parser multipart no afecta a las demas rutas.
  await app.register(multipart, { limits: { fileSize: 1_048_576, files: 2, fields: 0 } });

  app.get("/productos", { config: ver }, async (req) =>
    listarProductos(req.usuario!.sucursal_id, veCostos(req), esquemaListaProductos.parse(req.query)),
  );

  app.get("/productos/:id", { config: ver }, async (req) => {
    const { id } = paramId.parse(req.params);
    return obtenerProducto(req.usuario!.sucursal_id, veCostos(req), id);
  });

  app.post("/productos", { config: editar }, async (req, reply) => {
    const p = await crearProducto(req.usuario!.id, req.usuario!.sucursal_id, veCostos(req), esquemaCrearProducto.parse(req.body));
    return reply.code(201).send(p);
  });

  app.patch("/productos/:id", { config: editar }, async (req) => {
    const { id } = paramId.parse(req.params);
    return editarProducto(req.usuario!.id, req.usuario!.sucursal_id, veCostos(req), id, esquemaEditarProducto.parse(req.body));
  });

  app.post("/productos/:id/presentaciones", { config: editar }, async (req, reply) => {
    const { id } = paramId.parse(req.params);
    const p = await crearPresentacion(req.usuario!.id, id, esquemaPresentacionNueva.parse(req.body));
    return reply.code(201).send(p);
  });

  app.patch("/presentaciones/:id", { config: editar }, async (req) => {
    const { id } = paramId.parse(req.params);
    return editarPresentacion(req.usuario!.id, id, esquemaEditarPresentacion.parse(req.body));
  });

  app.get("/presentaciones/codigo/:codigo", { config: porCodigo }, async (req) => {
    const { codigo } = paramCodigo.parse(req.params);
    const { lista_precio_id } = esquemaCodigo.parse(req.query);
    return articuloPorCodigo(req.usuario!.sucursal_id, codigo, lista_precio_id);
  });

  app.put("/productos/:id/imagen", { config: editar }, async (req) => {
    const { id } = paramId.parse(req.params);
    if (!(await existeProducto(id))) throw new AppError("NO_ENCONTRADO");
    const { imagen, miniatura } = await leerPartes(req);
    const ext = extensionPorBytes(imagen);
    if (!ext || ext !== extensionPorBytes(miniatura) || miniatura.length > MINIATURA_MAX) throw new AppError("IMAGEN_NO_VALIDA");
    const archivo = await guardarImagen("imagenes", imagen);
    await guardarImagen("imagenes", miniatura, `${archivo.slice(0, archivo.lastIndexOf("."))}-240`);
    await fijarImagen(req.usuario!.id, id, archivo);
    return { imagen: archivo };
  });

  app.delete("/productos/:id/imagen", { config: editar }, async (req, reply) => {
    const { id } = paramId.parse(req.params);
    await fijarImagen(req.usuario!.id, id, null);
    return reply.code(204).send();
  });
}

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join } from "node:path";
import multipart from "@fastify/multipart";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { guardarImagen } from "../../comun/archivos.js";
import { AppError } from "../../comun/errores.js";
import { env } from "../../config/env.js";

const NOMBRE = /^[0-9a-f]{64}\.(jpg|png|webp)$/;
const TIPOS: Record<string, string> = { ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

/** Lee la unica parte `imagen`. El limite de 1 MB lo corta multipart (413) antes de guardar nada. */
async function leerImagen(req: FastifyRequest): Promise<Buffer> {
  let imagen: Buffer | undefined;
  try {
    for await (const parte of req.parts()) {
      if (parte.type !== "file" || parte.fieldname !== "imagen" || imagen) throw new AppError("VALIDACION", [{ path: [parte.fieldname], message: "Parte no esperada" }]);
      imagen = await parte.toBuffer();
    }
  } catch (err) {
    const codigo = (err as { code?: string }).code;
    if (codigo === "FST_FIELDS_LIMIT" || codigo === "FST_FILES_LIMIT" || codigo === "FST_PARTS_LIMIT") throw new AppError("VALIDACION", [{ path: [], message: "Partes no esperadas" }]);
    throw err;
  }
  if (!imagen) throw new AppError("IMAGEN_NO_VALIDA");
  return imagen;
}

export async function rutasComprobantes(app: FastifyInstance): Promise<void> {
  await app.register(multipart, { limits: { fileSize: 1_048_576, files: 1, fields: 0 } });

  // Comprobante de transferencia y foto de entrega: tipo por bytes magicos, nunca por nombre; el contenido no se loguea.
  app.post("/comprobantes", { config: { permiso: ["ventas.crear", "rutas.operar", "cobranza.abonar"] } }, async (req, reply) => {
    const comprobante = await guardarImagen("comprobantes", await leerImagen(req));
    return reply.code(201).send({ comprobante });
  });

  app.get("/comprobantes/:archivo", { config: { permiso: ["cobranza.ver", "rutas.liquidar", "cobranza.verificar"] } }, async (req, reply) => {
    const { archivo } = req.params as { archivo: string };
    if (!NOMBRE.test(archivo)) throw new AppError("NO_ENCONTRADO");
    const ruta = join(env.ARCHIVOS_DIR, "comprobantes", archivo);
    const info = await stat(ruta).catch(() => null);
    if (!info?.isFile()) throw new AppError("NO_ENCONTRADO");
    return reply.header("content-type", TIPOS[extname(archivo)]).header("content-length", info.size).header("cache-control", "private, no-store").send(createReadStream(ruta));
  });
}

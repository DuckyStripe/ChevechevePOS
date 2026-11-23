import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join } from "node:path";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../comun/errores.js";
import { env } from "../../config/env.js";

const NOMBRE = /^[0-9a-f]{64}(-240)?\.(jpg|png|webp)$/;
const TIPOS: Record<string, string> = { ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

export async function rutasImagenes(app: FastifyInstance): Promise<void> {
  // Publica (fotos de catalogo). Solo `imagenes/`: nunca sirve `comprobantes/`.
  app.get("/imagenes/:archivo", { config: { permiso: "publica" } }, async (req, reply) => {
    const { archivo } = req.params as { archivo: string };
    if (!NOMBRE.test(archivo)) throw new AppError("NO_ENCONTRADO");
    const ruta = join(env.ARCHIVOS_DIR, "imagenes", archivo);
    const info = await stat(ruta).catch(() => null);
    if (!info?.isFile()) throw new AppError("NO_ENCONTRADO");
    return reply
      .header("content-type", TIPOS[extname(archivo)])
      .header("content-length", info.size)
      .header("cache-control", "public, max-age=31536000, immutable")
      .send(createReadStream(ruta));
  });
}

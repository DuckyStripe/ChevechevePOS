import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../comun/errores.js";
import { conUsuario } from "../../comun/transaccion.js";
import { esquemaEditarConfiguracion } from "./esquemas.js";
import { editarConfiguracion, leerConfiguracion } from "./servicio.js";

const DIARIOS = "/respaldos/diario";
const DUMP = /^\d{4}-\d{2}-\d{2}\.dump$/;

export async function rutasConfiguracion(app: FastifyInstance): Promise<void> {
  app.get("/", { config: { permiso: "sesion" } }, async () => leerConfiguracion());

  app.patch("/", { config: { permiso: "configuracion.editar" } }, async (req) =>
    editarConfiguracion(req.usuario!.id, esquemaEditarConfiguracion.parse(req.body)),
  );

  // Respaldo manual (§3.2): el .dump mas reciente; la descarga queda anotada (y auditada) como copia fuera del servidor.
  app.get("/respaldo", { config: { permiso: "configuracion.editar" } }, async (req, reply) => {
    const nombre = (await readdir(DIARIOS).catch(() => [] as string[])).filter((n) => DUMP.test(n)).sort().at(-1);
    const info = nombre ? await stat(`${DIARIOS}/${nombre}`).catch(() => null) : null;
    if (!nombre || !info?.isFile()) throw new AppError("NO_ENCONTRADO");
    await conUsuario(req.usuario!.id, (c) =>
      c.query(
        `update app.configuracion set valor = to_jsonb(now()), actualizado_en = now(), actualizado_por = $1
          where clave = 'respaldo_ultima_descarga'`,
        [req.usuario!.id],
      ),
    );
    return reply
      .header("content-type", "application/octet-stream")
      .header("content-length", info.size)
      .header("content-disposition", `attachment; filename="chevechevepos-${nombre}"`)
      .header("cache-control", "private, no-store")
      .send(createReadStream(`${DIARIOS}/${nombre}`));
  });
}

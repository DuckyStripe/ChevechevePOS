import { randomBytes } from "node:crypto";
import type { ReadStream } from "node:fs";
import { open, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError } from "../../comun/errores.js";
import { ipDe } from "../../comun/permisos.js";
import { env } from "../../config/env.js";

// Servidor de actualizaciones del cascaron (CONTRATOS §4.6.1). Solo LEE archivos publicados por scripts/ota-*.mjs; no toca la base.
// Rutas publicas porque expo-updates no manda cookie. Todo lo que falta se lee como «nada publicado», nunca como error 500.
const RUNTIME_RE = /^[A-Za-z0-9._-]{1,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const APK_RE = /^chevecheve-[0-9]{1,6}\.apk$/;
const TIPO_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,60}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,60}$/i;
const FIRMA_RE = /^[\x20-\x7e]{1,4000}$/;
const PREFIJO = "/api/movil/actualizaciones";

const esValido = (rv: string) => RUNTIME_RE.test(rv) && !rv.startsWith(".");
const dentro = (raiz: string, destino: string) => {
  const rel = relative(raiz, destino);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

const esquemaUltima = z.object({
  version_code: z.number().int().min(1),
  version_name: z.string().min(1).max(32),
  runtime: z.string().max(64),
  archivo: z.string().regex(APK_RE),
  sha256: z.string().regex(HASH_RE),
  tamano_bytes: z.number().int().min(1),
  notas: z.string().max(2000),
  obligatoria: z.boolean().optional(),
  publicada_en: z.string().max(40),
});

interface Abierto { stream: ReadStream; size: number }

/** Vista de solo lectura de ACTUALIZACIONES_DIR (se lee de `env` en cada llamada). Cada ruta nace de valores ya validados y se comprueba que siga dentro. */
class Almacen {
  private get raiz(): string { return resolve(env.ACTUALIZACIONES_DIR); }

  private async archivo(...partes: string[]): Promise<{ ruta: string; size: number } | null> {
    const raiz = this.raiz;
    const lexica = resolve(raiz, ...partes);
    if (!dentro(raiz, lexica)) return null;
    try {
      const [raizReal, real] = await Promise.all([realpath(raiz), realpath(lexica)]);
      if (!dentro(raizReal, real)) return null;
      const info = await stat(real);
      return info.isFile() ? { ruta: real, size: info.size } : null;
    } catch {
      return null;
    }
  }

  private async leer(max: number, ...partes: string[]): Promise<Buffer | null> {
    const a = await this.archivo(...partes);
    if (!a || a.size > max) return null;
    return readFile(a.ruta).catch(() => null);
  }

  private async json(max: number, ...partes: string[]): Promise<unknown> {
    const b = await this.leer(max, ...partes);
    if (!b) return null;
    try {
      return JSON.parse(b.toString("utf8")) as unknown;
    } catch {
      return null;
    }
  }

  async actual(runtime: string): Promise<{ id: string; manifiesto: Buffer; firma: string | null } | null> {
    if (!esValido(runtime)) return null;
    const p = z.object({ update_id: z.string().regex(UUID_RE) }).safeParse(await this.json(1024, "android", runtime, "actual.json"));
    if (!p.success) return null;
    const id = p.data.update_id;
    const manifiesto = await this.leer(4 * 1024 * 1024, "android", runtime, "updates", id, "manifest.json");
    if (!manifiesto) return null;
    const f = (await this.leer(4096, join("android", runtime, "updates", id, "firma")))?.toString("utf8").trim();
    return { id, manifiesto, firma: f && FIRMA_RE.test(f) ? f : null };
  }

  async recurso(hash: string): Promise<(Abierto & { tipo: string }) | null> {
    if (!HASH_RE.test(hash)) return null;
    const a = await this.abrir("recursos", hash);
    if (!a) return null;
    const t = (await this.leer(128, "recursos", `${hash}.tipo`))?.toString("utf8").trim() ?? "";
    return { ...a, tipo: TIPO_RE.test(t) ? t : "application/octet-stream" };
  }

  async ultimaApk(): Promise<z.infer<typeof esquemaUltima> | null> {
    const p = esquemaUltima.safeParse(await this.json(16 * 1024, "apk", "ultima.json"));
    if (!p.success) return null;
    return (await this.archivo("apk", p.data.archivo)) ? p.data : null;
  }

  apk(nombre: string): Promise<Abierto | null> {
    return APK_RE.test(nombre) ? this.abrir("apk", nombre) : Promise.resolve(null);
  }

  private async abrir(...partes: string[]): Promise<Abierto | null> {
    const a = await this.archivo(...partes);
    if (!a) return null;
    let h;
    try {
      h = await open(a.ruta, "r");
      const info = await h.stat();
      if (!info.isFile()) {
        await h.close();
        return null;
      }
      return { stream: h.createReadStream(), size: info.size };
    } catch {
      await h?.close().catch(() => undefined);
      return null;
    }
  }
}

const cab = (req: FastifyRequest, nombre: string) => {
  const v = req.headers[nombre];
  return typeof v === "string" ? v : undefined;
};
const invalido = (campo: string) => new AppError("VALIDACION", [{ campo }]);
const limite = (max: number, prefijo: string) => ({ max, timeWindow: "1 minute", keyGenerator: (req: FastifyRequest) => `${prefijo}:${ipDe(req)}` });

function parte(nombre: string, cabeceras: string[], cuerpo: Buffer | string, borde: string): Buffer {
  const cabeza = [`--${borde}`, `content-disposition: form-data; name="${nombre}"`, "content-type: application/json", ...cabeceras, "", ""].join("\r\n");
  return Buffer.concat([Buffer.from(cabeza, "utf8"), Buffer.from(cuerpo), Buffer.from("\r\n", "utf8")]);
}

function enviarArchivo(reply: FastifyReply, f: Abierto, tipo: string, extra: Record<string, string>): FastifyReply {
  return reply.header("content-length", String(f.size)).headers(extra).type(tipo).send(f.stream);
}

export async function rutasActualizaciones(app: FastifyInstance): Promise<void> {
  const almacen = new Almacen();

  app.get("/manifiesto", { logLevel: "warn", config: { permiso: "publica", rateLimit: limite(60, "act-manif") } }, async (req, reply) => {
    const protocolo = cab(req, "expo-protocol-version");
    if (protocolo !== undefined && protocolo !== "1") throw invalido("expo-protocol-version");
    if (cab(req, "expo-platform") !== "android") throw invalido("expo-platform");
    const runtime = cab(req, "expo-runtime-version");
    if (runtime === undefined || !esValido(runtime)) throw invalido("expo-runtime-version");
    const actual = cab(req, "expo-current-update-id")?.toLowerCase();

    const u = await almacen.actual(runtime);
    reply.header("cache-control", "private, max-age=0").header("expo-protocol-version", "1").header("expo-sfv-version", "0");
    // Sin actualizacion (o el telefono ya la tiene): 204 sin cuerpo; el cliente lo toma como «nada nuevo».
    if (!u || u.id === actual) return reply.code(204).send();
    const borde = randomBytes(16).toString("hex");
    const cuerpo = Buffer.concat([
      parte("manifest", u.firma ? [`expo-signature: ${u.firma}`] : [], u.manifiesto, borde),
      parte("extensions", [], JSON.stringify({ assetRequestHeaders: {} }), borde),
      Buffer.from(`--${borde}--\r\n`, "utf8"),
    ]);
    return reply.type(`multipart/mixed; boundary=${borde}`).send(cuerpo);
  });

  app.get("/recursos/:hash", { logLevel: "warn", config: { permiso: "publica", rateLimit: limite(300, "act-rec") } }, async (req, reply) => {
    const r = await almacen.recurso(z.object({ hash: z.string().regex(HASH_RE) }).safeParse(req.params).data?.hash ?? "");
    if (!r) throw new AppError("NO_ENCONTRADO");
    return enviarArchivo(reply, r, r.tipo, { "cache-control": "public, max-age=31536000, immutable" });
  });

  app.get("/apk", { logLevel: "warn", config: { permiso: "publica", rateLimit: limite(60, "act-apk") } }, async (_req, reply) => {
    const u = await almacen.ultimaApk();
    reply.header("cache-control", "private, max-age=0").type("application/json; charset=utf-8");
    if (!u) return reply.send("null");
    const { archivo, ...resto } = u;
    return reply.send({ ...resto, obligatoria: u.obligatoria === true, url: `${PREFIJO}/apk/${archivo}` });
  });

  app.get("/apk/:archivo", { logLevel: "warn", config: { permiso: "publica", rateLimit: limite(6, "act-apkf") } }, async (req, reply) => {
    const nombre = (req.params as { archivo?: string }).archivo ?? "";
    const a = await almacen.apk(nombre);
    if (!a) throw new AppError("NO_ENCONTRADO");
    return enviarArchivo(reply, a, "application/vnd.android.package-archive", {
      "cache-control": "public, max-age=3600",
      "content-disposition": `attachment; filename="${nombre}"`,
    });
  });
}

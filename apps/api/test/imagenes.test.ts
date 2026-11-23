import { createHash, randomBytes } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cerrarPoolPruebas, crearApp, errorDe, pool } from "./ayuda.js";
import { ayudaF2, limpiarF2, tokenF2 } from "./ayuda-f2.js";

// Antes de que `env.ts` se evalue: las imagenes van a un directorio temporal, nunca a /datos/archivos.
const dir = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join: unir } = await import("node:path");
  const d = mkdtempSync(unir(tmpdir(), "chv-img-"));
  process.env.ARCHIVOS_DIR = d;
  return d;
});

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPG = [0xff, 0xd8, 0xff, 0xe0];
const WEBP = [...Buffer.from("RIFF"), 1, 0, 0, 0, ...Buffer.from("WEBP")];
const archivo = (firma: number[], relleno: number) => Buffer.concat([Buffer.from(firma), randomBytes(relleno)]);
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

function multipart(partes: { campo: string; nombre: string; datos: Buffer; tipo?: string }[]) {
  const limite = `----chv${randomBytes(6).toString("hex")}`;
  const trozos: Buffer[] = [];
  for (const p of partes) {
    trozos.push(Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="${p.campo}"; filename="${p.nombre}"\r\nContent-Type: ${p.tipo ?? "image/jpeg"}\r\n\r\n`), p.datos, Buffer.from("\r\n"));
  }
  trozos.push(Buffer.from(`--${limite}--\r\n`));
  return { payload: Buffer.concat(trozos), contentType: `multipart/form-data; boundary=${limite}` };
}

let app: FastifyInstance;
let h: ReturnType<typeof ayudaF2>;
let dueno: string;
let cajero: string;
let productoId: string;

const subir = (token: string | undefined, id: string, partes: Parameters<typeof multipart>[0]) => {
  const m = multipart(partes);
  return app.inject({
    method: "PUT",
    url: `/api/productos/${id}/imagen`,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": m.contentType, "x-visitante-ip": `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
    payload: m.payload,
  });
};

beforeAll(async () => {
  app = await crearApp();
  h = ayudaF2(app);
  dueno = await tokenF2(app, "Dueño");
  cajero = await tokenF2(app, "Cajero");
  productoId = (await h.crearProducto(dueno)).id;
});
afterAll(async () => {
  await app.close();
  await limpiarF2();
  await cerrarPoolPruebas();
  rmSync(dir, { recursive: true, force: true });
});

describe("PUT /api/productos/:id/imagen", () => {
  it("bytes PNG con nombre .jpg se guardan como .png (hash y -240 con la misma extension) y GET las sirve", async () => {
    const grande = archivo(PNG, 2000);
    const mini = archivo(PNG, 300);
    const r = await subir(dueno, productoId, [
      { campo: "imagen", nombre: "foto.jpg", datos: grande, tipo: "image/jpeg" },
      { campo: "miniatura", nombre: "mini.jpg", datos: mini, tipo: "image/jpeg" },
    ]);
    expect(r.statusCode).toBe(200);
    const nombre = `${sha(grande)}.png`;
    expect(r.json()).toEqual({ imagen: nombre });
    expect(existsSync(join(dir, "imagenes", nombre))).toBe(true);
    expect(existsSync(join(dir, "imagenes", `${sha(grande)}-240.png`))).toBe(true);
    expect((await pool.query("select imagen from app.producto where id = $1", [productoId])).rows[0].imagen).toBe(nombre);
    expect((await h.pedir("GET", `/api/productos/${productoId}`, dueno)).json().imagen).toBe(nombre);

    const g = await app.inject({ method: "GET", url: `/api/imagenes/${nombre}` });
    expect(g.statusCode).toBe(200);
    expect(g.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(g.headers["content-type"]).toBe("image/png");
    expect(g.rawPayload.equals(grande)).toBe(true);
    const m = await app.inject({ method: "GET", url: `/api/imagenes/${sha(grande)}-240.png` });
    expect(m.statusCode).toBe(200);
    expect(m.rawPayload.equals(mini)).toBe(true);
  });

  it("jpg y webp por su firma", async () => {
    for (const [firma, ext] of [[JPG, "jpg"], [WEBP, "webp"]] as const) {
      const grande = archivo([...firma], 500);
      const r = await subir(dueno, productoId, [
        { campo: "imagen", nombre: "a.png", datos: grande },
        { campo: "miniatura", nombre: "b.png", datos: archivo([...firma], 50) },
      ]);
      expect(r.statusCode, ext).toBe(200);
      expect(r.json().imagen).toBe(`${sha(grande)}.${ext}`);
    }
  });

  it("texto con nombre .png -> 400 IMAGEN_NO_VALIDA", async () => {
    const r = await subir(dueno, productoId, [
      { campo: "imagen", nombre: "x.png", datos: Buffer.from("esto no es una imagen"), tipo: "image/png" },
      { campo: "miniatura", nombre: "y.png", datos: archivo(PNG, 10), tipo: "image/png" },
    ]);
    expect(r.statusCode).toBe(400);
    expect(errorDe(r).codigo).toBe("IMAGEN_NO_VALIDA");
  });

  it("miniatura de 40 KB, miniatura de otro tipo o miniatura faltante -> 400 IMAGEN_NO_VALIDA", async () => {
    const grande = archivo(PNG, 2000);
    const casos = [
      [{ campo: "imagen", nombre: "a.png", datos: grande }, { campo: "miniatura", nombre: "b.png", datos: archivo(PNG, 40 * 1024) }],
      [{ campo: "imagen", nombre: "a.png", datos: grande }, { campo: "miniatura", nombre: "b.png", datos: archivo(JPG, 100) }],
      [{ campo: "imagen", nombre: "a.png", datos: grande }],
    ];
    for (const partes of casos) {
      const r = await subir(dueno, productoId, partes);
      expect(r.statusCode).toBe(400);
      expect(errorDe(r).codigo).toBe("IMAGEN_NO_VALIDA");
    }
  });

  it("imagen de mas de 1 MB -> 413 ARCHIVO_GRANDE", async () => {
    const r = await subir(dueno, productoId, [
      { campo: "imagen", nombre: "a.png", datos: archivo(PNG, 1_048_576 + 10) },
      { campo: "miniatura", nombre: "b.png", datos: archivo(PNG, 10) },
    ]);
    expect(r.statusCode).toBe(413);
    expect(errorDe(r).codigo).toBe("ARCHIVO_GRANDE");
  });

  it("parte desconocida -> 400 VALIDACION; 401; 403 sin catalogo.editar; 404 producto", async () => {
    const partes = [
      { campo: "imagen", nombre: "a.png", datos: archivo(PNG, 100) },
      { campo: "otra", nombre: "b.png", datos: archivo(PNG, 10) },
    ];
    const r = await subir(dueno, productoId, partes);
    expect(r.statusCode).toBe(400);
    expect(errorDe(r).codigo).toBe("VALIDACION");
    const buenas = [
      { campo: "imagen", nombre: "a.png", datos: archivo(PNG, 100) },
      { campo: "miniatura", nombre: "b.png", datos: archivo(PNG, 10) },
    ];
    expect((await subir(undefined, productoId, buenas)).statusCode).toBe(401);
    const c = await subir(cajero, productoId, buenas);
    expect(c.statusCode).toBe(403);
    expect(errorDe(c).codigo).toBe("SIN_PERMISO");
    const n = await subir(dueno, "99999999", buenas);
    expect(n.statusCode).toBe(404);
    expect(errorDe(n).codigo).toBe("NO_ENCONTRADO");
  });
});

describe("limites del multipart -> 400 VALIDACION (no 413)", () => {
  const partes = (n: number) => Array.from({ length: n }, (_, i) => ({ campo: i === 0 ? "imagen" : i === 1 ? "miniatura" : `extra${i}`, nombre: "a.png", datos: archivo(PNG, 50) }));
  it("tres archivos, un campo de texto o demasiadas partes", async () => {
    const tres = await subir(dueno, productoId, partes(3));
    expect(tres.statusCode).toBe(400);
    expect(errorDe(tres).codigo).toBe("VALIDACION");
    const limite = `----chv${randomBytes(6).toString("hex")}`;
    const campo = Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="nota"\r\n\r\nhola\r\n--${limite}--\r\n`);
    const r = await app.inject({ method: "PUT", url: `/api/productos/${productoId}/imagen`, headers: { authorization: `Bearer ${dueno}`, "content-type": `multipart/form-data; boundary=${limite}` }, payload: campo });
    expect(r.statusCode).toBe(400);
    expect(errorDe(r).codigo).toBe("VALIDACION");
    const muchas = await subir(dueno, productoId, partes(40));
    expect(muchas.statusCode).toBe(400);
    expect(errorDe(muchas).codigo).toBe("VALIDACION");
  });
});

describe("DELETE /api/productos/:id/imagen", () => {
  it("204 y deja producto.imagen en null; 404 si no existe; 403/401", async () => {
    const id = (await h.crearProducto(dueno)).id;
    await subir(dueno, id, [
      { campo: "imagen", nombre: "a.png", datos: archivo(PNG, 100) },
      { campo: "miniatura", nombre: "b.png", datos: archivo(PNG, 10) },
    ]);
    expect((await h.pedir("DELETE", `/api/productos/${id}/imagen`, cajero)).statusCode).toBe(403);
    expect((await h.pedir("DELETE", `/api/productos/${id}/imagen`)).statusCode).toBe(401);
    expect((await h.pedir("DELETE", `/api/productos/${id}/imagen`, dueno)).statusCode).toBe(204);
    expect((await h.pedir("GET", `/api/productos/${id}`, dueno)).json().imagen).toBeNull();
    expect((await h.pedir("DELETE", "/api/productos/99999999/imagen", dueno)).statusCode).toBe(404);
  });
});

describe("GET /api/imagenes/:archivo (publica)", () => {
  it("nombres fuera de la regex -> 404 sin tocar disco", async () => {
    const hash = "a".repeat(64);
    for (const mal of ["../x", "..%2Fx", "x.png", `${hash}.gif`, `${hash.toUpperCase()}.png`, `${hash}-241.png`, `${hash}.png.txt`, `${"a".repeat(63)}.png`, "..%2F..%2Fetc%2Fpasswd", "%2e%2e%2fx.png", "%2e%2e%2f%2e%2e%2fetc%2fpasswd", `%2e%2e%2f${hash}.png`, `x%2F${hash}.png`, `${hash.slice(0, 20)}%2F..%2F${hash.slice(0, 20)}.png`, "%2F", "%2e%2e"]) {
      const r = await app.inject({ method: "GET", url: `/api/imagenes/${mal}` });
      expect(r.statusCode, mal).toBe(404);
      expect(errorDe(r).codigo).toBe("NO_ENCONTRADO");
    }
  });

  it("nombre valido que no existe -> 404; no sirve comprobantes/", async () => {
    const hash = "b".repeat(64);
    expect((await app.inject({ method: "GET", url: `/api/imagenes/${hash}.png` })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/imagenes/comprobantes/${hash}.png` })).statusCode).toBe(404);
  });
});


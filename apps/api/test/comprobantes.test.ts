import { randomBytes } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar, errorDe } from "./ayuda.js";
import { crearUsuarioF3, limpiarF3, pedirPersonal, snapshotF3, type Snapshot } from "./ayuda-f3.js";
import { PNG, subir } from "./ayuda-f7.js";

// Antes de que `env.ts` se evalue: los comprobantes van a un directorio temporal, nunca a /datos/archivos.
const dir = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join: unir } = await import("node:path");
  const d = mkdtempSync(unir(tmpdir(), "chv-comp-"));
  process.env.ARCHIVOS_DIR = d;
  return d;
});

let app: FastifyInstance;
let antes: Snapshot;
let pedir: ReturnType<typeof pedirPersonal>;
const t: Record<string, string> = {};

beforeAll(async () => {
  antes = await snapshotF3();
  app = await crearApp();
  pedir = pedirPersonal(app);
  for (const rol of ["Dueño", "Administrador", "Repartidor", "Cajero", "Almacenista"] as const) t[rol] = await entrar(app, await crearUsuarioF3(rol));
});
afterAll(async () => {
  await limpiarF3(app, antes);
  await cerrarPoolPruebas();
  rmSync(dir, { recursive: true, force: true });
});

describe("POST /api/comprobantes y GET /api/comprobantes/:archivo", () => {
  it("PNG real -> 201 {comprobante} con nombre sha256.ext por bytes; quien cobra sube (Repartidor, Cajero); Almacenista y sin sesion no", async () => {
    for (const rol of ["Repartidor", "Cajero", "Administrador"]) {
      const r = await subir(app, t[rol]!, Buffer.concat([PNG, randomBytes(8)]));
      expect(r.statusCode, rol).toBe(201);
      expect(r.json().comprobante).toMatch(/^[0-9a-f]{64}\.png$/);
    }
    const r = await subir(app, t["Dueño"]!, PNG, "nombre.jpg");
    expect(existsSync(join(dir, "comprobantes", r.json().comprobante))).toBe(true);
    expect((await subir(app, t["Almacenista"]!, PNG)).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/comprobantes" })).statusCode).toBe(401);
  });

  it("texto con extension .jpg -> 400 IMAGEN_NO_VALIDA; mas de 1 MB -> 413 ARCHIVO_GRANDE; parte con otro nombre -> 400; sin archivo -> 400", async () => {
    const texto = await subir(app, t["Cajero"]!, Buffer.from("esto no es una imagen"), "foto.jpg");
    expect(texto.statusCode).toBe(400);
    expect(errorDe(texto).codigo).toBe("IMAGEN_NO_VALIDA");
    const grande = await subir(app, t["Cajero"]!, Buffer.concat([PNG, randomBytes(1_048_700)]));
    expect(grande.statusCode).toBe(413);
    expect(errorDe(grande).codigo).toBe("ARCHIVO_GRANDE");
    expect((await subir(app, t["Cajero"]!, PNG, "foto.png", "otra")).statusCode).toBe(400);
  });

  it("leer: cobranza.ver, cobranza.verificar o rutas.liquidar; el Repartidor 403; nombre invalido 404; la ruta publica de imagenes nunca los sirve; sin cache", async () => {
    const nombre = (await subir(app, t["Dueño"]!, Buffer.concat([PNG, randomBytes(8)]))).json().comprobante as string;
    for (const rol of ["Dueño", "Administrador", "Cajero"]) {
      const r = await pedir("GET", `/api/comprobantes/${nombre}`, t[rol]);
      expect(r.statusCode, rol).toBe(200);
      expect(r.headers["cache-control"]).toBe("private, no-store");
    }
    expect((await pedir("GET", `/api/comprobantes/${nombre}`, t["Repartidor"])).statusCode).toBe(403);
    expect((await pedir("GET", `/api/comprobantes/${nombre}`)).statusCode).toBe(401);
    expect((await pedir("GET", `/api/comprobantes/${"a".repeat(64)}.png`, t["Dueño"])).statusCode).toBe(404);
    expect((await pedir("GET", "/api/comprobantes/malo.png", t["Dueño"])).statusCode).toBe(404);
    expect((await pedir("GET", `/api/imagenes/${nombre}`)).statusCode).toBe(404);
  });
});

import { createVerify } from "node:crypto";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";
import { cerrarPoolPruebas, crearApp, errorDe } from "./ayuda.js";
import { crearApk } from "./ayuda-apk.js";
import { carpeta, correr, idDe, llavePrueba, publicar } from "./ayuda-ota.js";

let app: FastifyInstance;
let n = 0;
const base = "/api/movil/actualizaciones";
// Cada peticion usa otra IP para no chocar con los limites por minuto.
const get = (url: string, headers: Record<string, string> = {}) =>
  app.inject({ method: "GET", url, headers: { "x-visitante-ip": `10.9.${Math.floor(++n / 250)}.${n % 250}`, ...headers } });
const expo = (runtime: string, extra: Record<string, string> = {}) => ({ "expo-protocol-version": "1", "expo-platform": "android", "expo-runtime-version": runtime, ...extra });

beforeAll(async () => {
  app = await crearApp();
});
afterAll(async () => {
  await app.close();
  await cerrarPoolPruebas();
});

describe("sin nada publicado (nunca 500)", () => {
  it("directorio inexistente y directorio vacio: manifiesto 204, apk null, recurso y apk/:archivo 404", async () => {
    for (const dir of [join(carpeta(), "no-existe"), carpeta()]) {
      env.ACTUALIZACIONES_DIR = dir;
      const m = await get(`${base}/manifiesto`, expo("1.0.0"));
      expect(m.statusCode).toBe(204);
      expect(m.body).toBe("");
      const a = await get(`${base}/apk`);
      expect(a.statusCode).toBe(200);
      expect(a.json()).toBeNull();
      expect((await get(`${base}/recursos/${"a".repeat(64)}`)).statusCode).toBe(404);
      expect((await get(`${base}/apk/chevecheve-1.apk`)).statusCode).toBe(404);
    }
  });
});

describe("con una OTA publicada", () => {
  const dir = carpeta();
  const { ruta, publica } = llavePrueba(dir);
  const salida = join(dir, "pub");
  let id = "";

  beforeAll(() => {
    env.ACTUALIZACIONES_DIR = salida;
    const r = publicar(salida, ruta);
    expect(r.codigo).toBe(0);
    id = idDe(r.salida);
  });

  function partes(res: { headers: Record<string, unknown>; rawPayload: Buffer }) {
    const tipo = String(res.headers["content-type"]);
    const borde = /boundary=(\S+)/.exec(tipo)![1]!;
    return res.rawPayload.toString("utf8").split(`--${borde}`).slice(1, -1).map((p) => {
      const [cab, ...resto] = p.replace(/^\r\n/, "").split("\r\n\r\n");
      return { cab, cuerpo: resto.join("\r\n\r\n").replace(/\r\n$/, "") };
    });
  }

  it("multipart/mixed con manifest firmado (verifica con el certificado) y extensions", async () => {
    const r = await get(`${base}/manifiesto`, expo("1.0.0"));
    expect(r.statusCode).toBe(200);
    expect(String(r.headers["content-type"])).toMatch(/^multipart\/mixed; boundary=/);
    expect(r.headers["cache-control"]).toBe("private, max-age=0");
    expect(r.headers["expo-protocol-version"]).toBe("1");
    const [manifiesto, extensiones] = partes(r);
    expect(manifiesto!.cab).toContain('name="manifest"');
    expect(extensiones!.cab).toContain('name="extensions"');
    expect(JSON.parse(manifiesto!.cuerpo).id).toBe(id);
    const sig = /expo-signature: sig="([^"]+)", keyid="main", alg="rsa-v1_5-sha256"/.exec(manifiesto!.cab!)!;
    const v = createVerify("sha256").update(manifiesto!.cuerpo);
    expect(v.verify(publica, Buffer.from(sig[1]!, "base64"))).toBe(true);
    // Un manifiesto alterado no verifica.
    expect(createVerify("sha256").update(`${manifiesto!.cuerpo} `).verify(publica, Buffer.from(sig[1]!, "base64"))).toBe(false);
  });

  it("expo-current-update-id igual -> 204; otro runtime -> 204; cabeceras invalidas -> 400 VALIDACION", async () => {
    expect((await get(`${base}/manifiesto`, expo("1.0.0", { "expo-current-update-id": id.toUpperCase() }))).statusCode).toBe(204);
    expect((await get(`${base}/manifiesto`, expo("2.0.0"))).statusCode).toBe(204);
    for (const h of [expo("../x"), expo(".."), expo("a b"), { ...expo("1.0.0"), "expo-platform": "ios" }, { ...expo("1.0.0"), "expo-protocol-version": "9" }, {}]) {
      const r = await get(`${base}/manifiesto`, h);
      expect(r.statusCode).toBe(400);
      expect(errorDe(r).codigo).toBe("VALIDACION");
    }
  });

  it("recursos/<hash>: bytes, tipo e immutable; hash mal formado o ausente -> 404", async () => {
    const m = JSON.parse(partes(await get(`${base}/manifiesto`, expo("1.0.0")))[0]!.cuerpo);
    const url = new URL(m.launchAsset.url);
    const r = await get(url.pathname);
    expect(r.statusCode).toBe(200);
    expect(r.body).toBe('console.log("chevecheve ota fixture");');
    expect(r.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(r.headers["content-type"]).toContain("application/javascript");
    expect((await get(`${base}/recursos/${"0".repeat(64)}`)).statusCode).toBe(404);
    expect((await get(`${base}/recursos/ZZZ`)).statusCode).toBe(404);
    expect((await get(`${base}/recursos/..%2F..%2Fandroid`)).statusCode).toBe(404);
  });

  it("un enlace simbolico que sale del directorio no se sirve", async () => {
    const fuera = join(carpeta(), "secreto.txt");
    writeFileSync(fuera, "secreto");
    const hex = "b".repeat(64);
    symlinkSync(fuera, join(salida, "recursos", hex));
    expect((await get(`${base}/recursos/${hex}`)).statusCode).toBe(404);
  });

  it("un puntero apuntando a un manifiesto roto o ausente da 204, no 500", async () => {
    mkdirSync(join(salida, "android/3.0.0"), { recursive: true });
    writeFileSync(join(salida, "android/3.0.0/actual.json"), '{"update_id":"00000000-0000-4000-8000-000000000000"}');
    expect((await get(`${base}/manifiesto`, expo("3.0.0"))).statusCode).toBe(204);
    writeFileSync(join(salida, "android/3.0.0/actual.json"), "{no json");
    expect((await get(`${base}/manifiesto`, expo("3.0.0"))).statusCode).toBe(204);
  });

  it("ota-regresar: el manifiesto servido es el nuevo id con el contenido de la buena", async () => {
    const mala = idDe(publicar(salida, ruta).salida);
    expect(JSON.parse(partes(await get(`${base}/manifiesto`, expo("1.0.0")))[0]!.cuerpo).id).toBe(mala);
    const r = correr("ota-regresar", ["--runtime", "1.0.0", "--a", id, "--llave", ruta, "--salida", salida]);
    const nuevo = idDe(r.salida);
    const servido = JSON.parse(partes(await get(`${base}/manifiesto`, expo("1.0.0", { "expo-current-update-id": mala })))[0]!.cuerpo);
    expect(servido.id).toBe(nuevo);
    expect(servido.launchAsset).toEqual(JSON.parse(partes(await get(`${base}/manifiesto`, expo("1.0.0")))[0]!.cuerpo).launchAsset);
  });
});

describe("APK", () => {
  const dir = carpeta();
  const salida = join(dir, "pub");
  let contenido = "";

  beforeAll(() => {
    env.ACTUALIZACIONES_DIR = salida;
    crearApk(join(dir, "app.apk"), { versionCode: 12, versionName: "1.2.0", extra: "x".repeat(5000) });
    contenido = readFileSync(join(dir, "app.apk"), "latin1");
    const r = correr("ota-publicar-apk", ["--apk", join(dir, "app.apk"), "--version-code", "12", "--version-name", "1.2.0", "--runtime", "1.2.0", "--notas", "Nueva", "--obligatoria", "--salida", salida]);
    expect(r.codigo).toBe(0);
  });

  it("apk: forma del contrato con url; apk/:archivo en flujo con content-disposition; nombres raros -> 404", async () => {
    const a = (await get(`${base}/apk`)).json();
    expect(a).toMatchObject({ version_code: 12, version_name: "1.2.0", runtime: "1.2.0", tamano_bytes: contenido.length, notas: "Nueva", obligatoria: true, url: `${base}/apk/chevecheve-12.apk` });
    expect(Object.keys(a).sort()).toEqual(["notas", "obligatoria", "publicada_en", "runtime", "sha256", "tamano_bytes", "url", "version_code", "version_name"]);
    const f = await get(a.url);
    expect(f.statusCode).toBe(200);
    expect(f.rawPayload.toString("latin1")).toBe(contenido);
    expect(f.headers["content-type"]).toBe("application/vnd.android.package-archive");
    expect(f.headers["content-disposition"]).toBe('attachment; filename="chevecheve-12.apk"');
    expect(f.headers["content-length"]).toBe(String(contenido.length));
    for (const malo of ["../x", "chevecheve-12.apk.bak", "chevecheve-13.apk", "ultima.json", "%2e%2e%2fultima.json"]) {
      expect((await get(`${base}/apk/${malo}`)).statusCode).toBe(404);
    }
  });

  it("ultima.json que apunta a una APK que no existe -> null", async () => {
    const vacio = carpeta();
    mkdirSync(join(vacio, "apk"), { recursive: true });
    writeFileSync(join(vacio, "apk/ultima.json"), JSON.stringify({ version_code: 1, version_name: "1", runtime: "1", archivo: "chevecheve-1.apk", sha256: "a".repeat(64), tamano_bytes: 1, notas: "", publicada_en: "x" }));
    env.ACTUALIZACIONES_DIR = vacio;
    expect((await get(`${base}/apk`)).json()).toBeNull();
    env.ACTUALIZACIONES_DIR = salida;
  });
});

describe("rutas publicas", () => {
  it("las 4 rutas de actualizaciones son 'publica' y estan en la lista; una POST 'publica' extra impide arrancar", async () => {
    const declaradas: Array<[string, string, unknown]> = [];
    const Fastify = (await import("fastify")).default;
    const { permisosPlugin } = await import("../src/comun/permisos.js");
    const { rutasMovil } = await import("../src/modulos/movil/rutas.js");
    const f = Fastify();
    f.addHook("onRoute", (r) => { declaradas.push([String(r.method), r.url, (r.config as { permiso?: unknown } | undefined)?.permiso]); });
    await f.register(permisosPlugin);
    await f.register(async (api) => api.register(rutasMovil, { prefix: "/movil" }), { prefix: "/api" });
    await f.ready();
    await f.close();
    const act = declaradas.filter(([m, u]) => u.startsWith("/api/movil/actualizaciones") && m === "GET");
    expect(act.map(([, u]) => u).sort()).toEqual([`${base}/apk`, `${base}/apk/:archivo`, `${base}/manifiesto`, `${base}/recursos/:hash`]);
    expect(act.every(([, , p]) => p === "publica")).toBe(true);
    // /push/* son de sesion, no publicas.
    expect(declaradas.filter(([, u]) => u.includes("/push/")).every(([, , p]) => p === "sesion")).toBe(true);

    // Un GET desconocido bajo el prefijo no es publico: no puede declararse 'publica' y, sin declarar, la API no arranca.
    const extra = Fastify();
    await extra.register(permisosPlugin);
    expect(() => extra.get(`${base}/otra`, { config: { permiso: "publica" } }, async () => 1)).toThrow(/lista de CONTRATOS/);
    expect((await get(`${base}/otra`)).statusCode).toBe(404);

    // Una ruta publica fuera de la lista impide arrancar (y POST bajo actualizaciones tampoco vale).
    const malo = Fastify();
    await malo.register(permisosPlugin);
    expect(() => malo.post(`${base}/subir`, { config: { permiso: "publica" } }, async () => 1)).toThrow(/lista de CONTRATOS/);
  });
});

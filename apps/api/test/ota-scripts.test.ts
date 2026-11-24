import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crearApk } from "./ayuda-apk.js";
import { carpeta, correr, DIST, EXPO_CONFIG, idDe, llavePrueba, publicar, URL_BASE } from "./ayuda-ota.js";

const leer = (...p: string[]) => readFileSync(join(...p), "utf8");
const json = (...p: string[]) => JSON.parse(leer(...p));

describe("ota-publicar", () => {
  it("arma manifiesto, firma, recursos y puntero; imprime el id", () => {
    const dir = carpeta();
    const { ruta } = llavePrueba(dir);
    const salida = join(dir, "salida");
    const r = publicar(salida, ruta);
    expect(r.codigo).toBe(0);
    const id = idDe(r.salida);
    expect(json(salida, "android/1.0.0/actual.json")).toEqual({ update_id: id });
    const texto = leer(salida, "android/1.0.0/updates", id, "manifest.json");
    const m = JSON.parse(texto);
    expect(m).toMatchObject({ id, runtimeVersion: "1.0.0", metadata: {}, extra: { expoClient: { name: "Chevecheve" } } });
    // launchAsset: hash base64url del sha256, url absoluta por hex, .tipo guardado.
    const bundle = readFileSync(join(DIST, "_expo/static/js/android/entry-abc123.hbc"));
    const hex = createHash("sha256").update(bundle).digest("hex");
    expect(m.launchAsset).toMatchObject({ hash: createHash("sha256").update(bundle).digest("base64url"), contentType: "application/javascript", url: `${URL_BASE}/api/movil/actualizaciones/recursos/${hex}` });
    expect(leer(salida, "recursos", `${hex}.tipo`).trim()).toBe("application/javascript");
    expect(readFileSync(join(salida, "recursos", hex)).equals(bundle)).toBe(true);
    expect(m.assets.map((a: { fileExtension: string; contentType: string }) => [a.fileExtension, a.contentType])).toEqual([[".png", "image/png"], [".ttf", "font/ttf"]]);
    expect(readdirSync(join(salida, "recursos")).filter((f) => !f.endsWith(".tipo"))).toHaveLength(3);
    // La firma cubre el texto exacto del manifiesto.
    const firma = leer(salida, "android/1.0.0/updates", id, "firma").trim();
    expect(firma).toMatch(/^sig="[A-Za-z0-9+/=]+", keyid="main", alg="rsa-v1_5-sha256"$/);
    expect(firma).toContain('keyid="main"');
    expect(r.salida).not.toContain("PRIVATE KEY");
  });

  it("rechaza runtime con .., llave que no es RSA y banderas que faltan", () => {
    const dir = carpeta();
    const { ruta } = llavePrueba(dir);
    expect(publicar(join(dir, "s"), ruta, "..").codigo).toBe(1);
    expect(correr("ota-publicar", ["--dist", DIST]).error).toContain("Falta --runtime");
    writeFileSync(join(dir, "x.pem"), "no es llave");
    expect(publicar(join(dir, "s"), join(dir, "x.pem")).codigo).toBe(1);
    expect(existsSync(join(dir, "s"))).toBe(false);
    expect(correr("ota-publicar", ["--dist", DIST, "--runtime", "1.0.0", "--llave", ruta, "--expo-config", EXPO_CONFIG, "--url-base", "https://x.test/ruta", "--salida", join(dir, "s")]).codigo).toBe(1);
  });
});

describe("ota-regresar", () => {
  it("emite un id nuevo con el contenido de la buena y mueve el puntero; id inexistente falla", () => {
    const dir = carpeta();
    const { ruta } = llavePrueba(dir);
    const salida = join(dir, "salida");
    const buena = idDe(publicar(salida, ruta).salida);
    const mala = idDe(publicar(salida, ruta).salida);
    expect(json(salida, "android/1.0.0/actual.json").update_id).toBe(mala);
    const r = correr("ota-regresar", ["--runtime", "1.0.0", "--a", buena, "--llave", ruta, "--salida", salida]);
    expect(r.codigo).toBe(0);
    const nuevo = idDe(r.salida);
    expect([buena, mala]).not.toContain(nuevo);
    expect(json(salida, "android/1.0.0/actual.json").update_id).toBe(nuevo);
    const a = json(salida, "android/1.0.0/updates", buena, "manifest.json");
    const b = json(salida, "android/1.0.0/updates", nuevo, "manifest.json");
    expect(b.id).toBe(nuevo);
    expect({ ...b, id: null, createdAt: null }).toEqual({ ...a, id: null, createdAt: null });
    expect(correr("ota-regresar", ["--runtime", "1.0.0", "--a", "00000000-0000-4000-8000-000000000000", "--llave", ruta, "--salida", salida]).codigo).toBe(1);
  });
});

describe("ota-publicar-apk", () => {
  const apk = (dir: string, codigo = 7, extra: { paquete?: string; versionName?: string; firma?: string } = {}) => {
    const f = join(dir, `app-${codigo}-${extra.paquete ?? "ok"}-${extra.versionName ?? "n"}-${extra.firma ? "d" : "r"}.apk`);
    crearApk(f, { versionCode: codigo, versionName: extra.versionName ?? "1.1.0", ...(extra.paquete ? { paquete: extra.paquete } : {}), ...(extra.firma ? { extra: extra.firma } : {}) });
    return f;
  };
  const publicarApk = (dir: string, salida: string, codigo: string, extra: string[] = [], archivo = apk(dir, Number(codigo))) =>
    correr("ota-publicar-apk", ["--apk", archivo, "--version-code", codigo, "--version-name", "1.1.0", "--runtime", "1.1.0", "--notas", "Cambios de prueba", "--salida", salida, ...extra]);

  it("publica con sha256 y tamano leidos del APK; --obligatoria; un versionCode repetido o menor sale con error y no toca nada", () => {
    const dir = carpeta();
    const salida = join(dir, "salida");
    const f7 = apk(dir, 7);
    expect(publicarApk(dir, salida, "7", [], f7).codigo).toBe(0);
    const u = json(salida, "apk/ultima.json");
    expect(u).toMatchObject({
      version_code: 7, version_name: "1.1.0", runtime: "1.1.0", archivo: "chevecheve-7.apk", notas: "Cambios de prueba", obligatoria: false,
      sha256: createHash("sha256").update(readFileSync(f7)).digest("hex"), tamano_bytes: readFileSync(f7).length,
    });
    expect(u.publicada_en).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const antes = leer(salida, "apk/ultima.json");
    const repetido = publicarApk(dir, salida, "7", [], f7);
    expect(repetido.codigo).toBe(1);
    expect(repetido.error).toContain("ya está publicado");
    expect(publicarApk(dir, salida, "3").codigo).toBe(1);
    expect(leer(salida, "apk/ultima.json")).toBe(antes);
    expect(publicarApk(dir, salida, "8", ["--obligatoria"]).codigo).toBe(0);
    expect(json(salida, "apk/ultima.json")).toMatchObject({ version_code: 8, obligatoria: true });
  });

  it("rechaza un APK cuyo versionCode, versionName o paquete no coinciden con lo declarado, o con firma de depuracion", () => {
    const dir = carpeta();
    const salida = join(dir, "salida");
    const casos: Array<[string, string, string[]]> = [
      ["versionCode distinto", apk(dir, 5), ["--version-code", "9"]],
      ["versionName distinto", apk(dir, 9, { versionName: "9.9.9" }), []],
      ["paquete ajeno", apk(dir, 9, { paquete: "com.otra.app" }), []],
      ["firma de depuracion", apk(dir, 9, { firma: "CN=Android Debug,O=Android" }), []],
    ];
    const salidas = casos.map(([, f, extra]) => correr("ota-publicar-apk", ["--apk", f, "--version-code", "9", "--version-name", "1.1.0", "--runtime", "1.1.0", "--notas", "x", "--salida", salida, ...extra]));
    expect(salidas.map((r) => r.codigo)).toEqual([1, 1, 1, 1]);
    expect(salidas[0]!.error).toContain("no coincide con el del APK (5)");
    expect(salidas[1]!.error).toContain("--version-name");
    expect(salidas[2]!.error).toContain("com.otra.app");
    expect(salidas[3]!.error).toContain("depuración");
    expect(existsSync(join(salida, "apk"))).toBe(false);
  });

  it("rechaza versionCode no numerico, archivo que no es APK y notas excesivas", () => {
    const dir = carpeta();
    const salida = join(dir, "salida");
    expect(publicarApk(dir, salida, "abc").codigo).toBe(1);
    expect(publicarApk(dir, salida, "0").codigo).toBe(1);
    writeFileSync(join(dir, "falso.apk"), "esto no es un zip");
    expect(correr("ota-publicar-apk", ["--apk", join(dir, "falso.apk"), "--version-code", "9", "--version-name", "1.0.0", "--runtime", "1.0.0", "--notas", "x", "--salida", salida]).codigo).toBe(1);
    expect(existsSync(join(salida, "apk/chevecheve-9.apk"))).toBe(false);
  });
});

describe("firma contra el certificado de la APK y https", () => {
  const openssl = (args: string[]) => spawnSync("openssl", args, { encoding: "utf8" });
  it("con certificado correcto publica; con otro certificado falla y NO mueve actual.json; --url-base http falla", () => {
    const dir = carpeta();
    const { ruta } = llavePrueba(dir);
    const bueno = join(dir, "bueno.pem");
    expect(openssl(["req", "-new", "-x509", "-key", ruta, "-out", bueno, "-days", "1", "-subj", "/CN=prueba"]).status).toBe(0);
    const otra = llavePrueba(carpeta());
    const malo = join(dir, "malo.pem");
    expect(openssl(["req", "-new", "-x509", "-key", otra.ruta, "-out", malo, "-days", "1", "-subj", "/CN=otra"]).status).toBe(0);
    const salida = join(dir, "salida");
    const args = (cert: string) => ["--dist", DIST, "--runtime", "1.0.0", "--llave", ruta, "--expo-config", EXPO_CONFIG, "--url-base", URL_BASE, "--salida", salida, "--certificado", cert];
    expect(correr("ota-publicar", args(malo)).codigo).toBe(1);
    expect(existsSync(join(salida, "android/1.0.0/actual.json"))).toBe(false);
    expect(correr("ota-publicar", args(bueno)).codigo).toBe(0);
    expect(existsSync(join(salida, "android/1.0.0/actual.json"))).toBe(true);
    const http = correr("ota-publicar", [...args(bueno), "--url-base", "http://panel.ejemplo.test"]);
    expect(http.codigo).toBe(1);
  });
});

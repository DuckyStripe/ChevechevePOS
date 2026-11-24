import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, cerrarPoolPruebas, crearApp, crearUsuario, entrar, errorDe, instantanea, limpiar, pool, type Instantanea, type UsuarioPrueba } from "./ayuda.js";

let app: FastifyInstance;
let antes: Instantanea;
let u: UsuarioPrueba;
let tokenApp: string;
let tokenWeb: string;

const TOKEN_FCM = "fcm-token-de-prueba-1234567890:APA91bF_xyz";
const pedir = (method: "POST" | "DELETE", url: string, t: string, payload?: object) =>
  app.inject({ method, url, headers: auth(t), ...(payload ? { payload } : {}) });
const registrar = (t: string, token = TOKEN_FCM) => pedir("POST", "/api/movil/push/registrar", t, { token, plataforma: "android", app_version: "1.0.0" });
const dispositivos = async () => (await pool.query("select id, usuario_id, revocado_en from app.dispositivo where usuario_id = $1 order by id", [u.id])).rows;

beforeAll(async () => {
  antes = await instantanea();
  app = await crearApp();
  u = await crearUsuario("Administrador");
  tokenApp = await entrar(app, u, "app");
  tokenWeb = await entrar(app, u, "web");
});
afterAll(async () => {
  await limpiar(app, antes);
  await cerrarPoolPruebas();
});

describe("POST/DELETE /api/movil/push/registrar", () => {
  it("sin sesion -> 401; sesion web -> 403 SOLO_APP", async () => {
    expect((await app.inject({ method: "POST", url: "/api/movil/push/registrar", payload: { token: TOKEN_FCM, plataforma: "android" } })).statusCode).toBe(401);
    const r = await registrar(tokenWeb);
    expect(r.statusCode).toBe(403);
    expect(errorDe(r).codigo).toBe("SOLO_APP");
    expect(await dispositivos()).toEqual([]);
  });

  it("DELETE con sesion web -> 403 SOLO_APP", async () => {
    const r = await pedir("DELETE", "/api/movil/push/registrar", tokenWeb, {});
    expect(r.statusCode).toBe(403);
    expect(errorDe(r).codigo).toBe("SOLO_APP");
  });

  it("valida el cuerpo: token corto, caracteres raros o plataforma ios -> 400 VALIDACION", async () => {
    for (const body of [{ token: "corto", plataforma: "android" }, { token: "espacios no valen 12345678901234567890", plataforma: "android" }, { token: TOKEN_FCM, plataforma: "ios" }]) {
      const r = await pedir("POST", "/api/movil/push/registrar", tokenApp, body);
      expect(r.statusCode).toBe(400);
      expect(errorDe(r).codigo).toBe("VALIDACION");
    }
  });

  it("sesion app -> {registrado:true}; repetir -> la misma fila; DELETE con token -> {quitados:1}", async () => {
    const r = await registrar(tokenApp);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ registrado: true });
    await registrar(tokenApp);
    const filas = await dispositivos();
    expect(filas).toHaveLength(1);
    expect(filas[0].revocado_en).toBeNull();
    const d = await pedir("DELETE", "/api/movil/push/registrar", tokenApp, { token: TOKEN_FCM });
    expect(d.json()).toEqual({ quitados: 1 });
    expect((await dispositivos())[0].revocado_en).not.toBeNull();
    expect((await pedir("DELETE", "/api/movil/push/registrar", tokenApp, { token: TOKEN_FCM })).json()).toEqual({ quitados: 0 });
  });

  it("DELETE sin cuerpo quita todos los de la sesion", async () => {
    await registrar(tokenApp, "otro-token-fcm-abcdefghij1234567890");
    await registrar(tokenApp);
    const d = await app.inject({ method: "DELETE", url: "/api/movil/push/registrar", headers: auth(tokenApp) });
    expect(d.statusCode).toBe(200);
    expect(d.json().quitados).toBe(2);
  });

  it("POST /auth/logout revoca el dispositivo por el disparador, sin llamar DELETE", async () => {
    const sesion = await crearUsuario("Cajero");
    const t = await entrar(app, sesion, "app");
    await app.inject({ method: "POST", url: "/api/movil/push/registrar", headers: auth(t), payload: { token: "token-del-cajero-1234567890abcdef", plataforma: "android" } });
    const antesDeSalir = await pool.query("select revocado_en from app.dispositivo where usuario_id = $1", [sesion.id]);
    expect(antesDeSalir.rows).toEqual([{ revocado_en: null }]);
    expect((await app.inject({ method: "POST", url: "/api/auth/logout", headers: auth(t) })).statusCode).toBeLessThan(300);
    const despues = await pool.query("select revocado_en from app.dispositivo where usuario_id = $1", [sesion.id]);
    expect(despues.rows[0].revocado_en).not.toBeNull();
  });
});

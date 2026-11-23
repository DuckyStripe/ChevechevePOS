import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, cerrarPoolPruebas, crearApp, crearUsuario, entrar, errorDe, instantanea, limpiar, pool, type Instantanea, type UsuarioPrueba } from "./ayuda.js";

let app: FastifyInstance;
let antes: Instantanea;
let admin: UsuarioPrueba;
let tokenAdmin: string;
let tokenCajero: string;

const pedir = (method: "GET" | "PATCH" | "POST", url: string, token?: string, payload?: object) =>
  app.inject({ method, url, headers: token ? auth(token) : {}, ...(payload ? { payload } : {}) });

beforeAll(async () => {
  antes = await instantanea();
  app = await crearApp();
  admin = await crearUsuario("Administrador");
  tokenAdmin = await entrar(app, admin);
  tokenCajero = await entrar(app, await crearUsuario("Cajero"));
});
afterAll(async () => {
  await limpiar(app, antes);
  await cerrarPoolPruebas();
});

describe("GET /api/plantillas", () => {
  it("lista las 44 y filtra por canal", async () => {
    const todas = await pedir("GET", "/api/plantillas", tokenAdmin);
    expect(todas.statusCode).toBe(200);
    expect(todas.json()).toHaveLength(44);
    const push = (await pedir("GET", "/api/plantillas?canal=push", tokenAdmin)).json() as Array<{ canal: string; titulo: string }>;
    expect(push).toHaveLength(11);
    expect(push.every((p) => p.canal === "push" && p.titulo)).toBe(true);
    expect((await pedir("GET", "/api/plantillas?canal=sms", tokenAdmin)).statusCode).toBe(400);
  });
  it("401 y 403", async () => {
    expect((await pedir("GET", "/api/plantillas")).statusCode).toBe(401);
    expect((await pedir("GET", "/api/plantillas", tokenCajero)).statusCode).toBe(403);
  });
});

describe("PATCH /api/plantillas/:clave", () => {
  it("edita una whatsapp y deja fila en auditoria con el usuario_id", async () => {
    const res = await pedir("PATCH", "/api/plantillas/wa_enlace_cliente", tokenAdmin, { texto: "Hola {{cliente}}, entra a {{enlace}}" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ clave: "wa_enlace_cliente", canal: "whatsapp", titulo: null, texto: "Hola {{cliente}}, entra a {{enlace}}" });
    const a = await pool.query("select despues->>'texto' as texto from app.auditoria where tabla = 'plantilla' and registro_id = 'wa_enlace_cliente' and usuario_id = $1", [admin.id]);
    expect(a.rows).toEqual([{ texto: "Hola {{cliente}}, entra a {{enlace}}" }]);
  });
  it("push: cambia titulo y texto", async () => {
    const res = await pedir("PATCH", "/api/plantillas/push_pedido_nuevo", tokenAdmin, { titulo: "Pedido de {{cliente}}", texto: "{{folio}} por {{total}}" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ titulo: "Pedido de {{cliente}}", texto: "{{folio}} por {{total}}" });
  });
  it("400 VALIDACION: variable desconocida, push sin titulo, titulo en no-push, texto vacio", async () => {
    for (const [clave, cuerpo] of [
      ["wa_enlace_cliente", { texto: "Hola {{inventada}}" }],
      ["push_pedido_nuevo", { texto: "sin titulo" }],
      ["push_pedido_nuevo", { titulo: "{{x}}", texto: "ok" }],
      ["wa_enlace_cliente", { titulo: "no va", texto: "ok" }],
      ["wa_enlace_cliente", { texto: "" }],
      ["wa_enlace_cliente", { texto: "Hola {{ cliente }}" }],
    ] as const) {
      const res = await pedir("PATCH", `/api/plantillas/${clave}`, tokenAdmin, cuerpo);
      expect(res.statusCode, JSON.stringify(cuerpo)).toBe(400);
      expect(errorDe(res).codigo).toBe("VALIDACION");
    }
  });
  it("404 si la clave no existe (no se crean claves); 403; 401", async () => {
    expect((await pedir("PATCH", "/api/plantillas/no_existe", tokenAdmin, { texto: "x" })).statusCode).toBe(404);
    expect((await pedir("PATCH", "/api/plantillas/wa_enlace_cliente", tokenCajero, { texto: "x" })).statusCode).toBe(403);
    expect((await pedir("PATCH", "/api/plantillas/wa_enlace_cliente", undefined, { texto: "x" })).statusCode).toBe(401);
  });
});

describe("POST /api/plantillas/:clave/vista-previa", () => {
  it("renderiza el texto guardado con vars; las no listadas quedan vacias", async () => {
    await pedir("PATCH", "/api/plantillas/wa_enlace_cliente", tokenAdmin, { texto: "Hola {{cliente}} de {{negocio}}: {{enlace}}" });
    const res = await pedir("POST", "/api/plantillas/wa_enlace_cliente/vista-previa", tokenAdmin, { vars: { cliente: "Ana", enlace: "https://x/p/1", otra: "no" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ titulo: null, texto: "Hola Ana de : https://x/p/1" });
  });
  it("404 inexistente; 400 vars invalidas; 403; 401", async () => {
    expect((await pedir("POST", "/api/plantillas/no_existe/vista-previa", tokenAdmin, { vars: {} })).statusCode).toBe(404);
    expect((await pedir("POST", "/api/plantillas/wa_enlace_cliente/vista-previa", tokenAdmin, { vars: "x" })).statusCode).toBe(400);
    expect((await pedir("POST", "/api/plantillas/wa_enlace_cliente/vista-previa", tokenCajero, { vars: {} })).statusCode).toBe(403);
    expect((await pedir("POST", "/api/plantillas/wa_enlace_cliente/vista-previa", undefined, { vars: {} })).statusCode).toBe(401);
  });
});

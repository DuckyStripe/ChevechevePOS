import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, cerrarPoolPruebas, crearApp, crearUsuario, entrar, errorDe, instantanea, limpiar, pool, type Instantanea, type UsuarioPrueba } from "./ayuda.js";

let app: FastifyInstance;
let antes: Instantanea;
let yo: UsuarioPrueba;
let otro: UsuarioPrueba;
let token: string;

const pedir = (method: "GET" | "POST" | "PUT", url: string, t?: string, payload?: object) =>
  app.inject({ method, url, headers: t ? auth(t) : {}, ...(payload ? { payload } : {}) });
const sembrar = (u: UsuarioPrueba, n: number) =>
  pool.query(
    `insert into app.notificacion (usuario_id, evento, titulo, cuerpo, datos, clave)
     select $1, 'pedido_nuevo', 'Titulo ' || g, 'Cuerpo', '{"ruta":"/pedidos/1"}', 'k' || g from generate_series(1, $2) g`,
    [u.id, n],
  );

beforeAll(async () => {
  antes = await instantanea();
  app = await crearApp();
  yo = await crearUsuario("Cajero");
  otro = await crearUsuario("Cajero");
  token = await entrar(app, yo);
});
afterAll(async () => {
  await limpiar(app, antes);
  await cerrarPoolPruebas();
});

describe("notificaciones propias", () => {
  it("lista solo las del usuario, mas nuevas primero, con filtro no_leidas", async () => {
    await sembrar(yo, 3);
    await sembrar(otro, 2);
    const res = await pedir("GET", "/api/notificaciones", token);
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b).toMatchObject({ total: 3, pagina: 1, por_pagina: 50 });
    expect(b.items.map((i: { titulo: string }) => i.titulo)).toEqual(["Titulo 3", "Titulo 2", "Titulo 1"]);
    expect(b.items[0]).toMatchObject({ evento: "pedido_nuevo", datos: { ruta: "/pedidos/1" }, leida_en: null });
    await pool.query("update app.notificacion set leida_en = now() where usuario_id = $1 and clave = 'k1'", [yo.id]);
    expect((await pedir("GET", "/api/notificaciones?no_leidas=true", token)).json().total).toBe(2);
    expect((await pedir("GET", "/api/notificaciones?pagina=0", token)).statusCode).toBe(400);
  });

  it("leer con ids marca solo esas; sin ids marca todas; nunca las de otro", async () => {
    const ids = (await pool.query<{ id: string }>("select id from app.notificacion where usuario_id = $1 and leida_en is null order by id", [yo.id])).rows.map((r) => r.id);
    const ajena = (await pool.query<{ id: string }>("select id from app.notificacion where usuario_id = $1 limit 1", [otro.id])).rows[0]!.id;
    const una = await pedir("POST", "/api/notificaciones/leer", token, { ids: [ids[0], ajena] });
    expect(una.statusCode).toBe(200);
    expect(una.json()).toEqual({ sin_leer: 1 });
    expect((await pool.query("select leida_en from app.notificacion where id = $1", [ajena])).rows[0].leida_en).toBeNull();
    const todas = await pedir("POST", "/api/notificaciones/leer", token, {});
    expect(todas.json()).toEqual({ sin_leer: 0 });
    expect((await pedir("GET", "/api/auth/yo", token)).json().notificaciones_sin_leer).toBe(0);
    expect((await pedir("POST", "/api/notificaciones/leer", token, { ids: ["abc"] })).statusCode).toBe(400);
  });

  it("preferencias: todos los eventos con push=true por omision; PUT guarda y devuelve igual", async () => {
    const g = await pedir("GET", "/api/notificaciones/preferencias", token);
    expect(g.statusCode).toBe(200);
    expect(g.json().preferencias).toHaveLength(11);
    expect(g.json().preferencias.every((p: { push: boolean }) => p.push)).toBe(true);
    const put = await pedir("PUT", "/api/notificaciones/preferencias", token, { preferencias: [{ evento: "pedido_nuevo", push: false }] });
    expect(put.statusCode).toBe(200);
    expect(put.json().preferencias).toContainEqual({ evento: "pedido_nuevo", push: false });
    expect((await pedir("GET", "/api/notificaciones/preferencias", token)).json().preferencias).toContainEqual({ evento: "pedido_nuevo", push: false });
    const otra = await pedir("PUT", "/api/notificaciones/preferencias", token, { preferencias: [{ evento: "pedido_nuevo", push: true }] });
    expect(otra.json().preferencias).toContainEqual({ evento: "pedido_nuevo", push: true });
  });

  it("PUT con evento fuera de lista -> 400 VALIDACION", async () => {
    const res = await pedir("PUT", "/api/notificaciones/preferencias", token, { preferencias: [{ evento: "inventado", push: true }] });
    expect(res.statusCode).toBe(400);
    expect(errorDe(res).codigo).toBe("VALIDACION");
  });

  it("401 sin token en todas", async () => {
    for (const [m, u] of [["GET", "/api/notificaciones"], ["POST", "/api/notificaciones/leer"], ["GET", "/api/notificaciones/preferencias"], ["PUT", "/api/notificaciones/preferencias"]] as const) {
      const res = await pedir(m, u);
      expect(res.statusCode, `${m} ${u}`).toBe(401);
      expect(errorDe(res).codigo).toBe("NO_AUTENTICADO");
    }
  });
});

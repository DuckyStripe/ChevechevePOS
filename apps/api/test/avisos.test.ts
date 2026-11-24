import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar, errorDe, pool } from "./ayuda.js";
import { clienteConEnlace, crearUsuarioF3, limpiarF3, pedirPersonal, snapshotF3, tokenF3, type Snapshot } from "./ayuda-f3.js";

let app: FastifyInstance;
let antes: Snapshot;
let pedir: ReturnType<typeof pedirPersonal>;
let dueno: { token: string; id: string };
let cajero: string;
let repartidor: string;
let almacenista: string;

beforeAll(async () => {
  antes = await snapshotF3();
  app = await crearApp();
  pedir = pedirPersonal(app);
  const u = await crearUsuarioF3("Dueño");
  dueno = { token: await entrar(app, u), id: u.id };
  cajero = await tokenF3(app, "Cajero");
  repartidor = await tokenF3(app, "Repartidor");
  almacenista = await tokenF3(app, "Almacenista");
  await pedir("PATCH", "/api/configuracion", dueno.token, { url_publica: "https://pedidos.prueba.mx", negocio_nombre: "Bodega Prueba" });
});
afterAll(async () => {
  await limpiarF3(app, antes);
  await cerrarPoolPruebas();
});

const manual = (token: string, cliente_id: string, extra: object = {}) =>
  pedir("POST", "/api/avisos", token, { clave_idempotencia: randomUUID(), cliente_id, plantilla: "wa_datos_transferencia", ...extra });

describe("GET /api/avisos", () => {
  it("pendientes con texto renderizado y url wa.me/52…?text=…; el enlace del cliente va dentro del texto; sin telefono: telefono_completo false y wa.me/?text=", async () => {
    const c = await clienteConEnlace(app, dueno, {});
    const sin = await clienteConEnlace(app, dueno, { telefono: null });
    const a = (await manual(dueno.token, c.id, { plantilla: "wa_enlace_cliente" })).json();
    const b = (await manual(dueno.token, sin.id, { plantilla: "wa_enlace_cliente" })).json();
    const lista = await pedir("GET", `/api/avisos?estado=pendiente&cliente_id=${c.id}`, cajero);
    expect(lista.statusCode).toBe(200);
    expect(lista.json()).toMatchObject({ total: 1, pagina: 1, por_pagina: 50 });
    const x = lista.json().items[0];
    expect(x).toEqual({
      id: a.id, cliente: { id: c.id, nombre: c.nombre }, pedido_folio: null, plantilla: "wa_enlace_cliente", estado: "pendiente", creado_en: expect.any(String),
      telefono_completo: true, texto: expect.stringContaining(`Hola ${c.nombre}`), url: expect.stringMatching(/^https:\/\/wa\.me\/5215512345678\?text=/),
    });
    expect(x.texto).toContain(`https://pedidos.prueba.mx/p/${c.token}`);
    expect(x.texto).toContain("Bodega Prueba");
    expect(decodeURIComponent(x.url.split("text=")[1])).toBe(x.texto);
    const y = (await pedir("GET", `/api/avisos?cliente_id=${sin.id}`, cajero)).json().items[0];
    expect(y).toMatchObject({ id: b.id, telefono_completo: false, url: expect.stringMatching(/^https:\/\/wa\.me\/\?text=/) });
  });

  it("401; 403 sin avisos.enviar; 400 de filtros; el Repartidor (sin pedidos.ver) no ve ninguno en F3; filtro por estado", async () => {
    const c = await clienteConEnlace(app, dueno, {});
    await manual(dueno.token, c.id);
    expect((await pedir("GET", "/api/avisos")).statusCode).toBe(401);
    const r = await pedir("GET", "/api/avisos", almacenista);
    expect(r.statusCode).toBe(403);
    expect(errorDe(r).detalles).toEqual({ permiso: "avisos.enviar" });
    expect((await pedir("GET", "/api/avisos?estado=raro", cajero)).statusCode).toBe(400);
    expect((await pedir("GET", "/api/avisos?cliente_id=abc", cajero)).statusCode).toBe(400);
    expect((await pedir("GET", `/api/avisos?cliente_id=${c.id}`, repartidor)).json()).toMatchObject({ items: [], total: 0 });
    expect((await pedir("GET", `/api/avisos?cliente_id=${c.id}&estado=enviado`, cajero)).json().total).toBe(0);
  });
});

describe("POST /api/avisos (avisos manuales)", () => {
  it("201; la misma clave repite 200 con el mismo aviso; una plantilla fuera de la lista 400; 404 cliente o pedido ajeno; 401; 403", async () => {
    const c = await clienteConEnlace(app, dueno, {});
    const clave = randomUUID();
    const r = await pedir("POST", "/api/avisos", cajero, { clave_idempotencia: clave, cliente_id: c.id, plantilla: "wa_datos_transferencia" });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ plantilla: "wa_datos_transferencia", estado: "pendiente" });
    const otra = await pedir("POST", "/api/avisos", cajero, { clave_idempotencia: clave, cliente_id: c.id, plantilla: "wa_datos_transferencia" });
    expect(otra.statusCode).toBe(200);
    expect(otra.json().id).toBe(r.json().id);
    // Cada envio pedido a mano es nuevo: otra clave, otro aviso (y descarta el pendiente igual del mismo cliente y plantilla).
    const nueva = await pedir("POST", "/api/avisos", cajero, { clave_idempotencia: randomUUID(), cliente_id: c.id, plantilla: "wa_datos_transferencia" });
    expect(nueva.statusCode).toBe(201);
    expect(nueva.json().id).not.toBe(r.json().id);
    const pendientes = (await pedir("GET", `/api/avisos?cliente_id=${c.id}`, cajero)).json().items as { id: string; plantilla: string }[];
    expect(pendientes.filter((a) => a.plantilla === "wa_datos_transferencia").map((a) => a.id)).toEqual([nueva.json().id]);

    expect((await manual(cajero, c.id, { plantilla: "wa_pedido_confirmado" })).statusCode).toBe(400);
    expect((await manual(cajero, c.id, { plantilla: "wa_cliente_olvide_pin" })).statusCode).toBe(400);
    expect((await manual(cajero, c.id, { clave_idempotencia: "x" })).statusCode).toBe(400);
    expect((await manual(cajero, "999999999")).statusCode).toBe(404);
    expect((await manual(cajero, c.id, { pedido_id: "999999999" })).statusCode).toBe(404);
    expect((await pedir("POST", "/api/avisos", undefined, {})).statusCode).toBe(401);
    expect((await manual(almacenista, c.id)).statusCode).toBe(403);
    // Quien no ve pedidos (Repartidor) no crea avisos; el del enlace ademas pide clientes.enlace.
    const rep = await manual(repartidor, c.id);
    expect(rep.statusCode).toBe(403);
    expect(errorDe(rep)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "pedidos.ver" } });
    const sinEnlace = await manual(cajero, c.id, { plantilla: "wa_enlace_cliente" });
    expect(sinEnlace.statusCode).toBe(403);
    expect(errorDe(sinEnlace).detalles).toEqual({ permiso: "clientes.enlace" });
    expect((await manual(dueno.token, c.id, { plantilla: "wa_enlace_cliente" })).statusCode).toBe(201);
    // El parse va antes del permiso: plantilla fuera de lista es 400 aunque no tenga el permiso.
    expect((await manual(repartidor, c.id, { plantilla: "wa_pedido_confirmado" })).statusCode).toBe(400);
  });
});

describe("enviado y descartar", () => {
  it("enviado 204 y repetir 204; luego descartar 409 AVISO_NO_PENDIENTE; descartar 204; 404; 401; 403; el que no ve tampoco lo marca", async () => {
    const c = await clienteConEnlace(app, dueno, {});
    const a = (await manual(cajero, c.id)).json<{ id: string }>();
    expect((await pedir("POST", `/api/avisos/${a.id}/enviado`, cajero)).statusCode).toBe(204);
    const fila = (await pool.query("select estado, enviado_en, enviado_por from app.aviso_cliente where id = $1", [a.id])).rows[0];
    expect(fila).toMatchObject({ estado: "enviado", enviado_por: expect.any(String) });
    expect(fila.enviado_en).toBeInstanceOf(Date);
    expect((await pedir("POST", `/api/avisos/${a.id}/enviado`, cajero)).statusCode).toBe(204);
    const r = await pedir("POST", `/api/avisos/${a.id}/descartar`, cajero);
    expect(r.statusCode).toBe(409);
    expect(errorDe(r).codigo).toBe("AVISO_NO_PENDIENTE");

    const b = (await manual(cajero, c.id, { plantilla: "wa_datos_transferencia" })).json<{ id: string }>();
    expect((await pedir("POST", `/api/avisos/${b.id}/descartar`, cajero)).statusCode).toBe(204);
    expect((await pedir("POST", `/api/avisos/${b.id}/descartar`, cajero)).statusCode).toBe(204);
    expect(errorDe(await pedir("POST", `/api/avisos/${b.id}/enviado`, cajero)).codigo).toBe("AVISO_NO_PENDIENTE");

    const d = (await manual(cajero, c.id, { plantilla: "wa_recordatorio_saldo" })).json<{ id: string }>();
    expect((await pedir("POST", `/api/avisos/${d.id}/enviado`, repartidor)).statusCode).toBe(404);
    expect((await pedir("POST", `/api/avisos/${d.id}/enviado`, almacenista)).statusCode).toBe(403);
    expect((await pedir("POST", `/api/avisos/${d.id}/enviado`)).statusCode).toBe(401);
    expect((await pedir("POST", "/api/avisos/999999999/enviado", cajero)).statusCode).toBe(404);
    expect((await pedir("POST", "/api/avisos/abc/descartar", cajero)).statusCode).toBe(400);
  });
});

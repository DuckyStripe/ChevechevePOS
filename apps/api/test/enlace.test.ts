import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cifrar, descifrar, hashToken, nuevoToken } from "../src/modulos/clientes/token.js";
import { resumenNavegador } from "../src/modulos/clientes/navegador.js";
import { cerrarPoolPruebas, crearApp, errorDe, pool } from "./ayuda.js";
import { activarCliente, clienteConEnlace, limpiarF3, pedirCliente, pedirPersonal, snapshotF3, tokenF3, crearUsuarioF3, type ClienteF3, type Snapshot } from "./ayuda-f3.js";
import { entrar } from "./ayuda.js";

let app: FastifyInstance;
let antes: Snapshot;
let pedir: ReturnType<typeof pedirPersonal>;
let publico: ReturnType<typeof pedirCliente>;
let dueno: { token: string; id: string };
let admin: string;
let repartidor: string;
let cajero: string;

beforeAll(async () => {
  antes = await snapshotF3();
  app = await crearApp();
  pedir = pedirPersonal(app);
  publico = pedirCliente(app);
  const u = await crearUsuarioF3("Dueño");
  dueno = { token: await entrar(app, u), id: u.id };
  admin = await tokenF3(app, "Administrador");
  repartidor = await tokenF3(app, "Repartidor");
  cajero = await tokenF3(app, "Cajero");
  expect((await pedir("PATCH", "/api/configuracion", dueno.token, { url_publica: "https://pedidos.prueba.mx" })).statusCode).toBe(200);
});
afterAll(async () => {
  await limpiarF3(app, antes);
  await cerrarPoolPruebas();
});

const nuevo = (o: Parameters<typeof clienteConEnlace>[2] = {}) => clienteConEnlace(app, dueno, o);
const sinEnlace = async (): Promise<string> => {
  const r = await pedir("POST", "/api/clientes", dueno.token, { nombre: `TF3 Sin enlace ${Math.random().toString(36).slice(2, 8)}`, telefono_whatsapp: "5215512345678" });
  return r.json().id;
};

describe("token (cifrado del enlace)", () => {
  it("32 bytes en base64url, hash sha256 hex; cifrar y descifrar de ida y vuelta; tag alterado falla; cada cifrado es distinto", () => {
    const t = nuevoToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(nuevoToken()).not.toBe(t);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    const c = cifrar(t);
    expect(c.includes(Buffer.from(t))).toBe(false);
    expect(descifrar(c)).toBe(t);
    expect(cifrar(t).equals(c)).toBe(false);
    const roto = Buffer.from(c);
    roto[14] = roto[14]! ^ 0xff; // dentro del tag
    expect(() => descifrar(roto)).toThrow();
    const roto2 = Buffer.from(c);
    roto2[roto2.length - 1] = roto2[roto2.length - 1]! ^ 0x01; // en el texto cifrado
    expect(() => descifrar(roto2)).toThrow();
  });

  it("resumen del navegador: Chrome Android, WhatsApp iOS, Safari iOS", () => {
    expect(resumenNavegador("Mozilla/5.0 (Linux; Android 13; SM-A135M) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36")).toBe("Chrome Android");
    expect(resumenNavegador("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Mobile/15E148 WhatsApp/23.1")).toBe("WhatsApp iOS");
    expect(resumenNavegador("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17.0 Mobile/15E148 Safari/604.1")).toBe("Safari iOS");
    expect(resumenNavegador(undefined)).toBe("Navegador");
  });
});

describe("POST /api/clientes/:id/enlace", () => {
  it("sin primera compra 409 SIN_PRIMERA_COMPRA; con forzar 200 {aviso} con url_publica/p/<token> y el token nunca en claro en la base", async () => {
    const id = await sinEnlace();
    const r = await pedir("POST", `/api/clientes/${id}/enlace`, dueno.token, {});
    expect(r.statusCode).toBe(409);
    expect(errorDe(r).codigo).toBe("SIN_PRIMERA_COMPRA");

    const ok = await pedir("POST", `/api/clientes/${id}/enlace`, dueno.token, { forzar: true });
    expect(ok.statusCode).toBe(200);
    const { aviso } = ok.json<{ aviso: { id: string; plantilla: string; estado: string; texto: string; url: string; telefono_completo: boolean } }>();
    expect(aviso).toMatchObject({ plantilla: "wa_enlace_cliente", estado: "pendiente", telefono_completo: true });
    const token = /https:\/\/pedidos\.prueba\.mx\/p\/([A-Za-z0-9_-]{43})/.exec(aviso.texto)?.[1];
    expect(token).toBeTruthy();
    expect(aviso.url).toBe(`https://wa.me/5215512345678?text=${encodeURIComponent(aviso.texto)}`);
    // La respuesta solo trae el token dentro del aviso.
    expect(JSON.stringify({ ...ok.json(), aviso: { ...aviso, texto: "", url: "" } })).not.toContain(token!);
    // GET del cliente: ni token ni hash.
    const ficha = (await pedir("GET", `/api/clientes/${id}`, dueno.token)).body;
    expect(ficha).not.toContain(token!);
    expect(ficha).not.toContain(hashToken(token!));
    // Base: token_hash = sha256 y token_cifrado no contiene los bytes del token.
    const fila = (await pool.query("select token_hash, token_cifrado from app.cliente_enlace where cliente_id = $1 and revocado_en is null", [id])).rows[0];
    expect(fila.token_hash).toBe(hashToken(token!));
    expect((fila.token_cifrado as Buffer).includes(Buffer.from(token!))).toBe(false);
    expect(descifrar(fila.token_cifrado)).toBe(token);
    // El token abre el catalogo del cliente (sin dispositivo: pide PIN).
    const abre = await publico("GET", "/api/publico/cliente", { token: token! });
    expect(abre.statusCode).toBe(401);
    expect(errorDe(abre).codigo).toBe("PIN_REQUERIDO");
  });

  it("regenerar: el token viejo da 401 ENLACE_INVALIDO y el aviso nuevo lleva el token nuevo", async () => {
    const c = await nuevo();
    const r = await pedir("POST", `/api/clientes/${c.id}/enlace`, dueno.token);
    expect(r.statusCode).toBe(200);
    const nuevoTok = /\/p\/([A-Za-z0-9_-]{43})/.exec(r.json().aviso.texto)![1]!;
    expect(nuevoTok).not.toBe(c.token);
    const viejo = await publico("GET", "/api/publico/cliente", { token: c.token });
    expect(viejo.statusCode).toBe(401);
    expect(errorDe(viejo).codigo).toBe("ENLACE_INVALIDO");
    expect((await publico("GET", "/api/publico/cliente", { token: nuevoTok })).statusCode).toBe(401); // PIN_REQUERIDO, no invalido
    expect(errorDe(await publico("GET", "/api/publico/cliente", { token: nuevoTok })).codigo).toBe("PIN_REQUERIDO");
    const enlaces = await pool.query("select motivo_revocacion from app.cliente_enlace where cliente_id = $1 order by id", [c.id]);
    expect(enlaces.rows.map((x) => x.motivo_revocacion)).toEqual(["reemplazado", null]);
  });

  it("401, 403 (Repartidor y Cajero), 404 y 400", async () => {
    const c = await nuevo();
    expect((await pedir("POST", `/api/clientes/${c.id}/enlace`)).statusCode).toBe(401);
    for (const t of [repartidor, cajero]) {
      const r = await pedir("POST", `/api/clientes/${c.id}/enlace`, t, {});
      expect(r.statusCode).toBe(403);
      expect(errorDe(r)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "clientes.enlace" } });
    }
    expect((await pedir("POST", "/api/clientes/999999999/enlace", dueno.token, {})).statusCode).toBe(404);
    expect((await pedir("POST", "/api/clientes/abc/enlace", dueno.token, {})).statusCode).toBe(400);
    expect((await pedir("POST", `/api/clientes/${c.id}/enlace`, dueno.token, { forzar: "si" })).statusCode).toBe(400);
  });

  it("cliente inactivo: 409 CLIENTE_INACTIVO", async () => {
    const c = await nuevo();
    await pedir("PATCH", `/api/clientes/${c.id}`, dueno.token, { activo: false });
    const r = await pedir("POST", `/api/clientes/${c.id}/enlace`, dueno.token, { forzar: true });
    expect(r.statusCode).toBe(409);
    expect(errorDe(r).codigo).toBe("CLIENTE_INACTIVO");
  });
});

describe("dispositivos y PIN (personal)", () => {
  it("pin/restablecer 204: el dispositivo recordado sigue entrando y uno nuevo pide elegir; 401, 403 y 404", async () => {
    const c = await nuevo();
    const k = await activarCliente(app, c);
    expect((await publico("GET", "/api/publico/cliente", k)).statusCode).toBe(200);
    const r = await pedir("POST", `/api/clientes/${c.id}/pin/restablecer`, dueno.token);
    expect(r.statusCode).toBe(204);
    expect((await publico("GET", "/api/publico/cliente", k)).statusCode).toBe(200);
    const otro = await publico("GET", "/api/publico/cliente", { token: c.token });
    expect(errorDe(otro)).toMatchObject({ codigo: "PIN_REQUERIDO", detalles: { tiene_pin: false } });
    // Elige otro PIN en un dispositivo nuevo: alerta dispositivo_nuevo al personal con clientes.enlace.
    const k2 = await activarCliente(app, c, "4321");
    expect((await publico("GET", "/api/publico/cliente", k2)).statusCode).toBe(200);
    expect((await publico("GET", "/api/publico/cliente", k)).statusCode).toBe(200);
    const n = await pool.query("select count(*)::int as n from app.notificacion where evento = 'dispositivo_nuevo' and usuario_id = $1", [dueno.id]);
    expect(n.rows[0].n).toBeGreaterThanOrEqual(1);

    expect((await pedir("POST", `/api/clientes/${c.id}/pin/restablecer`)).statusCode).toBe(401);
    expect((await pedir("POST", `/api/clientes/${c.id}/pin/restablecer`, repartidor)).statusCode).toBe(403);
    expect((await pedir("POST", "/api/clientes/999999999/pin/restablecer", dueno.token)).statusCode).toBe(404);
    expect((await pedir("POST", `/api/clientes/${await sinEnlace()}/pin/restablecer`, dueno.token)).statusCode).toBe(404);
  });

  it("GET dispositivos y DELETE: ese dispositivo da 401 PIN_REQUERIDO; el de otro cliente 404; solo ven y quitan quienes tienen clientes.enlace", async () => {
    const c = await nuevo();
    const d = await nuevo();
    const k = await activarCliente(app, c);
    const kd = await activarCliente(app, d);
    const lista = await pedir("GET", `/api/clientes/${c.id}/dispositivos`, dueno.token);
    expect(lista.statusCode).toBe(200);
    expect(lista.json()).toEqual([{ id: expect.any(String), navegador: expect.any(String), primer_uso_en: expect.any(String), ultimo_uso_en: expect.any(String) }]);
    const did = lista.json()[0].id as string;
    const dida = (await pedir("GET", `/api/clientes/${d.id}/dispositivos`, dueno.token)).json()[0].id as string;

    expect((await pedir("GET", `/api/clientes/${c.id}/dispositivos`, cajero)).statusCode).toBe(403);
    expect((await pedir("GET", "/api/clientes/999999999/dispositivos", dueno.token)).statusCode).toBe(404);
    expect((await pedir("DELETE", `/api/clientes/${c.id}/dispositivos/${dida}`, dueno.token)).statusCode).toBe(404); // de otro cliente
    expect((await pedir("DELETE", `/api/clientes/${c.id}/dispositivos/${did}`, repartidor)).statusCode).toBe(403);
    expect((await pedir("DELETE", `/api/clientes/${c.id}/dispositivos/${did}`)).statusCode).toBe(401);
    expect((await pedir("DELETE", `/api/clientes/${c.id}/dispositivos/abc`, dueno.token)).statusCode).toBe(400);
    expect((await pedir("DELETE", `/api/clientes/${c.id}/dispositivos/${did}`, dueno.token)).statusCode).toBe(204);
    const r = await publico("GET", "/api/publico/cliente", k);
    expect(r.statusCode).toBe(401);
    expect(errorDe(r)).toMatchObject({ codigo: "PIN_REQUERIDO", detalles: { tiene_pin: true } });
    expect((await publico("GET", "/api/publico/cliente", kd)).statusCode).toBe(200); // el otro cliente intacto
    expect((await pedir("GET", `/api/clientes/${c.id}/dispositivos`, dueno.token)).json()).toEqual([]);
  });
});

describe("POST /api/clientes/enlaces/revocar (dar de baja link)", () => {
  it("3 ids (uno sin enlace): otro sin nota 400; con nota {dados_de_baja: 2}; sus tokens 401; el filtro dado_de_baja los trae con baja; generar de nuevo da otro token y el viejo sigue en 401", async () => {
    const a = await nuevo();
    const b = await nuevo();
    const sin = await sinEnlace();
    const cuerpo = { cliente_ids: [a.id, b.id, sin], motivo: "otro" };
    expect((await pedir("POST", "/api/clientes/enlaces/revocar", dueno.token, cuerpo)).statusCode).toBe(400);
    const r = await pedir("POST", "/api/clientes/enlaces/revocar", dueno.token, { ...cuerpo, nota: "ya no compra aqui" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ dados_de_baja: 2 });
    for (const x of [a, b]) {
      const t = await publico("GET", "/api/publico/cliente", { token: x.token });
      expect(t.statusCode).toBe(401);
      expect(errorDe(t).codigo).toBe("ENLACE_INVALIDO");
    }
    const lista = (await pedir("GET", "/api/clientes?enlace=dado_de_baja&por_pagina=200", dueno.token)).json().items as { id: string; enlace: { estado: string; baja: Record<string, unknown> } }[];
    const fa = lista.find((x) => x.id === a.id)!;
    expect(fa.enlace.estado).toBe("dado_de_baja");
    expect(fa.enlace.baja).toMatchObject({ en: expect.any(String), motivo: "otro", nota: "ya no compra aqui", por: { id: dueno.id } });
    expect(lista.some((x) => x.id === sin)).toBe(false);

    const g = await pedir("POST", `/api/clientes/${a.id}/enlace`, dueno.token, {});
    const nuevoTok = /\/p\/([A-Za-z0-9_-]{43})/.exec(g.json().aviso.texto)![1]!;
    expect(nuevoTok).not.toBe(a.token);
    expect(errorDe(await publico("GET", "/api/publico/cliente", { token: a.token })).codigo).toBe("ENLACE_INVALIDO");
    expect(errorDe(await publico("GET", "/api/publico/cliente", { token: nuevoTok })).codigo).toBe("PIN_REQUERIDO");
  });

  it("401, 403 y 400 de forma (sin ids, motivo raro, mas de 200)", async () => {
    const c = { cliente_ids: ["1"], motivo: "ya_no_es_cliente" };
    expect((await pedir("POST", "/api/clientes/enlaces/revocar", undefined, c)).statusCode).toBe(401);
    expect((await pedir("POST", "/api/clientes/enlaces/revocar", repartidor, c)).statusCode).toBe(403);
    expect((await pedir("POST", "/api/clientes/enlaces/revocar", admin, { ...c, cliente_ids: [] })).statusCode).toBe(400);
    expect((await pedir("POST", "/api/clientes/enlaces/revocar", admin, { ...c, motivo: "porque si" })).statusCode).toBe(400);
    expect((await pedir("POST", "/api/clientes/enlaces/revocar", admin, { ...c, cliente_ids: Array.from({ length: 201 }, (_, i) => String(i + 1)) })).statusCode).toBe(400);
  });
});

void (null as unknown as ClienteF3);

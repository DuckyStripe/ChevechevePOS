import { generateKeyPairSync } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, cerrarPoolPruebas, crearApp, crearUsuario, entrar, instantanea, limpiar, pool, type Instantanea, type UsuarioPrueba } from "./ayuda.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cargarCuenta, crearEnviador, type CuentaServicio } from "../src/modulos/notificaciones/envio.js";

// Sin red: `fetch` simulado. Ningun log debe contener el token FCM.
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const cuenta: CuentaServicio = {
  client_email: "prueba@chevecheve-prueba.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
  project_id: "chevecheve-prueba",
};
const TOKEN = "fcm-token-secreto-de-prueba-ZZZ1234567890:APA91b";

interface Llamada { url: string; cuerpo: unknown }
let app: FastifyInstance;
let antes: Instantanea;
let u: UsuarioPrueba;
let tokenApp: string;
let n = 0;
const logs: string[] = [];
const log = { warn: (o: object, m: string) => logs.push(JSON.stringify([o, m])), error: (o: object, m: string) => logs.push(JSON.stringify([o, m])) };

function simulado(respuestas: Array<{ status: number; json?: unknown }>, oauth = 200) {
  const llamadas: Llamada[] = [];
  const fetchSim = (async (url: string, init?: { body?: unknown }) => {
    const cuerpo = init?.body instanceof URLSearchParams ? Object.fromEntries(init.body) : JSON.parse(String(init?.body ?? "null"));
    llamadas.push({ url, cuerpo });
    if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "acceso-de-prueba", expires_in: 3600 }), { status: oauth });
    const r = respuestas.shift() ?? { status: 200 };
    return new Response(JSON.stringify(r.json ?? { name: "projects/x/messages/1" }), { status: r.status });
  }) as unknown as typeof fetch;
  return { fetch: fetchSim, llamadas, mensajes: () => llamadas.filter((l) => l.url.includes("messages:send")) };
}

async function nuevoEnvio(): Promise<string> {
  await pool.query("update app.notificacion_envio set estado = 'descartada' where estado = 'pendiente'");
  await pool.query(
    `insert into app.notificacion (usuario_id, evento, titulo, cuerpo, datos, clave)
     values ($1, 'pedido_nuevo', 'Pedido nuevo', 'Tienda hizo un pedido', '{"ruta":"/pedidos/9"}', $2)`,
    [u.id, `envio-${++n}`],
  );
  return (await pool.query("select e.id from app.notificacion_envio e join app.notificacion nn on nn.id = e.notificacion_id where nn.usuario_id = $1 and e.estado = 'pendiente'", [u.id])).rows[0]?.id;
}
const estado = async (id: string) => (await pool.query("select estado, intentos, ultimo_error from app.notificacion_envio where id = $1", [id])).rows[0];

beforeAll(async () => {
  antes = await instantanea();
  app = await crearApp();
  u = await crearUsuario("Administrador");
  tokenApp = await entrar(app, u, "app");
  const r = await app.inject({ method: "POST", url: "/api/movil/push/registrar", headers: auth(tokenApp), payload: { token: TOKEN, plataforma: "android" } });
  expect(r.statusCode).toBe(200);
});
afterAll(async () => {
  await limpiar(app, antes);
  await cerrarPoolPruebas();
});

describe("envio por FCM (red simulada)", () => {
  it("200 -> enviada; el cuerpo trae channel_id 'avisos', notification y datos.ruta; el token OAuth se cachea", async () => {
    const id = await nuevoEnvio();
    const sim = simulado([{ status: 200 }, { status: 200 }]);
    const enviar = crearEnviador({ cuenta, fetch: sim.fetch, log });
    expect(await enviar()).toBeGreaterThanOrEqual(1);
    expect((await estado(id)).estado).toBe("enviada");
    const m = sim.mensajes()[0]!;
    expect(m.url).toBe("https://fcm.googleapis.com/v1/projects/chevecheve-prueba/messages:send");
    const msg = (m.cuerpo as { message: { token: string; notification: unknown; data: Record<string, string>; android: { notification: { channel_id: string } } } }).message;
    expect(msg.token).toBe(TOKEN);
    expect(msg.notification).toEqual({ title: "Pedido nuevo", body: "Tienda hizo un pedido" });
    expect(msg.android.notification.channel_id).toBe("avisos");
    expect(msg.data.evento).toBe("pedido_nuevo");
    expect(JSON.parse(msg.data.datos!).ruta).toBe("/pedidos/9");
    // Segundo ciclo: sin pendientes, y el OAuth no se pidio otra vez.
    await nuevoEnvio();
    await enviar();
    expect(sim.llamadas.filter((l) => l.url.includes("oauth2"))).toHaveLength(1);
  });

  it("503 -> sigue pendiente con 1 intento y espera; UNREGISTERED -> dispositivo revocado y descartada", async () => {
    const id = await nuevoEnvio();
    const sim = simulado([{ status: 503, json: { error: { status: "UNAVAILABLE" } } }]);
    await crearEnviador({ cuenta, fetch: sim.fetch, log })();
    expect(await estado(id)).toEqual({ estado: "pendiente", intentos: 1, ultimo_error: "UNAVAILABLE" });

    const id2 = await nuevoEnvio();
    const sim2 = simulado([{ status: 404, json: { error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } } }]);
    await crearEnviador({ cuenta, fetch: sim2.fetch, log })();
    expect(await estado(id2)).toEqual({ estado: "descartada", intentos: 0, ultimo_error: "UNREGISTERED" });
    expect((await pool.query("select revocado_en from app.dispositivo where usuario_id = $1", [u.id])).rows[0].revocado_en).not.toBeNull();
  });

  it("falla de red -> temporal con codigo RED; ningun log ni ultimo_error contiene el token", async () => {
    await pool.query("update app.dispositivo set revocado_en = null where usuario_id = $1", [u.id]);
    const id = await nuevoEnvio();
    const roto = (async (url: string) => {
      if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "a", expires_in: 3600 }), { status: 200 });
      throw new Error(`connect ECONNREFUSED ${TOKEN}`);
    }) as unknown as typeof fetch;
    await crearEnviador({ cuenta, fetch: roto, log })();
    expect((await estado(id)).ultimo_error).toBe("RED");
    expect(logs.join("\n")).not.toContain(TOKEN);
    expect(JSON.stringify((await pool.query("select * from app.notificacion_envio")).rows)).not.toContain(TOKEN);
  });
});

describe("errores de FCM y de credenciales", () => {
  const nuevoReactivado = async () => {
    await pool.query("update app.dispositivo set revocado_en = null where usuario_id = $1", [u.id]);
    return nuevoEnvio();
  };
  const dispositivoRevocado = async () => (await pool.query("select revocado_en is not null as r from app.dispositivo where usuario_id = $1", [u.id])).rows[0].r as boolean;

  it("INVALID_ARGUMENT sobre message.token revoca el dispositivo; sobre otra cosa queda fallida SIN revocar", async () => {
    const id = await nuevoReactivado();
    const alToken = simulado([{ status: 400, json: { error: { status: "INVALID_ARGUMENT", details: [{ "@type": "x.BadRequest", fieldViolations: [{ field: "message.token" }] }] } } }]);
    await crearEnviador({ cuenta, fetch: alToken.fetch, log })();
    expect((await estado(id)).estado).toBe("descartada");
    expect(await dispositivoRevocado()).toBe(true);

    const id2 = await nuevoReactivado();
    const otro = simulado([{ status: 400, json: { error: { status: "INVALID_ARGUMENT", details: [{ fieldViolations: [{ field: "message.data" }] }] } } }]);
    await crearEnviador({ cuenta, fetch: otro.fetch, log })();
    expect(await estado(id2)).toEqual({ estado: "fallida", intentos: 0, ultimo_error: "INVALID_ARGUMENT" });
    expect(await dispositivoRevocado()).toBe(false);
  });

  it("falla de OAuth: el ciclo se omite y el envio queda pendiente con 0 intentos (se retoma al arreglarse)", async () => {
    const id = await nuevoReactivado();
    await crearEnviador({ cuenta, fetch: simulado([], 500).fetch, log })();
    expect(await estado(id)).toEqual({ estado: "pendiente", intentos: 0, ultimo_error: null });
    const bien = simulado([{ status: 200 }]);
    await crearEnviador({ cuenta, fetch: bien.fetch, log })();
    expect((await estado(id)).estado).toBe("enviada");
  });

  it("401/403 de FCM aborta el ciclo sin gastar intentos y renueva el token OAuth en el ciclo siguiente", async () => {
    const id = await nuevoReactivado();
    const sim = simulado([{ status: 401, json: { error: { status: "UNAUTHENTICATED" } } }, { status: 200 }]);
    const enviar = crearEnviador({ cuenta, fetch: sim.fetch, log });
    await enviar();
    expect(await estado(id)).toEqual({ estado: "pendiente", intentos: 0, ultimo_error: null });
    // El envio quedo reservado 2 min: se adelanta para el siguiente ciclo.
    await pool.query("update app.notificacion_envio set siguiente_intento_en = now() where id = $1", [id]);
    await enviar();
    expect((await estado(id)).estado).toBe("enviada");
    expect(sim.llamadas.filter((l) => l.url.includes("oauth2"))).toHaveLength(2);
  });
});

describe("cargarCuenta", () => {
  it("archivo ausente o incompleto da un error claro; completo da la cuenta", () => {
    const dir = mkdtempSync(join(tmpdir(), "chv-fcm-"));
    expect(cargarCuenta(join(dir, "no-existe.json"))).toMatchObject({ error: expect.stringContaining("no existe") });
    writeFileSync(join(dir, "a.json"), JSON.stringify({ client_email: "x@y", project_id: "p" }));
    const incompleto = cargarCuenta(join(dir, "a.json"));
    expect(incompleto).toMatchObject({ error: expect.stringContaining("private_key") });
    expect(JSON.stringify(incompleto)).not.toContain("x@y");
    writeFileSync(join(dir, "b.json"), JSON.stringify(cuenta));
    expect(cargarCuenta(join(dir, "b.json"))).toEqual({ cuenta });
  });
});

describe("sin FCM_CUENTA_SERVICIO", () => {
  it("la app arranca (ya esta arriba) y GET /notificaciones funciona", async () => {
    const r = await app.inject({ method: "GET", url: "/api/notificaciones", headers: auth(tokenApp) });
    expect(r.statusCode).toBe(200);
    expect(r.json().total).toBeGreaterThan(0);
  });
});

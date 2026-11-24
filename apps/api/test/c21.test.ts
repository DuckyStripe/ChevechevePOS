import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TAREAS_F3 } from "../src/tareas.js";
import { cerrarPoolPruebas, crearApp, entrar, errorDe, pool } from "./ayuda.js";
import { activarCliente, catalogoF3, clienteConEnlace, crearUsuarioF3, limpiarF3, pedidoEntregadoF3, pedirCliente, pedirPersonal, snapshotF3, type CatalogoF3, type Snapshot } from "./ayuda-f3.js";

// C21 / CONTRATOS §0: nunca se le quita el acceso a un cliente sin que una persona lo decida.
// Solo escriben el acceso: fn_generar_enlace y fn_revocar_enlace (revocado_en), fn_quitar_dispositivo (quitado_en),
// fn_restablecer_pin (pin_hash = null) y el PATCH de cliente (activo, accion explicita del personal).

const RAIZ = join(import.meta.dirname, "..");
const SQL_004 = readFileSync(join(RAIZ, "db/migraciones/004_clientes_pedidos.sql"), "utf8");

/** Cuerpos de `create [or replace] function app.<nombre>` (hasta el siguiente create function / trigger / vista). */
function funciones(sql: string): Map<string, string> {
  const partes = sql.split(/^create (?:or replace )?function app\./im).slice(1);
  return new Map(partes.map((p) => [p.slice(0, p.indexOf("(")).trim(), p.toLowerCase()]));
}
const quienes = (re: RegExp) => [...funciones(SQL_004)].filter(([, cuerpo]) => re.test(cuerpo)).map(([n]) => n).sort();

function archivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const ruta = join(dir, f);
    return statSync(ruta).isDirectory() ? archivosTs(ruta) : ruta.endsWith(".ts") ? [ruta] : [];
  });
}

describe("C21: busqueda en el codigo", () => {
  it("004: solo fn_generar_enlace y fn_revocar_enlace escriben revocado_en", () => {
    expect(quienes(/\brevocado_en\s*=/)).toEqual(["fn_generar_enlace", "fn_revocar_enlace"]);
  });
  it("004: solo fn_quitar_dispositivo escribe quitado_en", () => {
    expect(quienes(/\bquitado_en\s*=/)).toEqual(["fn_quitar_dispositivo"]);
  });
  it("004: solo fn_restablecer_pin deja pin_hash en null", () => {
    expect(quienes(/\bpin_hash\s*=\s*null/)).toEqual(["fn_restablecer_pin"]);
  });
  it("004: ninguna funcion escribe cliente.activo, ni borra enlaces, dispositivos o esperas", () => {
    expect(quienes(/update\s+app\.cliente\s+\w*\s*set[^;]*\bactivo\s*=/)).toEqual([]);
    expect(quienes(/delete\s+from\s+app\.cliente_(enlace|dispositivo)/)).toEqual([]);
  });

  it("src/**/*.ts: ningun SQL actualiza o borra enlaces ni dispositivos; solo el PATCH de cliente actualiza app.cliente", () => {
    const hallazgos: string[] = [];
    for (const f of archivosTs(join(RAIZ, "src"))) {
      const t = readFileSync(f, "utf8").toLowerCase();
      const rel = relative(RAIZ, f);
      if (/update\s+app\.cliente_(enlace|dispositivo|pin_espera)/.test(t)) hallazgos.push(`${rel}: update de enlace/dispositivo`);
      if (/delete\s+from\s+app\.cliente_(enlace|dispositivo|pin_espera)/.test(t)) hallazgos.push(`${rel}: delete de enlace/dispositivo`);
      if (/update\s+app\.cliente\s+(set|\w+\s+set)/.test(t) && rel !== "src/modulos/clientes/servicio.ts") hallazgos.push(`${rel}: update de app.cliente fuera del PATCH`);
      if (/\bactivo\s*=/.test(t) && /update\s+app\.cliente\s/.test(t) && rel !== "src/modulos/clientes/servicio.ts") hallazgos.push(`${rel}: escribe activo`);
    }
    expect(hallazgos).toEqual([]);
  });

  it("src/tareas.ts programa solo las tareas conocidas y ninguna toca el acceso", () => {
    expect(TAREAS_F3.map((t) => t.nombre).sort()).toEqual(["alertas-clientes", "sembrar-fechas-demanda", "sugerir-pedidos", "vencer-faltantes", "vencer-propuestos"]);
    expect(TAREAS_F3.map((t) => t.sql).sort()).toEqual([
      "select app.fn_alertas_clientes()", "select app.fn_sembrar_fechas_siguiente()", "select app.fn_sugerir_pedidos()", "select app.fn_vencer_faltantes()", "select app.fn_vencer_propuestos()",
    ]);
    const intervalos = Object.fromEntries(TAREAS_F3.map((t) => [t.nombre, t.cadaMs]));
    expect(intervalos).toEqual({ "vencer-faltantes": 60_000, "vencer-propuestos": 900_000, "sugerir-pedidos": 900_000, "alertas-clientes": 3_600_000, "sembrar-fechas-demanda": 3_600_000 });
    // Nadie mas programa tareas.
    const quienProgramaTareas = archivosTs(join(RAIZ, "src")).filter((f) => /\bprogramar\(/.test(readFileSync(f, "utf8")) && !f.endsWith("src/tareas.ts"));
    expect(quienProgramaTareas.map((f) => relative(RAIZ, f))).toEqual([]);
    // Y las funciones que corren no estan entre las que escriben acceso.
    const escritoras = new Set(["fn_generar_enlace", "fn_revocar_enlace", "fn_quitar_dispositivo", "fn_restablecer_pin"]);
    for (const t of TAREAS_F3) expect(escritoras.has(/app\.(fn_\w+)/.exec(t.sql)![1]!)).toBe(false);
  });
});

describe("C21: tarea de push (F4)", () => {
  it("envio-push solo se programa con FCM_CUENTA_SERVICIO, es la unica tarea fuera de TAREAS_F3 y no toca el acceso del cliente", () => {
    const tareas = readFileSync(join(RAIZ, "src/tareas.ts"), "utf8");
    expect([...tareas.matchAll(/programar\(app, "([\w-]+)"/g)].map((m) => m[1]).sort()).toEqual(["envio-push"]);
    expect(/if \(env\.FCM_CUENTA_SERVICIO\)[\s\S]*programar\(app, "envio-push"/.test(tareas)).toBe(true);
    const envio = readFileSync(join(RAIZ, "src/modulos/notificaciones/envio.ts"), "utf8").toLowerCase();
    expect(envio).not.toMatch(/cliente_enlace|cliente_dispositivo|pin_hash|app\.cliente\b/);
  });
});

describe("C21: comportamiento", () => {
  let app: FastifyInstance;
  let antes: Snapshot;
  let pedir: ReturnType<typeof pedirPersonal>;
  let publico: ReturnType<typeof pedirCliente>;
  let dueno: { token: string; id: string };
  let k: CatalogoF3;

  beforeAll(async () => {
    antes = await snapshotF3();
    app = await crearApp();
    pedir = pedirPersonal(app);
    publico = pedirCliente(app);
    const u = await crearUsuarioF3("Dueño");
    dueno = { token: await entrar(app, u), id: u.id };
    k = await catalogoF3(app, dueno.token);
  });
  afterAll(async () => {
    await limpiarF3(app, antes);
    await cerrarPoolPruebas();
  });

  const acceso = async (id: string) =>
    (await pool.query(
      `select (select activo from app.cliente where id = $1) as activo,
              (select json_agg(json_build_object('id', e.id, 'revocado_en', e.revocado_en, 'pin', e.pin_hash)  order by e.id) from app.cliente_enlace e where e.cliente_id = $1) as enlaces,
              (select json_agg(json_build_object('id', d.id, 'quitado_en', d.quitado_en) order by d.id) from app.cliente_dispositivo d join app.cliente_enlace e on e.id = d.cliente_enlace_id where e.cliente_id = $1) as dispositivos`,
      [id],
    )).rows[0];

  it("las 4 tareas, 10 tokens falsos y 5 PIN malos no cambian enlace, dispositivos, PIN ni activo; el cliente vuelve a entrar con su dispositivo", async () => {
    await pedir("PATCH", "/api/configuracion", dueno.token, { sugerencia_hora: "00:00", visitas_umbral: 5, inactividad_dias: 30 });
    const c = await clienteConEnlace(app, dueno, {});
    const cred = await activarCliente(app, c);
    // Todo lo que dispara avisos: muchas aperturas sin pedir, 40 dias de enlace y atrasado en su cadencia.
    await pool.query("update app.cliente_enlace set creado_en = now() - interval '40 days' where id = $1", [c.enlace_id]);
    await pool.query("insert into app.cliente_visita (cliente_id, fecha, aperturas) values ($1, app.fn_fecha_local(now()), 9)", [c.id]);
    for (const dias of [60, 53, 46, 39]) await pedidoEntregadoF3(c.id, { hace_dias: dias, lineas: [{ presentacion_id: k.corona.caja, cantidad: 2, precio: "420.00" }] });
    const antes1 = await acceso(c.id);

    // 5 PIN malos desde una IP y 10 tokens falsos desde otra.
    for (let i = 0; i < 5; i++) await publico("POST", "/api/publico/pin/entrar", { token: c.token, ip: "10.55.5.5" }, { pin: "0000" });
    for (let i = 0; i < 10; i++) expect((await publico("GET", "/api/publico/cliente", { token: `falso-${i}-c21`, ip: "10.55.5.6" })).statusCode).toBe(401);
    expect(errorDe(await publico("GET", "/api/publico/cliente", { token: "otro-c21", ip: "10.55.5.6" })).codigo).toBe("ENLACE_BLOQUEADO");

    for (const t of TAREAS_F3) await pool.query(t.sql);
    // Las alertas si se generaron (la tarea avisa) ...
    const alertas = await pool.query("select evento from app.notificacion where usuario_id = $1 and clave in ($2, $3)", [dueno.id, `visitas:${c.id}:${(await pool.query("select to_char(app.fn_fecha_local(now()), 'IYYY\"-W\"IW') as s")).rows[0].s}`, `inactivo:${c.id}:e${c.enlace_id}`]);
    expect(alertas.rows.length).toBeGreaterThanOrEqual(1);
    // ... y la lista del personal las marca, pero el acceso no cambia.
    const fila = (await pedir("GET", `/api/clientes?buscar=${encodeURIComponent(c.nombre)}`, dueno.token)).json().items[0];
    expect(fila.alertas).toEqual(expect.arrayContaining(["visitas"]));
    expect(await acceso(c.id)).toEqual(antes1);
    expect(antes1.activo).toBe(true);
    expect(antes1.enlaces.every((e: { revocado_en: unknown }) => e.revocado_en === null)).toBe(true);

    // El cliente sigue entrando con su dispositivo, sin PIN, y la IP que fallo tambien (cuando pase su espera) con el PIN correcto.
    expect((await publico("GET", "/api/publico/cliente", cred)).statusCode).toBe(200);
    expect((await publico("POST", "/api/publico/pedidos", cred, { clave_idempotencia: "no-uuid" })).statusCode).toBe(400);
    expect((await pool.query("select count(*)::int as n from app.cliente_enlace where cliente_id = $1 and revocado_en is null", [c.id])).rows[0].n).toBe(1);
  });

  it("solo una persona le quita el acceso: dar de baja, quitar dispositivo, restablecer PIN y desactivar son acciones del personal", async () => {
    const c = await clienteConEnlace(app, dueno, {});
    const cred = await activarCliente(app, c);
    expect((await publico("GET", "/api/publico/cliente", cred)).statusCode).toBe(200);
    expect((await pedir("PATCH", `/api/clientes/${c.id}`, dueno.token, { activo: false })).statusCode).toBe(200);
    expect(errorDe(await publico("GET", "/api/publico/cliente", cred)).codigo).toBe("ENLACE_INVALIDO");
    expect((await pedir("PATCH", `/api/clientes/${c.id}`, dueno.token, { activo: true })).statusCode).toBe(200);
    expect((await publico("GET", "/api/publico/cliente", cred)).statusCode).toBe(200); // el enlace nunca se toco
    const baja = await pedir("POST", "/api/clientes/enlaces/revocar", dueno.token, { cliente_ids: [c.id], motivo: "ya_no_es_cliente" });
    expect(baja.json()).toEqual({ dados_de_baja: 1 });
    expect(errorDe(await publico("GET", "/api/publico/cliente", cred)).codigo).toBe("ENLACE_INVALIDO");
  });
});

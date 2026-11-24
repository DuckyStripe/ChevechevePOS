import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import type pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { enTransaccion, error, pool, ROL } from "./ayuda.js";

afterAll(() => pool.end());

let n = 0;
const usuario = async (c: pg.PoolClient, rol: string = ROL.admin): Promise<string> =>
  (await c.query(
    `insert into app.usuario (usuario, nombre, contrasena_hash, rol_id, sucursal_id)
     values ($1, 'Prueba F4', 'hash-secreto', ${rol}, 1) returning id`,
    [`tf4_sql${++n}x${process.pid}`],
  )).rows[0].id;
const sesion = async (c: pg.PoolClient, usuarioId: string, origen: "web" | "app" = "app"): Promise<string> =>
  (await c.query("insert into app.sesion (usuario_id, origen, expira_en) values ($1, $2, now() + interval '1 day') returning jti", [usuarioId, origen])).rows[0].jti;
const token = () => `tok-${randomUUID()}-${randomUUID()}`;
const registrar = async (c: pg.PoolClient, u: string, jti: string, tok = token()) =>
  (await c.query("select app.fn_registrar_dispositivo($1, $2, $3, 'android', '1.0.0') as id", [u, jti, tok])).rows[0].id as string;
const notificar = (c: pg.PoolClient, u: string, clave: string) =>
  c.query("select app.fn_notificar('pedido_nuevo', $1, '{\"cliente\":\"X\",\"folio\":\"P-1\",\"total\":\"1.00\",\"pedido_id\":1}'::jsonb, $2)", [clave, u]);
const envios = async (c: pg.PoolClient, u: string) =>
  (await c.query(
    `select e.id, e.estado, e.intentos, e.dispositivo_id from app.notificacion_envio e
     join app.notificacion n on n.id = e.notificacion_id where n.usuario_id = $1 order by e.id`, [u])).rows;

describe("migracion 005", () => {
  it("app.migraciones tiene 000-005 y re-correr el migrador no aplica nada", async () => {
    const r = await pool.query("select archivo from app.migraciones order by archivo");
    expect(r.rows.map((x) => x.archivo)).toEqual(expect.arrayContaining(["000_base.sql", "004_clientes_pedidos.sql", "005_push.sql"]));
    const p = spawnSync(process.execPath, ["scripts/migrar.mjs"], { encoding: "utf8", env: process.env });
    expect(p.stdout).toContain("nada pendiente");
    expect(p.status).toBe(0);
  });

  it("la plantilla push_pin_ataque ya dice 15 minutos (004) y 005 no la toca", async () => {
    const r = await pool.query("select texto from app.plantilla where clave = 'push_pin_ataque'");
    expect(r.rows[0].texto).toContain("15 minutos");
  });
});

describe("registrar dispositivo", () => {
  it("sesion web -> SOLO_APP; sesion app -> id; sesion cerrada -> SESION_CERRADA; plataforma ajena -> VALIDACION", async () => {
    await enTransaccion(async (c) => {
      const u = await usuario(c);
      const web = await sesion(c, u, "web");
      expect((await error(c, () => registrar(c, u, web))).message).toBe("SOLO_APP");
      const app = await sesion(c, u);
      expect(await registrar(c, u, app)).toMatch(/^\d+$/);
      await c.query("update app.sesion set cerrada_en = now() where jti = $1", [app]);
      expect((await error(c, () => registrar(c, u, app))).message).toBe("SESION_CERRADA");
      const otra = await sesion(c, u);
      expect((await error(c, () => c.query("select app.fn_registrar_dispositivo($1, $2, $3, 'ios', null)", [u, otra, token()]))).message).toBe("VALIDACION");
      // Sesion de otro usuario: no vale.
      const v = await usuario(c);
      expect((await error(c, () => registrar(c, v, otra))).message).toBe("SESION_CERRADA");
    });
  });

  it("el mismo token desde otra sesion y otro usuario reasigna la misma fila, limpia revocado_en y descarta lo pendiente del dueno anterior", async () => {
    await enTransaccion(async (c) => {
      const a = await usuario(c);
      const b = await usuario(c);
      const sa = await sesion(c, a);
      const sb = await sesion(c, b);
      const tok = token();
      const id = await registrar(c, a, sa, tok);
      await notificar(c, a, "k1");
      expect((await envios(c, a)).map((e) => e.estado)).toEqual(["pendiente"]);
      await c.query("update app.dispositivo set revocado_en = now() where id = $1", [id]);
      expect(await registrar(c, b, sb, tok)).toBe(id);
      const d = (await c.query("select usuario_id, sesion_jti, revocado_en from app.dispositivo where token_push = $1", [tok])).rows;
      expect(d).toEqual([{ usuario_id: b, sesion_jti: sb, revocado_en: null }]);
      expect((await envios(c, a)).map((e) => e.estado)).toEqual(["descartada"]);
    });
  });

  it("quitar: con token quita ese; sin token quita los de la sesion; descarta pendientes; otro usuario no quita nada", async () => {
    await enTransaccion(async (c) => {
      const u = await usuario(c);
      const otro = await usuario(c);
      const s = await sesion(c, u);
      const t1 = token();
      await registrar(c, u, s, t1);
      await registrar(c, u, s);
      await notificar(c, u, "k1");
      // Otro usuario ni siquiera es dueno de la sesion.
      expect((await error(c, () => c.query("select app.fn_quitar_dispositivos($1, $2, $3)", [otro, s, t1]))).message).toBe("SESION_CERRADA");
      expect((await c.query("select app.fn_quitar_dispositivos($1, $2, $3) as n", [u, s, t1])).rows[0].n).toBe(1);
      expect((await c.query("select app.fn_quitar_dispositivos($1, $2) as n", [u, s])).rows[0].n).toBe(1);
      expect((await c.query("select app.fn_quitar_dispositivos($1, $2) as n", [u, s])).rows[0].n).toBe(0);
      expect((await envios(c, u)).map((e) => e.estado)).toEqual(["descartada", "descartada"]);
    });
  });
});

describe("encolar y revocar", () => {
  it("2 usuarios con pedidos.gestionar: uno con 2 dispositivos y otro con push = false -> 2 envios; revocado o sesion cerrada -> 0", async () => {
    await enTransaccion(async (c) => {
      const a = await usuario(c);
      const b = await usuario(c);
      const sa = await sesion(c, a);
      const sa2 = await sesion(c, a);
      const sb = await sesion(c, b);
      const da1 = await registrar(c, a, sa);
      const da2 = await registrar(c, a, sa2);
      await registrar(c, b, sb);
      await c.query("insert into app.notificacion_preferencia (usuario_id, evento, push) values ($1, 'pedido_nuevo', false)", [b]);
      await notificar(c, a, "k1");
      await notificar(c, b, "k1");
      expect((await envios(c, a)).map((e) => e.dispositivo_id).sort()).toEqual([da1, da2].sort());
      expect(await envios(c, b)).toEqual([]);
      // La notificacion si existe (la bandeja no depende del push).
      expect((await c.query("select 1 from app.notificacion where usuario_id = $1", [b])).rowCount).toBe(1);

      await c.query("update app.dispositivo set revocado_en = now() where id = $1", [da1]);
      await c.query("update app.sesion set cerrada_en = now() where jti = $1", [sa2]);
      await notificar(c, a, "k2");
      // El de da1 sigue pendiente (se revoco a mano); el de da2 lo descarto el cierre de sesion.
      expect((await envios(c, a)).map((e) => e.estado)).toEqual(["pendiente", "descartada"]);
      const k2 = await c.query(
        "select 1 from app.notificacion_envio e join app.notificacion n on n.id = e.notificacion_id where n.usuario_id = $1 and n.clave = 'k2'", [a]);
      expect(k2.rowCount).toBe(0);
    });
  });

  it("cerrar la sesion revoca sus dispositivos y descarta sus envios pendientes (no los de otra sesion)", async () => {
    await enTransaccion(async (c) => {
      const u = await usuario(c);
      const s1 = await sesion(c, u);
      const s2 = await sesion(c, u);
      const d1 = await registrar(c, u, s1);
      const d2 = await registrar(c, u, s2);
      await notificar(c, u, "k1");
      await c.query("update app.sesion set cerrada_en = now() where jti = $1", [s1]);
      const rev = (await c.query("select id, revocado_en is not null as r from app.dispositivo where id = any($1) order by id", [[d1, d2]])).rows;
      expect(rev).toEqual([{ id: d1, r: true }, { id: d2, r: false }]);
      expect((await envios(c, u)).map((e) => [e.dispositivo_id, e.estado])).toEqual([[d1, "descartada"], [d2, "pendiente"]]);
    });
  });

  it("la tabla de dispositivos no se audita: ningun renglon de auditoria trae token_push", async () => {
    await enTransaccion(async (c) => {
      const u = await usuario(c);
      await registrar(c, u, await sesion(c, u), "token-secreto-de-auditoria");
      const r = await c.query("select 1 from app.auditoria where tabla in ('dispositivo','notificacion_envio') or despues::text like '%token-secreto-de-auditoria%'");
      expect(r.rowCount).toBe(0);
    });
  });
});

describe("despachador", () => {
  it("tomar: 25 h -> descartada y no sale; reintentos 1/5/30/120 min y al 5.o fallida; invalido revoca el dispositivo; enviada", async () => {
    await enTransaccion(async (c) => {
      const u = await usuario(c);
      const s = await sesion(c, u);
      const tok = token();
      const d = await registrar(c, u, s, tok);
      await notificar(c, u, "viejo");
      await c.query("update app.notificacion set creado_en = now() - interval '25 hours' where usuario_id = $1 and clave = 'viejo'", [u]);
      await notificar(c, u, "nuevo");
      const tomados = (await c.query("select * from app.fn_envios_tomar(50) where token_push = $1", [tok])).rows;
      expect(tomados).toHaveLength(1);
      expect(Object.keys(tomados[0]).sort()).toEqual(["cuerpo", "datos", "envio_id", "evento", "notificacion_id", "titulo", "token_push"]);
      expect(tomados[0]).toMatchObject({ titulo: "Pedido nuevo", evento: "pedido_nuevo", datos: { ruta: "/pedidos/1" } });
      const todos = (await envios(c, u)).map((e) => e.estado);
      expect(todos.sort()).toEqual(["descartada", "pendiente"]);
      // Reservar es por envio y justo antes de mandarlo: la primera vez es tuyo; despues ni se reserva ni se vuelve a tomar.
      expect((await c.query("select app.fn_envio_reservar($1) as ok", [tomados[0].envio_id])).rows[0].ok).toBe(true);
      expect((await c.query("select app.fn_envio_reservar($1) as ok", [tomados[0].envio_id])).rows[0].ok).toBe(false);
      expect((await c.query("select * from app.fn_envios_tomar(50) where token_push = $1", [tok])).rowCount).toBe(0);

      const id = tomados[0].envio_id as string;
      const espera = async () => (await c.query("select intentos, estado, round(extract(epoch from siguiente_intento_en - now()) / 60) as min, ultimo_error from app.notificacion_envio where id = $1", [id])).rows[0];
      const esperas: number[] = [];
      for (let i = 1; i <= 4; i++) {
        await c.query("select app.fn_envio_resultado($1, 'temporal', 'UNAVAILABLE')", [id]);
        const e = await espera();
        expect(e).toMatchObject({ intentos: i, estado: "pendiente", ultimo_error: "UNAVAILABLE" });
        esperas.push(Number(e.min));
      }
      expect(esperas).toEqual([1, 5, 30, 120]);
      await c.query("select app.fn_envio_resultado($1, 'temporal', 'UNAVAILABLE')", [id]);
      expect(await espera()).toMatchObject({ intentos: 5, estado: "fallida" });
      // Una vez cerrado, otro resultado no lo cambia.
      await c.query("select app.fn_envio_resultado($1, 'enviada', null)", [id]);
      expect((await espera()).estado).toBe("fallida");

      // enviada
      await notificar(c, u, "otro");
      const e2 = (await c.query("select e.id from app.notificacion_envio e join app.notificacion n on n.id = e.notificacion_id where n.clave = 'otro' and n.usuario_id = $1", [u])).rows[0].id;
      await c.query("select app.fn_envio_resultado($1, 'enviada', null)", [e2]);
      expect((await c.query("select estado, enviada_en is not null as ok from app.notificacion_envio where id = $1", [e2])).rows[0]).toEqual({ estado: "enviada", ok: true });

      // invalido: revoca el dispositivo y descarta lo pendiente de ese dispositivo
      await notificar(c, u, "malo");
      await notificar(c, u, "malo2");
      const pend = (await c.query("select e.id from app.notificacion_envio e join app.notificacion n on n.id = e.notificacion_id where n.clave in ('malo','malo2') and n.usuario_id = $1 order by e.id", [u])).rows;
      await c.query("select app.fn_envio_resultado($1, 'invalido', 'UNREGISTERED')", [pend[0].id]);
      expect((await c.query("select revocado_en is not null as r from app.dispositivo where id = $1", [d])).rows[0].r).toBe(true);
      expect((await c.query("select estado, ultimo_error from app.notificacion_envio where id = $1", [pend[1].id])).rows[0].estado).toBe("descartada");
      expect((await error(c, () => c.query("select app.fn_envio_resultado($1, 'raro', null)", [pend[0].id]))).message).toBe("VALIDACION");
    });
  });

  it("fn_envios_tomar(50) desde dos conexiones a la vez no repite ningun envio", async () => {
    const c0 = await pool.connect();
    let u = "";
    const marca = (await c0.query("select coalesce(max(id), 0) as m from app.auditoria")).rows[0].m;
    try {
      u = await usuario(c0);
      const s = await sesion(c0, u);
      const toks: string[] = [];
      for (let i = 0; i < 6; i++) {
        const t = token();
        toks.push(t);
        await registrar(c0, u, s, t);
      }
      await notificar(c0, u, "conc");
      const tomar = async () => {
        const c = await pool.connect();
        try {
          await c.query("begin");
          const r = await c.query("select envio_id from app.fn_envios_tomar(50) where token_push = any($1)", [toks]);
          await new Promise((ok) => setTimeout(ok, 150)); // las dos transacciones se traslapan
          await c.query("commit");
          return r.rows.map((x) => x.envio_id as string);
        } finally {
          c.release();
        }
      };
      const [x, y] = await Promise.all([tomar(), tomar()]);
      expect([...x, ...y].sort()).toEqual([...new Set([...x, ...y])].sort());
      expect(x.length + y.length).toBe(6);
    } finally {
      if (u) {
        await c0.query("delete from app.notificacion_envio where notificacion_id in (select id from app.notificacion where usuario_id = $1)", [u]);
        await c0.query("delete from app.dispositivo where usuario_id = $1", [u]);
        await c0.query("delete from app.notificacion where usuario_id = $1", [u]);
        await c0.query("delete from app.sesion where usuario_id = $1", [u]);
        await c0.query("delete from app.usuario where id = $1", [u]);
        await c0.query("delete from app.auditoria where id > $1", [marca]);
      }
      c0.release();
    }
  });
});

describe("casos de revision", () => {
  it("sesion vencida no encola; usuario desactivado revoca sus dispositivos y descarta lo pendiente", async () => {
    await enTransaccion(async (c) => {
      const u = await usuario(c);
      const s1 = await sesion(c, u);
      await registrar(c, u, s1);
      await c.query("update app.sesion set expira_en = now() - interval '1 minute' where jti = $1", [s1]);
      await notificar(c, u, "k1");
      expect(await envios(c, u)).toEqual([]);

      const v = await usuario(c);
      const s2 = await sesion(c, v);
      const d = await registrar(c, v, s2);
      await notificar(c, v, "k1");
      await c.query("update app.usuario set activo = false where id = $1", [v]);
      expect((await c.query("select revocado_en is not null as r from app.dispositivo where id = $1", [d])).rows[0].r).toBe(true);
      expect((await envios(c, v)).map((e) => e.estado)).toEqual(["descartada"]);
    });
  });

  it("DELETE (fn_quitar_dispositivos) con sesion web -> SOLO_APP", async () => {
    await enTransaccion(async (c) => {
      const u = await usuario(c);
      const web = await sesion(c, u, "web");
      expect((await error(c, () => c.query("select app.fn_quitar_dispositivos($1, $2)", [u, web]))).message).toBe("SOLO_APP");
    });
  });

  it("permanente -> fallida sin revocar el dispositivo; purgar borra terminados de mas de 30 dias y descarta pendientes de mas de 24 h", async () => {
    await enTransaccion(async (c) => {
      const u = await usuario(c);
      const d = await registrar(c, u, await sesion(c, u));
      await notificar(c, u, "a");
      await notificar(c, u, "b");
      await notificar(c, u, "c");
      const [a, b, cc] = (await envios(c, u)).map((e) => e.id);
      await c.query("select app.fn_envio_resultado($1, 'permanente', 'INVALID_ARGUMENT')", [a]);
      expect((await c.query("select estado, ultimo_error from app.notificacion_envio where id = $1", [a])).rows[0]).toEqual({ estado: "fallida", ultimo_error: "INVALID_ARGUMENT" });
      expect((await c.query("select revocado_en from app.dispositivo where id = $1", [d])).rows[0].revocado_en).toBeNull();

      await c.query("select app.fn_envio_resultado($1, 'enviada', null)", [b]);
      await c.query("update app.notificacion set creado_en = now() - interval '31 days' where clave in ('a', 'b') and usuario_id = $1", [u]);
      await c.query("update app.notificacion set creado_en = now() - interval '25 hours' where clave = 'c' and usuario_id = $1", [u]);
      expect((await c.query("select app.fn_envios_purgar() as n")).rows[0].n).toBe(2);
      expect((await envios(c, u)).map((e) => [e.id, e.estado])).toEqual([[cc, "descartada"]]);
    });
  });
});

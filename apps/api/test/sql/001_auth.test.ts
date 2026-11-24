import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import { crearUsuario, enTransaccion, error, pool, ROL } from "./ayuda.js";

afterAll(() => pool.end());

const CLAVES_CONFIG = [
  "negocio_nombre", "negocio_telefono", "negocio_direccion", "negocio_whatsapp", "ticket_pie",
  "credito_dias_predeterminado", "pedido_minimo", "hora_corte", "dias_aviso_caducidad", "url_publica",
  "faltante_minutos_respuesta", "faltante_accion_predeterminada", "reparto_minutos_por_parada",
  "reparto_velocidad_kmh", "transferencia_banco", "transferencia_titular", "transferencia_clabe",
  "margen_objetivo", "precio_redondeo", "sugerencia_dias_tolerancia", "sugerencia_vigencia_horas",
  "sugerencia_hora", "compra_cobertura_dias", "compra_promedio_dias", "semaforo_dias_rojo",
  "visitas_umbral", "visitas_dias", "inactividad_dias", "enlace_tras_primera_compra", "respaldo_ultima_prueba",
];

const PUSH = [
  "pedido_nuevo", "pedido_modificado", "pedido_cancelado_cliente", "surtido_listo", "ruta_asignada",
  "entrega_fallida", "ubicacion_propuesta", "dispositivo_nuevo", "visitas_sin_pedido", "cliente_inactivo",
  "faltante_respondido", "pin_ataque",
].map((e) => `push_${e}`);
const WA = [
  "enlace_cliente", "pedido_recibido", "pedido_confirmado", "pedido_faltante", "pedido_ajustado", "pedido_en_ruta",
  "entrega_fallida", "nota_entrega", "recordatorio_saldo", "lo_de_siempre", "estado_cuenta", "resumen_dia",
  "datos_transferencia", "cliente_avisa_pedido", "surtido_proveedor", "cliente_olvide_pin",
].map((e) => `wa_${e}`);
const PANTALLA = [
  "elegir_pin", "pedir_pin", "pin_espera", "pedido_enviado", "enlace_invalido", "aviso_ubicacion", "bienvenida", "faltante",
].map((e) => `pantalla_${e}`);
const ESTADO = [
  "propuesto", "recibido", "esperando_cliente", "confirmado", "surtiendo", "cargado", "en_ruta", "entregado", "no_entregado", "cancelado",
].map((e) => `estado_${e}`);

describe("migracion 001", () => {
  it("base vacia migrada: 000 y 001 registradas; re-correr el migrador no aplica nada", async () => {
    const r = await pool.query("select archivo from app.migraciones order by archivo");
    expect(r.rows.map((x) => x.archivo)).toEqual(readdirSync("db/migraciones").filter((f) => f.endsWith(".sql")).sort());
    expect(r.rows.map((x) => x.archivo)).toEqual(expect.arrayContaining(["000_base.sql", "001_auth.sql"]));
    const p = spawnSync(process.execPath, ["scripts/migrar.mjs"], { encoding: "utf8", env: process.env });
    expect(p.stdout).toContain("nada pendiente");
  });

  it("semillas: roles, permisos, configuracion y 46 plantillas", async () => {
    const roles = await pool.query("select nombre, es_sistema from app.rol order by id");
    expect(roles.rows.map((x) => x.nombre)).toEqual(["Dueño", "Administrador", "Repartidor", "Cajero", "Almacenista"]);
    expect(roles.rows.filter((x) => x.es_sistema)).toHaveLength(1);

    const perm = async (rol: string) =>
      (await pool.query("select permiso_codigo from app.rol_permiso rp join app.rol r on r.id = rp.rol_id where r.nombre = $1 and permiso_codigo in ('auditoria.ver','configuracion.editar','usuarios.gestionar') order by 1", [rol]))
        .rows.map((x) => x.permiso_codigo);
    expect(await perm("Dueño")).toEqual(["auditoria.ver", "configuracion.editar", "usuarios.gestionar"]);
    expect(await perm("Administrador")).toEqual(["auditoria.ver", "configuracion.editar"]);

    const suc = await pool.query("select id, nombre, lat, lng from app.sucursal");
    expect(suc.rows).toEqual([{ id: "1", nombre: "Bodega principal", lat: null, lng: null }]);

    const cfg = await pool.query("select clave from app.configuracion");
    expect(cfg.rows.map((x) => x.clave).sort()).toEqual([...CLAVES_CONFIG].sort());
    const v = await pool.query("select valor from app.configuracion where clave in ('respaldo_ultima_prueba','hora_corte') order by clave");
    expect(v.rows.map((x) => x.valor)).toEqual(["18:00", null]);

    // Solo las plantillas de 001–004; migraciones posteriores agregan las suyas.
    const pl = await pool.query("select clave, canal, titulo from app.plantilla where clave = any($1)", [[...PUSH, ...WA, ...PANTALLA, ...ESTADO]]);
    expect(pl.rows.map((x) => x.clave).sort()).toEqual([...PUSH, ...WA, ...PANTALLA, ...ESTADO].sort());
    for (const x of pl.rows) {
      const canal = x.clave.startsWith("wa_") ? "whatsapp" : x.clave.startsWith("push_") ? "push" : "pantalla";
      expect(x.canal, x.clave).toBe(canal);
      expect(x.titulo !== null, x.clave).toBe(canal === "push");
    }
  });
});

describe("funciones", () => {
  it("fn_fecha_local usa America/Mexico_City", async () => {
    const r = await pool.query("select app.fn_fecha_local('2026-11-24 05:30+00')::text as d, app.fn_fecha_local('2026-11-24 07:00+00')::text as e");
    expect(r.rows[0]).toEqual({ d: "2026-11-23", e: "2026-11-24" });
  });

  it("fn_siguiente_folio: consecutivo", async () => {
    await enTransaccion(async (c) => {
      // Relativo: desde 004 los pedidos tambien gastan folios P.
      const a = await c.query("select app.fn_siguiente_folio(1, 'P') f");
      const b = await c.query("select app.fn_siguiente_folio(1, 'P') f");
      const n = (x: string) => Number(x.slice(2));
      expect(a.rows[0].f).toMatch(/^P-\d{6}$/);
      expect(n(b.rows[0].f)).toBe(n(a.rows[0].f) + 1);
    });
  });

  it("fn_siguiente_folio: dos conexiones concurrentes no repiten folio", async () => {
    const a = await pool.connect();
    const b = await pool.connect();
    try {
      await a.query("begin");
      await b.query("begin");
      const fa = (await a.query("select app.fn_siguiente_folio(1, 'D') f")).rows[0].f;
      let bTermino = false;
      const pb = b.query("select app.fn_siguiente_folio(1, 'D') f").then((r) => ((bTermino = true), r.rows[0].f));
      await new Promise((r) => setTimeout(r, 300));
      expect(bTermino).toBe(false); // espera el candado de A
      await a.query("commit");
      const fb = await pb;
      await b.query("commit");
      expect(fa).toBe("D-000001");
      expect(fb).toBe("D-000002");
    } finally {
      await a.query("rollback").catch(() => undefined);
      await b.query("rollback").catch(() => undefined);
      a.release();
      b.release();
      await pool.query("delete from app.folio where serie = 'D'");
    }
  });

  it("fn_tiene_permiso", async () => {
    await enTransaccion(async (c) => {
      const admin = await crearUsuario(c, ROL.admin);
      const inactivo = await crearUsuario(c, ROL.admin, false);
      const q = async (u: string, p: string) => (await c.query("select app.fn_tiene_permiso($1, $2) t", [u, p])).rows[0].t;
      expect(await q(admin, "auditoria.ver")).toBe(true);
      expect(await q(admin, "usuarios.gestionar")).toBe(false);
      expect(await q(inactivo, "auditoria.ver")).toBe(false);
      expect(await q(admin, "no.existe")).toBe(false);
    });
  });

  it("fn_render_plantilla", async () => {
    await enTransaccion(async (c) => {
      await c.query(
        `insert into app.plantilla (clave, canal, titulo, texto, variables)
         values ('push_prueba_x', 'push', 'Hola {{cliente}}', 'Folio {{folio}} {{secreta}}|', '{cliente,folio}')`,
      );
      const r = await c.query("select * from app.fn_render_plantilla('push_prueba_x', $1::jsonb)", [
        JSON.stringify({ cliente: "Tienda Ana", folio: "P-000001", secreta: "no" }),
      ]);
      expect(r.rows[0]).toEqual({ titulo: "Hola Tienda Ana", texto: "Folio P-000001 |" });
      const w = await c.query("select * from app.fn_render_plantilla('wa_lo_de_siempre', '{\"cliente\":\"Ana\"}')");
      expect(w.rows[0].titulo).toBeNull();
      expect(w.rows[0].texto).toContain("Ana");
      expect(w.rows[0].texto).not.toContain("{{cliente}}");
      const e = await error(c, () => c.query("select * from app.fn_render_plantilla('no_existe', '{}')"));
      expect(e).toEqual({ code: "P0001", message: "PLANTILLA_NO_EXISTE" });
    });
  });
});

describe("fn_notificar", () => {
  const vars = JSON.stringify({ cliente: "Ana", folio: "P-000007", total: "100.00", pedido_id: 7 });

  it("con p_usuario_id: una fila con titulo/cuerpo y datos.ruta; misma clave -> 0", async () => {
    await enTransaccion(async (c) => {
      const u = await crearUsuario(c, ROL.admin);
      const n = await c.query("select app.fn_notificar('pedido_nuevo', 'pedido_nuevo:7', $1::jsonb, $2) n", [vars, u]);
      expect(n.rows[0].n).toBe(1);
      const f = await c.query("select titulo, cuerpo, datos from app.notificacion where usuario_id = $1", [u]);
      expect(f.rows).toEqual([{ titulo: "Pedido nuevo", cuerpo: "Ana hizo el pedido P-000007 por $100.00.", datos: { ruta: "/pedidos/7" } }]);
      const otra = await c.query("select app.fn_notificar('pedido_nuevo', 'pedido_nuevo:7', $1::jsonb, $2) n", [vars, u]);
      expect(otra.rows[0].n).toBe(0);
    });
  });

  it("sin p_usuario_id: solo usuarios activos con el permiso del evento", async () => {
    await enTransaccion(async (c) => {
      await c.query("insert into app.permiso (codigo, modulo, descripcion) values ('pedidos.gestionar', 'pedidos', 'x') on conflict do nothing");   // existe desde 004
      const con = await crearUsuario(c, ROL.admin);
      const inactivo = await crearUsuario(c, ROL.admin, false);
      const sin = await crearUsuario(c, ROL.admin);
      const dueno = await crearUsuario(c, ROL.dueno); // trg_permiso_a_sistema se lo dio
      await c.query("insert into app.rol_permiso (rol_id, permiso_codigo) select id, 'pedidos.gestionar' from app.rol where nombre = 'Administrador' on conflict do nothing");
      // `sin`: otro rol sin el permiso
      await c.query("update app.usuario set rol_id = (select id from app.rol where nombre = 'Cajero') where id = $1", [sin]);
      const n = await c.query("select app.fn_notificar('pedido_nuevo', 'k1', $1::jsonb) n", [vars]);
      expect(n.rows[0].n).toBe(2);
      const dest = await c.query("select usuario_id from app.notificacion where clave = 'k1' order by 1");
      expect(dest.rows.map((r) => r.usuario_id).sort()).toEqual([con, dueno].sort());
      expect(dest.rows.map((r) => r.usuario_id)).not.toContain(inactivo);
      // ruta_asignada solo con p_usuario_id
      const r = await c.query("select app.fn_notificar('ruta_asignada', 'k2', '{}'::jsonb) n");
      expect(r.rows[0].n).toBe(0);
    });
  });

  it("outbox: transaccion revertida no deja fila", async () => {
    const u = (await pool.query(
      `insert into app.usuario (usuario, nombre, contrasena_hash, rol_id, sucursal_id)
       values ('prueba.outbox', 'Outbox', 'x', ${ROL.admin}, 1) returning id`,
    )).rows[0].id;
    try {
      const c = await pool.connect();
      try {
        await c.query("begin");
        await c.query("select app.fn_notificar('pedido_nuevo', 'outbox:1', $1::jsonb, $2)", [vars, u]);
        expect((await c.query("select count(*)::int n from app.notificacion where clave = 'outbox:1'")).rows[0].n).toBe(1);
        await c.query("rollback");
      } finally {
        c.release();
      }
      expect((await pool.query("select count(*)::int n from app.notificacion where clave = 'outbox:1'")).rows[0].n).toBe(0);
    } finally {
      await pool.query("delete from app.auditoria where tabla = 'usuario' and registro_id = $1", [u]);
      await pool.query("delete from app.usuario where id = $1", [u]);
      await pool.query("delete from app.auditoria where tabla = 'usuario' and registro_id = $1", [u]);
    }
  });
});

describe("protecciones", () => {
  it("trg_permiso_a_sistema: el Dueño recibe el permiso nuevo, Administrador no", async () => {
    await enTransaccion(async (c) => {
      await c.query("insert into app.permiso (codigo, modulo, descripcion) values ('prueba.algo', 'prueba', 'x')");
      const r = await c.query("select r.nombre from app.rol_permiso rp join app.rol r on r.id = rp.rol_id where rp.permiso_codigo = 'prueba.algo'");
      expect(r.rows.map((x) => x.nombre)).toEqual(["Dueño"]);
    });
  });

  it("rol de sistema: UPDATE/DELETE y borrar su rol_permiso -> ROL_SISTEMA; cascada por permiso si; segundo es_sistema -> 23505", async () => {
    await enTransaccion(async (c) => {
      const rolSis = `(select id from app.rol where es_sistema)`;
      expect(await error(c, () => c.query(`update app.rol set descripcion = 'x' where id = ${rolSis}`))).toEqual({ code: "P0001", message: "ROL_SISTEMA" });
      expect(await error(c, () => c.query(`delete from app.rol where id = ${rolSis}`))).toEqual({ code: "P0001", message: "ROL_SISTEMA" });
      expect(await error(c, () => c.query(`delete from app.rol_permiso where rol_id = ${rolSis} and permiso_codigo = 'auditoria.ver'`))).toEqual({ code: "P0001", message: "ROL_SISTEMA" });
      expect((await error(c, () => c.query("insert into app.rol (nombre, es_sistema) values ('Otro', true)"))).code).toBe("23505");
      // borrar el permiso cascada también sobre el rol de sistema
      await c.query("insert into app.permiso (codigo, modulo, descripcion) values ('prueba.algo', 'prueba', 'x')");
      await c.query("delete from app.permiso where codigo = 'prueba.algo'");
      expect((await c.query("select count(*)::int n from app.rol_permiso where permiso_codigo = 'prueba.algo'")).rows[0].n).toBe(0);
      // un rol normal sí se edita y se borra
      await c.query("update app.rol set descripcion = 'nueva' where nombre = 'Cajero'");
      await c.query("delete from app.rol_permiso where permiso_codigo = 'auditoria.ver'  and rol_id = (select id from app.rol where nombre = 'Administrador')");
    });
  });

  it("último dueño", async () => {
    await enTransaccion(async (c) => {
      await c.query("set constraints all immediate");
      const d1 = await crearUsuario(c, ROL.dueno);
      const e = { code: "P0001", message: "ULTIMO_DUENO" };
      expect(await error(c, () => c.query("update app.usuario set activo = false where id = $1", [d1]))).toEqual(e);
      expect(await error(c, () => c.query(`update app.usuario set rol_id = ${ROL.admin} where id = $1`, [d1]))).toEqual(e);
      expect(await error(c, () => c.query("delete from app.usuario where id = $1", [d1]))).toEqual(e);
      // usuarios que no son dueño no disparan nada
      const a = await crearUsuario(c, ROL.admin);
      await c.query("update app.usuario set activo = false where id = $1", [a]);
      // con dos dueños, desactivar uno pasa
      const d2 = await crearUsuario(c, ROL.dueno);
      await c.query("update app.usuario set activo = false where id = $1", [d1]);
      expect(await error(c, () => c.query("update app.usuario set activo = false where id = $1", [d2]))).toEqual(e);
    });
  });
});

describe("último dueño concurrente", () => {
  it("dos transacciones que desactivan duenos distintos: una pasa y la otra ULTIMO_DUENO", async () => {
    const ins = async (n: string) =>
      (await pool.query(
        `insert into app.usuario (usuario, nombre, contrasena_hash, rol_id, sucursal_id)
         values ($1, 'D', 'x', ${ROL.dueno}, 1) returning id`, [n])).rows[0].id as string;
    const d1 = await ins("prueba.dueno1");
    const d2 = await ins("prueba.dueno2");
    const [a, b, tercero] = await Promise.all([pool.connect(), pool.connect(), pool.connect()]);
    try {
      await a.query("begin");
      await b.query("begin");
      await a.query("update app.usuario set activo = false where id = $1", [d1]);
      await b.query("update app.usuario set activo = false where id = $1", [d2]);
      // Un tercero retiene el candado del disparador: los dos COMMIT quedan esperando juntos.
      await tercero.query("begin");
      await tercero.query("select pg_advisory_xact_lock(862002)");
      let terminaron = 0;
      const fin = (c: typeof a) => c.query("commit").then(() => "ok", (e: { message: string }) => e.message).finally(() => terminaron++);
      const pa = fin(a);
      const pb = fin(b);
      await new Promise((r) => setTimeout(r, 300));
      expect(terminaron).toBe(0);
      await tercero.query("commit");
      expect((await Promise.all([pa, pb])).sort()).toEqual(["ULTIMO_DUENO", "ok"]);
    } finally {
      for (const c of [a, b, tercero]) {
        await c.query("rollback").catch(() => undefined);
        c.release();
      }
      const l = await pool.connect();
      try {
        await l.query("begin");
        await l.query("alter table app.usuario disable trigger trg_ultimo_dueno");
        await l.query("delete from app.usuario where id = any($1::bigint[])", [[d1, d2]]);
        await l.query("delete from app.auditoria where tabla = 'usuario' and registro_id = any($1::text[])", [[d1, d2]]);
        await l.query("alter table app.usuario enable trigger trg_ultimo_dueno");
        await l.query("commit");
      } finally {
        await l.query("rollback").catch(() => undefined);
        l.release();
      }
    }
  });
});

describe("auditoria", () => {
  it("usuario: usuario_id, sin contrasena_hash; ruido (intentos_fallidos) no audita; cambio de contrasena sí", async () => {
    await enTransaccion(async (c) => {
      const u = await crearUsuario(c, ROL.admin);
      await c.query("select set_config('app.usuario_id', $1, true)", [u]);
      await c.query("update app.usuario set nombre = 'Nuevo' where id = $1", [u]);
      const f = await c.query("select usuario_id, registro_id, accion, antes, despues from app.auditoria where tabla = 'usuario' and accion = 'actualizar' and registro_id = $1", [u]);
      expect(f.rows).toHaveLength(1);
      expect(f.rows[0].usuario_id).toBe(u);
      expect(f.rows[0].antes.nombre).toBe("Prueba");
      expect(f.rows[0].despues.nombre).toBe("Nuevo");
      expect(f.rows[0].antes).not.toHaveProperty("contrasena_hash");
      expect(f.rows[0].despues).not.toHaveProperty("contrasena_hash");

      await c.query("update app.usuario set intentos_fallidos = 3, bloqueado_hasta = now(), actualizado_en = now() where id = $1", [u]);
      expect((await c.query("select count(*)::int n from app.auditoria where tabla = 'usuario' and accion = 'actualizar' and registro_id = $1", [u])).rows[0].n).toBe(1);

      await c.query("update app.usuario set contrasena_hash = 'otro' where id = $1", [u]);
      expect((await c.query("select count(*)::int n from app.auditoria where tabla = 'usuario' and accion = 'actualizar' and registro_id = $1", [u])).rows[0].n).toBe(2);
    });
  });

  it("usuario_id vacío queda null (nullif)", async () => {
    await enTransaccion(async (c) => {
      await c.query("select set_config('app.usuario_id', '', true)");
      await c.query("update app.configuracion set valor = '\"X\"' where clave = 'ticket_pie'");
      const f = await c.query("select usuario_id from app.auditoria where tabla = 'configuracion'");
      expect(f.rows).toEqual([{ usuario_id: null }]);
    });
  });

  it("configuracion, rol_permiso, plantilla: registro_id por llave", async () => {
    await enTransaccion(async (c) => {
      await c.query("update app.configuracion set valor = '\"Pie\"' where clave = 'ticket_pie'");
      await c.query("insert into app.rol_permiso (rol_id, permiso_codigo) select id, 'usuarios.gestionar' from app.rol where nombre = 'Cajero'");
      await c.query("update app.plantilla set texto = 'Cambiado {{cliente}}' where clave = 'wa_cliente_olvide_pin'");
      const cajero = (await c.query("select id from app.rol where nombre = 'Cajero'")).rows[0].id;
      const reg = async (t: string) => (await c.query("select registro_id, accion from app.auditoria where tabla = $1", [t])).rows;
      expect(await reg("configuracion")).toEqual([{ registro_id: "ticket_pie", accion: "actualizar" }]);
      expect(await reg("rol_permiso")).toEqual([{ registro_id: `${cajero}:usuarios.gestionar`, accion: "insertar" }]);
      expect(await reg("plantilla")).toEqual([{ registro_id: "wa_cliente_olvide_pin", accion: "actualizar" }]);
    });
  });
});

describe("CHECKs", () => {
  it("usuario corto, coordenadas a medias, push sin titulo, eventos fuera de lista", async () => {
    await enTransaccion(async (c) => {
      const mal = (sql: string, p: unknown[] = []) => error(c, () => c.query(sql, p));
      expect((await mal(`insert into app.usuario (usuario, nombre, contrasena_hash, rol_id, sucursal_id) values ('AB', 'x', 'h', ${ROL.admin}, 1)`)).code).toBe("23514");
      expect((await mal("insert into app.sucursal (nombre, lat) values ('S', 19.4)")).code).toBe("23514");
      expect((await mal("insert into app.plantilla (clave, canal, texto) values ('push_sin_titulo', 'push', 'x')")).code).toBe("23514");
      const u = await crearUsuario(c, ROL.admin);
      expect((await mal("insert into app.notificacion (usuario_id, evento, titulo, cuerpo, clave) values ($1, 'inventado', 't', 'c', 'k')", [u])).code).toBe("23514");
      expect((await mal("insert into app.notificacion_preferencia (usuario_id, evento) values ($1, 'inventado')", [u])).code).toBe("23514");
    });
  });
});

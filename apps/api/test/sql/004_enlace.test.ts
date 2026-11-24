import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import type pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { enTransaccion, error, pool } from "./ayuda.js";
import { dia, errorConDetalle, producto } from "./ayuda-inventario.js";
import {
  catalogoBase, cliente, clienteAtrasado, enlace, fila, notificaciones, pedido, pedidoEntregado, ROL3, sha, usuarioF3,
} from "./ayuda-pedidos.js";

afterAll(() => pool.end());

const generar = (c: pg.PoolClient, usuario: string, cli: string, forzar = false) => {
  const hash = sha(randomBytes(16).toString("hex"));
  return c.query("select app.fn_generar_enlace($1, $2, $3, $4, $5) as id", [usuario, cli, hash, randomBytes(60), forzar]).then((r) => ({ id: r.rows[0].id as string, hash }));
};
const entrar = async (c: pg.PoolClient, enl: string, ip: string, ok: boolean, disp = sha(randomBytes(8).toString("hex")), nav = "Chrome Android") =>
  (await c.query("select app.fn_entrar_con_pin($1, $2, $3, $4, $5) as r", [enl, ip, ok, disp, nav])).rows[0].r as Record<string, unknown>;
const porToken = async (c: pg.PoolClient, token: string, disp: string | null = null) =>
  (await c.query("select * from app.fn_cliente_por_token($1, $2)", [token, disp])).rows;

describe("migracion 004: objetos, semillas y permisos", () => {
  it("app.migraciones tiene 000-004 y re-correr el migrador no aplica nada", async () => {
    const r = await pool.query("select archivo from app.migraciones order by archivo");
    expect(r.rows.map((x) => x.archivo)).toEqual(["000_base.sql", "001_auth.sql", "002_catalogo_inventario.sql", "003_compras.sql", "004_clientes_pedidos.sql"]);
    const p = spawnSync(process.execPath, ["scripts/migrar.mjs"], { encoding: "utf8", env: process.env });
    expect(p.stdout).toContain("nada pendiente");
    expect(p.status).toBe(0);
  });

  it("9 permisos nuevos, todos del Dueno; Administrador sin cambiar_precio; Repartidor y Almacenista exactos", async () => {
    await enTransaccion(async (c) => {
      const nuevos = ["clientes.ver", "clientes.editar", "clientes.credito", "clientes.enlace", "pedidos.ver", "pedidos.capturar",
        "pedidos.gestionar", "pedidos.cambiar_precio", "avisos.enviar"];
      expect((await c.query("select codigo from app.permiso where codigo = any($1)", [nuevos])).rowCount).toBe(9);
      const de = async (rol: string) => (await c.query(
        "select rp.permiso_codigo from app.rol_permiso rp join app.rol r on r.id = rp.rol_id where r.nombre = $1 and rp.permiso_codigo = any($2)", [rol, nuevos])).rows.map((x) => x.permiso_codigo as string).sort();
      expect(await de("Dueño")).toEqual([...nuevos].sort());
      expect(await de("Administrador")).toEqual(nuevos.filter((x) => x !== "pedidos.cambiar_precio").sort());
      expect(await de("Repartidor")).toEqual(["avisos.enviar", "clientes.ver"]);
      expect(await de("Cajero")).toEqual(["avisos.enviar", "clientes.ver", "pedidos.capturar", "pedidos.ver"]);
      expect(await de("Almacenista")).toEqual(["pedidos.ver"]);
      // La semilla no ensucia la bitacora.
      expect((await c.query("select 1 from app.auditoria where tabla = 'rol_permiso' and registro_id like '%pedidos.%'")).rowCount).toBe(0);
    });
  });
});

describe("enlace del cliente", () => {
  it("generar: SIN_PRIMERA_COMPRA; forzado crea enlace y aviso; otro reemplaza al anterior; dos vigentes a mano 23505; auditoria sin secretos", async () => {
    await enTransaccion(async (c) => {
      const u = await usuarioF3(c);
      const cli = await cliente(c, { ya_compro: false });
      const e1 = await errorConDetalle(c, () => generar(c, u, cli));
      expect(e1.message).toBe("SIN_PRIMERA_COMPRA");
      const a = await generar(c, u, cli, true);
      const av = await fila<{ estado: string; vars: Record<string, string> }>(c, "select estado, vars from app.aviso_cliente where clave = $1", [`wa_enlace_cliente:c${cli}:e${a.id}`]);
      expect(av.estado).toBe("pendiente");
      expect(Object.keys(av.vars).sort()).toEqual(["cliente", "negocio"]);
      expect(await fila(c, "select despues->>'forzado' as f from app.auditoria where tabla = 'cliente_enlace' and registro_id = $1 and despues ? 'forzado'", [a.id])).toEqual({ f: "true" });

      const b = await generar(c, u, cli, true);
      expect(await fila(c, "select revocado_en is not null as r, motivo_revocacion, revocado_por from app.cliente_enlace where id = $1", [a.id]))
        .toEqual({ r: true, motivo_revocacion: "reemplazado", revocado_por: u });
      expect(await porToken(c, a.hash)).toEqual([]);
      expect(await porToken(c, b.hash)).toHaveLength(1);

      const dup = await error(c, () => c.query("insert into app.cliente_enlace (cliente_id, token_hash, token_cifrado, creado_por) values ($1, $2, '\\x00', $3)", [cli, sha("x"), u]));
      expect(dup.code).toBe("23505");

      const aud = await c.query("select antes, despues from app.auditoria where tabla = 'cliente_enlace' and registro_id = $1", [a.id]);
      expect(aud.rowCount).toBeGreaterThanOrEqual(2);
      for (const f of aud.rows) for (const x of [f.antes, f.despues]) {
        if (!x) continue;
        for (const secreto of ["token_hash", "token_cifrado", "pin_hash"]) expect(secreto in x).toBe(false);
      }
      // Con primera compra no hace falta forzar; sin permiso o cliente inactivo no se genera.
      const ok = await cliente(c);
      expect((await generar(c, u, ok)).id).toBeTruthy();
      const rep = await usuarioF3(c, ROL3.repartidor);
      expect((await error(c, () => generar(c, rep, ok))).message).toBe("SIN_PERMISO");
      await c.query("update app.cliente set activo = false where id = $1", [ok]);
      expect((await error(c, () => generar(c, u, ok))).message).toBe("CLIENTE_INACTIVO");
    });
  });

  it("primera compra por pedido entregado (sin ya_compro) tambien cuenta", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c, { ya_compro: false });
      await pedidoEntregado(c, cli, { creado_hace_dias: 2, lineas: [{ presentacion: k.caja, cantidad: 1, entregada: 1, precio: "420.00" }] });
      expect((await generar(c, k.usuario, cli)).id).toBeTruthy();
    });
  });

  it("revocar: 3 clientes (uno sin enlace) devuelve 2; otro sin nota VALIDACION; sin permiso SIN_PERMISO; generar despues da enlace nuevo", async () => {
    await enTransaccion(async (c) => {
      const u = await usuarioF3(c);
      const [a, b, sinEnlace] = [await cliente(c), await cliente(c), await cliente(c)];
      const ea = await generar(c, u, a);
      await generar(c, u, b);
      const revocar = (usuario: string, ids: string[], motivo: string, nota: string | null = null) =>
        c.query("select app.fn_revocar_enlace($1, $2::bigint[], $3, $4) as n", [usuario, ids, motivo, nota]);

      expect((await error(c, () => revocar(u, [a, b], "otro"))).message).toBe("VALIDACION");
      expect((await error(c, () => revocar(u, [a, b], "reemplazado"))).message).toBe("VALIDACION");
      const rep = await usuarioF3(c, ROL3.repartidor);
      expect((await error(c, () => revocar(rep, [a], "solo_cotiza"))).message).toBe("SIN_PERMISO");
      expect((await revocar(u, [a, b, sinEnlace], "ya_no_es_cliente")).rows[0].n).toBe(2);
      expect(await fila(c, "select motivo_revocacion, revocado_por, revocado_en is not null as r from app.cliente_enlace where cliente_id = $1", [a]))
        .toEqual({ motivo_revocacion: "ya_no_es_cliente", revocado_por: u, r: true });
      expect(await porToken(c, ea.hash)).toEqual([]);
      expect((await revocar(u, [a, b, sinEnlace], "ya_no_es_cliente")).rows[0].n).toBe(0);

      const nuevo = await generar(c, u, a);
      expect(nuevo.hash).not.toBe(ea.hash);
      expect(await porToken(c, ea.hash)).toEqual([]);
      expect(await porToken(c, nuevo.hash)).toHaveLength(1);
      expect((await revocar(u, [a], "otro", "se mudo")).rows[0].n).toBe(1);
      expect((await fila<{ nota_revocacion: string }>(c, "select nota_revocacion from app.cliente_enlace where id = $1", [nuevo.id])).nota_revocacion).toBe("se mudo");
    });
  });

  it("PIN: PIN_YA_DEFINIDO, primer PIN sin alerta, 4 incorrectos con intentos 4..1, 5.o en espera, espera sin comparar, otra IP libre, acierto tras la espera", async () => {
    await enTransaccion(async (c) => {
      const u = await usuarioF3(c);
      const cli = await cliente(c);
      const e = await generar(c, u, cli);
      const d1 = sha("disp-1");
      const did1 = (await c.query("select app.fn_elegir_pin($1, 'pin-bcrypt', $2, 'Chrome Android') as id", [e.id, d1])).rows[0].id;
      expect((await error(c, () => c.query("select app.fn_elegir_pin($1, 'otro', $2, 'x')", [e.id, sha("d2")]))).message).toBe("PIN_YA_DEFINIDO");
      expect(await notificaciones(c, "dispositivo_nuevo", `dispositivo:${did1}`, [u])).toBe(0);
      expect(await porToken(c, e.hash, d1)).toEqual([{ cliente_id: cli, cliente_enlace_id: e.id, lista_precio_id: expect.any(String), dispositivo_ok: true, tiene_pin: true }]);
      expect((await porToken(c, e.hash, sha("desconocido")))[0].dispositivo_ok).toBe(false);

      for (const restantes of [4, 3, 2, 1]) {
        expect(await entrar(c, e.id, "ip-a", false)).toEqual({ codigo: "PIN_INCORRECTO", intentos_restantes: restantes });
      }
      const quinto = await entrar(c, e.id, "ip-a", false);
      expect(quinto.codigo).toBe("PIN_EN_ESPERA");
      expect(quinto.segundos).toBeGreaterThanOrEqual(899);
      expect(quinto.segundos).toBeLessThanOrEqual(900);
      // La espera no compara: con el PIN bueno tambien espera. Otra IP no esta en espera.
      expect((await entrar(c, e.id, "ip-a", true)).codigo).toBe("PIN_EN_ESPERA");
      expect(await entrar(c, e.id, "ip-b", false)).toEqual({ codigo: "PIN_INCORRECTO", intentos_restantes: 4 });

      await c.query("update app.cliente_pin_espera set espera_hasta = now() - interval '1 minute' where cliente_enlace_id = $1 and ip_hash = 'ip-a'", [e.id]);
      const d2 = sha("disp-2");
      const ok = await entrar(c, e.id, "ip-a", true, d2, "Safari iOS");
      expect(ok.codigo).toBe("OK");
      expect((await c.query("select 1 from app.cliente_pin_espera where cliente_enlace_id = $1 and ip_hash = 'ip-a'", [e.id])).rowCount).toBe(0);
      expect(await fila(c, "select navegador, quitado_en from app.cliente_dispositivo where token_hash = $1", [d2])).toEqual({ navegador: "Safari iOS", quitado_en: null });
      expect(await notificaciones(c, "dispositivo_nuevo", `dispositivo:${ok.dispositivo_id}`, [u])).toBe(1);
      // Un acierto desde un dispositivo ya registrado no vuelve a alertar.
      const otra = await entrar(c, e.id, "ip-a", true, d2);
      expect(otra.dispositivo_id).toBe(ok.dispositivo_id);
      expect(await notificaciones(c, "dispositivo_nuevo", `dispositivo:${ok.dispositivo_id}`, [u])).toBe(1);
    });
  });

  it("restablecer PIN: pin null, dispositivos y enlace intactos, PIN nuevo en dispositivo nuevo alerta; quitar dispositivo solo afecta a ese", async () => {
    await enTransaccion(async (c) => {
      const u = await usuarioF3(c);
      const cli = await cliente(c);
      const e = await generar(c, u, cli);
      const d1 = sha("d1");
      await c.query("select app.fn_elegir_pin($1, 'h', $2, 'Chrome Android')", [e.id, d1]);
      const d2 = sha("d2");
      await entrar(c, e.id, "ip", true, d2);

      const rep = await usuarioF3(c, ROL3.repartidor);
      expect((await error(c, () => c.query("select app.fn_restablecer_pin($1, $2)", [rep, cli]))).message).toBe("SIN_PERMISO");
      await c.query("select app.fn_restablecer_pin($1, $2)", [u, cli]);
      expect(await fila(c, "select pin_hash, revocado_en, id from app.cliente_enlace where cliente_id = $1 and revocado_en is null", [cli])).toEqual({ pin_hash: null, revocado_en: null, id: e.id });
      expect((await porToken(c, e.hash, d1))[0]).toMatchObject({ dispositivo_ok: true, tiene_pin: false });
      expect((await porToken(c, e.hash, d2))[0].dispositivo_ok).toBe(true);

      const d3 = sha("d3");
      const did3 = (await c.query("select app.fn_elegir_pin($1, 'nuevo', $2, 'WhatsApp iOS') as id", [e.id, d3])).rows[0].id;
      expect(await notificaciones(c, "dispositivo_nuevo", `dispositivo:${did3}`, [u])).toBe(1);

      const did1 = (await fila<{ id: string }>(c, "select id from app.cliente_dispositivo where token_hash = $1", [d1])).id;
      expect((await error(c, () => c.query("select app.fn_quitar_dispositivo($1, $2)", [rep, did1]))).message).toBe("SIN_PERMISO");
      await c.query("select app.fn_quitar_dispositivo($1, $2)", [u, did1]);
      expect((await porToken(c, e.hash, d1))[0].dispositivo_ok).toBe(false);
      expect((await porToken(c, e.hash, d2))[0].dispositivo_ok).toBe(true);
      expect((await porToken(c, e.hash, d3))[0].dispositivo_ok).toBe(true);
      expect(await fila(c, "select quitado_por, quitado_en is not null as q from app.cliente_dispositivo where id = $1", [did1])).toEqual({ quitado_por: u, q: true });
      expect((await error(c, () => c.query("select app.fn_quitar_dispositivo($1, 999999999)", [u]))).message).toBe("NO_ENCONTRADO");
    });
  });

  it("fn_cliente_por_token: cliente inactivo sin filas; ultimo_uso_en no cambia dentro del mismo minuto, si pasado un minuto", async () => {
    await enTransaccion(async (c) => {
      const u = await usuarioF3(c);
      const cli = await cliente(c);
      const e = await generar(c, u, cli);
      expect(await porToken(c, e.hash)).toHaveLength(1);
      const uso = async () => (await fila<{ t: string }>(c, "select ultimo_uso_en::text as t from app.cliente_enlace where id = $1", [e.id])).t;
      const primero = await uso();
      expect(primero).not.toBeNull();
      await c.query("update app.cliente_enlace set ultimo_uso_en = now() - interval '30 seconds' where id = $1", [e.id]);
      const hace30 = await uso();
      await porToken(c, e.hash);
      await porToken(c, e.hash);
      expect(await uso()).toBe(hace30);
      await c.query("update app.cliente_enlace set ultimo_uso_en = now() - interval '2 minutes' where id = $1", [e.id]);
      await porToken(c, e.hash);
      expect(await uso()).toBe(primero);
      // El uso no ensucia la bitacora.
      const n = (await c.query("select count(*)::int as n from app.auditoria where tabla = 'cliente_enlace' and registro_id = $1", [e.id])).rows[0].n;
      await c.query("update app.cliente_enlace set ultimo_uso_en = now() - interval '2 minutes' where id = $1", [e.id]);
      await porToken(c, e.hash);
      expect((await c.query("select count(*)::int as n from app.auditoria where tabla = 'cliente_enlace' and registro_id = $1", [e.id])).rows[0].n).toBe(n);

      await c.query("update app.cliente set activo = false where id = $1", [cli]);
      expect(await porToken(c, e.hash)).toEqual([]);
    });
  });
});

describe("visitas, alertas y C21", () => {
  it("visitas sin pedido: 4 aperturas 0 notificaciones; 5 -> 1 con clave de semana ISO; misma semana 0; con pedido 0", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const cli = await cliente(c);
      await enlace(c, cli, k.usuario);
      const semana = (await fila<{ s: string }>(c, `select to_char(app.fn_fecha_local(now()), 'IYYY"-W"IW') as s`)).s;
      const clave = `visitas:${cli}:${semana}`;
      for (let i = 0; i < 4; i++) await c.query("select app.fn_registrar_visita($1, 'apertura')", [cli]);
      await c.query("select app.fn_alertas_clientes()");
      expect(await notificaciones(c, "visitas_sin_pedido", clave, [k.usuario])).toBe(0);
      await c.query("select app.fn_registrar_visita($1, 'apertura')", [cli]);
      await c.query("select app.fn_registrar_visita($1, 'catalogo')", [cli]);
      expect(await fila(c, "select aperturas, vistas_catalogo from app.cliente_visita where cliente_id = $1", [cli])).toEqual({ aperturas: 5, vistas_catalogo: 1 });
      expect((await c.query("select app.fn_alertas_clientes() as n")).rows[0].n).toBeGreaterThanOrEqual(1);
      expect(await notificaciones(c, "visitas_sin_pedido", clave, [k.usuario])).toBe(1);
      expect((await c.query("select app.fn_alertas_clientes() as n")).rows[0].n).toBe(0);
      expect(await notificaciones(c, "visitas_sin_pedido", clave, [k.usuario])).toBe(1);
      expect((await error(c, () => c.query("select app.fn_registrar_visita($1, 'otro')", [cli]))).message).toBe("VALIDACION");

      const con = await cliente(c);
      await enlace(c, con, k.usuario);
      await pedido(c, con, [{ presentacion_id: k.caja, cantidad: 2 }]);
      for (let i = 0; i < 5; i++) await c.query("select app.fn_registrar_visita($1, 'apertura')", [con]);
      await c.query("select app.fn_alertas_clientes()");
      expect(await notificaciones(c, "visitas_sin_pedido", `visitas:${con}:${semana}`, [k.usuario])).toBe(0);
    });
  });

  it("inactividad: 30 dias -> inactivo:<cliente>:<pedido>; 29 nada; nunca pidio y enlace de hace 30 -> e<enlace>; sin enlace nada", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const linea = (dias: number) => ({ creado_hace_dias: dias, lineas: [{ presentacion: k.caja, cantidad: 1, entregada: 1, precio: "420.00" }] });
      const a = await cliente(c);
      await enlace(c, a, k.usuario);
      const pa = await pedidoEntregado(c, a, linea(30));
      const b = await cliente(c);
      await enlace(c, b, k.usuario);
      await pedidoEntregado(c, b, linea(29));
      const nunca = await cliente(c);
      const en = await enlace(c, nunca, k.usuario);
      await c.query("update app.cliente_enlace set creado_en = now() - interval '30 days' where id = $1", [en.id]);
      const sinEnlace = await cliente(c);
      await pedidoEntregado(c, sinEnlace, linea(40));
      await c.query("select app.fn_alertas_clientes()");
      expect(await notificaciones(c, "cliente_inactivo", `inactivo:${a}:${pa}`, [k.usuario])).toBe(1);
      expect(await notificaciones(c, "cliente_inactivo", `inactivo:${nunca}:e${en.id}`, [k.usuario])).toBe(1);
      const ruido = await c.query("select count(*)::int as n from app.notificacion where evento = 'cliente_inactivo' and usuario_id = $1 and (clave like $2 or clave like $3)",
        [k.usuario, `inactivo:${b}:%`, `inactivo:${sinEnlace}:%`]);
      expect(ruido.rows[0].n).toBe(0);
      const viva = await c.query("select tipo from app.v_alerta_cliente where cliente_id = any($1) order by cliente_id", [[a, b, nunca, sinEnlace]]);
      expect(viva.rows.map((r) => r.tipo)).toEqual(["cliente_inactivo", "cliente_inactivo"]);
    });
  });

  it("alerta dispositivo_nuevo en la vista: dispositivo no quitado del que no es el primero, reciente", async () => {
    await enTransaccion(async (c) => {
      const u = await usuarioF3(c);
      const cli = await cliente(c);
      const e = await generar(c, u, cli);
      await c.query("select app.fn_elegir_pin($1, 'h', $2, 'Chrome Android')", [e.id, sha("p1")]);
      expect((await c.query("select 1 from app.v_alerta_cliente where cliente_id = $1 and tipo = 'dispositivo_nuevo'", [cli])).rowCount).toBe(0);
      const ok = await entrar(c, e.id, "ip", true, sha("p2"), "WhatsApp iOS");
      const v = await c.query("select clave, detalle from app.v_alerta_cliente where cliente_id = $1 and tipo = 'dispositivo_nuevo'", [cli]);
      expect(v.rows).toEqual([{ clave: `dispositivo:${ok.dispositivo_id}`, detalle: { cliente: expect.any(String), cliente_id: Number(cli), dispositivo: "WhatsApp iOS" } }]);
    });
  });

  it("C21: ninguna funcion automatica revoca enlace, quita dispositivos, desactiva clientes ni toca el PIN", async () => {
    await enTransaccion(async (c) => {
      const k = await catalogoBase(c);
      const { cliente: cli, enlace: e } = await clienteAtrasado(c, k);
      await c.query("select app.fn_elegir_pin($1, 'pin-oculto', $2, 'Chrome Android')", [e.id, sha("dd")]);
      for (let i = 0; i < 5; i++) await c.query("select app.fn_registrar_visita($1, 'apertura')", [cli]);
      await c.query("update app.cliente_enlace set creado_en = now() - interval '40 days' where id = $1", [e.id]);
      const f = await pedido(c, cli, [{ presentacion_id: k.caja, cantidad: 2 }, { presentacion_id: k.six, cantidad: 1 }]);
      await c.query("select app.fn_confirmar_pedido($1, $2, $3::jsonb)", [k.usuario, f, JSON.stringify({ version: 1, fecha_entrega: await dia(c, 0) })]);

      const foto = async () => (await c.query(
        `select (select jsonb_agg(to_jsonb(e) - 'ultimo_uso_en' order by e.id) from app.cliente_enlace e) as enlaces,
                (select jsonb_agg(to_jsonb(d) - 'ultimo_uso_en' order by d.id) from app.cliente_dispositivo d) as dispositivos,
                (select jsonb_agg(c.activo order by c.id) from app.cliente c) as activos`)).rows[0];
      const antes = await foto();
      await c.query("update app.configuracion set valor = '\"00:00\"' where clave = 'sugerencia_hora'");
      await c.query("select app.fn_alertas_clientes()");
      await c.query("select app.fn_vencer_faltantes()");
      await c.query("select app.fn_sugerir_pedidos()");
      await c.query("select app.fn_vencer_propuestos()");
      for (let i = 0; i < 6; i++) await entrar(c, e.id, "ip-c21", false);
      expect(await foto()).toEqual(antes);
      expect((await fila<{ pin_hash: string }>(c, "select pin_hash from app.cliente_enlace where id = $1", [e.id])).pin_hash).toBe("pin-oculto");
    });
  });
});

describe("ubicacion y proxima visita", () => {
  it("proponer llena *_propuesta y notifica sin tocar lat/lng; fijar 'cliente' copia y limpia; SIN_PROPUESTA; fuera de Mexico 23514", async () => {
    await enTransaccion(async (c) => {
      const u = await usuarioF3(c);
      const cli = await cliente(c);
      await c.query("select app.fn_proponer_ubicacion($1, 19.432608, -99.133209)", [cli]);
      expect(await fila(c, "select lat, lat_propuesta, lng_propuesta, propuesta_en is not null as en from app.cliente where id = $1", [cli]))
        .toEqual({ lat: null, lat_propuesta: "19.432608", lng_propuesta: "-99.133209", en: true });
      const n = await c.query("select count(*)::int as n from app.notificacion where evento = 'ubicacion_propuesta' and usuario_id = $1 and clave like $2", [u, `ubicacion:${cli}:%`]);
      expect(n.rows[0].n).toBe(1);
      const sin = await usuarioF3(c, ROL3.repartidor);
      expect((await error(c, () => c.query("select app.fn_fijar_ubicacion($1, $2, null, null, 'cliente')", [sin, cli]))).message).toBe("SIN_PERMISO");
      await c.query("select app.fn_fijar_ubicacion($1, $2, null, null, 'cliente')", [u, cli]);
      expect(await fila(c, "select lat, lng, ubicacion_fuente, lat_propuesta, propuesta_en from app.cliente where id = $1", [cli]))
        .toEqual({ lat: "19.432608", lng: "-99.133209", ubicacion_fuente: "cliente", lat_propuesta: null, propuesta_en: null });
      expect((await error(c, () => c.query("select app.fn_fijar_ubicacion($1, $2, null, null, 'cliente')", [u, cli]))).message).toBe("SIN_PROPUESTA");
      await c.query("select app.fn_fijar_ubicacion($1, $2, 20.5, -100.4, 'mapa')", [u, cli]);
      expect(await fila(c, "select lat, ubicacion_fuente from app.cliente where id = $1", [cli])).toEqual({ lat: "20.500000", ubicacion_fuente: "mapa" });
      expect((await error(c, () => c.query("select app.fn_proponer_ubicacion($1, 40.0, -3.7)", [cli]))).code).toBe("23514");
      expect((await error(c, () => c.query("select app.fn_fijar_ubicacion($1, $2, 40.0, -3.7, 'app')", [u, cli]))).code).toBe("23514");
    });
  });

  it("fn_proxima_visita: manana -> manana; hoy -> hoy + 7; {manana, hoy} -> manana; sin dias -> null", async () => {
    await enTransaccion(async (c) => {
      const cli = await cliente(c);
      const iso = async (d: number) => (await fila<{ i: number }>(c, "select extract(isodow from app.fn_fecha_local(now()) + $1::int)::int as i", [d])).i;
      const prox = async (dias: number[]) => {
        await c.query("update app.cliente set dias_visita = $2::smallint[] where id = $1", [cli, dias]);
        return (await fila<{ f: string | null }>(c, "select app.fn_proxima_visita($1)::text as f", [cli])).f;
      };
      expect(await prox([await iso(1)])).toBe(await dia(c, 1));
      expect(await prox([await iso(0)])).toBe(await dia(c, 7));
      expect(await prox([await iso(0), await iso(1)])).toBe(await dia(c, 1));
      expect(await prox([await iso(3), await iso(5)])).toBe(await dia(c, 3));
      expect(await prox([])).toBeNull();
    });
  });
});

describe("auditoria y equivalentes", () => {
  it("auditoria de cliente con app.usuario_id; producto_equivalente registra producto:equivalente; equivalente a si mismo 23514", async () => {
    await enTransaccion(async (c) => {
      const u = await usuarioF3(c);
      const cli = await cliente(c);
      await c.query("select set_config('app.usuario_id', $1, true)", [u]);
      await c.query("update app.cliente set contacto = 'Don Beto', limite_credito = 1000 where id = $1", [cli]);
      const a = await fila<{ usuario_id: string; accion: string; despues: { contacto: string; limite_credito: string } }>(c,
        "select usuario_id, accion, despues from app.auditoria where tabla = 'cliente' and registro_id = $1 order by id desc limit 1", [cli]);
      expect(a).toMatchObject({ usuario_id: u, accion: "actualizar", despues: { contacto: "Don Beto", limite_credito: 1000 } });
      await c.query("insert into app.zona (nombre) values ('Centro')");
      expect((await c.query("select 1 from app.auditoria where tabla = 'zona'")).rowCount).toBeGreaterThanOrEqual(1);
      expect((await error(c, () => c.query("insert into app.zona (nombre) values ('centro')"))).code).toBe("23505");

      const a1 = await producto(c, { usuario: u });
      const a2 = await producto(c, { usuario: u });
      await c.query("insert into app.producto_equivalente (producto_id, equivalente_id) values ($1, $2)", [a1.id, a2.id]);
      expect((await c.query("select 1 from app.auditoria where tabla = 'producto_equivalente' and registro_id = $1", [`${a1.id}:${a2.id}`])).rowCount).toBe(1);
      expect((await error(c, () => c.query("insert into app.producto_equivalente (producto_id, equivalente_id) values ($1, $1)", [a1.id]))).code).toBe("23514");
    });
  });
});

import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import { enTransaccion, error, pool } from "./ayuda.js";
import { dia, errorConDetalle } from "./ayuda-inventario.js";
import { fila, notificaciones, ROL3, usuarioF3 } from "./ayuda-pedidos.js";
import {
  compra, juego, lin, lista, pedidoConfirmado, producto, ventaKardex,
} from "./ayuda-surtido.js";

afterAll(() => pool.end());

describe("migracion 006", () => {
  it("app.migraciones incluye 000-006 y re-correr el migrador no aplica nada", async () => {
    const r = await pool.query("select archivo from app.migraciones order by archivo");
    expect(r.rows.map((x) => x.archivo)).toEqual(expect.arrayContaining([
      "000_base.sql", "001_auth.sql", "002_catalogo_inventario.sql", "003_compras.sql", "004_clientes_pedidos.sql", "006_surtido.sql"]));
    const p = spawnSync(process.execPath, ["scripts/migrar.mjs"], { encoding: "utf8", env: process.env });
    expect(p.stdout).toContain("nada pendiente");
    expect(p.status).toBe(0);
  });

  it("surtido.ver solo para Duenio, Administrador y Almacenista; semilla del anio con quincenas y Semana Santa", async () => {
    await enTransaccion(async (c) => {
      const roles = (await c.query(
        "select r.nombre from app.rol_permiso rp join app.rol r on r.id = rp.rol_id where rp.permiso_codigo = 'surtido.ver' order by r.nombre")).rows.map((x) => x.nombre);
      expect(roles).toEqual(["Administrador", "Almacenista", "Dueño"]);
      const anio = (await fila<{ y: number }>(c, "select extract(year from app.fn_fecha_local(now()))::int as y")).y;
      const r = await c.query("select fecha::text, nombre, factor::text from app.fecha_demanda where extract(year from fecha) = $1 order by fecha", [anio]);
      const quincena = r.rows.filter((x) => x.nombre === "Quincena");
      // 14-16 y 29-31 de cada mes que los tenga, mas el 1 de cada mes (menos lo que pise Semana Santa)
      expect(quincena.length).toBeGreaterThan(60);
      expect(quincena.every((x) => x.factor === "1.30")).toBe(true);
      const santa = r.rows.filter((x) => x.nombre === "Semana Santa");
      expect(santa).toHaveLength(2);
      expect(await fila(c, "select ($1::date + 1 = $2::date) as ok", [santa[0].fecha, santa[1].fecha])).toEqual({ ok: true });
      // Pascua 2026 = 5 de abril: Jueves y Viernes Santo el 2 y el 3
      if (anio === 2026) expect(santa.map((x) => x.fecha)).toEqual(["2026-04-02", "2026-04-03"]);
    });
  });
});

describe("fn_lista_surtido: formula", () => {
  it("juego fijo: Corona y Victoria con los numeros de la tabla; recibido, propuesto y la linea en faltante no cuentan", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const f = await lista(c, j.manana, [j.k.corona.id, j.k.victoria.id, j.tecate.id]);
      // Corona: A 2 cajas (48) + B 1 caja (24) = 72; previo = D' 6; disponible 60 - 6 = 54; a comprar 72 - 54 = 18;
      // reponer = 30 - max(0, 54 - 72) = 30; sugerida = ceil(48 / 24) = 2.
      expect(f[j.k.corona.id]).toMatchObject({
        proveedor_id: j.modelo.id, modo_surtido: "inventario", piezas_pedidas: 72, existencia: 60, comprometido_previo: 6, disponible: 54,
        piezas_a_comprar: 18, reponer_minimo: 30, presentacion_id: j.k.caja, factor: 24, cantidad_sugerida: 2,
        ultimo_costo: "300.00", costo_estimado: "600.00", sugerido_demanda: 0, promocion_id: null, costo_promocion: null, ahorro: null,
      });
      // Victoria: solo C (24); la Caja de B esta en faltante. Contra pedido: sin minimo.
      expect(f[j.k.victoria.id]).toMatchObject({
        modo_surtido: "contra_pedido", piezas_pedidas: 24, existencia: 0, comprometido_previo: 0, disponible: 0,
        piezas_a_comprar: 24, reponer_minimo: 0, cantidad_sugerida: 1, ultimo_costo: "290.00", costo_estimado: "290.00",
      });
      // Tecate: sin pedidos, minimo 0, sin ventas -> no hay fila.
      expect(f[j.tecate.id]).toBeUndefined();
      // La linea de Victoria de B esta en faltante y B esta esperando_cliente.
      expect(await fila(c, "select estado from app.pedido where id = $1", [j.B])).toEqual({ estado: "esperando_cliente" });
      expect(await fila(c, "select estado from app.pedido_linea where id = $1", [j.lineaFaltante])).toEqual({ estado: "faltante" });
    });
  });

  it("la sustituta cuenta: B responde con Corona Caja x1 -> Corona 96 / 42 / 3; Victoria sigue en 24", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const opcion = (await fila<{ id: string }>(c, "select id from app.propuesta_opcion where propuesta_id = $1 and tipo = 'sustituto'", [j.propuesta])).id;
      await c.query("select app.fn_responder_faltante($1, null, $2, $3)", [j.cli, j.propuesta, opcion]);
      const f = await lista(c, j.manana, [j.k.corona.id, j.k.victoria.id]);
      // 96 pedidas; disponible 54 -> comprar 42; reponer 30 (54 - 96 < 0); ceil(72 / 24) = 3
      expect(f[j.k.corona.id]).toMatchObject({ piezas_pedidas: 96, piezas_a_comprar: 42, reponer_minimo: 30, cantidad_sugerida: 3 });
      expect(f[j.k.victoria.id]).toMatchObject({ piezas_pedidas: 24 });
    });
  });

  it("un pedido cargado de otra fecha cuenta antes: comprometido_previo 30", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const pasado = await pedidoConfirmado(c, j.k.usuario, j.cli, [lin(j.k.caja, 1)], await dia(c, 3));
      await c.query("update app.pedido set estado = 'cargado' where id = $1", [pasado]);
      const f = await lista(c, j.manana, [j.k.corona.id]);
      expect(f[j.k.corona.id]).toMatchObject({ comprometido_previo: 30, disponible: 30, piezas_pedidas: 72, piezas_a_comprar: 42 });
    });
  });

  it("por ruta: solo cuenta los pedidos de esa ruta (pedido.ruta_id)", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      // Con 007 presente pedido.ruta_id tiene llave a ruta: se quita dentro de la transaccion (se revierte) para no depender de 007.
      await c.query("alter table app.pedido drop constraint if exists fk_pedido_ruta");
      await c.query("update app.pedido set ruta_id = 777 where id = $1", [j.A]);
      const f = await lista(c, j.manana, [j.k.corona.id, j.k.victoria.id], "777");
      // Solo A (48): disponible 54 -> nada que comprar por pedidos; el minimo si (30 - max(0, 54 - 48) = 24).
      expect(f[j.k.corona.id]).toMatchObject({ piezas_pedidas: 48, piezas_a_comprar: 0, reponer_minimo: 24, cantidad_sugerida: 1 });
      expect(f[j.k.victoria.id]).toBeUndefined();
    });
  });

  it("comprar la sugerida (2 Cajas Corona y 1 Victoria) hace desaparecer las filas", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      await compra(c, j.k.caja, 2, "300.00", j.modelo.id);
      await compra(c, j.k.victoriaCaja, 1, "290.00", j.modelo.id);
      expect(await lista(c, j.manana, [j.k.corona.id, j.k.victoria.id])).toEqual({});
    });
  });

  it("orden por proveedor (sin proveedor al final) y solo filas con algo que comprar", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const u = j.k.usuario;
      const p1 = await producto(c, { modo: "contra_pedido", proveedor: j.abarrotera.id, nombre: "Zeta", usuario: u });
      const p2 = await producto(c, { modo: "contra_pedido", proveedor: null, nombre: "Alfa", usuario: u });
      const p3 = await producto(c, { modo: "inventario", proveedor: j.modelo.id, piezas: 500, nombre: "Sobra", usuario: u });
      for (const p of [p1, p2, p3]) await pedidoConfirmado(c, u, j.cli, [lin(p.pf(24), 1)], j.manana);
      const ids = [j.k.corona.id, j.k.victoria.id, p1.id, p2.id, p3.id];
      const r = await c.query("select producto_id from app.fn_lista_surtido(1, $1::date) where producto_id = any($2)", [j.manana, ids]);
      // Abarrotera < Modelo (Corona, Victoria por nombre), al final sin proveedor; p3 (de sobra) no sale
      expect(r.rows.map((x) => x.producto_id)).toEqual([p1.id, j.k.corona.id, j.k.victoria.id, p2.id]);
    });
  });
});

describe("fn_lista_surtido: compra inteligente", () => {
  it("demanda: 280 piezas en 28 dias, cobertura 7 y dos dias de 1.30 -> ceil(10 * 7.60 - 20) = 56; sin ventas 0; contra pedido sin fila", async () => {
    await enTransaccion(async (c) => {
      const u = await usuarioF3(c);
      const D = await dia(c, 1);
      await c.query("delete from app.fecha_demanda");
      await c.query("insert into app.fecha_demanda (fecha, nombre, factor) values ($1::date + 1, 'Puente', 1.30), ($1::date + 4, 'Partido', 1.30)", [D]);
      const tecate = await producto(c, { modo: "inventario", piezas: 300, nombre: "Tecate", usuario: u });
      await ventaKardex(c, tecate.id, 280, 10, u);
      const quieto = await producto(c, { modo: "inventario", piezas: 20, nombre: "Quieto", usuario: u });
      const contra = await producto(c, { modo: "contra_pedido", piezas: 300, nombre: "Contra", usuario: u });
      await ventaKardex(c, contra.id, 280, 10, u);
      expect(await fila(c, "select existencia from app.fn_lista_surtido(1, $1::date) where producto_id = $2", [D, tecate.id])).toEqual({ existencia: 20 });
      const f = await lista(c, D, [tecate.id, quieto.id, contra.id]);
      expect(f[tecate.id]).toMatchObject({ sugerido_demanda: 56, piezas_a_comprar: 0, reponer_minimo: 0, cantidad_sugerida: 0, existencia: 20 });
      expect(f[quieto.id]).toBeUndefined();
      expect(f[contra.id]).toBeUndefined();
      // Con el calendario limpio (factor 1 todos los dias): ceil(10 * 7 - 20) = 50
      await c.query("delete from app.fecha_demanda");
      expect((await lista(c, D, [tecate.id]))[tecate.id]).toMatchObject({ sugerido_demanda: 50 });
    });
  });

  it("promocion: vigente 280.00 -> ahorro 40.00; vencida ayer -> null; minimo 5 > 2 -> null; dos vigentes -> la menor", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const promo = async (costo: string, desde: number, hasta: number, minimo = 1) =>
        (await fila<{ id: string }>(c, `insert into app.promocion_proveedor (proveedor_id, presentacion_id, costo_presentacion, minimo_cantidad, desde, hasta, creado_por)
          values ($1, $2, $3, $4, $5::date + $6::int, $5::date + $7::int, $8) returning id`, [j.modelo.id, j.k.caja, costo, minimo, j.manana, desde, hasta, j.k.usuario])).id;
      const corona = async () => (await lista(c, j.manana, [j.k.corona.id]))[j.k.corona.id];

      const vencida = await promo("200.00", -5, -1);
      expect(await corona()).toMatchObject({ promocion_id: null, costo_promocion: null, ahorro: null });
      const lejana = await promo("100.00", 5, 9, 5); // minimo 5 > cantidad sugerida 2 (y ademas aun no empieza)
      const grande = await promo("150.00", -1, 1, 5);
      expect(await corona()).toMatchObject({ promocion_id: null, ahorro: null });
      const buena = await promo("280.00", -1, 1);
      expect(await corona()).toMatchObject({ promocion_id: buena, costo_promocion: "280.00", ahorro: "40.00" });
      const mejor = await promo("270.00", 0, 0);
      expect(await corona()).toMatchObject({ promocion_id: mejor, costo_promocion: "270.00", ahorro: "60.00" });
      expect([vencida, lejana, grande]).toHaveLength(3);
      // Victoria no tiene promocion
      expect((await lista(c, j.manana, [j.k.victoria.id]))[j.k.victoria.id]).toMatchObject({ promocion_id: null });
    });
  });
});

describe("fn_publicar_surtido", () => {
  it("publicar dos veces la misma lista: un aviso por usuario con compras.registrar; cambiar un pedido avisa otra vez; sin surtido.ver -> SIN_PERMISO", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const alma = await usuarioF3(c, ROL3.almacenista);
      const cajero = await usuarioF3(c, ROL3.cajero);
      const n1 = await fila<{ n: number }>(c, "select app.fn_publicar_surtido($1, 1, $2::date) as n", [j.k.usuario, j.manana]);
      expect(n1.n).toBeGreaterThanOrEqual(2); // Duenio y Almacenista (otros usuarios de la base tambien)
      const clave = (await fila<{ clave: string }>(c, "select clave from app.notificacion where evento = 'surtido_listo' and usuario_id = $1", [alma])).clave;
      expect(clave).toMatch(/^surtido:1:\d{4}-\d{2}-\d{2}:[0-9a-f]{32}$/);
      const u = (await fila<{ datos: { ruta: string }; cuerpo: string }>(c, "select datos, cuerpo from app.notificacion where usuario_id = $1 and evento = 'surtido_listo'", [alma]));
      expect(u.datos.ruta).toBe(`/surtido?fecha=${j.manana}`);
      expect(u.cuerpo).toMatch(/tiene \d+ productos/);
      expect(await notificaciones(c, "surtido_listo", clave, [j.k.usuario, alma])).toBe(2);
      expect(await notificaciones(c, "surtido_listo", clave, [cajero])).toBe(0);

      expect((await fila<{ n: number }>(c, "select app.fn_publicar_surtido($1, 1, $2::date) as n", [j.k.usuario, j.manana])).n).toBe(0);

      await pedidoConfirmado(c, j.k.usuario, j.cli, [lin(j.k.caja, 1)], j.manana);
      expect((await fila<{ n: number }>(c, "select app.fn_publicar_surtido($1, 1, $2::date) as n", [alma, j.manana])).n).toBeGreaterThanOrEqual(2);
      expect((await c.query("select count(*)::int as n from app.notificacion where usuario_id = $1 and evento = 'surtido_listo'", [alma])).rows[0].n).toBe(2);

      const e = await errorConDetalle(c, () => c.query("select app.fn_publicar_surtido($1, 1, $2::date)", [cajero, j.manana]));
      expect(e).toMatchObject({ message: "SIN_PERMISO", detalle: { permiso: "surtido.ver" } });
    });
  });

  it("lista vacia: no avisa", async () => {
    await enTransaccion(async (c) => {
      const u = await usuarioF3(c);
      await c.query("update app.producto set existencia_minima = 0"); // otras suites dejan productos con minimo
      expect((await fila<{ n: number }>(c, "select app.fn_publicar_surtido($1, 1, $2::date) as n", [u, await dia(c, 1)])).n).toBe(0);
    });
  });
});

describe("fn_mensaje_surtido y fechas de demanda", () => {
  it("mensaje al proveedor: cantidades y producto, sin precios; proveedor sin lineas y proveedor inexistente", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const m = await fila<{ telefono: string; texto: string }>(c, "select * from app.fn_mensaje_surtido(1, $1::date, $2)", [j.manana, j.modelo.id]);
      expect(m).toMatchObject({ telefono: "5215500000000", telefono_invalido: false });
      expect(m.texto).toContain(j.modelo.nombre);
      expect(m.texto).toMatch(/\n2 Caja de 24 Corona Extra 355 ml lata/);
      expect(m.texto).toMatch(/\n1 Caja de 24 Victoria 355 ml lata/);
      expect(m.texto).not.toMatch(/[$]|300\.00|290\.00/);
      expect((await fila<{ texto: string }>(c, "select * from app.fn_mensaje_surtido(1, $1::date, $2)", [j.manana, j.abarrotera.id])).texto).not.toMatch(/Caja/);
      expect((await c.query("select * from app.fn_mensaje_surtido(1, $1::date, 999999999)", [j.manana])).rowCount).toBe(0);
    });
  });

  it("reemplazar el anio: lo de otro anio queda, fuera de anio -> FECHA_NO_VALIDA, sin configuracion.editar -> SIN_PERMISO", async () => {
    await enTransaccion(async (c) => {
      const u = await usuarioF3(c);
      const alma = await usuarioF3(c, ROL3.almacenista);
      await c.query("insert into app.fecha_demanda (fecha, nombre, factor) values ('2098-05-05', 'Otro anio', 2)");
      const n = await fila<{ n: number }>(c, `select app.fn_reemplazar_fechas_demanda($1, 2099, $2::jsonb) as n`,
        [u, JSON.stringify([{ fecha: "2099-01-10", nombre: "Puente", factor: 1.5 }, { fecha: "2099-03-03", nombre: "Final", factor: 2 }])]);
      expect(n.n).toBe(2);
      const n2 = await fila<{ n: number }>(c, `select app.fn_reemplazar_fechas_demanda($1, 2099, $2::jsonb) as n`, [u, JSON.stringify([{ fecha: "2099-02-02", nombre: "Solo", factor: 1 }])]);
      expect(n2.n).toBe(1);
      expect((await c.query("select fecha::text from app.fecha_demanda where extract(year from fecha) in (2098, 2099) order by fecha")).rows.map((x) => x.fecha)).toEqual(["2098-05-05", "2099-02-02"]);
      expect((await errorConDetalle(c, () => c.query("select app.fn_reemplazar_fechas_demanda($1, 2099, $2::jsonb)", [u, JSON.stringify([{ fecha: "2100-01-01", nombre: "x", factor: 1 }])]))).message).toBe("FECHA_NO_VALIDA");
      expect((await error(c, () => c.query("select app.fn_reemplazar_fechas_demanda($1, 2099, '[]'::jsonb)", [alma]))).message).toBe("SIN_PERMISO");
    });
  });
});

describe("reglas unicas de F5 (revision)", () => {
  it("v_comprometido sale de v_linea_comprometida; fn_pedido_requiere_surtido: A y C si, D (hoy, alcanza) y el recibido no", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      // Corona: A 48 + B 24 + D 6 = 78 confirmadas; Victoria: C 24 (la Caja de B esta en faltante)
      expect(await fila(c, "select confirmadas, cargadas from app.v_comprometido where producto_id = $1", [j.k.corona.id])).toEqual({ confirmadas: 78, cargadas: 0 });
      expect(await fila(c, "select confirmadas from app.v_comprometido where producto_id = $1", [j.k.victoria.id])).toEqual({ confirmadas: 24 });
      expect(await fila(c, "select disponible from app.v_disponible where producto_id = $1", [j.k.corona.id])).toEqual({ disponible: -18 });
      const req = async (p: string) => (await fila<{ r: boolean }>(c, "select app.fn_pedido_requiere_surtido($1) as r", [p])).r;
      expect(await req(j.A)).toBe(true);
      expect(await req(j.B)).toBe(true); // su linea de Corona activa cae en una lista con faltante
      expect(await req(j.C)).toBe(true);
      expect(await req(j.D)).toBe(false);
      expect(await req(j.recibido)).toBe(false);
    });
  });

  it("promocion de otro proveedor no aplica; solo la del proveedor habitual del producto", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      await c.query(`insert into app.promocion_proveedor (proveedor_id, presentacion_id, costo_presentacion, desde, hasta, creado_por)
        values ($1, $2, '250.00', $3, $3, $4)`, [j.abarrotera.id, j.k.caja, j.manana, j.k.usuario]);
      expect((await lista(c, j.manana, [j.k.corona.id]))[j.k.corona.id]).toMatchObject({ promocion_id: null, costo_promocion: null, ahorro: null });
    });
  });

  it("ultimo_costo ignora compras canceladas: compra a 350.00 y se cancela -> vuelve 300.00", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const id = await compra(c, j.k.caja, 1, "350.00", j.modelo.id);
      expect((await lista(c, j.manana, [j.k.corona.id]))[j.k.corona.id]).toMatchObject({ ultimo_costo: "350.00" });
      await c.query("select app.fn_cancelar_compra($1, $2, 'prueba')", [j.k.usuario, id]);
      expect((await lista(c, j.manana, [j.k.corona.id]))[j.k.corona.id]).toMatchObject({ ultimo_costo: "300.00", costo_estimado: "600.00" });
    });
  });

  it("producto sin presentacion de compra: fila marcada, sin cantidad sugerida y como nota en el mensaje", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const p = await producto(c, { modo: "contra_pedido", proveedor: j.abarrotera.id, nombre: "Rarito", usuario: j.k.usuario });
      await pedidoConfirmado(c, j.k.usuario, j.cli, [lin(p.pf(24), 1)], j.manana);
      await c.query("update app.presentacion set se_compra = false where producto_id = $1", [p.id]);
      expect((await lista(c, j.manana, [p.id]))[p.id]).toMatchObject({
        sin_presentacion_compra: true, presentacion_id: null, cantidad_sugerida: null, piezas_a_comprar: 24, costo_estimado: null,
      });
      expect((await lista(c, j.manana, [j.k.corona.id]))[j.k.corona.id]).toMatchObject({ sin_presentacion_compra: false });
      const m = await fila<{ texto: string }>(c, "select * from app.fn_mensaje_surtido(1, $1::date, $2)", [j.manana, j.abarrotera.id]);
      expect(m.texto).toMatch(/\n24 piezas Rarito/);
    });
  });

  it("no se desactiva un producto con pedidos pendientes (PRODUCTO_CON_PEDIDOS); uno sin pedidos si", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const e = await errorConDetalle(c, () => c.query("update app.producto set activo = false where id = $1", [j.k.corona.id]));
      expect(e).toMatchObject({ message: "PRODUCTO_CON_PEDIDOS", detalle: { producto_id: Number(j.k.corona.id) } });
      await c.query("update app.producto set activo = false where id = $1", [j.tecate.id]);
      // al cancelar sus pedidos ya se puede
      await c.query("update app.pedido set estado = 'cancelado', cancelado_en = now(), respuesta_limite_en = null where id = any($1)", [[j.A, j.B, j.D]]);
      await c.query("update app.producto set activo = false where id = $1", [j.k.corona.id]);
    });
  });

  it("telefono del proveedor: normaliza para wa.me; uno que no sirve se marca invalido", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      const tel = async (t: string) => fila(c, "select telefono, telefono_invalido from app.fn_mensaje_surtido(1, $1::date, $2)",
        [j.manana, (await c.query("update app.proveedor set telefono = $2 where id = $1 returning id", [j.modelo.id, t])).rows[0].id]);
      expect(await tel("55 1234-5678")).toEqual({ telefono: "525512345678", telefono_invalido: false });
      expect(await tel("+52 1 55 1234 5678")).toEqual({ telefono: "5215512345678", telefono_invalido: false });
      expect(await tel("12345")).toEqual({ telefono: null, telefono_invalido: true });
      expect(await tel("")).toEqual({ telefono: null, telefono_invalido: false });
    });
  });

  it("calendario del anio que viene: la siembra es idempotente y respeta lo que ya hay; en diciembre sola", async () => {
    await enTransaccion(async (c) => {
      const n = (await fila<{ n: number }>(c, "select app.fn_sembrar_fechas_demanda(2101) as n")).n;
      expect(n).toBeGreaterThan(60);
      await c.query("update app.fecha_demanda set factor = 2 where fecha = '2101-01-15'");
      expect((await fila<{ n: number }>(c, "select app.fn_sembrar_fechas_demanda(2101) as n")).n).toBe(n);
      expect(await fila(c, "select factor::text from app.fecha_demanda where fecha = '2101-01-15'")).toEqual({ factor: "2.00" });
      expect((await fila<{ n: number }>(c, "select count(*)::int as n from app.fecha_demanda where extract(year from fecha) = 2101 and nombre = 'Semana Santa'")).n).toBe(2);
      const mes = (await fila<{ m: number }>(c, "select extract(month from app.fn_fecha_local(now()))::int as m")).m;
      if (mes !== 12) expect((await fila<{ n: number }>(c, "select app.fn_sembrar_fechas_siguiente() as n")).n).toBe(0);
    });
  });
});

describe("auditoria", () => {
  it("alta de promocion y de fecha de demanda quedan en auditoria (registro_id = id / fecha)", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      await c.query("select set_config('app.usuario_id', $1, true)", [j.k.usuario]);
      const promo = (await fila<{ id: string }>(c, `insert into app.promocion_proveedor (proveedor_id, presentacion_id, costo_presentacion, desde, hasta, creado_por)
        values ($1, $2, '280.00', $3, $3, $4) returning id`, [j.modelo.id, j.k.caja, j.manana, j.k.usuario])).id;
      expect(await fila(c, "select accion, usuario_id from app.auditoria where tabla = 'promocion_proveedor' and registro_id = $1", [promo]))
        .toEqual({ accion: "insertar", usuario_id: j.k.usuario });
      await c.query("insert into app.fecha_demanda (fecha, nombre, factor) values ('2097-12-24', 'Navidad', 2)");
      expect(await fila(c, "select accion from app.auditoria where tabla = 'fecha_demanda' and registro_id = '2097-12-24'")).toEqual({ accion: "insertar" });
    });
  });

  it("restricciones: hasta < desde y factor fuera de 0.1-5 se rechazan", async () => {
    await enTransaccion(async (c) => {
      const j = await juego(c);
      expect((await error(c, () => c.query(`insert into app.promocion_proveedor (proveedor_id, presentacion_id, costo_presentacion, desde, hasta, creado_por)
        values ($1, $2, '1.00', $3::date, $3::date - 1, $4)`, [j.modelo.id, j.k.caja, j.manana, j.k.usuario]))).code).toBe("23514");
      expect((await error(c, () => c.query("insert into app.fecha_demanda (fecha, nombre, factor) values ('2096-01-01', 'x', 6)"))).code).toBe("23514");
    });
  });
});


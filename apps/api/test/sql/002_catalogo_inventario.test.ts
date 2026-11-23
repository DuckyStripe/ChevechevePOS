import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import { enTransaccion, error, pool } from "./ayuda.js";
import { ajuste, dia, errorConDetalle, existencia, ponerPrecio, producto, proveedor, usuarioF2 } from "./ayuda-inventario.js";

afterAll(() => pool.end());

const NUEVOS = [
  "catalogo.ver", "catalogo.editar", "precios.editar", "costos.ver", "inventario.ver", "inventario.ajustar",
  "proveedores.gestionar", "compras.ver", "compras.registrar", "compras.cancelar",
];

describe("migraciones 002 y 003", () => {
  it("base vacia migrada: 000 a 003 registradas; re-correr el migrador no aplica nada", async () => {
    const r = await pool.query("select archivo from app.migraciones order by archivo");
    expect(r.rows.map((x) => x.archivo)).toEqual(readdirSync("db/migraciones").filter((f) => f.endsWith(".sql")).sort());
    expect(r.rows.map((x) => x.archivo)).toEqual(
      expect.arrayContaining(["000_base.sql", "001_auth.sql", "002_catalogo_inventario.sql", "003_compras.sql"]),
    );
    const p = spawnSync(process.execPath, ["scripts/migrar.mjs"], { encoding: "utf8", env: process.env });
    expect(p.stdout).toContain("nada pendiente");
  });

  it("semillas y permisos", async () => {
    const listas = await pool.query("select nombre, es_predeterminada from app.lista_precio order by id");
    expect(listas.rows).toEqual([
      { nombre: "Menudeo", es_predeterminada: true },
      { nombre: "Mayoreo", es_predeterminada: false },
    ]);
    const nuevos = async (rol: string) =>
      (await pool.query(
        "select permiso_codigo from app.rol_permiso rp join app.rol r on r.id = rp.rol_id where r.nombre = $1 and permiso_codigo = any($2) order by 1",
        [rol, NUEVOS],
      )).rows.map((x) => x.permiso_codigo);
    expect(await nuevos("Dueño")).toEqual([...NUEVOS].sort());
    const admin = await nuevos("Administrador");
    expect(admin).not.toContain("precios.editar");
    expect(admin).not.toContain("costos.ver");
    expect(admin).not.toContain("compras.cancelar");
    expect(admin).toEqual([
      "catalogo.editar", "catalogo.ver", "compras.registrar", "compras.ver", "inventario.ajustar", "inventario.ver", "proveedores.gestionar",
    ]);
    expect(await nuevos("Cajero")).toEqual(["catalogo.ver", "inventario.ver"]);
    expect(await nuevos("Repartidor")).toEqual(["catalogo.ver"]);
    expect(await nuevos("Almacenista")).toEqual(admin);
    // La semilla no ensucia la bitacora de rol_permiso con las concesiones.
    const aud = await pool.query("select count(*)::int as n from app.auditoria where tabla = 'rol_permiso' and usuario_id is null and registro_id like any($1)", [NUEVOS.map((p) => `%:${p}`)]);
    expect(aud.rows[0].n).toBe(0);
  });
});

describe("catalogo", () => {
  it("pieza obligatoria: sin factor 1 falla al commit; con Pieza pasa", async () => {
    await enTransaccion(async (c) => {
      const cat = (await c.query("insert into app.categoria (nombre) values ('Sin pieza') returning id")).rows[0].id;
      const p = (await c.query("insert into app.producto (nombre, categoria_id) values ('Sin pieza', $1) returning id", [cat])).rows[0].id;
      await c.query("insert into app.presentacion (producto_id, nombre, factor) values ($1, 'Caja de 24', 24)", [p]);
      const e = await error(c, () => c.query("set constraints all immediate"));
      expect(e).toEqual({ code: "P0001", message: "PRODUCTO_SIN_PIEZA" });
    });
    await enTransaccion(async (c) => {
      await producto(c, { factores: [1, 24] });
      await c.query("set constraints all immediate");
    });
  });

  it("factor inmutable: factor y producto_id; nombre y activa si se pueden cambiar", async () => {
    await enTransaccion(async (c) => {
      const a = await producto(c, { factores: [1, 24] });
      const b = await producto(c);
      const caja = a.pf(24);
      expect(await error(c, () => c.query("update app.presentacion set factor = 12 where id = $1", [caja]))).toEqual({ code: "P0001", message: "FACTOR_INMUTABLE" });
      expect(await error(c, () => c.query("update app.presentacion set producto_id = $2 where id = $1", [caja, b.id]))).toEqual({ code: "P0001", message: "FACTOR_INMUTABLE" });
      await c.query("update app.presentacion set nombre = 'Caja grande', activa = false where id = $1", [caja]);
      const r = await c.query("select nombre, activa, factor from app.presentacion where id = $1", [caja]);
      expect(r.rows[0]).toEqual({ nombre: "Caja grande", activa: false, factor: 24 });
    });
  });

  it("mismo factor conviven; mismo nombre (otra mayuscula) y codigo de barras repetido: 23505", async () => {
    await enTransaccion(async (c) => {
      const a = await producto(c, { factores: [1, 24] });
      await c.query("update app.presentacion set nombre = 'Caja de 24', codigo_barras = $2 where id = $1", [a.pf(24), `7501${a.id}`]);
      await c.query("insert into app.presentacion (producto_id, nombre, factor) values ($1, 'Charola de 24', 24)", [a.id]);
      const n = await c.query("select count(*)::int as n from app.presentacion where producto_id = $1 and factor = 24", [a.id]);
      expect(n.rows[0].n).toBe(2);
      const e1 = await error(c, () => c.query("insert into app.presentacion (producto_id, nombre, factor) values ($1, 'CAJA DE 24', 24)", [a.id]));
      expect(e1.code).toBe("23505");
      expect(e1.message).toContain("uq_presentacion_nombre");
      const e2 = await error(c, () => c.query("insert into app.presentacion (producto_id, nombre, factor, codigo_barras) values ($1, 'Otra', 6, $2)", [a.id, `7501${a.id}`]));
      expect(e2.code).toBe("23505");
      expect(e2.message).toContain("uq_presentacion_codigo");
    });
  });
});

describe("inventario", () => {
  it("kardex inmutable: UPDATE y DELETE", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { costo: "12.50" });
      expect(await error(c, () => c.query("update app.movimiento_inventario set motivo = 'x' where producto_id = $1", [p.id]))).toEqual({ code: "P0001", message: "MOVIMIENTO_INMUTABLE" });
      expect(await error(c, () => c.query("delete from app.movimiento_inventario where producto_id = $1", [p.id]))).toEqual({ code: "P0001", message: "MOVIMIENTO_INMUTABLE" });
    });
  });

  it("existencia solo por movimiento: INSERT, UPDATE y DELETE directos", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { costo: "12.50" });
      const q = await producto(c);
      const esperado = { code: "P0001", message: "EXISTENCIA_SOLO_POR_MOVIMIENTO" };
      expect(await error(c, () => c.query("insert into app.existencia (sucursal_id, producto_id, cantidad) values (1, $1, 5)", [q.id]))).toEqual(esperado);
      expect(await error(c, () => c.query("update app.existencia set cantidad = 5 where producto_id = $1", [p.id]))).toEqual(esperado);
      expect(await error(c, () => c.query("delete from app.existencia where producto_id = $1", [p.id]))).toEqual(esperado);
      expect((await existencia(c, p.id)).cantidad).toBe(240);
    });
  });

  it("sin existencia negativa: salida mayor y contra_pedido en cero", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { costo: "12.50" });
      const e = await errorConDetalle(c, () => ajuste(c, p.usuario, p.id, "ajuste_salida", 241));
      expect(e.code).toBe("P0001");
      expect(e.message).toBe("STOCK_INSUFICIENTE");
      expect(e.detalle).toEqual({ producto_id: Number(p.id), disponible: 240, solicitado: 241 });
      expect((await existencia(c, p.id)).cantidad).toBe(240);

      const cp = await producto(c, { modo: "contra_pedido" });
      const e2 = await errorConDetalle(c, () => ajuste(c, cp.usuario, cp.id, "ajuste_salida", 1));
      expect(e2.message).toBe("STOCK_INSUFICIENTE");
      expect(e2.detalle).toEqual({ producto_id: Number(cp.id), disponible: 0, solicitado: 1 });
    });
  });

  it("signo y causa: merma sin causa y compra con cantidad negativa (23514)", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { costo: "12.50" });
      const merma = await error(c, () =>
        c.query("insert into app.movimiento_inventario (sucursal_id, producto_id, tipo, cantidad, usuario_id) values (1, $1, 'merma', -1, $2)", [p.id, p.usuario]));
      expect(merma.code).toBe("23514");
      expect(merma.message).toContain("ck_movimiento_causa");
      const signo = await error(c, () =>
        c.query("insert into app.movimiento_inventario (sucursal_id, producto_id, tipo, cantidad, costo_unitario, usuario_id) values (1, $1, 'compra', -1, 1, $2)", [p.id, p.usuario]));
      expect(signo.code).toBe("23514");
      expect(signo.message).toContain("ck_movimiento_signo");
    });
  });

  it("salidas no cambian el costo: ajuste_salida y merma salen al promedio vigente", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { costo: "12.50" });
      await ajuste(c, p.usuario, p.id, "ajuste_salida", 10);
      await ajuste(c, p.usuario, p.id, "merma", 5, { causa: "caducado" });
      const r = await c.query("select tipo, cantidad, costo_unitario, existencia_resultante, costo_promedio_resultante from app.movimiento_inventario where producto_id = $1 order by id", [p.id]);
      expect(r.rows).toEqual([
        { tipo: "inventario_inicial", cantidad: 240, costo_unitario: "12.500000", existencia_resultante: 240, costo_promedio_resultante: "12.500000" },
        { tipo: "ajuste_salida", cantidad: -10, costo_unitario: "12.500000", existencia_resultante: 230, costo_promedio_resultante: "12.500000" },
        { tipo: "merma", cantidad: -5, costo_unitario: "12.500000", existencia_resultante: 225, costo_promedio_resultante: "12.500000" },
      ]);
      expect(await existencia(c, p.id)).toMatchObject({ cantidad: 225, costo_promedio: "12.500000" });
    });
  });

  it("entrada de ajuste usa el promedio vigente; AJUSTE_NO_VALIDO en lo demas", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { costo: "12.50" });
      const id = await ajuste(c, p.usuario, p.id, "ajuste_entrada", 10);
      const m = await c.query("select costo_unitario, costo_promedio_resultante, existencia_resultante from app.movimiento_inventario where id = $1", [id]);
      expect(m.rows[0]).toEqual({ costo_unitario: "12.500000", costo_promedio_resultante: "12.500000", existencia_resultante: 250 });

      // inventario_inicial sin motivo si se permite
      const q = await producto(c);
      await ajuste(c, p.usuario, q.id, "inventario_inicial", 3, { costo: "1.00", motivo: null });

      const mal = async (fn: () => Promise<unknown>) => expect((await error(c, fn)).message).toBe("AJUSTE_NO_VALIDO");
      await mal(() => ajuste(c, p.usuario, p.id, "inventario_inicial", 5));                                  // sin costo
      await mal(() => ajuste(c, p.usuario, p.id, "ajuste_entrada", 5, { motivo: "" }));                      // motivo vacio
      await mal(() => ajuste(c, p.usuario, p.id, "ajuste_salida", 5, { motivo: "  " }));                     // motivo en blanco
      await mal(() => ajuste(c, p.usuario, p.id, "merma", 5));                                               // sin causa
      await mal(() => ajuste(c, p.usuario, p.id, "merma", 5, { causa: "robo" }));                            // causa fuera de lista
      await mal(() => ajuste(c, p.usuario, p.id, "venta", 5));                                               // tipo fuera de la lista
      await mal(() => ajuste(c, p.usuario, p.id, "ajuste_entrada", 0));                                      // piezas = 0
      await mal(() => ajuste(c, p.usuario, p.id, "ajuste_entrada", -5));                                     // piezas < 0
      expect((await existencia(c, p.id)).cantidad).toBe(250);
    });
  });

  it("conteo: sin diferencia devuelve null; menor es ajuste_salida; mayor es ajuste_entrada", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { costo: "12.50" });
      const movs = async () => (await c.query("select count(*)::int as n from app.movimiento_inventario where producto_id = $1", [p.id])).rows[0].n;
      const conteo = async (piezas: number) =>
        (await c.query("select movimiento_id as id from app.fn_contar_inventario($1, 1, $2, $3, 'conteo')", [p.usuario, p.id, piezas])).rows[0].id;
      const antes = await movs();
      expect(await conteo(240)).toBeNull();
      expect(await movs()).toBe(antes);

      const id = await conteo(230);
      const m = await c.query("select tipo, cantidad, costo_unitario, motivo from app.movimiento_inventario where id = $1", [id]);
      expect(m.rows[0]).toEqual({ tipo: "ajuste_salida", cantidad: -10, costo_unitario: "12.500000", motivo: "conteo" });
      const id2 = await conteo(250);
      const m2 = await c.query("select tipo, cantidad, costo_unitario from app.movimiento_inventario where id = $1", [id2]);
      expect(m2.rows[0]).toEqual({ tipo: "ajuste_entrada", cantidad: 20, costo_unitario: "12.500000" });
      expect(await existencia(c, p.id)).toMatchObject({ cantidad: 250, costo_promedio: "12.500000" });
    });
  });
});

describe("precios", () => {
  it("fn_precio: lista sin precio cae a la predeterminada; sin precio en ninguna es null", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24] });
      const caja = p.pf(24);
      const precio = async (lista: string) =>
        (await c.query("select app.fn_precio($1, (select id from app.lista_precio where nombre = $2)) as p", [caja, lista])).rows[0].p;
      expect(await precio("Mayoreo")).toBeNull();
      await ponerPrecio(c, caja, "Menudeo", "330.00");
      expect(await precio("Menudeo")).toBe("330.00");
      expect(await precio("Mayoreo")).toBe("330.00");
      await ponerPrecio(c, caja, "Mayoreo", "320.00");
      expect(await precio("Mayoreo")).toBe("320.00");
    });
  });

  it("fn_precio con ofertas: vigencia, menor gana, lista null aplica a todas, sin base = la oferta", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24] });
      const caja = p.pf(24);
      await ponerPrecio(c, caja, "Menudeo", "330.00");
      const hoy = await dia(c, 0), ayer = await dia(c, -1), manana = await dia(c, 1), futuro = await dia(c, 30);
      const precio = async (lista: string) =>
        (await c.query("select app.fn_precio($1, (select id from app.lista_precio where nombre = $2)) as p", [caja, lista])).rows[0].p;
      const oferta = (lista: string | null, monto: string, desde: string, hasta: string) =>
        c.query(
          `insert into app.precio_oferta (presentacion_id, lista_precio_id, precio, desde, hasta, motivo, creado_por)
           values ($1, (select id from app.lista_precio where nombre = $2), $3, $4, $5, 'promocion', $6) returning id`,
          [caja, lista, monto, desde, hasta, p.usuario],
        );

      await oferta("Menudeo", "300.00", hoy, futuro);
      expect(await precio("Menudeo")).toBe("300.00");
      // Mayoreo no tiene oferta propia: base cae a Menudeo (330) y la oferta de Menudeo no le aplica
      expect(await precio("Mayoreo")).toBe("330.00");
      await c.query("delete from app.precio_oferta where presentacion_id = $1", [caja]);

      await oferta("Menudeo", "300.00", manana, futuro);
      expect(await precio("Menudeo")).toBe("330.00");
      await c.query("delete from app.precio_oferta where presentacion_id = $1", [caja]);

      await oferta("Menudeo", "300.00", await dia(c, -5), ayer);
      expect(await precio("Menudeo")).toBe("330.00");
      await c.query("delete from app.precio_oferta where presentacion_id = $1", [caja]);

      await oferta("Menudeo", "350.00", hoy, futuro);
      expect(await precio("Menudeo")).toBe("330.00");
      await c.query("delete from app.precio_oferta where presentacion_id = $1", [caja]);

      await oferta(null, "310.00", hoy, futuro);
      expect(await precio("Menudeo")).toBe("310.00");
      expect(await precio("Mayoreo")).toBe("310.00");

      await oferta("Menudeo", "305.00", hoy, futuro);
      expect(await precio("Menudeo")).toBe("305.00");   // dos vigentes: la menor
      expect(await precio("Mayoreo")).toBe("310.00");
      await c.query("delete from app.precio_oferta where presentacion_id = $1", [caja]);

      // Sin precio base en ninguna lista: la oferta es el precio
      const sin = await producto(c, { factores: [1, 12] });
      await c.query(
        `insert into app.precio_oferta (presentacion_id, lista_precio_id, precio, desde, hasta, motivo, creado_por)
         values ($1, null, 200.00, $2, $3, 'por_caducar', $4)`,
        [sin.pf(12), hoy, futuro, sin.usuario],
      );
      expect((await c.query("select app.fn_precio($1, (select id from app.lista_precio where nombre = 'Menudeo')) as p", [sin.pf(12)])).rows[0].p).toBe("200.00");
      expect((await c.query("select app.fn_precio($1, (select id from app.lista_precio where nombre = 'Menudeo')) as p", [sin.pf(1)])).rows[0].p).toBeNull();
    });
  });

  it("fn_margen_objetivo: configuracion, categoria, producto", async () => {
    await enTransaccion(async (c) => {
      const cfg = await producto(c);
      const cat = await producto(c, { margenCategoria: "0.20" });
      const prod = await producto(c, { margenCategoria: "0.20", margen: "0.10" });
      const m = async (id: string) => Number((await c.query("select app.fn_margen_objetivo($1) as m", [id])).rows[0].m);
      expect(await m(cfg.id)).toBe(0.15);
      expect(await m(cat.id)).toBe(0.2);
      expect(await m(prod.id)).toBe(0.1);
    });
  });

  it("v_precio_bajo_costo: precio 300 con costo de caja 306 aparece; promedio 0 no", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24], costo: "12.75" });
      const caja = p.pf(24);
      await ponerPrecio(c, caja, "Menudeo", "300.00");
      await ponerPrecio(c, caja, "Mayoreo", "306.00");   // igual al costo: no es bajo costo
      const v = await c.query("select lista, precio, costo_presentacion, diferencia from app.v_precio_bajo_costo where presentacion_id = $1", [caja]);
      expect(v.rows).toEqual([{ lista: "Menudeo", precio: "300.00", costo_presentacion: "306.00", diferencia: "-6.00" }]);

      const sin = await producto(c, { factores: [1, 24] });
      await ponerPrecio(c, sin.pf(24), "Menudeo", "1.00");
      const v2 = await c.query("select 1 from app.v_precio_bajo_costo where presentacion_id = $1", [sin.pf(24)]);
      expect(v2.rows).toHaveLength(0);
    });
  });
});

describe("busqueda", () => {
  it("tolerante a acentos, mayusculas, alias y faltas", async () => {
    await enTransaccion(async (c) => {
      const corona = await producto(c, { nombre: "Corona Extra 355 ml lata" });
      const familiar = await producto(c, { nombre: "Corona Familiar 940 ml", alias: ["caguama"] });
      const tecate = await producto(c, { nombre: "Tecate Light", alias: ["lite"], marca: "Heineken" });
      const xx = await producto(c, { nombre: "Dos Equis Lager", alias: ["xx"] });
      const mios = [corona, familiar, tecate, xx].map((x) => x.id);
      const buscar = async (t: string) =>
        (await c.query("select producto_id from app.fn_buscar_productos($1, 200)", [t])).rows.map((r) => r.producto_id).filter((id) => mios.includes(id));

      expect((await buscar("caguama"))[0]).toBe(familiar.id);
      expect((await buscar("tecate lite"))[0]).toBe(tecate.id);
      expect((await buscar("tecate light"))[0]).toBe(tecate.id);
      expect([corona.id, familiar.id]).toContain((await buscar("kerona"))[0]);
      expect((await buscar("xx"))[0]).toBe(xx.id);
      expect(await buscar("xx")).toEqual([xx.id]);
      const mayus = await buscar("CORONA");
      expect(mayus.slice().sort()).toEqual([corona.id, familiar.id].sort());
      expect(await buscar("  ")).toEqual([]);
      expect((await buscar("heineken"))[0]).toBe(tecate.id);   // por marca
      expect((await c.query("select count(*)::int as n from app.fn_buscar_productos('corona', 1)")).rows[0].n).toBe(1);   // p_limite
    });
  });
});

describe("auditoria", () => {
  it("UPDATE precio y alta de oferta quedan con su llave", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24] });
      const caja = p.pf(24);
      await c.query("select set_config('app.usuario_id', $1, true)", [p.usuario]);
      await ponerPrecio(c, caja, "Menudeo", "330.00");
      await ponerPrecio(c, caja, "Menudeo", "340.00");
      const lista = (await c.query("select id from app.lista_precio where nombre = 'Menudeo'")).rows[0].id;
      const a = await c.query("select registro_id, accion, usuario_id from app.auditoria where tabla = 'precio' and registro_id = $1 order by id", [`${caja}:${lista}`]);
      expect(a.rows).toEqual([
        { registro_id: `${caja}:${lista}`, accion: "insertar", usuario_id: p.usuario },
        { registro_id: `${caja}:${lista}`, accion: "actualizar", usuario_id: p.usuario },
      ]);
      const hoy = await dia(c, 0);
      const o = await c.query(
        "insert into app.precio_oferta (presentacion_id, precio, desde, hasta, motivo, creado_por) values ($1, 300, $2, $2, 'promocion', $3) returning id",
        [caja, hoy, p.usuario],
      );
      const ao = await c.query("select accion from app.auditoria where tabla = 'precio_oferta' and registro_id = $1", [o.rows[0].id]);
      expect(ao.rows).toEqual([{ accion: "insertar" }]);
    });
  });
});

describe("protecciones adicionales", () => {
  it("segundo inventario_inicial del mismo producto: AJUSTE_NO_VALIDO; ajuste_entrada sin costo usa el promedio", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { costo: "12.50" });
      expect((await error(c, () => ajuste(c, p.usuario, p.id, "inventario_inicial", 5, { costo: "9.00" }))).message).toBe("AJUSTE_NO_VALIDO");
      expect((await existencia(c, p.id)).cantidad).toBe(240);
      // un producto con otro movimiento previo tampoco admite inicial
      const q = await producto(c);
      await ajuste(c, q.usuario, q.id, "ajuste_entrada", 3, { costo: "2.00" });
      expect((await error(c, () => ajuste(c, q.usuario, q.id, "inventario_inicial", 5, { costo: "9.00" }))).message).toBe("AJUSTE_NO_VALIDO");
    });
  });

  it("TRUNCATE bloqueado en movimiento_inventario y existencia", async () => {
    await enTransaccion(async (c) => {
      expect(await error(c, () => c.query("truncate app.movimiento_inventario"))).toEqual({ code: "P0001", message: "MOVIMIENTO_INMUTABLE" });
      expect(await error(c, () => c.query("truncate app.existencia"))).toEqual({ code: "P0001", message: "EXISTENCIA_SOLO_POR_MOVIMIENTO" });
    });
  });

  it("la bandera de existencia no queda puesta: DML directo sigue bloqueado despues de un movimiento", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { costo: "12.50" });
      await ajuste(c, p.usuario, p.id, "ajuste_salida", 1);
      expect((await error(c, () => c.query("update app.existencia set cantidad = 1 where producto_id = $1", [p.id]))).message).toBe("EXISTENCIA_SOLO_POR_MOVIMIENTO");
    });
  });

  it("presentaciones no se borran", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { factores: [1, 24] });
      const e = await error(c, () => c.query("delete from app.presentacion where id = $1", [p.pf(24)]));
      expect(e).toEqual({ code: "P0001", message: "PRESENTACION_NO_BORRABLE" });
    });
  });

  it("busqueda: solo activos salvo p_incluir_inactivos", async () => {
    await enTransaccion(async (c) => {
      const p = await producto(c, { nombre: "Cerveza Zarzaparrilla Unica" });
      await c.query("update app.producto set activo = false where id = $1", [p.id]);
      const ids = async (incl?: boolean) =>
        (await c.query(incl === undefined ? "select producto_id from app.fn_buscar_productos('zarzaparrilla')" : "select producto_id from app.fn_buscar_productos('zarzaparrilla', 30, $1)", incl === undefined ? [] : [incl])).rows.map((r) => r.producto_id);
      expect(await ids()).toEqual([]);
      expect(await ids(false)).toEqual([]);
      expect(await ids(true)).toEqual([p.id]);
    });
  });

  it("fecha local de negocio: 00:30 UTC sigue siendo el dia anterior en Mexico; la oferta usa fn_fecha_local(now())", async () => {
    await enTransaccion(async (c) => {
      const f = async (ts: string) => (await c.query("select app.fn_fecha_local($1::timestamptz)::text as d", [ts])).rows[0].d;
      expect(await f("2026-11-24T00:30:00Z")).toBe("2026-11-23");
      expect(await f("2026-11-24T06:00:00Z")).toBe("2026-11-24");
      expect(await f("2026-11-23T05:59:00Z")).toBe("2026-11-22");

      const p = await producto(c, { factores: [1, 24] });
      await ponerPrecio(c, p.pf(24), "Menudeo", "330.00");
      // oferta de un solo dia, el dia local de hoy: vigente sin importar la hora UTC
      await c.query(
        `insert into app.precio_oferta (presentacion_id, precio, desde, hasta, motivo, creado_por)
         values ($1, 300, app.fn_fecha_local(now()), app.fn_fecha_local(now()), 'promocion', $2)`, [p.pf(24), p.usuario]);
      const r = await c.query("select app.fn_precio($1, (select id from app.lista_precio where nombre = 'Menudeo')) as p", [p.pf(24)]);
      expect(r.rows[0].p).toBe("300.00");
    });
  });

  it("auditoria de producto, presentacion, categoria y proveedor", async () => {
    await enTransaccion(async (c) => {
      const u = await usuarioF2(c);
      await c.query("select set_config('app.usuario_id', $1, true)", [u]);
      const p = await producto(c, { factores: [1, 24], usuario: u });
      const prov = await proveedor(c);
      await c.query("update app.producto set nombre = 'Renombrado' where id = $1", [p.id]);
      await c.query("update app.presentacion set nombre = 'Renombrada' where id = $1", [p.pf(24)]);
      await c.query("update app.categoria set orden = 3 where id = $1", [p.categoria_id]);
      await c.query("update app.proveedor set notas = 'n' where id = $1", [prov]);
      const a = async (tabla: string, id: string) =>
        (await c.query("select accion, usuario_id from app.auditoria where tabla = $1 and registro_id = $2 order by id", [tabla, id])).rows;
      const dos = [{ accion: "insertar", usuario_id: u }, { accion: "actualizar", usuario_id: u }];
      expect(await a("producto", p.id)).toEqual(dos);
      expect(await a("presentacion", p.pf(24))).toEqual(dos);
      expect(await a("categoria", p.categoria_id)).toEqual(dos);
      expect(await a("proveedor", prov)).toEqual(dos);
    });
  });
});

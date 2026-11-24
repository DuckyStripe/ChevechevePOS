import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error: modulo .mjs sin tipos
import { importar } from "../../scripts/importar-eleventa.mjs";
import { pool } from "../ayuda.js";

// Datos unicos por corrida (la base de pruebas es compartida); el usuario NO se borra: tiene movimientos de kardex.
const marca = String(Date.now()).slice(-10);
const usuario = `televenta_${marca}`;
const dir = mkdtempSync(join(tmpdir(), "elev-int-"));
const fx = (n: string) => join(import.meta.dirname, "fixtures", n);
// latin1 conserva los bytes de windows-1252 tal cual
const copia = (n: string, cambios: Array<[string, string]>) => {
  let t = readFileSync(fx(n)).toString("latin1");
  for (const [a, b] of cambios) t = t.split(a).join(b);
  const ruta = join(dir, n);
  writeFileSync(ruta, Buffer.from(t, "latin1"));
  return ruta;
};
let catalogo: string, clientes: string;
let marcaAuditoria = "0";
const codigos = [`${marca}0011`, `${marca}0028`];

const contar = async (sql: string, p: unknown[]) => Number((await pool.query<{ n: string }>(sql, p)).rows[0]!.n);
const productos = () => contar("select count(*) n from app.presentacion where codigo_barras = any($1)", [codigos]);
const clientesN = () => contar("select count(*) n from app.cliente where nombre like $1", [`%${marca}`]);

beforeAll(async () => {
  marcaAuditoria = (await pool.query<{ m: string }>("select coalesce(max(id), 0) as m from app.auditoria")).rows[0]!.m;
  await pool.query(
    `insert into app.usuario (usuario, nombre, contrasena_hash, rol_id, sucursal_id, debe_cambiar_contrasena)
     values ($1, 'Importador prueba', 'x', (select id from app.rol where nombre = 'Administrador'), 1, false)`, [usuario]);
  catalogo = copia("catalogo.csv", [["7500000000011", codigos[0]!], ["7500000000028", codigos[1]!], ["7500000000035", `${marca}0035`], ["7500000000042", `${marca}0042`], ["Cervezas", `Cervezas${marca}`]]);
  clientes = copia("clientes.csv", [["Lupe", `Lupe ${marca}`], ["Pepe", `Pepe ${marca}`], ["Sin Tel", `Sin Tel ${marca}`]]);
});
// Deja la base como estaba para las demas suites: sin clientes, productos activos ni usuario activo ni bitacora de esta corrida.
// El kardex y las categorias se quedan (los movimientos son inmutables); los productos quedan inactivos.
afterAll(async () => {
  rmSync(dir, { recursive: true });
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('app.escribiendo_dinero', '1', true)");
    await c.query("delete from app.cuenta_por_cobrar where cliente_id in (select id from app.cliente where nombre like $1)", [`%${marca}`]);
    await c.query("delete from app.cliente where nombre like $1", [`%${marca}`]);
    await c.query("commit");
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
  await pool.query("update app.presentacion set activa = false where codigo_barras like $1", [`${marca}%`]);
  await pool.query("update app.producto set activo = false where id in (select producto_id from app.presentacion where codigo_barras like $1)", [`${marca}%`]);
  await pool.query("update app.usuario set activo = false where usuario = $1", [usuario]);
  await pool.query("delete from app.auditoria where id > $1", [marcaAuditoria]);
});

const corre = (parte: string, archivo: string, extra: Record<string, unknown> = {}) => importar({ parte, archivo, usuario, ...extra });

describe("importar Eleventa (base de pruebas)", () => {
  it("catalogo en simulacro no escribe nada", async () => {
    const r = await corre("catalogo", catalogo, { simulacro: true });
    expect(r).toMatchObject({ modo: "simulacro", leidas: 5, nuevas: 2 });
    expect(r.rechazadas.map((x: { motivo: string }) => x.motivo)).toEqual(expect.arrayContaining(["sin nombre", expect.stringContaining("repetido"), expect.stringContaining("precio")]));
    expect(await productos()).toBe(0);
    expect(await contar("select count(*) n from app.categoria where nombre like $1", [`%${marca}`])).toBe(0);
  });
  it("catalogo real: nuevos con precios; segunda corrida actualiza sin duplicar", async () => {
    const r = await corre("catalogo", catalogo);
    expect(r).toMatchObject({ nuevas: 2, actualizadas: 0 });
    expect(await productos()).toBe(2);
    const p = await pool.query<{ lista: string; precio: string }>(
      `select l.nombre lista, p.precio from app.precio p join app.lista_precio l on l.id = p.lista_precio_id
        join app.presentacion pr on pr.id = p.presentacion_id where pr.codigo_barras = $1 order by 1`, [codigos[0]]);
    expect(p.rows).toEqual([{ lista: "Mayoreo", precio: "16.50" }, { lista: "Menudeo", precio: "18.00" }]);
    const r2 = await corre("catalogo", catalogo);
    expect(r2).toMatchObject({ nuevas: 0, actualizadas: 0, sin_cambio: 2 });
    expect(await productos()).toBe(2);
  });
  it("existencias exige --corte, carga una vez y la segunda salta todo", async () => {
    await expect(corre("existencias", catalogo)).rejects.toThrow("--corte");
    const sim = await corre("existencias", catalogo, { corte: true, simulacro: true });
    expect(sim.nuevas).toBe(2);
    expect(await contar("select count(*) n from app.movimiento_inventario m join app.presentacion pr on pr.producto_id = m.producto_id where pr.codigo_barras = any($1)", [codigos])).toBe(0);
    const r = await corre("existencias", catalogo, { corte: true });
    expect(r.nuevas).toBe(2);
    const e = await pool.query("select e.cantidad from app.existencia e join app.presentacion pr on pr.producto_id = e.producto_id where pr.codigo_barras = $1", [codigos[0]]);
    expect(e.rows[0].cantidad).toBe(24);
    const r2 = await corre("existencias", catalogo, { corte: true });
    expect(r2.nuevas).toBe(0);
    expect(r2.saltadas.length).toBe(2);
  });
  it("clientes: sin duplicar, teléfono inválido sin teléfono, saldos solo reportados", async () => {
    const sim = await corre("clientes", clientes, { simulacro: true });
    expect(sim.nuevas).toBe(3);
    expect(await clientesN()).toBe(0);
    const r = await corre("clientes", clientes);
    expect(r).toMatchObject({ nuevas: 3 });
    expect(r.telefonos_invalidos).toHaveLength(1);
    expect(JSON.stringify(r)).not.toContain("5512345678");
    expect(r.saldos.suma).toBe("170.75");
    expect(await clientesN()).toBe(3);
    const sinTel = await pool.query("select telefono_whatsapp, ya_compro from app.cliente where nombre = $1", [`Miscelánea Sin Tel ${marca}`]);
    expect(sinTel.rows[0]).toEqual({ telefono_whatsapp: null, ya_compro: true });
    const r2 = await corre("clientes", clientes);
    expect(r2.nuevas).toBe(0);
    expect(await clientesN()).toBe(3);
  });
});

describe("importar Eleventa: saldos (base de pruebas)", () => {
  const tel = `5500${marca.slice(-6)}`;
  const csvClientes = `Nombre,Teléfono,Dirección,Saldo\nSaldo Uno ${marca},${tel},Calle 1,"1,250.50"\nSaldo Cero ${marca},,Calle 2,0\nSaldo Malo ${marca},,Calle 3,abc\n`;
  const csvSaldos = `${csvClientes}Saldo Fantasma ${marca},,Calle 4,10\n`;
  let ya: string, saldos: string;
  const cxc = () => pool.query<{ monto: string; saldo: string; origen: string; concepto: string; vence: string; esperado: string }>(
    `select x.monto, x.saldo, x.origen, x.concepto, x.vence_el::text vence,
            ((now() at time zone 'America/Mexico_City')::date + c.dias_credito)::text esperado
       from app.cuenta_por_cobrar x join app.cliente c on c.id = x.cliente_id where c.nombre like $1`, [`%${marca}`]).then((r) => r.rows);
  beforeAll(async () => {
    ya = join(dir, "saldos-clientes.csv");
    saldos = join(dir, "saldos.csv");
    writeFileSync(ya, csvClientes);
    writeFileSync(saldos, csvSaldos);
    await corre("clientes", ya);
    await pool.query("update app.cliente set dias_credito = 7 where nombre = $1", [`Saldo Uno ${marca}`]);
  });
  const saldosCon = (extra: Record<string, unknown> = {}) => corre("saldos", saldos, { corte: true, concepto: "Saldo de Eleventa", ...extra });

  it("sin --corte o sin --concepto falla y no escribe", async () => {
    await expect(corre("saldos", saldos, { concepto: "x" })).rejects.toThrow("--corte");
    await expect(corre("saldos", saldos, { corte: true })).rejects.toThrow("--concepto");
    expect((await cxc()).length).toBe(0);
  });
  it("--simulacro reporta pero no deja filas", async () => {
    const r = await saldosCon({ simulacro: true });
    expect(r).toMatchObject({ cargados: 1, suma: "1250.50" });
    expect((await cxc()).length).toBe(0);
  });
  it("carga solo el saldo valido, vence = corte + dias de credito, reporte sin telefonos", async () => {
    const r = await saldosCon();
    expect(r).toMatchObject({ cargados: 1, suma: "1250.50", ya_tenian: 0, no_encontrados: 1 });
    expect(r.saldo_invalido).toEqual([expect.objectContaining({ nombre: `Saldo Malo ${marca}` })]);
    expect(JSON.stringify(r)).not.toContain(tel);
    const f = await cxc();
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ monto: "1250.50", saldo: "1250.50", origen: "saldo_inicial", concepto: "Saldo de Eleventa" });
    expect(f[0]!.vence).toBe(f[0]!.esperado);
  });
  it("segunda corrida no duplica", async () => {
    const r = await saldosCon();
    expect(r).toMatchObject({ cargados: 0, suma: "0.00", ya_tenian: 1 });
    expect(await cxc()).toHaveLength(1);
  });
});

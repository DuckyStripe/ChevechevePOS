import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar, errorDe, pool } from "./ayuda.js";
import { crearUsuarioF3, limpiarF3, pedirPersonal, snapshotF3, tokenF3, type Snapshot } from "./ayuda-f3.js";
import { limpiarF5 } from "./ayuda-f5.js";

let app: FastifyInstance;
let antes: Snapshot;
let pedir: ReturnType<typeof pedirPersonal>;
let dueno: string;
let almacenista: string;
let cajero: string;

beforeAll(async () => {
  antes = await snapshotF3();
  app = await crearApp();
  pedir = pedirPersonal(app);
  dueno = await entrar(app, await crearUsuarioF3("Dueño"));
  almacenista = await tokenF3(app, "Almacenista");
  cajero = await tokenF3(app, "Cajero");
});
afterAll(async () => {
  await limpiarF5();
  await limpiarF3(app, antes);
  await cerrarPoolPruebas();
});

type Lista = { anio: number; items: { fecha: string; nombre: string; factor: string }[]; total: number };

describe("/api/fechas-demanda", () => {
  it("GET: el anio actual viene sembrado (quincenas y Semana Santa); Almacenista lo ve; Cajero 403; anio mal escrito 400", async () => {
    expect((await pedir("GET", "/api/fechas-demanda")).statusCode).toBe(401);
    const r = (await pedir("GET", "/api/fechas-demanda", almacenista)).json<Lista>();
    const actual = (await pool.query<{ y: number }>("select extract(year from app.fn_fecha_local(now()))::int as y")).rows[0]!.y;
    expect(r.anio).toBe(actual);
    expect(r.items.length).toBeGreaterThan(60);
    expect(r.items.every((x) => x.fecha.startsWith(String(actual)))).toBe(true);
    expect(r.items.filter((x) => x.nombre === "Semana Santa")).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ factor: expect.stringMatching(/^\d\.\d\d$/) });
    expect(r.total).toBe(r.items.length);
    const g = await pedir("GET", "/api/fechas-demanda", cajero);
    expect(g.statusCode).toBe(403);
    expect(errorDe(g)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "surtido.ver" } });
    expect((await pedir("GET", "/api/fechas-demanda?anio=dos", dueno)).statusCode).toBe(400);
  });

  it("PUT reemplaza el anio exacto (lo de otro anio queda); factor 6 o 0.05 -> 400; fecha de otro anio 409; repetida 409", async () => {
    const dos = [{ fecha: "2099-02-14", nombre: "Puente", factor: 1.5 }, { fecha: "2099-06-10", nombre: "Final de futbol", factor: 2 }];
    const a = await pedir("PUT", "/api/fechas-demanda", dueno, { anio: 2099, fechas: dos });
    expect(a.statusCode).toBe(200);
    expect(a.json<Lista>()).toMatchObject({ anio: 2099, total: 2, items: [{ fecha: "2099-02-14", nombre: "Puente", factor: "1.50" }, { fecha: "2099-06-10", nombre: "Final de futbol", factor: "2.00" }] });
    // Sin `anio`: sale de las fechas. Reemplaza, no suma.
    const b = await pedir("PUT", "/api/fechas-demanda", dueno, { fechas: [{ fecha: "2099-12-24", nombre: "Navidad", factor: 1.2 }] });
    expect(b.json<Lista>().items.map((x) => x.fecha)).toEqual(["2099-12-24"]);
    expect((await pedir("GET", "/api/fechas-demanda?anio=2099", almacenista)).json<Lista>().total).toBe(1);

    const actual = (await pedir("GET", "/api/fechas-demanda", dueno)).json<Lista>();
    expect(actual.total).toBeGreaterThan(60); // el anio en curso no se toco

    expect((await pedir("PUT", "/api/fechas-demanda", dueno, { anio: 2099, fechas: [{ fecha: "2099-03-01", nombre: "x", factor: 6 }] })).statusCode).toBe(400);
    expect((await pedir("PUT", "/api/fechas-demanda", dueno, { anio: 2099, fechas: [{ fecha: "2099-03-01", nombre: "x", factor: 0.05 }] })).statusCode).toBe(400);
    expect((await pedir("PUT", "/api/fechas-demanda", dueno, { anio: 2099, fechas: [{ fecha: "2099-03-01", nombre: "", factor: 1 }] })).statusCode).toBe(400);
    const otro = await pedir("PUT", "/api/fechas-demanda", dueno, { anio: 2099, fechas: [{ fecha: "2098-03-01", nombre: "x", factor: 1 }] });
    expect(otro.statusCode).toBe(409);
    expect(errorDe(otro).codigo).toBe("FECHA_NO_VALIDA");
    const rep = await pedir("PUT", "/api/fechas-demanda", dueno, { anio: 2099, fechas: [{ fecha: "2099-03-01", nombre: "x", factor: 1 }, { fecha: "2099-03-01", nombre: "y", factor: 1 }] });
    expect(errorDe(rep).codigo).toBe("DUPLICADO");
    // Lo rechazado no borro nada
    expect((await pedir("GET", "/api/fechas-demanda?anio=2099", dueno)).json<Lista>().total).toBe(1);
  });

  it("PUT solo con configuracion.editar: Almacenista y Cajero 403; la lista vacia limpia el anio", async () => {
    for (const t of [almacenista, cajero]) {
      const r = await pedir("PUT", "/api/fechas-demanda", t, { anio: 2099, fechas: [] });
      expect(r.statusCode).toBe(403);
      expect(errorDe(r)).toMatchObject({ codigo: "SIN_PERMISO", detalles: { permiso: "configuracion.editar" } });
    }
    const v = await pedir("PUT", "/api/fechas-demanda", dueno, { anio: 2099, fechas: [] });
    expect(v.json<Lista>()).toMatchObject({ anio: 2099, total: 0, items: [] });
  });
});

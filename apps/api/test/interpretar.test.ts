import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { partirMensaje } from "../src/modulos/pedidos/interpretar.js";
import { cerrarPoolPruebas, crearApp, entrar, errorDe, pool } from "./ayuda.js";
import { ayudaF2 } from "./ayuda-f2.js";
import { clienteConEnlace, crearUsuarioF3, limpiarF3, pedirPersonal, snapshotF3, tokenF3, type Snapshot } from "./ayuda-f3.js";

describe("partirMensaje (parte pura, sin base)", () => {
  const una = (t: string) => partirMensaje(t)[0]!;

  it("cantidad al inicio, unidad y producto; el texto de la linea no lleva la cantidad", () => {
    expect(una("2 cajas de corona")).toEqual({ texto: "cajas de corona", cantidad: 2, media: false, unidad: "caja", producto: "corona" });
    expect(una("un cartón de tecate lite")).toMatchObject({ cantidad: 1, unidad: "caja", producto: "tecate lite", texto: "cartón de tecate lite" });
    expect(una("3 six de corona por favor")).toMatchObject({ cantidad: 3, unidad: "six", producto: "corona" });
    expect(una("doce latas de victoria")).toMatchObject({ cantidad: 12, unidad: "pieza", producto: "victoria" });
    expect(una("UNA CAJA DE XX")).toMatchObject({ cantidad: 1, unidad: "caja", producto: "xx" });
  });

  it("cantidad al final, «x2» y numero pegado a la unidad", () => {
    expect(una("corona 2 cajas")).toMatchObject({ cantidad: 2, unidad: "caja", producto: "corona" });
    expect(una("indio x3")).toMatchObject({ cantidad: 3, unidad: null, producto: "indio" });
    expect(una("indio x 4")).toMatchObject({ cantidad: 4, producto: "indio" });
    expect(una("modelo 5")).toMatchObject({ cantidad: 5, producto: "modelo" });
    expect(una("2cajas corona")).toMatchObject({ cantidad: 2, unidad: "caja", producto: "corona" });
  });

  it("«media» es 0.5 de la presentacion mayor y se marca", () => {
    expect(una("media de xx")).toEqual({ texto: "de xx", cantidad: 0.5, media: true, unidad: null, producto: "xx" });
    expect(una("media caja de corona")).toMatchObject({ media: true, unidad: "caja", producto: "corona" });
  });

  it("corta por salto de linea, coma, punto y coma y « y » cuando sigue una cantidad", () => {
    expect(partirMensaje("6 caguamas y 3 six indio").map((f) => [f.cantidad, f.producto])).toEqual([[6, "caguamas"], [3, "indio"]]);
    expect(partirMensaje("2 corona, 3 indio; 1 xx\n4 modelo").map((f) => f.producto)).toEqual(["corona", "indio", "xx", "modelo"]);
    expect(partirMensaje("una de xx y una de tecate").map((f) => [f.cantidad, f.producto])).toEqual([[1, "xx"], [1, "tecate"]]);
    // sin cantidad despues de la «y» no se corta: es parte del nombre
    expect(partirMensaje("tecate y victoria")).toHaveLength(1);
    expect(partirMensaje("- 2 cajas corona\n- 1 six victoria").map((f) => f.producto)).toEqual(["corona", "victoria"]);
  });

  it("saludos y cortesias no son lineas; el vacio da []", () => {
    expect(partirMensaje("Hola buenas tardes")).toEqual([]);
    expect(partirMensaje("   ")).toEqual([]);
    expect(partirMensaje("Hola buenas tardes, me manda 2 cajas de corona gracias")).toEqual([{ texto: "cajas de corona", cantidad: 2, media: false, unidad: "caja", producto: "corona" }]);
  });

  it("la parte pura devuelve todas las lineas; el tope de 100 lo aplica la resolucion", () => {
    expect(partirMensaje(Array.from({ length: 150 }, (_, i) => `${(i % 9) + 1} corona`).join("\n"))).toHaveLength(150);
  });
});

describe("POST /api/pedidos/interpretar", () => {
  let app: FastifyInstance;
  let antes: Snapshot;
  let pedir: ReturnType<typeof pedirPersonal>;
  let dueno: { token: string; id: string };
  let cajero: string;
  let almacenista: string;
  let cliente: string;
  const ids: Record<string, Record<number, string>> = {};
  let otrosProductos: string[] = [];

  beforeAll(async () => {
    antes = await snapshotF3();
    app = await crearApp();
    pedir = pedirPersonal(app);
    const h = ayudaF2(app);
    // Los productos que dejaron otras suites (p. ej. «Corona lata …») empatarian la busqueda: se apagan mientras corre esta y se restauran al final.
    otrosProductos = (await pool.query<{ id: string }>("update app.producto set activo = false where activo and nombre not like 'TF3 %' returning id")).rows.map((r) => r.id);
    const u = await crearUsuarioF3("Dueño");
    dueno = { token: await entrar(app, u), id: u.id };
    cajero = await tokenF3(app, "Cajero");
    almacenista = await tokenF3(app, "Almacenista");
    const lista = (await pedir("GET", "/api/listas-precio", dueno.token)).json().items.find((l: { nombre: string }) => l.nombre === "Menudeo").id as string;
    const categoria = await h.crearCategoria(dueno.token);
    const precios: object[] = [];
    // [nombre, alias, factores con precio]
    const catalogo: [string, string[], Record<number, string>][] = [
      ["TF3 Corona Extra", [], { 6: "110.00", 24: "420.00" }],
      ["TF3 Tecate Lite", ["tecate light"], { 6: "100.00", 24: "390.00" }],
      ["TF3 Indio", [], { 6: "95.00", 24: "370.00" }],
      ["TF3 XX Lager", ["xx", "dos equis"], { 24: "430.00" }],
      ["TF3 Modelo Especial", [], { 24: "450.00" }],
      ["TF3 Victoria 355 ml", [], { 24: "410.00" }],
      ["TF3 Caguama 940 ml", ["caguama", "caguamas"], { 1: "38.00" }],
    ];
    for (const [nombre, alias, fx] of catalogo) {
      const p = await h.crearProducto(dueno.token, { nombre, alias, categoria_id: categoria.id, factores: Object.keys(fx).map(Number).filter((f) => f !== 1) });
      ids[nombre] = Object.fromEntries(Object.keys(fx).map((f) => [Number(f), p.por(Number(f)).id]));
      for (const [f, precio] of Object.entries(fx)) precios.push({ presentacion_id: p.por(Number(f)).id, lista_precio_id: lista, precio });
    }
    expect((await pedir("PUT", "/api/precios", dueno.token, { precios })).statusCode).toBe(200);
    cliente = (await clienteConEnlace(app, dueno, {})).id;
  });
  afterAll(async () => {
    await pool.query("update app.producto set activo = true where id = any($1::bigint[])", [otrosProductos]);
    await limpiarF3(app, antes);
    await cerrarPoolPruebas();
  });

  const interpretar = (texto: string, token = cajero, cliente_id = cliente) => pedir("POST", "/api/pedidos/interpretar", token, { cliente_id, texto });
  type Linea = { texto: string; cantidad: number; presentacion_id?: string; color: string; candidatos: { presentacion_id: string; producto: string; presentacion: string; precio: string; puntaje: number }[] };
  const lineas = async (texto: string) => (await interpretar(texto)).json<{ lineas: Linea[] }>().lineas;

  it("fixture de 10 mensajes: al menos 80 % de las lineas salen verdes y las que importan eligen la presentacion correcta", async () => {
    const mensajes = readFileSync(new URL("./fixtures/mensajes-whatsapp.txt", import.meta.url), "utf8")
      .split(/^---$/m).map((m) => m.split("\n").filter((l) => !l.startsWith("#")).join("\n").trim()).filter(Boolean);
    expect(mensajes).toHaveLength(10);
    const todas: Linea[] = [];
    for (const m of mensajes) todas.push(...(await lineas(m)));
    const verdes = todas.filter((l) => l.color === "verde").length;
    if (process.env.DEPURAR) console.log(JSON.stringify(todas.filter((l) => l.color !== "verde"), null, 1));
    expect(todas.length).toBeGreaterThanOrEqual(15);
    expect(verdes / todas.length).toBeGreaterThanOrEqual(0.8);

    const [a, b] = await lineas("2 cajas de corona y 3 six indio");
    expect(a).toMatchObject({ cantidad: 2, color: "verde", presentacion_id: ids["TF3 Corona Extra"]![24], candidatos: [expect.objectContaining({ presentacion: "Caja de 24", precio: "420.00" })] });
    expect(b).toMatchObject({ cantidad: 3, color: "verde", presentacion_id: ids["TF3 Indio"]![6] });
    expect((await lineas("un cartón de tecate lite"))[0]).toMatchObject({ cantidad: 1, color: "verde", presentacion_id: ids["TF3 Tecate Lite"]![24] });
    expect((await lineas("6 caguamas"))[0]).toMatchObject({ cantidad: 6, color: "verde", presentacion_id: ids["TF3 Caguama 940 ml"]![1] });
    expect((await lineas("tecate light"))[0]).toMatchObject({ color: "verde" });
  });

  it("«media de xx»: cantidad redondeada a 1 y amarilla; sin candidato: roja con el texto; unidad que el producto no tiene: amarilla", async () => {
    expect((await lineas("media de xx"))[0]).toMatchObject({ cantidad: 1, color: "amarillo", candidatos: [expect.objectContaining({ presentacion_id: ids["TF3 XX Lager"]![24] })] });
    expect((await lineas("2 cajas de zzzz qqqq"))[0]).toEqual({ texto: "cajas de zzzz qqqq", cantidad: 2, color: "rojo", candidatos: [] });
    expect((await lineas("3 six de xx"))[0]).toMatchObject({ cantidad: 3, color: "amarillo" });
  });

  it("corregir una linea la deja verde la proxima vez para ese cliente (POST /pedidos {correcciones}); otro cliente no la aprende", async () => {
    const antes1 = (await lineas("2 cartones de la buena"))[0]!;
    expect(antes1.color).not.toBe("verde");
    const destino = ids["TF3 Modelo Especial"]![24]!;
    const r = await pedir("POST", "/api/pedidos", cajero, {
      clave_idempotencia: randomUUID(), cliente_id: cliente, lineas: [{ presentacion_id: destino, cantidad: 2 }],
      correcciones: [{ texto: antes1.texto, presentacion_id: destino }],
    });
    expect(r.statusCode).toBe(201);
    const despues = (await lineas("5 cartones de la buena"))[0]!;
    expect(despues).toMatchObject({ color: "verde", cantidad: 5, presentacion_id: destino });
    const otro = (await clienteConEnlace(app, dueno, {})).id;
    expect((await interpretar("5 cartones de la buena", cajero, otro)).json().lineas[0].color).not.toBe("verde");
  });

  it("400: texto de 2001 caracteres, vacio o sin cliente; 404 cliente; 401; 403 sin pedidos.capturar", async () => {
    const largo = await interpretar("a".repeat(2001));
    expect(largo.statusCode).toBe(400);
    expect(errorDe(largo).codigo).toBe("VALIDACION");
    expect((await interpretar("a".repeat(2000))).statusCode).toBe(200);
    expect((await interpretar("   ")).statusCode).toBe(400);
    const cien = Array.from({ length: 100 }, () => "2 corona").join("\n");
    expect((await interpretar(cien)).statusCode).toBe(200);
    const demasiadas = await interpretar(`${cien}\n1 indio`);
    expect(demasiadas.statusCode).toBe(400);
    expect(errorDe(demasiadas).codigo).toBe("VALIDACION");
    expect((await pedir("POST", "/api/pedidos/interpretar", cajero, { texto: "2 corona" })).statusCode).toBe(400);
    expect((await interpretar("2 corona", cajero, "999999999")).statusCode).toBe(404);
    expect((await pedir("POST", "/api/pedidos/interpretar", undefined, { cliente_id: cliente, texto: "2 corona" })).statusCode).toBe(401);
    const sin = await interpretar("2 corona", almacenista);
    expect(sin.statusCode).toBe(403);
    expect(errorDe(sin).detalles).toEqual({ permiso: "pedidos.capturar" });
    expect((await interpretar("Hola buenas tardes")).json()).toEqual({ lineas: [] });
  });
});

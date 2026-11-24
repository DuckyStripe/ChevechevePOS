import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cerrarPoolPruebas, crearApp, entrar } from "./ayuda.js";
import { activarCliente, crearUsuarioF3, limpiarF3, pedirCliente, pedirPersonal, snapshotF3, type Credenciales, type Snapshot } from "./ayuda-f3.js";
import { montarJuegoZ, llavesDeZona, type JuegoZHttp } from "./ayuda-f11.js";

// F11 paquete C: «en tu zona tambien piden» por HTTP con el juego Z de docs/fases/F11.md (el mismo de las pruebas SQL de 011).
// Solo ids: nunca cuantos clientes de la zona compran, ni quienes. Todo cuelga de la sesion del enlace, no de un parametro.
let app: FastifyInstance;
let antes: Snapshot;
let pedir: ReturnType<typeof pedirPersonal>;
let publico: ReturnType<typeof pedirCliente>;
let j: JuegoZHttp;
let desmontar: () => Promise<void>;
let dueno: string;
let credE: Credenciales;
let credF: Credenciales;

type Catalogo = { articulos: { presentacion_id: string; precio: string }[]; sugerencias_zona: { presentacion_id: string }[]; version: string };
const catalogo = async (c: Credenciales) => {
  const r = await publico("GET", "/api/publico/catalogo", c);
  expect(r.statusCode, r.body).toBe(200);
  return { cuerpo: r.json<Catalogo>(), etag: r.headers.etag as string };
};

beforeAll(async () => {
  antes = await snapshotF3();
  app = await crearApp();
  pedir = pedirPersonal(app);
  publico = pedirCliente(app);
  const u = await crearUsuarioF3("Dueño");
  dueno = await entrar(app, u);
  ({ j, desmontar } = await montarJuegoZ());
  credE = await activarCliente(app, { id: j.E, nombre: "E", token: j.enlace.E.token, enlace_id: "0" });
  credF = await activarCliente(app, { id: j.F, nombre: "F", token: j.enlace.F.token, enlace_id: "0" });
}, 120_000);

afterAll(async () => {
  await desmontar?.();
  await limpiarF3(app, antes);
  await cerrarPoolPruebas();
});

describe("sugerencias_zona en el catalogo del cliente", () => {
  it("E recibe los 3 ids del juego, en orden, cada uno es un articulo del catalogo y no hay conteos, clientes ni zonas; F (otra zona) no recibe ninguno", async () => {
    const { cuerpo } = await catalogo(credE);
    const esperado = [j.caja.Corona, j.caja.Indio, j.caja["Carta Blanca"]];
    expect(cuerpo.sugerencias_zona).toEqual(esperado.map((presentacion_id) => ({ presentacion_id })));
    const articulos = new Set(cuerpo.articulos.map((a) => a.presentacion_id));
    for (const id of esperado) expect(articulos.has(id)).toBe(true);
    expect(llavesDeZona(cuerpo.sugerencias_zona)).toEqual([]);
    expect((await catalogo(credF)).cuerpo.sugerencias_zona).toEqual([]);
  });

  it("las sugerencias van dentro del cuerpo hasheado: cambiar el precio de Indio Caja a 410.00 cambia el precio del articulo y el ETag", async () => {
    const antesE = await catalogo(credE);
    const listas = (await pedir("GET", "/api/listas-precio", dueno)).json().items as { id: string; nombre: string }[];
    const menudeo = listas.find((l) => l.nombre === "Menudeo")!.id;
    const r = await pedir("PUT", "/api/precios", dueno, { precios: [{ presentacion_id: j.caja.Indio, lista_precio_id: menudeo, precio: "410.00" }] });
    expect(r.statusCode, r.body).toBe(200);
    const despues = await catalogo(credE);
    expect(despues.cuerpo.articulos.find((a) => a.presentacion_id === j.caja.Indio)).toMatchObject({ precio: "410.00" });
    expect(despues.etag).not.toBe(antesE.etag);
    expect(despues.cuerpo.sugerencias_zona).toEqual(antesE.cuerpo.sugerencias_zona);
    expect(despues.cuerpo.version).toBe(despues.etag.slice(1, -1));
  });

  it("el cliente sale del enlace: el parametro cliente_id en la consulta no cambia el resultado", async () => {
    const r = await publico("GET", `/api/publico/catalogo?cliente_id=${j.F}`, credE);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json<Catalogo>().sugerencias_zona).toHaveLength(3);
  });
});

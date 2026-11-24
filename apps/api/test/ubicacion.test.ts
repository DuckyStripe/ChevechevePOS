import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { extraerCoordenadas, resolverUbicacion, type FetchUbicacion } from "../src/modulos/clientes/ubicacion.js";
import { cerrarPoolPruebas, crearApp, entrar, errorDe, pool } from "./ayuda.js";
import { activarCliente, clienteConEnlace, crearUsuarioF3, limpiarF3, pedirCliente, pedirPersonal, snapshotF3, tokenF3, type Snapshot } from "./ayuda-f3.js";

describe("extraerCoordenadas (parte pura)", () => {
  it("@lat,lng, q=, ll=, !3d!4d y coordenadas sueltas; fuera de Mexico o sin par: null", () => {
    const esperado = { lat: "19.432600", lng: "-99.133200" };
    expect(extraerCoordenadas("https://www.google.com/maps/place/Tienda/@19.4326,-99.1332,17z/data=!3m1")).toEqual(esperado);
    expect(extraerCoordenadas("https://maps.google.com/?q=19.4326,-99.1332")).toEqual(esperado);
    expect(extraerCoordenadas("https://www.google.com/maps?ll=19.4326,-99.1332&z=15")).toEqual(esperado);
    expect(extraerCoordenadas("https://www.google.com/maps/place/X/data=!4m2!3d19.4326!4d-99.1332")).toEqual(esperado);
    expect(extraerCoordenadas("19.4326, -99.1332")).toEqual(esperado);
    expect(extraerCoordenadas("19.4326,-99.1332")).toEqual(esperado);
    expect(extraerCoordenadas("@40.4168,-3.7038")).toBeNull(); // Madrid
    expect(extraerCoordenadas("mi tienda queda cerca")).toBeNull();
    expect(extraerCoordenadas("99,99")).toBeNull();
  });
});

describe("resolverUbicacion (fetch inyectado: nunca red real)", () => {
  const redirige = (location: string | null, status = 302): FetchUbicacion => vi.fn(async () => ({ status, headers: { get: (n: string) => (n.toLowerCase() === "location" ? location : null) } }));

  it("enlace corto: un solo fetch con redirect manual y solo se acepta Location de *.google.com", async () => {
    const f = redirige("https://www.google.com/maps/place/X/@19.4326,-99.1332,17z");
    expect(await resolverUbicacion("https://maps.app.goo.gl/AbCdEf123", f)).toEqual({ lat: "19.432600", lng: "-99.133200" });
    expect(f).toHaveBeenCalledTimes(1);
    expect(vi.mocked(f).mock.calls[0]![1]).toMatchObject({ redirect: "manual" });
  });

  it("Location a otro dominio, sin redireccion, error de red o http: VALIDACION", async () => {
    for (const f of [redirige("https://evil.example.com/@19.4326,-99.1332"), redirige("https://google.com.evil.com/@19.4326,-99.1332"), redirige(null, 200), redirige("http://www.google.com/@19.4326,-99.1332"), vi.fn(async () => { throw new Error("sin red"); })]) {
      await expect(resolverUbicacion("https://maps.app.goo.gl/x", f as FetchUbicacion)).rejects.toMatchObject({ codigo: "VALIDACION" });
    }
  });

  it("un dominio que no es de enlaces cortos no se visita", async () => {
    const f = redirige("https://www.google.com/@19.4326,-99.1332");
    await expect(resolverUbicacion("https://acortador.example.com/x", f)).rejects.toMatchObject({ codigo: "VALIDACION" });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("ubicacion por la API", () => {
  let app: FastifyInstance;
  let antes: Snapshot;
  let pedir: ReturnType<typeof pedirPersonal>;
  let publico: ReturnType<typeof pedirCliente>;
  let dueno: { token: string; id: string };
  let cajero: string;
  let repartidor: string;

  beforeAll(async () => {
    antes = await snapshotF3();
    app = await crearApp();
    pedir = pedirPersonal(app);
    publico = pedirCliente(app);
    const u = await crearUsuarioF3("Dueño");
    dueno = { token: await entrar(app, u), id: u.id };
    cajero = await tokenF3(app, "Cajero");
    repartidor = await tokenF3(app, "Repartidor");
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await limpiarF3(app, antes);
    await cerrarPoolPruebas();
  });

  const put = (id: string, cuerpo: object, token = dueno.token) => pedir("PUT", `/api/clientes/${id}/ubicacion`, token, cuerpo);

  it("PUT con los tres formatos de texto y con coordenadas: lat/lng exactos con 6 decimales", async () => {
    const c = await clienteConEnlace(app, dueno, {});
    for (const texto of ["https://www.google.com/maps/place/T/@19.4326,-99.1332,17z", "https://maps.google.com/?q=19.4326,-99.1332", "19.4326, -99.1332"]) {
      const r = await put(c.id, { texto });
      expect(r.statusCode, texto).toBe(200);
      expect(r.json()).toMatchObject({ lat: "19.432600", lng: "-99.133200", tiene_ubicacion: true, ubicacion_fuente: "mapa" });
    }
    const r = await put(c.id, { lat: "20.5", lng: -103.25, fuente: "app" });
    expect(r.json()).toMatchObject({ lat: "20.500000", lng: "-103.250000", ubicacion_fuente: "app" });
  });

  it("enlace corto con fetch simulado: google.com -> ok; otro dominio -> 400 VALIDACION; sin red real", async () => {
    const c = await clienteConEnlace(app, dueno, {});
    const respuesta = (loc: string) => vi.fn(async () => new Response(null, { status: 302, headers: { location: loc } }));
    const bueno = respuesta("https://www.google.com/maps/place/X/@19.4326,-99.1332,17z");
    vi.stubGlobal("fetch", bueno);
    const ok = await put(c.id, { texto: "https://maps.app.goo.gl/AbC123" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ lat: "19.432600", lng: "-99.133200" });
    expect(bueno).toHaveBeenCalledTimes(1);
    const malo = respuesta("https://evil.example.com/maps/@19.4326,-99.1332");
    vi.stubGlobal("fetch", malo);
    const r = await put(c.id, { texto: "https://maps.app.goo.gl/AbC123" });
    expect(r.statusCode).toBe(400);
    expect(errorDe(r).codigo).toBe("VALIDACION");
    vi.unstubAllGlobals();
  });

  it("400: fuera de Mexico, sin par, fuente mala, cuerpo vacio; 404; 401; 403 (Cajero y Repartidor no editan)", async () => {
    const c = await clienteConEnlace(app, dueno, {});
    expect((await put(c.id, { lat: 40.4, lng: -3.7, fuente: "mapa" })).statusCode).toBe(400);
    expect((await put(c.id, { texto: "por la iglesia" })).statusCode).toBe(400);
    expect((await put(c.id, { lat: 19.4, lng: -99.1, fuente: "cliente" })).statusCode).toBe(400);
    expect((await put(c.id, {})).statusCode).toBe(400);
    expect((await put("999999999", { texto: "19.4326,-99.1332" })).statusCode).toBe(404);
    expect((await pedir("PUT", `/api/clientes/${c.id}/ubicacion`, undefined, { texto: "19.4326,-99.1332" })).statusCode).toBe(401);
    for (const t of [cajero, repartidor]) expect((await put(c.id, { texto: "19.4326,-99.1332" }, t)).statusCode).toBe(403);
  });

  it("aceptar la propuesta del cliente: sin propuesta 409 SIN_PROPUESTA; con propuesta copia a lat/lng (fuente cliente) y la limpia; 401, 403, 404", async () => {
    const c = await clienteConEnlace(app, dueno, {});
    const sin = await pedir("POST", `/api/clientes/${c.id}/ubicacion/aceptar`, dueno.token);
    expect(sin.statusCode).toBe(409);
    expect(errorDe(sin).codigo).toBe("SIN_PROPUESTA");
    const cred = await activarCliente(app, c);
    expect((await publico("POST", "/api/publico/ubicacion", cred, { lat: 19.5, lng: -99.2, precision_m: 10 })).statusCode).toBe(202);
    expect((await pedir("GET", `/api/clientes/${c.id}`, dueno.token)).json()).toMatchObject({ lat: null, lat_propuesta: "19.500000", tiene_propuesta: true });
    expect((await pedir("POST", `/api/clientes/${c.id}/ubicacion/aceptar`, cajero)).statusCode).toBe(403);
    expect((await pedir("POST", `/api/clientes/${c.id}/ubicacion/aceptar`)).statusCode).toBe(401);
    const ok = await pedir("POST", `/api/clientes/${c.id}/ubicacion/aceptar`, dueno.token);
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ lat: "19.500000", lng: "-99.200000", ubicacion_fuente: "cliente", lat_propuesta: null, tiene_propuesta: false, tiene_ubicacion: true });
    expect((await pedir("POST", "/api/clientes/999999999/ubicacion/aceptar", dueno.token)).statusCode).toBe(404);
    expect((await pool.query("select count(*)::int as n from app.auditoria where tabla = 'cliente' and registro_id = $1", [c.id])).rows[0].n).toBeGreaterThan(0);
  });
});

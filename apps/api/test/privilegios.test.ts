import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, cerrarPoolPruebas, crearApp, crearUsuario, entrar, errorDe, instantanea, limpiar, pool, type Instantanea, type UsuarioPrueba } from "./ayuda.js";

// Regla del dueno: usuarios.gestionar sin ser Dueño no permite tocar al Dueño ni repartir poder.
let app: FastifyInstance;
let antes: Instantanea;
let dueno: UsuarioPrueba;
let tokenGestor: string;
let tokenDueno: string;
let rolDueno: string;
let rolCajero: string;
let n = 0;

const pedir = (method: "POST" | "PATCH", url: string, token: string, payload?: object) =>
  app.inject({ method, url, headers: auth(token), ...(payload ? { payload } : {}) });
const sinPermiso = (res: { statusCode: number; json: () => unknown }) => {
  expect(res.statusCode).toBe(403);
  expect(errorDe(res).codigo).toBe("SIN_PERMISO");
};

beforeAll(async () => {
  antes = await instantanea();
  app = await crearApp();
  dueno = await crearUsuario("Dueño");
  tokenDueno = await entrar(app, dueno);
  // Rol propio con usuarios.gestionar, asignado a alguien que no es Dueño.
  const rol = await pool.query<{ id: string }>("insert into app.rol (nombre) values ($1) returning id", [`tapi_gestor_${process.pid}`]);
  await pool.query("insert into app.rol_permiso (rol_id, permiso_codigo) values ($1, 'usuarios.gestionar')", [rol.rows[0]!.id]);
  const gestor = await crearUsuario("Cajero");
  await pool.query("update app.usuario set rol_id = $2 where id = $1", [gestor.id, rol.rows[0]!.id]);
  tokenGestor = await entrar(app, gestor);
  rolDueno = (await pool.query<{ id: string }>("select id from app.rol where es_sistema")).rows[0]!.id;
  rolCajero = (await pool.query<{ id: string }>("select id from app.rol where nombre = 'Cajero'")).rows[0]!.id;
});
afterAll(async () => {
  await limpiar(app, antes);
  await cerrarPoolPruebas();
});

describe("gestor sin rol de sistema", () => {
  it("no puede crear un usuario Dueño ni asignar el rol Dueño", async () => {
    sinPermiso(await pedir("POST", "/api/usuarios", tokenGestor, { usuario: `tapi_x${process.pid}`, nombre: "X", contrasena: "clave-inicial-1", rol_id: rolDueno }));
    const otro = await crearUsuario("Cajero");
    sinPermiso(await pedir("PATCH", `/api/usuarios/${otro.id}`, tokenGestor, { rol_id: rolDueno }));
  });

  it("no puede editar, desactivar, restablecer ni cerrar sesiones de un Dueño", async () => {
    sinPermiso(await pedir("PATCH", `/api/usuarios/${dueno.id}`, tokenGestor, { nombre: "Hackeado" }));
    sinPermiso(await pedir("PATCH", `/api/usuarios/${dueno.id}`, tokenGestor, { activo: false }));
    sinPermiso(await pedir("POST", `/api/usuarios/${dueno.id}/contrasena`, tokenGestor, { nueva: "clave-del-atacante" }));
    sinPermiso(await pedir("POST", `/api/usuarios/${dueno.id}/cerrar-sesiones`, tokenGestor));
    // Nada cambio: el dueno sigue entrando con su sesion y su clave.
    expect((await app.inject({ method: "GET", url: "/api/auth/yo", headers: auth(tokenDueno) })).statusCode).toBe(200);
    expect((await pool.query("select nombre, activo from app.usuario where id = $1", [dueno.id])).rows[0]).toMatchObject({ activo: true, nombre: expect.stringContaining("Prueba") });
  });

  it("no puede crear ni editar un rol que otorgue usuarios.gestionar", async () => {
    sinPermiso(await pedir("POST", "/api/roles", tokenGestor, { nombre: `tapi_esc_${process.pid}_${++n}`, permisos: ["usuarios.gestionar"] }));
    const libre = (await pedir("POST", "/api/roles", tokenGestor, { nombre: `tapi_ok_${process.pid}_${++n}`, permisos: ["auditoria.ver"] })).json();
    sinPermiso(await pedir("PATCH", `/api/roles/${libre.id}`, tokenGestor, { permisos: ["auditoria.ver", "usuarios.gestionar"] }));
    // Tampoco el rol que ya lo tiene (el suyo).
    const suyo = (await pool.query<{ id: string }>("select id from app.rol where nombre = $1", [`tapi_gestor_${process.pid}`])).rows[0]!.id;
    sinPermiso(await pedir("PATCH", `/api/roles/${suyo}`, tokenGestor, { nombre: `tapi_gestor2_${process.pid}` }));
    sinPermiso(await pedir("PATCH", `/api/roles/${rolDueno}`, tokenGestor, { nombre: "Otro" }));
  });

  it("sigue pudiendo gestionar usuarios y roles comunes", async () => {
    const u = await crearUsuario("Cajero");
    const ok = await pedir("PATCH", `/api/usuarios/${u.id}`, tokenGestor, { nombre: "Editado", rol_id: rolCajero });
    expect(ok.statusCode).toBe(200);
    expect((await pedir("POST", `/api/usuarios/${u.id}/cerrar-sesiones`, tokenGestor)).statusCode).toBe(204);
    const rol = await pedir("POST", "/api/roles", tokenGestor, { nombre: `tapi_comun_${process.pid}_${++n}`, permisos: ["configuracion.editar"] });
    expect(rol.statusCode).toBe(201);
  });
});

describe("el Dueño si puede", () => {
  it("crear un Dueño y un rol con usuarios.gestionar", async () => {
    const r = await pedir("POST", "/api/usuarios", tokenDueno, { usuario: `tapi_d2_${process.pid}`, nombre: "Otro dueno", contrasena: "clave-inicial-1", rol_id: rolDueno });
    expect(r.statusCode).toBe(201);
    const rol = await pedir("POST", "/api/roles", tokenDueno, { nombre: `tapi_gest2_${process.pid}`, permisos: ["usuarios.gestionar"] });
    expect(rol.statusCode).toBe(201);
  });
});

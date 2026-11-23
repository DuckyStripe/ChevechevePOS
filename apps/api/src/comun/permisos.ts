import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { errors as erroresJose, jwtVerify } from "jose";
import { env } from "../config/env.js";
import { consulta } from "../db/database.js";
import { AppError } from "./errores.js";

/** `config.permiso` de una ruta: codigo de §5, arreglo (cualquiera), 'sesion', 'cliente' o 'publica'. */
export type PermisoRuta = string | string[];

export interface UsuarioSesion {
  id: string;
  jti: string;
  origen: "web" | "app";
  sucursal_id: string;
  permisos: string[];
}

export interface ClienteEnlace {
  cliente_id: string;
  cliente_enlace_id: string;
  lista_precio_id: string | null;
  dispositivo_ok: boolean;
  tiene_pin: boolean;
}

declare module "fastify" {
  interface FastifyContextConfig {
    permiso?: PermisoRuta;
    /** Ruta de cliente que se puede usar sin dispositivo reconocido (las de PIN). */
    sinDispositivo?: boolean;
  }
  interface FastifyRequest {
    usuario?: UsuarioSesion;
    cliente?: ClienteEnlace;
  }
}

// CONTRATOS §4.1: unicas rutas que pueden ser 'publica' (HEAD cuenta como GET).
const PUBLICAS: Array<[metodo: string, coincide: (url: string) => boolean]> = [
  ["GET", (u) => u === "/health" || u === "/ready"],
  ["POST", (u) => u === "/api/auth/login"],
  ["GET", (u) => u === "/api/imagenes/:archivo"],
  ["GET", (u) => u.startsWith("/api/movil/actualizaciones/")],
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function validarRuta(url: string, metodos: string | string[], permiso: PermisoRuta | undefined): void {
  const enApi = url === "/api" || url.startsWith("/api/");
  const ids = `${[metodos].flat().join(",")} ${url}`;
  if (permiso === undefined) {
    if (enApi) throw new Error(`Ruta sin config.permiso: ${ids}`);
    return;
  }
  const publico = url.startsWith("/api/publico/");
  if (permiso === "cliente" && !publico) throw new Error(`Ruta 'cliente' fuera de /api/publico/: ${ids}`);
  if (publico && permiso !== "cliente") throw new Error(`Ruta de /api/publico/ que no es 'cliente': ${ids}`);
  if (permiso === "publica") {
    const ok = [metodos].flat().every((m) => {
      const metodo = m === "HEAD" ? "GET" : m;
      return PUBLICAS.some(([mm, f]) => mm === metodo && f(url));
    });
    if (!ok) throw new Error(`Ruta 'publica' fuera de la lista de CONTRATOS §4.1: ${ids}`);
  }
}

async function autenticarPersonal(req: FastifyRequest): Promise<UsuarioSesion & { debe_cambiar: boolean }> {
  const cab = req.headers.authorization;
  if (!cab?.startsWith("Bearer ")) throw new AppError("NO_AUTENTICADO");
  let sub: string | undefined;
  let jti: string | undefined;
  try {
    const { payload } = await jwtVerify(cab.slice(7), new TextEncoder().encode(env.JWT_SECRET), { algorithms: ["HS256"] });
    sub = payload.sub;
    jti = payload.jti;
  } catch (err) {
    throw new AppError(err instanceof erroresJose.JWTExpired ? "SESION_CERRADA" : "NO_AUTENTICADO");
  }
  if (!sub || !/^\d+$/.test(sub) || !jti || !UUID.test(jti)) throw new AppError("NO_AUTENTICADO");

  // Sesion viva + usuario activo + permisos del rol, siempre de la base.
  const r = await consulta<{
    origen: "web" | "app";
    sucursal_id: string;
    debe_cambiar: boolean;
    permisos: string[];
    reciente: boolean;
  }>(
    `select s.origen, u.sucursal_id, u.debe_cambiar_contrasena as debe_cambiar,
            array(select rp.permiso_codigo from app.rol_permiso rp where rp.rol_id = u.rol_id) as permisos,
            s.ultima_actividad_en > now() - interval '1 minute' as reciente
       from app.sesion s join app.usuario u on u.id = s.usuario_id
      where s.jti = $1 and s.usuario_id = $2 and s.cerrada_en is null and s.expira_en > now() and u.activo`,
    [jti, sub],
  );
  const f = r.rows[0];
  if (!f) throw new AppError("SESION_CERRADA");
  if (!f.reciente) await consulta("update app.sesion set ultima_actividad_en = now() where jti = $1", [jti]);
  return { id: sub, jti, origen: f.origen, sucursal_id: f.sucursal_id, permisos: f.permisos, debe_cambiar: f.debe_cambiar };
}

async function autenticarCliente(req: FastifyRequest): Promise<ClienteEnlace> {
  const token = req.headers["x-cliente-token"];
  const dispositivo = req.headers["x-cliente-dispositivo"];
  if (typeof token !== "string" || !token) throw new AppError("ENLACE_INVALIDO");
  // fn_cliente_por_token llega en la migracion 004; hasta entonces esta rama no tiene rutas.
  const r = await consulta<ClienteEnlace>("select * from app.fn_cliente_por_token($1, $2)", [
    sha256(token),
    typeof dispositivo === "string" && dispositivo ? sha256(dispositivo) : "",
  ]);
  if (!r.rows[0]) throw new AppError("ENLACE_INVALIDO");
  return r.rows[0];
}

export const permisosPlugin = fp(async (app: FastifyInstance) => {
  app.addHook("onRoute", (opts) => validarRuta(opts.url, opts.method, opts.config?.permiso));

  app.addHook("preHandler", async (req) => {
    const permiso = req.routeOptions.config.permiso;
    if (permiso === undefined || permiso === "publica") return;

    if (permiso === "cliente") {
      const c = await autenticarCliente(req);
      if (!c.dispositivo_ok && !req.routeOptions.config.sinDispositivo) {
        throw new AppError("PIN_REQUERIDO", { tiene_pin: c.tiene_pin });
      }
      req.cliente = c;
      return;
    }

    const { debe_cambiar, ...usuario } = await autenticarPersonal(req);
    req.usuario = usuario;
    if (debe_cambiar && !req.routeOptions.url?.startsWith("/api/auth/")) throw new AppError("CAMBIO_CONTRASENA_REQUERIDO");
    if (permiso === "sesion") return;
    if (![permiso].flat().some((p) => usuario.permisos.includes(p))) {
      throw new AppError("SIN_PERMISO", { permiso });
    }
  });
});

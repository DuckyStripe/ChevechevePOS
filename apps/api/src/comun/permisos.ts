import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { errors as erroresJose, jwtVerify } from "jose";
import { env } from "../config/env.js";
import { consulta } from "../db/database.js";
import { datosPublicos } from "./negocio-publico.js";
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
  ["GET", (u) => u === "/api/publico/negocio"],
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
  // Unica ruta publica bajo /api/publico/: datos del negocio para las pantallas de PIN y de enlace invalido (sin token).
  const publico = url.startsWith("/api/publico/") && url !== "/api/publico/negocio";
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

// Token falso: 10 fallos en 15 min por IP (X-Visitante-Ip) -> 429 ENLACE_BLOQUEADO antes de tocar la base.
// shortcut: memoria de un proceso con tope; con varias replicas cada una cuenta aparte. Pasar a tabla si se escala.
const FALLOS_MAX = 10;
const VENTANA_MS = 15 * 60_000;
const MAX_IPS = 5000;
const fallosPorIp = new Map<string, number[]>();

/** IPv6 se agrupa por /64 (una casa o telefono recorre miles de direcciones); IPv4 tal cual. Sin IP: 'desconocida'. */
export function cubetaIp(ip: string | undefined): string {
  const t = (ip ?? "").trim().toLowerCase().replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/, "$1");
  if (!t) return "desconocida";
  if (!t.includes(":")) return t;
  const sinZona = t.split("%")[0]!;
  const [izq = "", der] = sinZona.split("::");
  const a = izq ? izq.split(":") : [];
  const b = der === undefined ? [] : der ? der.split(":") : [];
  const completo = der === undefined ? a : [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b];
  return `${completo.slice(0, 4).map((h) => h.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

export const ipDe = (req: FastifyRequest): string => {
  const h = req.headers["x-visitante-ip"];
  return cubetaIp((typeof h === "string" && h.trim()) || req.ip);
};

function fallosVigentes(ip: string): number[] {
  const desde = Date.now() - VENTANA_MS;
  const vivos = (fallosPorIp.get(ip) ?? []).filter((t) => t > desde);
  if (vivos.length) fallosPorIp.set(ip, vivos);
  else fallosPorIp.delete(ip);
  return vivos;
}

function sumarFallo(ip: string): void {
  const vivos = fallosVigentes(ip);
  vivos.push(Date.now());
  fallosPorIp.delete(ip);
  fallosPorIp.set(ip, vivos);
  if (fallosPorIp.size > MAX_IPS) fallosPorIp.delete(fallosPorIp.keys().next().value!);
}

/** Solo pruebas: la memoria de fallos no se limpia sola entre archivos. */
export const olvidarFallosDeEnlace = (): void => fallosPorIp.clear();

async function autenticarCliente(req: FastifyRequest): Promise<ClienteEnlace> {
  const token = req.headers["x-cliente-token"];
  const dispositivo = req.headers["x-cliente-dispositivo"];
  // Sin token no hay nada que adivinar: no cuenta como fallo ni bloquea a nadie.
  if (typeof token !== "string" || !token) throw new AppError("ENLACE_INVALIDO");
  const r = await consulta<ClienteEnlace>("select * from app.fn_cliente_por_token($1, $2)", [
    sha256(token),
    typeof dispositivo === "string" && dispositivo ? sha256(dispositivo) : "",
  ]);
  // Un token valido siempre pasa (aunque su IP este bloqueada por adivinar otros): el bloqueo solo frena a quien falla.
  if (r.rows[0]) return r.rows[0];
  const ip = ipDe(req);
  if (fallosVigentes(ip).length >= FALLOS_MAX) throw new AppError("ENLACE_BLOQUEADO");
  sumarFallo(ip);
  throw new AppError("ENLACE_INVALIDO");
}

/** Permiso extra de rutas «A + B» (CONTRATOS §4.4): `config.permiso` lleva A y la ruta exige B antes de tocar la base. */
export function exigirPermiso(req: FastifyRequest, codigo: string): void {
  if (!req.usuario?.permisos.includes(codigo)) throw new AppError("SIN_PERMISO", { permiso: codigo });
}

export const permisosPlugin = fp(async (app: FastifyInstance) => {
  app.addHook("onRoute", (opts) => validarRuta(opts.url, opts.method, opts.config?.permiso));

  app.addHook("preHandler", async (req) => {
    const permiso = req.routeOptions.config.permiso;
    if (permiso === undefined || permiso === "publica") return;

    if (permiso === "cliente") {
      const c = await autenticarCliente(req);
      if (!c.dispositivo_ok && !req.routeOptions.config.sinDispositivo) {
        throw new AppError("PIN_REQUERIDO", { tiene_pin: c.tiene_pin, ...(await datosPublicos()) });
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

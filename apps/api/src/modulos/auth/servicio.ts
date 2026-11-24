import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { env } from "../../config/env.js";
import { AppError } from "../../comun/errores.js";
import { conUsuario } from "../../comun/transaccion.js";
import { consulta, enTransaccion } from "../../db/database.js";

const MAX_FALLOS = 5;
const BLOQUEO_MIN = 15;
// Hash de una contrasena que nadie tiene: se compara cuando el usuario no existe para que tarde igual.
const HASH_FALSO = bcrypt.hashSync("no-es-una-contrasena-real", 12);

export interface Yo {
  id: string;
  usuario: string;
  nombre: string;
  rol: { id: string; nombre: string };
  permisos: string[];
  sucursal: { id: string; nombre: string };
  debe_cambiar_contrasena: boolean;
  turno_abierto: { id: string; tipo: string; caja_id: string | null; ruta_id: string | null } | null;
  notificaciones_sin_leer: number;
}

/** `turno_abierto`: el turno de caja o de ruta abierto de esta persona (uno solo, por indice unico), o null. */
export async function obtenerYo(usuarioId: string): Promise<Yo> {
  const r = await consulta<Yo>(
    `select u.id, u.usuario, u.nombre,
            json_build_object('id', r.id, 'nombre', r.nombre) as rol,
            array(select rp.permiso_codigo from app.rol_permiso rp where rp.rol_id = u.rol_id order by 1) as permisos,
            json_build_object('id', s.id, 'nombre', s.nombre) as sucursal,
            u.debe_cambiar_contrasena,
            (select json_build_object('id', t.id::text, 'tipo', t.tipo, 'caja_id', t.caja_id::text, 'ruta_id', t.ruta_id::text)
               from app.turno_caja t where t.usuario_id = u.id and t.estado = 'abierto') as turno_abierto,
            (select count(*)::int from app.notificacion n where n.usuario_id = u.id and n.leida_en is null) as notificaciones_sin_leer
       from app.usuario u join app.rol r on r.id = u.rol_id join app.sucursal s on s.id = u.sucursal_id
      where u.id = $1`,
    [usuarioId],
  );
  if (!r.rows[0]) throw new AppError("NO_ENCONTRADO");
  return r.rows[0];
}

// Usuarios que no existen tambien se bloquean (si no, el 429 delataria cuales existen).
// shortcut: memoria por proceso con tope; con varias replicas cada una cuenta aparte. Pasar a tabla si se escala.
const fantasmas = new Map<string, { fallos: number; hasta: number }>();
const MAX_FANTASMAS = 5000;

function revisarFantasma(usuario: string): number | null {
  const f = fantasmas.get(usuario);
  if (!f) return null;
  if (f.hasta && f.hasta <= Date.now()) {
    fantasmas.delete(usuario);
    return null;
  }
  return f.hasta ? Math.ceil((f.hasta - Date.now()) / 1000) : null;
}

/** Cuenta un fallo; true si con este se bloquea. */
function fallaFantasma(usuario: string): boolean {
  const f = fantasmas.get(usuario) ?? { fallos: 0, hasta: 0 };
  fantasmas.delete(usuario);
  f.fallos += 1;
  const bloquea = f.fallos >= MAX_FALLOS;
  if (bloquea) {
    f.fallos = 0;
    f.hasta = Date.now() + BLOQUEO_MIN * 60_000;
  }
  fantasmas.set(usuario, f);
  if (fantasmas.size > MAX_FANTASMAS) fantasmas.delete(fantasmas.keys().next().value!);
  return bloquea;
}

const bloqueado = (seg: number) => new AppError("USUARIO_BLOQUEADO", { reintentar_en: seg });

export async function iniciarSesion(
  datos: { usuario: string; contrasena: string; origen: "web" | "app" },
  ip: string,
  userAgent: string | undefined,
) {
  const ipHash = createHash("sha256").update(ip + env.JWT_SECRET).digest("hex");
  // bcrypt (lento) corre fuera de toda transaccion y sin conexion del pool retenida.
  const u = (
    await consulta<{ id: string; contrasena_hash: string; activo: boolean; reintentar_en: number | null }>(
      `select id, contrasena_hash, activo,
              case when bloqueado_hasta > now() then ceil(extract(epoch from bloqueado_hasta - now()))::int end as reintentar_en
         from app.usuario where usuario = $1`,
      [datos.usuario],
    )
  ).rows[0];

  if (!u) {
    const restante = revisarFantasma(datos.usuario);
    if (restante !== null) throw bloqueado(restante);
    await bcrypt.compare(datos.contrasena, HASH_FALSO);
    throw fallaFantasma(datos.usuario) ? bloqueado(BLOQUEO_MIN * 60) : new AppError("CREDENCIALES_INVALIDAS");
  }
  if (u.reintentar_en !== null) throw bloqueado(u.reintentar_en);

  const buena = await bcrypt.compare(datos.contrasena, u.contrasena_hash);
  if (!buena || !u.activo) {
    // Un solo UPDATE atomico: cuenta el fallo y, al quinto, bloquea y reinicia el contador.
    const r = await consulta<{ bloqueado: boolean }>(
      `update app.usuario
          set intentos_fallidos = case when intentos_fallidos + 1 >= $2 then 0 else intentos_fallidos + 1 end,
              bloqueado_hasta = case when intentos_fallidos + 1 >= $2 then now() + make_interval(mins => $3) else bloqueado_hasta end
        where id = $1
        returning bloqueado_hasta > now() as bloqueado`,
      [u.id, MAX_FALLOS, BLOQUEO_MIN],
    );
    throw r.rows[0]?.bloqueado ? bloqueado(BLOQUEO_MIN * 60) : new AppError("CREDENCIALES_INVALIDAS");
  }

  const res = await enTransaccion(async (c) => {
    await c.query("update app.usuario set intentos_fallidos = 0 where id = $1 and intentos_fallidos > 0", [u.id]);
    const s = await c.query<{ jti: string; expira_en: Date }>(
      `insert into app.sesion (usuario_id, origen, expira_en, user_agent, ip_hash)
       values ($1, $2, now() + case when $2 = 'app' then $3::numeric * interval '1 day' else $4::numeric * interval '1 hour' end, $5, $6)
       returning jti, expira_en`,
      [u.id, datos.origen, env.SESION_APP_DIAS, env.SESION_WEB_HORAS, userAgent?.slice(0, 300) ?? null, ipHash],
    );
    return { jti: s.rows[0]!.jti, expira_en: s.rows[0]!.expira_en, usuarioId: u.id };
  });

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(res.usuarioId)
    .setJti(res.jti)
    .setIssuedAt()
    .setExpirationTime(Math.floor(res.expira_en.getTime() / 1000))
    .sign(new TextEncoder().encode(env.JWT_SECRET));
  return { token, expira_en: res.expira_en, usuario: await obtenerYo(res.usuarioId) };
}

export async function cerrarSesion(jti: string): Promise<void> {
  await consulta("update app.sesion set cerrada_en = now() where jti = $1 and cerrada_en is null", [jti]);
}

/** Cambia la contrasena propia y cierra las demas sesiones (la actual sigue). */
export async function cambiarContrasena(usuarioId: string, jti: string, actual: string, nueva: string): Promise<void> {
  const h = await consulta<{ contrasena_hash: string }>("select contrasena_hash from app.usuario where id = $1", [usuarioId]);
  if (!h.rows[0] || !(await bcrypt.compare(actual, h.rows[0].contrasena_hash))) throw new AppError("CONTRASENA_INCORRECTA");
  const hash = await bcrypt.hash(nueva, 12);
  await conUsuario(usuarioId, async (c) => {
    await c.query("update app.usuario set contrasena_hash = $2, debe_cambiar_contrasena = false, actualizado_en = now() where id = $1", [usuarioId, hash]);
    await c.query("update app.sesion set cerrada_en = now() where usuario_id = $1 and jti <> $2 and cerrada_en is null", [usuarioId, jti]);
  });
}

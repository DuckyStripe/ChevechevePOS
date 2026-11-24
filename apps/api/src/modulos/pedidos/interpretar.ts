import type pg from "pg";
import { AppError } from "../../comun/errores.js";

/*
 * Intérprete de mensajes de WhatsApp (CONTRATOS §2.12 B6): reglas, sin IA ni red.
 * Parte pura (partirMensaje) + resolución contra la base (interpretarMensaje).
 * El vocabulario vive en estas constantes: no es texto para el usuario.
 */

export type Unidad = "caja" | "six" | "pieza";

const NUMEROS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20,
};
const UNIDADES: Record<string, Unidad> = {
  caja: "caja", cajas: "caja", carton: "caja", cartones: "caja",
  six: "six", sixes: "six", sixpack: "six", sixpacks: "six",
  pieza: "pieza", piezas: "pieza", lata: "pieza", latas: "pieza", botella: "pieza", botellas: "pieza", unidad: "pieza", unidades: "pieza",
};
/** Saludos, cortesias y verbos de pedir: se quitan antes de buscar cantidad y producto. */
const RELLENO = new Set([
  "hola", "buenas", "buenos", "buen", "dia", "dias", "tarde", "tardes", "noche", "noches", "oye", "favor", "porfavor", "porfa", "gracias", "saludos",
  "quiero", "necesito", "ocupo", "mandame", "manda", "mandas", "mandar", "mande", "pasame", "traeme", "ayudame", "pedido", "pedir", "me", "por", "para", "hoy", "manana", "ok", "tambien",
]);
const ARTICULOS = new Set(["de", "del", "la", "el", "los", "las", "unas", "unos", "que"]);

export interface Fragmento {
  /** Lo que escribio, sin la cantidad: es la llave de `cliente_alias` (se normaliza en SQL). */
  texto: string;
  cantidad: number;
  /** `media`: la mitad de la presentacion mayor; se redondea y la linea sale amarilla. */
  media: boolean;
  unidad: Unidad | null;
  /** Solo el nombre del producto (sin cantidad, unidad ni articulos). */
  producto: string;
}

export const normalizarLibre = (s: string): string =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9ñ\s.x-]/g, " ").replace(/\s+/g, " ").trim();

const clave = (t: string) => normalizarLibre(t).replace(/[.-]/g, "");
const esDigitos = (t: string) => /^\d{1,3}$/.test(t);
const esCantidad = (t: string) => esDigitos(clave(t)) || clave(t) in NUMEROS || clave(t) === "media";

function valorCantidad(t: string): { n: number; media: boolean } {
  const k = clave(t);
  if (k === "media") return { n: 0.5, media: true };
  return { n: esDigitos(k) ? Number(k) : (NUMEROS[k] ?? 1), media: false };
}

/** Parte el mensaje en lineas candidatas: salto de linea, coma, «;» y « y » cuando lo que sigue empieza con una cantidad. */
function cortar(entrada: string): string[][] {
  const trozos = entrada.split(/[\n\r;,]+/);
  const salida: string[][] = [];
  for (const trozo of trozos) {
    const palabras = trozo.replace(/^\s*[-*•·]+\s+/, "").replace(/^\s*\d+[).]\s+(?=\D)/, "").trim().split(/\s+/).filter(Boolean);
    let actual: string[] = [];
    for (let i = 0; i < palabras.length; i++) {
      const p = palabras[i]!;
      const sig = palabras[i + 1];
      if (clave(p) === "y" && sig !== undefined && esCantidad(sig) && actual.length > 0) {
        salida.push(actual);
        actual = [];
      } else actual.push(p);
    }
    if (actual.length) salida.push(actual);
  }
  return salida;
}

function analizar(palabras: string[]): Fragmento | null {
  // «2cajas» / «6six»: se separa el numero pegado.
  const sueltas = palabras.flatMap((p) => {
    const m = /^(\d{1,3})([a-zñ]+)$/i.exec(normalizarLibre(p));
    return m && clave(m[2]!) in UNIDADES ? [m[1]!, m[2]!] : [p];
  });
  // «x2» / «x 2» al final: cantidad.
  let tokens = sueltas.filter((t) => !RELLENO.has(clave(t)));
  const util = tokens.filter((t) => !ARTICULOS.has(clave(t)));
  if (util.length === 0) return null;

  let cantidad = 1;
  let media = false;
  let cantidadVista = false;
  const alFinal = /^x(\d{1,3})$/.exec(clave(tokens[tokens.length - 1] ?? ""));
  if (alFinal) {
    cantidad = Number(alFinal[1]);
    cantidadVista = true;
    tokens = tokens.slice(0, -1);
  } else if (tokens.length >= 2 && clave(tokens[tokens.length - 2]!) === "x" && esDigitos(clave(tokens[tokens.length - 1]!))) {
    cantidad = Number(clave(tokens[tokens.length - 1]!));
    cantidadVista = true;
    tokens = tokens.slice(0, -2);
  } else if (tokens.length >= 2 && esCantidad(tokens[0]!)) {
    const v = valorCantidad(tokens[0]!);
    cantidad = v.n;
    media = v.media;
    cantidadVista = true;
    tokens = tokens.slice(1);
  } else if (tokens.length >= 3 && esDigitos(clave(tokens[tokens.length - 2]!)) && UNIDADES[clave(tokens[tokens.length - 1]!)]) {
    // «corona 2 cajas»
    cantidad = Number(clave(tokens[tokens.length - 2]!));
    cantidadVista = true;
    tokens = [...tokens.slice(0, -2), tokens[tokens.length - 1]!];
  } else if (tokens.length >= 2 && esDigitos(clave(tokens[tokens.length - 1]!))) {
    cantidad = Number(clave(tokens[tokens.length - 1]!));
    cantidadVista = true;
    tokens = tokens.slice(0, -1);
  }
  if (cantidadVista && cantidad < 1 && !media) cantidad = 1;

  let unidad: Unidad | null = null;
  const sin = (i: number) => (tokens = tokens.filter((_, j) => j !== i));
  if (tokens.length && UNIDADES[clave(tokens[0]!)]) {
    unidad = UNIDADES[clave(tokens[0]!)]!;
    sin(0);
  } else if (tokens.length > 1 && UNIDADES[clave(tokens[tokens.length - 1]!)]) {
    unidad = UNIDADES[clave(tokens[tokens.length - 1]!)]!;
    sin(tokens.length - 1);
  }
  // «un six»: la unidad sola ya es la cantidad 1.
  const producto = tokens.filter((t) => !ARTICULOS.has(clave(t))).map(normalizarLibre).filter(Boolean).join(" ");
  const texto = palabras.filter((p) => !RELLENO.has(clave(p)) && !(cantidadVista && (esCantidad(p) || /^x\d{0,3}$/.test(clave(p))) )).join(" ").trim() || producto;
  if (!producto && !unidad) return null;
  return { texto, cantidad: media ? 0.5 : cantidad, media, unidad, producto };
}

/** Parte pura: del mensaje a lineas con cantidad, unidad y producto. Sin base de datos. */
export function partirMensaje(entrada: string): Fragmento[] {
  return cortar(entrada).map(analizar).filter((f): f is Fragmento => f !== null);
}

/* ---------------------------------------------------------------- resolucion con la base */

export interface Candidato {
  presentacion_id: string;
  producto: string;
  presentacion: string;
  precio: string;
  puntaje: number;
}
export interface LineaInterpretada {
  texto: string;
  cantidad: number;
  presentacion_id?: string;
  color: "verde" | "amarillo" | "rojo";
  candidatos: Candidato[];
}

interface Pres {
  id: string;
  producto_id: string;
  producto: string;
  nombre: string;
  factor: number;
  precio: string | null;
}

const MAX_FRAGMENTOS = 100;
const UMBRAL_VERDE = 0.6;
const VENTAJA_VERDE = 0.15;

/** La presentacion de `p` que corresponde a la unidad dicha; null si no hay. */
function porUnidad(pres: Pres[], u: Unidad): Pres | null {
  const v = pres.filter((x) => x.precio !== null);
  const ordenadas = [...v].sort((a, b) => b.factor - a.factor);
  if (u === "caja") return ordenadas.find((x) => /caja|carton/i.test(x.nombre) && !/media/i.test(x.nombre)) ?? ordenadas.find((x) => x.factor >= 12) ?? null;
  if (u === "six") return v.find((x) => x.factor === 6 || /six/i.test(x.nombre)) ?? null;
  return v.find((x) => x.factor === 1) ?? null;
}

/** Sin unidad: la que mas pide ese cliente de ese producto; si no, la de mayor factor que se vende. */
function porDefecto(pres: Pres[], rank: Map<string, number>): Pres | null {
  const v = pres.filter((x) => x.precio !== null);
  const frecuentes = v.filter((x) => rank.has(x.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return frecuentes[0] ?? [...v].sort((a, b) => b.factor - a.factor)[0] ?? null;
}

const candidato = (p: Pres, puntaje: number): Candidato => ({
  presentacion_id: p.id, producto: p.producto, presentacion: p.nombre, precio: p.precio!, puntaje: Math.round(puntaje * 100) / 100,
});

/**
 * Resuelve cada linea: alias del cliente -> alias global -> `fn_buscar_productos`.
 * Verde = alias exacto, o un candidato con puntaje >= 0.6 y >= 0.15 sobre el segundo; amarillo = lo demas (3 mejores); rojo = sin candidato.
 */
export async function interpretarMensaje(q: pg.Pool | pg.PoolClient, clienteId: string, texto: string): Promise<{ lineas: LineaInterpretada[] }> {
  const fragmentos = partirMensaje(texto);
  // Un pedido lleva a lo mas 100 lineas: un mensaje con mas no es un pedido y cada linea cuesta consultas.
  if (fragmentos.length > MAX_FRAGMENTOS) throw new AppError("VALIDACION", [{ path: ["texto"], message: "El mensaje tiene demasiadas lineas" }]);
  if (fragmentos.length === 0) return { lineas: [] };

  const lista = (await q.query<{ lista_precio_id: string }>("select lista_precio_id from app.cliente where id = $1", [clienteId])).rows[0]?.lista_precio_id;
  const rank = new Map<string, number>();
  (await q.query<{ presentacion_id: string }>("select presentacion_id from app.fn_frecuentes($1, 100)", [clienteId])).rows.forEach((f, i) => rank.set(f.presentacion_id, i));

  const salida: LineaInterpretada[] = [];
  for (const f of fragmentos) {
    const cantidad = f.media ? 1 : Math.max(1, Math.round(f.cantidad));

    // 1) alias aprendido: del cliente primero y luego el global.
    const alias = await q.query<{ id: string; producto_id: string; producto: string; nombre: string; factor: number; precio: string | null }>(
      `select pz.id, pz.producto_id, p.nombre as producto, pz.nombre, pz.factor, app.fn_precio(pz.id, $3::bigint)::text as precio
         from app.cliente_alias a
         join app.presentacion pz on pz.id = a.presentacion_id and pz.activa and pz.se_vende
         join app.producto p on p.id = pz.producto_id and p.activo
        where a.texto = app.fn_normalizar($1) and (a.cliente_id = $2 or a.cliente_id is null)
        order by (a.cliente_id is null), a.veces desc limit 1`,
      [f.texto, clienteId, lista],
    );
    const a = alias.rows[0];
    if (a && a.precio !== null) {
      const c = candidato({ id: a.id, producto_id: a.producto_id, producto: a.producto, nombre: a.nombre, factor: a.factor, precio: a.precio }, 1);
      salida.push({ texto: f.texto, cantidad, presentacion_id: c.presentacion_id, color: f.media ? "amarillo" : "verde", candidatos: [c] });
      continue;
    }

    // 2) busqueda tolerante de producto.
    const buscados = f.producto
      ? (await q.query<{ producto_id: string; puntaje: number }>("select producto_id, puntaje from app.fn_buscar_productos($1, 5)", [f.producto])).rows
      : [];
    if (buscados.length === 0) {
      salida.push({ texto: f.texto, cantidad, color: "rojo", candidatos: [] });
      continue;
    }
    const ids = buscados.map((b) => b.producto_id);
    const pres = (
      await q.query<{ id: string; producto_id: string; producto: string; nombre: string; factor: number; precio: string | null }>(
        `select pz.id, pz.producto_id, p.nombre as producto, pz.nombre, pz.factor, app.fn_precio(pz.id, $2::bigint)::text as precio
           from app.presentacion pz join app.producto p on p.id = pz.producto_id
          where pz.producto_id = any($1::bigint[]) and pz.activa and pz.se_vende and p.activo`,
        [ids, lista],
      )
    ).rows;

    const candidatos: Candidato[] = [];
    let unidadResuelta = f.unidad === null;
    for (const b of buscados) {
      const delProducto = pres.filter((x) => x.producto_id === b.producto_id);
      const dePedida = f.unidad ? porUnidad(delProducto, f.unidad) : null;
      const elegida = dePedida ?? porDefecto(delProducto, rank);
      if (!elegida) continue;
      if (candidatos.length === 0) unidadResuelta = f.unidad === null || dePedida !== null;
      candidatos.push(candidato(elegida, b.puntaje));
    }
    if (candidatos.length === 0) {
      salida.push({ texto: f.texto, cantidad, color: "rojo", candidatos: [] });
      continue;
    }
    const [primero, segundo] = candidatos;
    const claro = primero!.puntaje >= UMBRAL_VERDE && (!segundo || primero!.puntaje - segundo.puntaje >= VENTAJA_VERDE);
    const verde = claro && unidadResuelta && !f.media;
    salida.push({
      texto: f.texto,
      cantidad,
      ...(verde ? { presentacion_id: primero!.presentacion_id } : {}),
      color: verde ? "verde" : "amarillo",
      candidatos: candidatos.slice(0, 3),
    });
  }
  return { lineas: salida };
}

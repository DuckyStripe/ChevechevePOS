import { AppError } from "../../comun/errores.js";
import { conUsuario } from "../../comun/transaccion.js";
import { consulta } from "../../db/database.js";
import { variablesUsadas } from "./esquemas.js";

const COLUMNAS = "clave, canal, titulo, texto, variables";

export async function listarPlantillas(canal?: string) {
  const r = await consulta(
    `select ${COLUMNAS} from app.plantilla where ($1::text is null or canal = $1) order by canal, clave`,
    [canal ?? null],
  );
  return r.rows;
}

export async function editarPlantilla(actor: string, clave: string, d: { titulo?: string; texto: string }) {
  return conUsuario(actor, async (c) => {
    const p = (await c.query<{ canal: string; variables: string[] }>("select canal, variables from app.plantilla where clave = $1 for update", [clave])).rows[0];
    if (!p) throw new AppError("NO_ENCONTRADO");
    const problemas: Array<{ path: string[]; message: string }> = [];
    for (const [campo, valor] of [["texto", d.texto], ["titulo", d.titulo ?? ""]] as const) {
      const malas = variablesUsadas(valor).filter((v) => !p.variables.includes(v));
      if (malas.length) problemas.push({ path: [campo], message: `Variables que no existen: ${[...new Set(malas)].join(", ")}` });
    }
    if (p.canal === "push" && !d.titulo) problemas.push({ path: ["titulo"], message: "El titulo es obligatorio" });
    if (p.canal !== "push" && d.titulo !== undefined) problemas.push({ path: ["titulo"], message: "Solo los avisos push llevan titulo" });
    if (problemas.length) throw new AppError("VALIDACION", problemas);
    const r = await c.query(
      `update app.plantilla set texto = $2, titulo = coalesce($3, titulo), actualizado_en = now(), actualizado_por = $4
        where clave = $1 returning ${COLUMNAS}`,
      [clave, d.texto, d.titulo ?? null, actor],
    );
    return r.rows[0];
  });
}

export async function vistaPrevia(clave: string, vars: Record<string, string>) {
  const e = await consulta("select 1 from app.plantilla where clave = $1", [clave]);
  if (!e.rowCount) throw new AppError("NO_ENCONTRADO");
  const r = await consulta<{ titulo: string | null; texto: string }>("select titulo, texto from app.fn_render_plantilla($1, $2::jsonb)", [clave, JSON.stringify(vars)]);
  return r.rows[0]!;
}

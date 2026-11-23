import { listadoDeFilas, offset, type Pagina } from "../../comun/paginacion.js";
import { consulta } from "../../db/database.js";

type Filtros = Pagina & { tabla?: string; registro_id?: string; usuario_id?: string; desde?: string; hasta?: string };

/** Filas de app.auditoria + usuario_nombre. `desde`/`hasta` son fechas locales inclusivas (America/Mexico_City). */
export async function listarAuditoria(f: Filtros) {
  const donde: string[] = [];
  const p: unknown[] = [];
  const agrega = (sql: string, valor: unknown) => {
    p.push(valor);
    donde.push(sql.replace("?", `$${p.length}`));
  };
  if (f.tabla) agrega("a.tabla = ?", f.tabla);
  if (f.registro_id) agrega("a.registro_id = ?", f.registro_id);
  if (f.usuario_id) agrega("a.usuario_id = ?", f.usuario_id);
  if (f.desde) agrega("a.creado_en >= (?::date)::timestamp at time zone 'America/Mexico_City'", f.desde);
  if (f.hasta) agrega("a.creado_en < ((?::date) + 1)::timestamp at time zone 'America/Mexico_City'", f.hasta);
  p.push(f.por_pagina, offset(f));
  const r = await consulta<{ total: string }>(
    `select a.id, a.usuario_id, u.nombre as usuario_nombre, a.cliente_id, a.tabla, a.registro_id, a.accion,
            a.antes, a.despues, a.creado_en, count(*) over() as total
       from app.auditoria a left join app.usuario u on u.id = a.usuario_id
      ${donde.length ? `where ${donde.join(" and ")}` : ""}
      order by a.id desc limit $${p.length - 1} offset $${p.length}`,
    p,
  );
  return listadoDeFilas(r.rows, f);
}

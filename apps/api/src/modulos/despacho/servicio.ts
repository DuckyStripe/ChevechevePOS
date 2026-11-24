import type { UsuarioSesion } from "../../comun/permisos.js";
import { consulta } from "../../db/database.js";
import { contarPendientes } from "../avisos/servicio.js";
import { leerRespaldo } from "../salud/rutas.js";

const HORAS_VENCIDO = 26;

/** `GET /despacho`: unica fuente de contadores operativos de F3. Cada bloque va solo si el usuario tiene su permiso (sin surtido, rutas ni cierre hasta sus fases). */
export async function despacho(u: UsuarioSesion, fecha: string | undefined) {
  const dia = (await consulta<{ f: string }>("select coalesce($1::date, app.fn_fecha_local(now()))::text as f", [fecha ?? null])).rows[0]!.f;
  const salida: Record<string, unknown> = { fecha: dia };

  if (u.permisos.includes("pedidos.ver")) {
    const r = await consulta(
      `select count(*) filter (where p.estado = 'recibido')::int as por_confirmar,
              count(*) filter (where p.estado = 'esperando_cliente')::int as esperando_cliente,
              (select count(*)::int from app.propuesta_faltante f join app.pedido_linea l on l.id = f.pedido_linea_id join app.pedido pf on pf.id = l.pedido_id
                where f.estado = 'pendiente' and pf.sucursal_id = $1 and f.limite_en < now() + interval '1 hour') as faltantes_vencen_1h,
              count(*) filter (where p.estado = 'confirmado' and p.ruta_id is null)::int as confirmados_sin_ruta,
              count(*) filter (where p.estado = 'confirmado' and p.entrega_tipo = 'recoge' and p.fecha_entrega = $2::date)::int as recoge
         from app.pedido p where p.sucursal_id = $1`,
      [u.sucursal_id, dia],
    );
    const zonas = await consulta(
      `select coalesce(z.nombre, 'Sin zona') as zona, count(*)::int as pedidos, (count(*) filter (where p.ruta_id is null))::int as sin_ruta, sum(p.total)::text as total
         from app.pedido p join app.cliente c on c.id = p.cliente_id left join app.zona z on z.id = c.zona_id
        where p.sucursal_id = $1 and p.estado in ('confirmado','cargado','en_ruta') and p.fecha_entrega = $2::date
        group by z.nombre order by z.nombre nulls last`,
      [u.sucursal_id, dia],
    );
    salida.pedidos = { ...r.rows[0], por_zona: zonas.rows };
  }
  if (u.permisos.includes("avisos.enviar")) salida.avisos_pendientes = await contarPendientes(u);
  if (u.permisos.includes("configuracion.editar")) {
    const r = await leerRespaldo();
    const viejo = r ? Date.now() - Date.parse(r.ultimo) > HORAS_VENCIDO * 3_600_000 : true;
    salida.respaldo = { ultimo: r?.ultimo ?? null, ok: r?.ok ?? false, vencido: !r || !r.ok || viejo };
  }
  return salida;
}

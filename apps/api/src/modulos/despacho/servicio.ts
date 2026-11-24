import type { UsuarioSesion } from "../../comun/permisos.js";
import { consulta } from "../../db/database.js";
import { contarPendientes } from "../avisos/servicio.js";
import { leerRespaldo } from "../salud/rutas.js";

const HORAS_VENCIDO = 26;
const DIAS_DESCARGA = 7;

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
  if (u.permisos.includes("surtido.ver")) {
    // F5: filas de la lista de surtido de la fecha del despacho (misma regla que /surtido: fn_lista_surtido).
    const r = await consulta<{ n: number }>("select count(*)::int as n from app.fn_lista_surtido($1, $2::date)", [u.sucursal_id, dia]);
    salida.surtido = { productos_por_comprar: r.rows[0]!.n };
  }
  if (u.permisos.includes("rutas.ver") || u.permisos.includes("rutas.operar")) salida.rutas = await bloqueRutas(u, dia);
  if (["rutas.liquidar", "cobranza.verificar", "caja.supervisar"].some((p) => u.permisos.includes(p))) salida.cierre = await bloqueCierre(u);
  if (u.permisos.includes("avisos.enviar")) salida.avisos_pendientes = await contarPendientes(u);
  if (u.permisos.includes("configuracion.editar")) {
    const [r, d] = await Promise.all([
      leerRespaldo(),
      consulta<{ descarga: string | null }>("select valor #>> '{}' as descarga from app.configuracion where clave = 'respaldo_ultima_descarga'"),
    ]);
    const descarga = d.rows[0]?.descarga ?? null;
    const viejo = r ? Date.now() - Date.parse(r.ultimo) > HORAS_VENCIDO * 3_600_000 : true;
    // Sin copia remota (rclone) vale una descarga manual del dueño de los ultimos DIAS_DESCARGA dias.
    const descargaReciente = descarga !== null && Date.now() - Date.parse(descarga) <= DIAS_DESCARGA * 86_400_000;
    salida.respaldo = {
      ultimo: r?.ultimo ?? null,
      ok: r?.ok ?? false,
      local: r?.local ?? false,
      descarga,
      vencido: !r || !r.local || viejo || (!r.ok && !descargaReciente),
      // El respaldo se hizo bien en el servidor y solo falta sacarlo: la pantalla ofrece descargarlo.
      falta_copia: !!r && r.local && !viejo && !r.ok && !descargaReciente,
    };
  }
  return salida;
}

/** Bloque `rutas` (F6): con `rutas.ver` todas las de la fecha; con solo `rutas.operar`, las propias. Las canceladas no cuentan. */
async function bloqueRutas(u: UsuarioSesion, dia: string) {
  const r = await consulta(
    `select r.id::text as id, r.folio, r.nombre, r.estado, us.nombre as repartidor,
            (select count(*)::int from app.ruta_parada pa where pa.ruta_id = r.id) as paradas,
            (select count(*)::int from app.ruta_parada pa where pa.ruta_id = r.id and pa.estado = 'visitada') as entregadas
       from app.ruta r join app.usuario us on us.id = r.repartidor_id
      where r.sucursal_id = $1 and r.fecha = $2::date and r.estado <> 'cancelada'
        and ($3::boolean or r.repartidor_id = $4) order by r.id`,
    [u.sucursal_id, dia, u.permisos.includes("rutas.ver"), u.id],
  );
  return {
    lista: r.rows,
    por_cargar: r.rows.filter((x) => x.estado === "planeada").length,
    en_curso: r.rows.filter((x) => x.estado === "en_curso").length,
    // F7: rutas terminadas que nadie ha liquidado (de cualquier dia); solo para quien liquida.
    ...(u.permisos.includes("rutas.liquidar") ? { por_liquidar: await porLiquidar(u) } : {}),
  };
}

async function porLiquidar(u: UsuarioSesion): Promise<number> {
  return (await consulta<{ n: number }>("select count(*)::int as n from app.ruta where sucursal_id = $1 and estado = 'terminada'", [u.sucursal_id])).rows[0]!.n;
}

/** Bloque `cierre` (F7): lo que falta cerrar en caja. Transferencias sin ver en el banco y turnos de mostrador abiertos de la sucursal. */
async function bloqueCierre(u: UsuarioSesion) {
  const r = await consulta<{ transferencias_por_verificar: number; turnos_mostrador_abiertos: number }>(
    `select (select count(*)::int from app.v_transferencia t where t.sucursal_id = $1 and t.verificado_en is null) as transferencias_por_verificar,
            (select count(*)::int from app.turno_caja t join app.caja k on k.id = t.caja_id where t.tipo = 'mostrador' and t.estado = 'abierto' and k.sucursal_id = $1) as turnos_mostrador_abiertos`,
    [u.sucursal_id],
  );
  return r.rows[0]!;
}

import { AppError } from "../../comun/errores.js";
import { conUsuario } from "../../comun/transaccion.js";
import { consulta } from "../../db/database.js";

const COLUMNAS_COSTO = ["ultimo_costo", "costo_estimado", "costo_promocion", "ahorro"] as const;

/** Fecha pedida o mañana (dia local de negocio, calculado en SQL). */
async function diaDeSurtido(fecha: string | undefined): Promise<string> {
  const r = await consulta<{ f: string }>("select coalesce($1::date, app.fn_fecha_local(now()) + 1)::text as f", [fecha ?? null]);
  return r.rows[0]!.f;
}

type Fila = Record<string, unknown> & {
  proveedor_id: string | null; proveedor: string | null; telefono: string | null; costo_proveedor: string | null; costo_total: string | null;
  sin_costo_proveedor: number; sin_costo_total: number;
};

/**
 * `GET /surtido`: filas de `fn_lista_surtido` agrupadas por proveedor. Los costos (y las sumas de costo, calculadas en SQL) salen
 * solo con `costos.ver` o `compras.registrar` (quien compra ve lo que paga; misma regla en /promociones): sin el permiso se borran del objeto, no se ponen en null.
 */
export async function listaSurtido(sucursal: string, f: { fecha?: string; ruta_id?: string }, veCostos: boolean) {
  const fecha = await diaDeSurtido(f.fecha);
  const r = await consulta<Fila>(
    `select l.*, pv.telefono,
            sum(l.costo_estimado) over (partition by l.proveedor_id)::text as costo_proveedor, sum(l.costo_estimado) over ()::text as costo_total,
            (count(*) filter (where l.ultimo_costo is null and l.cantidad_sugerida > 0) over (partition by l.proveedor_id))::int as sin_costo_proveedor,
            (count(*) filter (where l.ultimo_costo is null and l.cantidad_sugerida > 0) over ())::int as sin_costo_total
       from app.fn_lista_surtido($1, $2::date, $3) l
       left join app.proveedor pv on pv.id = l.proveedor_id
      order by (l.proveedor_id is null), l.proveedor, l.producto, l.producto_id`,
    [sucursal, fecha, f.ruta_id ?? null],
  );
  const grupos = new Map<string, { proveedor_id: string | null; proveedor: string | null; telefono: string | null; lineas: Record<string, unknown>[]; costo_estimado?: string | null; sin_costo_previo?: number }>();
  for (const fila of r.rows) {
    const { proveedor_id, proveedor, telefono, costo_proveedor, costo_total: _t, sin_costo_proveedor, sin_costo_total: _s, ...linea } = fila;
    void _t;
    void _s;
    if (!veCostos) for (const c of COLUMNAS_COSTO) delete linea[c];
    const clave = proveedor_id ?? "";
    let g = grupos.get(clave);
    if (!g) {
      g = { proveedor_id, proveedor, telefono, lineas: [], ...(veCostos ? { costo_estimado: costo_proveedor, sin_costo_previo: sin_costo_proveedor } : {}) };
      grupos.set(clave, g);
    }
    g.lineas.push(linea);
  }
  return {
    fecha,
    proveedores: [...grupos.values()],
    totales: { productos: r.rows.length, ...(veCostos ? { costo_estimado: r.rows[0]?.costo_total ?? null, sin_costo_previo: r.rows[0]?.sin_costo_total ?? 0 } : {}) },
  };
}

/** `GET /surtido/mensaje`: texto de WhatsApp para el proveedor (plantilla `wa_surtido_proveedor`, sin costos) y su telefono. */
export async function mensajeSurtido(sucursal: string, f: { fecha?: string; proveedor_id: string }) {
  const fecha = await diaDeSurtido(f.fecha);
  const r = await consulta<{ telefono: string | null; texto: string; telefono_invalido: boolean }>("select telefono, texto, telefono_invalido from app.fn_mensaje_surtido($1, $2::date, $3)", [
    sucursal, fecha, f.proveedor_id,
  ]);
  if (!r.rows[0]) throw new AppError("NO_ENCONTRADO");
  return r.rows[0];
}

/** `POST /surtido/publicar`: avisa a quien compra; `notificados` = avisos nuevos (0 si ya se habia publicado esa lista). */
export async function publicarSurtido(actor: string, sucursal: string, fecha: string) {
  return conUsuario(actor, async (c) => {
    const r = await c.query<{ n: number }>("select app.fn_publicar_surtido($1::bigint, $2::bigint, $3::date) as n", [actor, sucursal, fecha]);
    return { notificados: r.rows[0]!.n };
  });
}

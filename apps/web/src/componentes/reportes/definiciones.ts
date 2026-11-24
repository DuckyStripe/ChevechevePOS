import { dinero } from "@/lib/dinero";
import { fechaHora, porcentaje } from "@/componentes/productos/formato";
import type { FilaReporte } from "@/lib/tipos";

/** F9: una definicion por reporte. La web solo muestra lo que entrega la API: ningun importe se calcula aqui. */
export type TipoCelda = "texto" | "dinero" | "num" | "pct" | "fecha" | "bool";
export type ColumnaReporte = { titulo: string; clave: string; tipo?: TipoCelda; soloAgrupar?: string };
export type FiltroExtra = "categoria" | "zona" | "tipo_turno";

export type DefReporte = {
  slug: string;
  api: string;
  titulo: string;
  ayuda: string;
  /** Todos requeridos. */
  permisos: string[];
  /** Con que tenga uno basta (cortes). */
  alguno?: string[];
  fechas: "rango" | "al" | "ninguna";
  agrupar?: { valor: string; nombre: string }[];
  extra?: FiltroExtra;
  /** Titulo de la primera columna (la etiqueta del grupo). */
  grupo?: string;
  columnas: ColumnaReporte[];
  /** Con `totales`: la fila de totales usa las mismas claves. */
  conTotales?: boolean;
};

const dia = { valor: "dia", nombre: "Por día" };
const mes = { valor: "mes", nombre: "Por mes" };
const producto = { valor: "producto", nombre: "Por producto" };
const categoria = { valor: "categoria", nombre: "Por categoría" };
const cliente = { valor: "cliente", nombre: "Por cliente" };
const zona = { valor: "zona", nombre: "Por zona" };
const ruta = { valor: "ruta", nombre: "Por ruta" };
const origen = { valor: "origen", nombre: "Por origen de la venta" };

export const REPORTES: DefReporte[] = [
  {
    slug: "ventas", api: "ventas", titulo: "Ventas", ayuda: "Cuánto se vendió, ya sin canceladas y restando devoluciones.",
    permisos: ["reportes.ver"], fechas: "rango", conTotales: true, grupo: "Grupo",
    agrupar: [dia, mes, { valor: "usuario", nombre: "Por vendedor" }, cliente, zona, ruta, origen, producto, categoria, { valor: "metodo", nombre: "Por forma de pago" }],
    columnas: [
      { titulo: "Grupo", clave: "etiqueta" },
      { titulo: "Ventas", clave: "num_ventas", tipo: "num" },
      { titulo: "Piezas", clave: "piezas", tipo: "num" },
      { titulo: "Importe", clave: "importe", tipo: "dinero" },
    ],
  },
  {
    slug: "compras", api: "compras", titulo: "Compras", ayuda: "Cuánto se compró a proveedores, sin compras canceladas.",
    permisos: ["reportes.ver", "compras.ver"], fechas: "rango", conTotales: true, grupo: "Grupo",
    agrupar: [dia, mes, { valor: "proveedor", nombre: "Por proveedor" }, producto, categoria],
    columnas: [
      { titulo: "Grupo", clave: "etiqueta" },
      { titulo: "Compras", clave: "num_compras", tipo: "num" },
      { titulo: "Piezas", clave: "piezas", tipo: "num" },
      { titulo: "Importe", clave: "importe", tipo: "dinero" },
    ],
  },
  {
    slug: "utilidad", api: "utilidad", titulo: "Utilidad", ayuda: "Lo que vendiste contra lo que te costó. Solo para quien ve costos.",
    permisos: ["reportes.ver", "costos.ver"], fechas: "rango", grupo: "Grupo",
    agrupar: [dia, mes, producto, categoria, origen],
    columnas: [
      { titulo: "Grupo", clave: "etiqueta" },
      { titulo: "Vendido", clave: "importe", tipo: "dinero" },
      { titulo: "Costo", clave: "costo", tipo: "dinero" },
      { titulo: "Utilidad", clave: "utilidad", tipo: "dinero" },
      { titulo: "Margen", clave: "margen", tipo: "pct" },
    ],
  },
  {
    slug: "ganancia", api: "ganancia", titulo: "Ganancia", ayuda: "Lo que realmente te queda por cliente, ruta o zona (la ruta ya descuenta sus gastos).",
    permisos: ["reportes.ver", "costos.ver"], fechas: "rango", grupo: "Grupo",
    agrupar: [cliente, ruta, zona],
    columnas: [
      { titulo: "Grupo", clave: "etiqueta" },
      { titulo: "Vendido", clave: "importe", tipo: "dinero" },
      { titulo: "Costo", clave: "costo", tipo: "dinero" },
      { titulo: "Utilidad", clave: "utilidad", tipo: "dinero" },
      { titulo: "Gastos de la ruta", clave: "gastos_ruta", tipo: "dinero", soloAgrupar: "ruta" },
      { titulo: "Ganancia", clave: "ganancia", tipo: "dinero" },
    ],
  },
  {
    slug: "entregas", api: "entregas", titulo: "Entregas", ayuda: "Pedidos entregados, no entregados y lo que faltó.",
    permisos: ["reportes.ver"], fechas: "rango", grupo: "Grupo",
    agrupar: [dia, ruta, { valor: "repartidor", nombre: "Por repartidor" }, zona, cliente],
    columnas: [
      { titulo: "Grupo", clave: "etiqueta" },
      { titulo: "Pedidos", clave: "pedidos", tipo: "num" },
      { titulo: "Entregados", clave: "entregados", tipo: "num" },
      { titulo: "No entregados", clave: "fallidos", tipo: "num" },
      { titulo: "Parciales", clave: "parciales", tipo: "num" },
      { titulo: "Piezas que faltaron", clave: "piezas_faltantes", tipo: "num" },
      { titulo: "Pedido", clave: "importe_pedido", tipo: "dinero" },
      { titulo: "Entregado", clave: "importe_entregado", tipo: "dinero" },
    ],
  },
  {
    slug: "faltantes", api: "faltantes", titulo: "Lo que no tuviste", ayuda: "Piezas que te pidieron y no pudiste surtir.",
    permisos: ["reportes.ver"], fechas: "rango", grupo: "Grupo",
    agrupar: [producto, { valor: "proveedor", nombre: "Por proveedor" }],
    columnas: [
      { titulo: "Grupo", clave: "etiqueta" },
      { titulo: "Piezas que faltaron", clave: "piezas_faltantes", tipo: "num" },
    ],
  },
  {
    slug: "inventario", api: "inventario-valorizado", titulo: "Inventario valorizado", ayuda: "Cuánto vale lo que hay en la bodega hoy.",
    permisos: ["costos.ver"], fechas: "ninguna", extra: "categoria",
    columnas: [
      { titulo: "Producto", clave: "producto" },
      { titulo: "Categoría", clave: "categoria" },
      { titulo: "Piezas", clave: "cantidad", tipo: "num" },
      { titulo: "Cajas", clave: "cajas", tipo: "num" },
      { titulo: "Sueltas", clave: "sueltas", tipo: "num" },
      { titulo: "Costo por pieza", clave: "costo_promedio", tipo: "dinero" },
      { titulo: "Valor", clave: "valor", tipo: "dinero" },
    ],
  },
  {
    slug: "bajo-minimo", api: "bajo-minimo", titulo: "Por surtir (bajo mínimo)", ayuda: "Productos que ya están en su mínimo o por debajo.",
    permisos: ["inventario.ver"], fechas: "ninguna",
    columnas: [
      { titulo: "Producto", clave: "producto" },
      { titulo: "Categoría", clave: "categoria" },
      { titulo: "Hay", clave: "cantidad", tipo: "num" },
      { titulo: "Mínimo", clave: "existencia_minima", tipo: "num" },
      { titulo: "Faltan", clave: "faltante", tipo: "num" },
      { titulo: "Agotado", clave: "agotado", tipo: "bool" },
    ],
  },
  {
    slug: "cuentas-por-cobrar", api: "cuentas-por-cobrar", titulo: "Cuentas por cobrar", ayuda: "Quién debe y desde cuándo, por fecha de vencimiento. Cobrar se hace en Cobranza.",
    permisos: ["cobranza.ver"], fechas: "al", extra: "zona", conTotales: true,
    columnas: [
      { titulo: "Cliente", clave: "nombre" },
      { titulo: "Zona", clave: "zona" },
      { titulo: "Al corriente", clave: "corriente", tipo: "dinero" },
      { titulo: "1 a 30 días", clave: "d1_30", tipo: "dinero" },
      { titulo: "31 a 60 días", clave: "d31_60", tipo: "dinero" },
      { titulo: "61 a 90 días", clave: "d61_90", tipo: "dinero" },
      { titulo: "Más de 90 días", clave: "d90_mas", tipo: "dinero" },
      { titulo: "Total", clave: "total", tipo: "dinero" },
    ],
  },
  {
    slug: "cortes", api: "cortes", titulo: "Cortes de caja", ayuda: "Cuánto debía haber y cuánto se contó en cada turno.",
    permisos: [], alguno: ["caja.supervisar", "rutas.liquidar"], fechas: "rango", extra: "tipo_turno",
    columnas: [
      { titulo: "Quién", clave: "usuario.nombre" },
      { titulo: "Tipo", clave: "tipo" },
      { titulo: "Abrió", clave: "abierto_en", tipo: "fecha" },
      { titulo: "Cerró", clave: "cerrado_en", tipo: "fecha" },
      { titulo: "Fondo", clave: "fondo_inicial", tipo: "dinero" },
      { titulo: "Esperado", clave: "efectivo_esperado", tipo: "dinero" },
      { titulo: "Contado", clave: "efectivo_contado", tipo: "dinero" },
      { titulo: "Diferencia", clave: "diferencia", tipo: "dinero" },
    ],
  },
];

export const reportePorSlug = (slug: string) => REPORTES.find((r) => r.slug === slug);

export function puedeVer(d: DefReporte, permisos: string[]): boolean {
  return d.permisos.every((p) => permisos.includes(p)) && (!d.alguno || d.alguno.some((p) => permisos.includes(p)));
}

/** Valor de `a.b.c` dentro de una fila. */
function leer(fila: FilaReporte, clave: string): unknown {
  let v: unknown = fila;
  for (const k of clave.split(".")) v = v != null && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined;
  return v;
}

const TIPO_TURNO: Record<string, string> = { mostrador: "Mostrador", ruta: "Ruta" };

/** Texto para la pantalla. */
export function mostrar(fila: FilaReporte, c: ColumnaReporte): string {
  const v = leer(fila, c.clave);
  if (c.clave === "etiqueta" && (v == null || v === "")) return "Sin asignar";
  if (v == null || v === "") return "—";
  if (typeof v === "object") return (v as { nombre?: string }).nombre ?? "—";
  const s = String(v);
  switch (c.tipo) {
    case "dinero": return dinero(s);
    case "pct": return porcentaje(s);
    case "fecha": return fechaHora(s);
    case "bool": return v === true || s === "true" ? "Sí" : "No";
    default: return c.clave === "tipo" ? (TIPO_TURNO[s] ?? s) : s;
  }
}

/** Texto para el CSV: el valor tal como llega (dinero sin formato); los textos que Excel leeria como formula llevan `'`. */
export function crudo(fila: FilaReporte, c: ColumnaReporte): string {
  const v = leer(fila, c.clave);
  if (c.clave === "etiqueta" && (v == null || v === "")) return "Sin asignar";
  if (v == null) return "";
  const s = typeof v === "object" ? ((v as { nombre?: string }).nombre ?? "") : String(v);
  return (c.tipo ?? "texto") === "texto" && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { sufijo, ayudaF2 } from "./ayuda-f2.js";
import { pedirPersonal, clienteConEnlace, type ClienteF3 } from "./ayuda-f3.js";
import { conCredito } from "./ayuda-f7.js";
import type { Dueno } from "./ayuda-f6.js";

// F8: juego fijo de las pruebas de paridad del mostrador (docs/fases/F8.md, paquete C). Reutiliza F2/F3/F6/F7; cajas `TF7 ...`, productos y clientes `TF3 ...`.

export interface CatalogoF8 {
  corona: { id: string; pieza: string; six: string; caja: string };
  victoria: { id: string; caja: string };
  menudeo: string;
  mayoreo: string;
}

const ok = async <T extends { statusCode: number; body: string }>(r: T, que: string): Promise<T> => {
  if (r.statusCode >= 300) throw new Error(`${que}: ${r.statusCode} ${r.body}`);
  return r;
};

/**
 * Juego fijo de F7/F8: Corona Pieza 18.00, Six 105.00, Caja 400.00 (Menudeo) y Caja 380.00 (Mayoreo), existencia 240 a 12.50;
 * Victoria Caja 390.00 (Menudeo), existencia 24. Cada llamada crea productos nuevos (existencia exacta por prueba).
 */
export async function catalogoF8(app: FastifyInstance, dueno: string): Promise<CatalogoF8> {
  const h = ayudaF2(app);
  const pedir = pedirPersonal(app);
  await ok(await pedir("PATCH", "/api/configuracion", dueno, { pedido_minimo: "1.00" }), "config");
  const listas = (await ok(await pedir("GET", "/api/listas-precio", dueno), "listas")).json().items as { id: string; nombre: string }[];
  const menudeo = listas.find((l) => l.nombre === "Menudeo")!.id;
  const mayoreo = listas.find((l) => l.nombre === "Mayoreo")!.id;
  const categoria = await h.crearCategoria(dueno);
  const s = sufijo();
  const corona = await h.crearProducto(dueno, { nombre: `TF3 F8 Corona ${s}`, factores: [6, 24], categoria_id: categoria.id });
  const victoria = await h.crearProducto(dueno, { nombre: `TF3 F8 Victoria ${s}`, factores: [24], categoria_id: categoria.id });
  await ok(await pedir("PUT", "/api/precios", dueno, { precios: [
    { presentacion_id: corona.por(1).id, lista_precio_id: menudeo, precio: "18.00" },
    { presentacion_id: corona.por(6).id, lista_precio_id: menudeo, precio: "105.00" },
    { presentacion_id: corona.por(24).id, lista_precio_id: menudeo, precio: "400.00" },
    { presentacion_id: corona.por(24).id, lista_precio_id: mayoreo, precio: "380.00" },
    { presentacion_id: victoria.por(24).id, lista_precio_id: menudeo, precio: "390.00" },
  ] }), "precios");
  for (const [p, piezas, costo] of [[corona.id, 240, "12.50"], [victoria.id, 24, "12.08"]] as const) {
    await ok(await pedir("POST", "/api/inventario/ajustes", dueno, { producto_id: p, tipo: "inventario_inicial", piezas, costo_unitario: costo, clave_idempotencia: randomUUID() }), "existencia");
  }
  return {
    corona: { id: corona.id, pieza: corona.por(1).id, six: corona.por(6).id, caja: corona.por(24).id },
    victoria: { id: victoria.id, caja: victoria.por(24).id },
    menudeo,
    mayoreo,
  };
}

/** Cliente C (limite 1000.00, 7 dias, Menudeo) y cliente M (lista Mayoreo). */
export async function clientesF8(app: FastifyInstance, dueno: Dueno, k: CatalogoF8): Promise<{ C: ClienteF3; M: ClienteF3 }> {
  const C = await clienteConEnlace(app, dueno);
  await conCredito(app, dueno, C, "1000.00", 7);
  const M = await clienteConEnlace(app, dueno, { lista_precio_id: k.mayoreo });
  return { C, M };
}

/** Abre un turno de mostrador a `token` en una caja nueva `TF7 ...` (la crea `dueno`). Devuelve el id del turno. */
export async function turnoMostrador(app: FastifyInstance, dueno: string, token: string, fondo = "0.00"): Promise<string> {
  const pedir = pedirPersonal(app);
  const caja = (await ok(await pedir("POST", "/api/cajas", dueno, { nombre: `TF7 Caja ${sufijo()}` }), "caja")).json<{ id: string }>().id;
  return (await ok(await pedir("POST", "/api/turnos", token, { caja_id: caja, fondo_inicial: fondo }), "turno")).json<{ id: string }>().id;
}

type Pago = { metodo: "efectivo" | "credito" | "tarjeta" | "transferencia"; monto: string };
/** POST /api/ventas con clave nueva (respuesta cruda). */
export function vender(app: FastifyInstance, token: string, o: { lineas: { presentacion_id: string; cantidad: number; precio_unitario?: string }[]; pagos: Pago[]; cliente_id?: string; lista_precio_id?: string; efectivo_recibido?: string; clave_idempotencia?: string }) {
  return pedirPersonal(app)("POST", "/api/ventas", token, { clave_idempotencia: randomUUID(), ...o });
}

/** Todas las llaves (a cualquier profundidad) de un JSON. */
export function llaves(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(llaves);
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => [k, ...llaves(x)]);
  return [];
}

/** Pedido confirmado para `fecha` (reparto o recoge); devuelve su id. */
export async function pedidoF8(app: FastifyInstance, dueno: string, cliente: string, fecha: string, lineas: { presentacion_id: string; cantidad: number }[], entrega_tipo: "reparto" | "recoge" = "reparto"): Promise<string> {
  const pedir = pedirPersonal(app);
  const p = (await ok(await pedir("POST", "/api/pedidos", dueno, { clave_idempotencia: randomUUID(), cliente_id: cliente, entrega_tipo, lineas }), "pedido")).json<{ id: string }>();
  await ok(await pedir("POST", `/api/pedidos/${p.id}/confirmar`, dueno, { version: 1, fecha_entrega: fecha }), "confirmar");
  return p.id;
}

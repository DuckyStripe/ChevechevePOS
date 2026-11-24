import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { pool } from "./ayuda.js";
import { ayudaF2, hoyMas, sufijo } from "./ayuda-f2.js";
import { catalogoF3, clienteConEnlace, pedirPersonal, type CatalogoF3 } from "./ayuda-f3.js";

export interface EscenarioF5 {
  k: CatalogoF3;
  modelo: { id: string; nombre: string };
  cliente: { id: string };
  hoy: string;
  manana: string;
}

/**
 * Juego de F5.md por la API (productos `TF3 ...`, que `limpiarF3` desactiva): Corona (minimo 30, proveedor, 60 piezas, ultima compra Caja 300.00),
 * Victoria (contra pedido, ultima compra Caja 290.00) y pedidos confirmados de 2 y 1 Caja de Corona y 1 de Victoria para manana,
 * y 1 Six de Corona para hoy. Resultado esperado para manana: Corona 72/6/54/18/30/2 ("600.00"), Victoria 24/0/0/24/0/1 ("290.00").
 */
export async function escenarioF5(app: FastifyInstance, dueno: { token: string; id: string }, cajero: string): Promise<EscenarioF5> {
  const pedir = pedirPersonal(app);
  const h = ayudaF2(app);
  const ok = async <T extends { statusCode: number; body: string }>(r: T, que: string): Promise<T> => {
    if (r.statusCode >= 300) throw new Error(`${que}: ${r.statusCode} ${r.body}`);
    return r;
  };
  const k = await catalogoF3(app, dueno.token);
  await ok(await pedir("PATCH", "/api/configuracion", dueno.token, { pedido_minimo: "1.00" }), "config");
  const prov = await ok(await pedir("POST", "/api/proveedores", dueno.token, { nombre: `TF3 Modelo ${sufijo()}`, telefono: "5215500000000" }), "proveedor");
  const modelo = prov.json<{ id: string; nombre: string }>();
  await ok(await pedir("PATCH", `/api/productos/${k.corona.id}`, dueno.token, { proveedor_id: modelo.id, existencia_minima: 30 }), "corona");
  await ok(await pedir("PATCH", `/api/productos/${k.victoria.id}`, dueno.token, { proveedor_id: modelo.id, modo_surtido: "contra_pedido" }), "victoria");
  // Cada compra sube la existencia 24; la salida la deja como estaba (Corona 60, Victoria 0).
  for (const [producto, caja, costo] of [[k.corona.id, k.corona.caja, "300.00"], [k.victoria.id, k.victoria.caja, "290.00"]] as const) {
    await ok(await h.registrarCompra(dueno.token, [{ presentacion_id: caja, cantidad: 1, costo_presentacion: costo }], { proveedor_id: modelo.id }), "compra");
    await ok(await pedir("POST", "/api/inventario/ajustes", dueno.token, { producto_id: producto, tipo: "ajuste_salida", piezas: 24, motivo: "prueba F5" }), "salida");
  }
  const cliente = await clienteConEnlace(app, dueno);
  const hoy = await hoyMas(0);
  const manana = await hoyMas(1);
  const pedido = async (lineas: { presentacion_id: string; cantidad: number }[], fecha: string) => {
    const p = (await ok(await pedir("POST", "/api/pedidos", cajero, { clave_idempotencia: randomUUID(), cliente_id: cliente.id, lineas }), "pedido")).json<{ id: string }>();
    await ok(await pedir("POST", `/api/pedidos/${p.id}/confirmar`, dueno.token, { version: 1, fecha_entrega: fecha }), "confirmar");
    return p.id;
  };
  await pedido([{ presentacion_id: k.corona.caja, cantidad: 2 }], manana);
  await pedido([{ presentacion_id: k.corona.caja, cantidad: 1 }], manana);
  await pedido([{ presentacion_id: k.victoria.caja, cantidad: 1 }], manana);
  await pedido([{ presentacion_id: k.corona.six, cantidad: 1 }], hoy);
  return { k, modelo, cliente, hoy, manana };
}

/** Borra lo propio de F5 que `limpiarF3` no cubre (promociones y el calendario de pruebas del anio 2099). Va antes de `limpiarF3`. */
export async function limpiarF5(): Promise<void> {
  await pool.query("delete from app.promocion_proveedor where creado_por in (select id from app.usuario where usuario like 'tf3\\_%')");
  await pool.query("delete from app.fecha_demanda where fecha >= '2099-01-01'");
}

/** Todas las llaves del JSON, a cualquier profundidad. */
export function llaves(v: unknown, acumulado: string[] = []): string[] {
  if (Array.isArray(v)) for (const x of v) llaves(x, acumulado);
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      acumulado.push(k);
      llaves(x, acumulado);
    }
  }
  return acumulado;
}

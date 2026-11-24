import { z } from "zod";
import { idEsquema } from "../../comun/ids.js";
import { booleanoQuery, esquemaPagina } from "../../comun/paginacion.js";
import { margen } from "../categorias/esquemas.js";

/** `?ids=1,2,3` -> ["1","2","3"] (1..max). */
export const idsCsv = (max: number) =>
  z
    .string()
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.string().regex(/^[1-9]\d{0,17}$/)).min(1).max(max));

const texto = (max: number) => z.string().trim().min(1).max(max);
const alias = z.array(texto(60)).max(30);
const codigo = z.string().trim().min(1).max(60);

export const esquemaListaProductos = esquemaPagina.extend({
  buscar: z.string().trim().min(1).max(100).optional(),
  categoria_id: idEsquema.optional(),
  marca_id: idEsquema.optional(),
  proveedor_id: idEsquema.optional(),
  modo_surtido: z.enum(["inventario", "contra_pedido"]).optional(),
  activo: booleanoQuery.optional(),
  bajo_minimo: booleanoQuery.optional(),
  producto_ids: idsCsv(50).optional(),
});

const presentacion = {
  nombre: texto(100),
  codigo_barras: codigo.nullable().optional(),
  se_vende: z.boolean().optional(),
  se_compra: z.boolean().optional(),
};

export const esquemaPresentacionNueva = z.object({ ...presentacion, factor: z.number().int().min(1).max(100000) });

// strictObject: `factor` (y cualquier llave ajena) en el PATCH es 400, no se ignora (FACTOR_INMUTABLE queda para SQL).
export const esquemaEditarPresentacion = z.strictObject({
  nombre: presentacion.nombre.optional(),
  codigo_barras: presentacion.codigo_barras,
  se_vende: presentacion.se_vende,
  se_compra: presentacion.se_compra,
  activa: z.boolean().optional(),
  cuenta_lealtad: z.boolean().optional(),
});

const campos = {
  nombre: texto(150),
  categoria_id: idEsquema,
  marca_id: idEsquema.nullable(),
  sku: texto(60).nullable(),
  descripcion: z.string().trim().max(500).nullable(),
  alias,
  contenido_ml: z.number().int().min(1).max(100000).nullable(),
  tipo_envase: z.enum(["lata", "botella", "retornable"]).nullable(),
  modo_surtido: z.enum(["inventario", "contra_pedido"]),
  margen_objetivo: margen.nullable(),
  proveedor_id: idEsquema.nullable(),
  existencia_minima: z.number().int().min(0).max(1_000_000),
};

export const esquemaCrearProducto = z.object({
  nombre: campos.nombre,
  categoria_id: campos.categoria_id,
  marca_id: campos.marca_id.optional(),
  sku: campos.sku.optional(),
  descripcion: campos.descripcion.optional(),
  alias: campos.alias.optional(),
  contenido_ml: campos.contenido_ml.optional(),
  tipo_envase: campos.tipo_envase.optional(),
  modo_surtido: campos.modo_surtido.optional(),
  margen_objetivo: campos.margen_objetivo.optional(),
  proveedor_id: campos.proveedor_id.optional(),
  existencia_minima: campos.existencia_minima,
  presentaciones: z.array(esquemaPresentacionNueva).max(30),
});

export const esquemaEditarProducto = z.object({
  nombre: campos.nombre.optional(),
  categoria_id: campos.categoria_id.optional(),
  marca_id: campos.marca_id.optional(),
  sku: campos.sku.optional(),
  descripcion: campos.descripcion.optional(),
  alias: campos.alias.optional(),
  contenido_ml: campos.contenido_ml.optional(),
  tipo_envase: campos.tipo_envase.optional(),
  modo_surtido: campos.modo_surtido.optional(),
  margen_objetivo: campos.margen_objetivo.optional(),
  proveedor_id: campos.proveedor_id.optional(),
  existencia_minima: campos.existencia_minima.optional(),
  activo: z.boolean().optional(),
});

export const paramCodigo = z.object({ codigo: z.string().trim().min(1).max(60) });
export const esquemaCodigo = z.object({ lista_precio_id: idEsquema.optional() });

export const esquemaCatalogoVenta = z.object({ lista_precio_id: idEsquema.optional() });
export const esquemaEquivalentes = z.object({
  equivalentes: z.array(z.object({ producto_id: idEsquema, orden: z.number().int().min(1).max(100) })).max(50),
});

import { z } from "zod";
import { idEsquema } from "../../comun/ids.js";
import { booleanoQuery, esquemaPagina } from "../../comun/paginacion.js";

const usuario = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,30}$/, "Usa de 3 a 30 letras minusculas, numeros, punto, guion o guion bajo");
const nombre = z.string().trim().min(1).max(100);
const telefono = z.string().trim().max(30).nullable();
const contrasena = z.string().min(8).max(200);

export const esquemaListaUsuarios = esquemaPagina.extend({
  buscar: z.string().trim().min(1).max(100).optional(),
  rol_id: idEsquema.optional(),
  activo: booleanoQuery.optional(),
});

export const esquemaCrearUsuario = z.object({
  usuario,
  nombre,
  telefono: telefono.optional(),
  contrasena,
  rol_id: idEsquema,
});

export const esquemaEditarUsuario = z.object({
  nombre: nombre.optional(),
  telefono: telefono.optional(),
  rol_id: idEsquema.optional(),
  activo: z.boolean().optional(),
});

export const esquemaNuevaContrasena = z.object({ nueva: contrasena });

export type Grupo = "paso1" | "paso2" | "paso3" | "paso4" | "paso5" | "mostrador" | "ajustes";

export type EntradaMenu = { ruta: string; titulo: string; permiso: string; grupo: Grupo };

/** N2: la operacion del dia en orden, Mostrador aparte y Ajustes al final. */
export const TITULOS_GRUPO: Record<Grupo, string> = {
  paso1: "1 · Pedidos entrantes",
  paso2: "2 · Surtir y comprar",
  paso3: "3 · Cargar y rutas",
  paso4: "4 · Entregar y cobrar",
  paso5: "5 · Cierre del día",
  mostrador: "Mostrador",
  ajustes: "Ajustes",
};

const ORDEN: Grupo[] = ["paso1", "paso2", "paso3", "paso4", "paso5", "mostrador", "ajustes"];

/** F1: solo lo que existe. Cada fase agrega sus pantallas aqui, nunca antes de construirlas. */
export const ENTRADAS: EntradaMenu[] = [
  { ruta: "/usuarios", titulo: "Usuarios", permiso: "usuarios.gestionar", grupo: "ajustes" },
  { ruta: "/roles", titulo: "Roles y permisos", permiso: "usuarios.gestionar", grupo: "ajustes" },
  { ruta: "/configuracion", titulo: "Configuración", permiso: "configuracion.editar", grupo: "ajustes" },
  { ruta: "/auditoria", titulo: "Auditoría", permiso: "auditoria.ver", grupo: "ajustes" },
];

export function menuPara(permisos: string[]): { grupo: Grupo; titulo: string; entradas: EntradaMenu[] }[] {
  return ORDEN.map((grupo) => ({
    grupo,
    titulo: TITULOS_GRUPO[grupo],
    entradas: ENTRADAS.filter((e) => e.grupo === grupo && permisos.includes(e.permiso)),
  })).filter((g) => g.entradas.length > 0);
}

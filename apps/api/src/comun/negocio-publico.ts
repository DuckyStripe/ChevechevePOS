import { consulta } from "../db/database.js";

export interface DatosPublicos {
  negocio: { nombre: string; whatsapp: string };
  textos: { pedir_pin: string; elegir_pin: string; enlace_invalido: string };
}

/** Lo que necesitan las pantallas sin sesion del cliente (PIN y enlace invalido): nombre y WhatsApp del negocio y sus textos. Nada del cliente. */
export async function datosPublicos(): Promise<DatosPublicos> {
  const r = await consulta<{ nombre: string | null; whatsapp: string | null; pedir_pin: string; elegir_pin: string; enlace_invalido: string }>(
    `select (select valor #>> '{}' from app.configuracion where clave = 'negocio_nombre') as nombre,
            (select valor #>> '{}' from app.configuracion where clave = 'negocio_whatsapp') as whatsapp,
            (select texto from app.fn_render_plantilla('pantalla_pedir_pin', '{}')) as pedir_pin,
            (select texto from app.fn_render_plantilla('pantalla_elegir_pin', '{}')) as elegir_pin,
            (select texto from app.fn_render_plantilla('pantalla_enlace_invalido', '{}')) as enlace_invalido`,
  );
  const f = r.rows[0]!;
  return {
    negocio: { nombre: f.nombre ?? "", whatsapp: f.whatsapp ?? "" },
    textos: { pedir_pin: f.pedir_pin, elegir_pin: f.elegir_pin, enlace_invalido: f.enlace_invalido },
  };
}

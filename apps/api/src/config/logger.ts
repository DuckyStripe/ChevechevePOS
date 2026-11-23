/**
 * Opciones del logger (pino) de Fastify.
 * Se censuran por ruta las cabeceras de credenciales y los campos sensibles
 * (CONTRATOS §3), por si algun `log.error({ ... })` los vuelca. El token del
 * enlace del cliente viaja en la URL `/p/<token>`: el serializador de `req` lo oculta.
 */
const CABECERAS = ["authorization", "cookie", "set-cookie", "x-cliente-token", "x-cliente-dispositivo"];
const CAMPOS = ["token", "token_push", "dispositivo_token", "contrasena", "actual", "nueva", "pin"];

const RUTAS_REDACTADAS = [
  ...CABECERAS.flatMap((c) => [`req.headers["${c}"]`, `headers["${c}"]`, `res.headers["${c}"]`]),
  ...CAMPOS.flatMap((c) => [c, `*.${c}`, `req.body.${c}`]),
];

export function ocultarRutaEnlace(url: string): string {
  return url.replace(/^\/p\/[^/?#]*/, "/p/***");
}

export function opcionesLogger(level: string, desarrollo = false) {
  return {
    level,
    redact: { paths: RUTAS_REDACTADAS, censor: "[omitido]" },
    serializers: {
      req(req: { method?: string; url?: string; host?: string; remoteAddress?: string; remotePort?: number }) {
        return {
          method: req.method,
          url: req.url ? ocultarRutaEnlace(req.url) : req.url,
          host: req.host,
          remoteAddress: req.remoteAddress,
          remotePort: req.remotePort,
        };
      },
    },
    ...(desarrollo ? { transport: { target: "pino-pretty" } } : {}),
  };
}

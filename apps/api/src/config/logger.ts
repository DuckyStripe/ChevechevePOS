/**
 * Opciones del logger (pino) de Fastify.
 * Se censuran por ruta las cabeceras de credenciales y los campos sensibles,
 * en el primer y segundo nivel, por si algun `log.error({ ... })` los vuelca.
 */
const CABECERAS = ["authorization", "cookie", "set-cookie"];
const CAMPOS = ["password", "token", "secret"];

const RUTAS_REDACTADAS = [
  ...CABECERAS.flatMap((c) => [`req.headers["${c}"]`, `headers["${c}"]`, `res.headers["${c}"]`]),
  ...CAMPOS.flatMap((c) => [c, `*.${c}`, `req.body.${c}`]),
];

export function opcionesLogger(level: string, desarrollo = false) {
  return {
    level,
    redact: { paths: RUTAS_REDACTADAS, censor: "[omitido]" },
    ...(desarrollo ? { transport: { target: "pino-pretty" } } : {}),
  };
}

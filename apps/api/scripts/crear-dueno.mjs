// Crea el primer usuario con rol Dueño. Uso: node scripts/crear-dueno.mjs --usuario <u> --nombre "<Nombre>"
// La contraseña sale de CONTRASENA del entorno o de una pregunta oculta; nunca por argumento ni al log.
import bcrypt from "bcryptjs";
import pg from "pg";

const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

function preguntarOculto(texto) {
  return new Promise((resolve) => {
    process.stdout.write(texto);
    let s = "";
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const fin = () => {
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      process.stdin.off("data", alRecibir);
      process.stdout.write("\n");
      resolve(s);
    };
    const alRecibir = (c) => {
      for (const ch of c) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") return fin();
        if (ch === "\u0003") process.exit(130);
        if (ch === "\u007f") s = s.slice(0, -1);
        else s += ch;
      }
    };
    process.stdin.on("data", alRecibir);
  });
}

const usuario = (arg("usuario") ?? "").trim().toLowerCase();
const nombre = (arg("nombre") ?? "").trim();
if (!/^[a-z0-9._-]{3,30}$/.test(usuario) || !nombre) {
  console.error('Uso: crear-dueno.mjs --usuario <3-30 letras minusculas, numeros . _ -> --nombre "<Nombre>"');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL no esta definida");
  process.exit(1);
}
const contrasena = process.env.CONTRASENA ?? (await preguntarOculto("Contraseña (min. 8): "));
if (contrasena.length < 8) {
  console.error("La contraseña debe tener al menos 8 caracteres");
  process.exit(1);
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  const hash = await bcrypt.hash(contrasena, 12);
  const r = await c.query(
    `insert into app.usuario (usuario, nombre, contrasena_hash, rol_id, sucursal_id, debe_cambiar_contrasena)
     values ($1, $2, $3, (select id from app.rol where es_sistema), 1, false)
     on conflict (usuario) do nothing returning id`,
    [usuario, nombre, hash],
  );
  if (!r.rowCount) {
    console.error(`El usuario ${usuario} ya existe`);
    process.exit(1);
  }
  console.log(`Dueño ${usuario} creado`);
} finally {
  await c.end();
}

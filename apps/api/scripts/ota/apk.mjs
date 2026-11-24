// Lee del propio APK su paquete, versionCode y versionName (AndroidManifest.xml binario), sin aapt2 ni dependencias.
// shortcut: zip sin ZIP64 (un APK de decenas de MB nunca lo necesita) y solo el elemento <manifest>.
import { Buffer } from "node:buffer";
import { open, readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

/** Contenido de las entradas del zip cuyo nombre cumple `quiere` (en el orden del directorio central). */
async function leerEntradas(ruta, quiere) {
  const salida = [];
  const h = await open(ruta, "r");
  try {
    const { size } = await h.stat();
    const colaLen = Math.min(size, 65_557);
    const cola = Buffer.alloc(colaLen);
    await h.read(cola, 0, colaLen, size - colaLen);
    let e = -1;
    for (let i = colaLen - 22; i >= 0; i--) if (cola.readUInt32LE(i) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error("El archivo no es un APK (zip) válido.");
    const cdTam = cola.readUInt32LE(e + 12);
    const cdPos = cola.readUInt32LE(e + 16);
    if (cdPos === 0xffffffff || cdTam === 0xffffffff) throw new Error("APK en formato ZIP64: no soportado.");
    const cd = Buffer.alloc(cdTam);
    await h.read(cd, 0, cdTam, cdPos);
    for (let p = 0; p + 46 <= cdTam && cd.readUInt32LE(p) === 0x02014b50; ) {
      const metodo = cd.readUInt16LE(p + 10);
      const comp = cd.readUInt32LE(p + 20);
      const n = cd.readUInt16LE(p + 28), x = cd.readUInt16LE(p + 30), c = cd.readUInt16LE(p + 32);
      const local = cd.readUInt32LE(p + 42);
      if (quiere(cd.toString("utf8", p + 46, p + 46 + n))) {
        const cab = Buffer.alloc(30);
        await h.read(cab, 0, 30, local);
        const datos = Buffer.alloc(comp);
        await h.read(datos, 0, comp, local + 30 + cab.readUInt16LE(26) + cab.readUInt16LE(28));
        if (metodo !== 0 && metodo !== 8) throw new Error("El APK usa una compresión no soportada.");
        salida.push(metodo === 0 ? datos : inflateRawSync(datos));
      }
      p += 46 + n + x + c;
    }
    return salida;
  } finally {
    await h.close();
  }
}

function cadenas(b, ini) {
  const cuenta = b.readUInt32LE(ini + 8), banderas = b.readUInt32LE(ini + 16), base = ini + b.readUInt32LE(ini + 20), cab = b.readUInt16LE(ini + 2);
  const utf8 = (banderas & 0x100) !== 0;
  const salida = [];
  for (let i = 0; i < cuenta; i++) {
    let p = base + b.readUInt32LE(ini + cab + i * 4);
    if (utf8) {
      if (b[p++] & 0x80) p++;
      let n = b[p++];
      if (n & 0x80) n = ((n & 0x7f) << 8) | b[p++];
      salida.push(b.toString("utf8", p, p + n));
    } else {
      let n = b.readUInt16LE(p);
      p += 2;
      if (n & 0x8000) { n = ((n & 0x7fff) << 16) | b.readUInt16LE(p); p += 2; }
      salida.push(b.toString("utf16le", p, p + n * 2));
    }
  }
  return salida;
}

/** Atributos del elemento <manifest> de un AXML. */
export function leerAxml(b) {
  if (b.length < 8 || b.readUInt16LE(0) !== 0x0003) throw new Error("AndroidManifest.xml no es XML binario de Android.");
  let tabla = [];
  for (let p = b.readUInt16LE(2); p + 8 <= b.length; ) {
    const tipo = b.readUInt16LE(p), tam = b.readUInt32LE(p + 4);
    if (tam < 8) break;
    if (tipo === 0x0001) tabla = cadenas(b, p);
    if (tipo === 0x0102 && tabla[b.readInt32LE(p + 20)] === "manifest") {
      const ini = p + 16 + b.readUInt16LE(p + 24), tamAtr = b.readUInt16LE(p + 26), n = b.readUInt16LE(p + 28);
      const attrs = {};
      for (let i = 0; i < n; i++) {
        const a = ini + i * tamAtr;
        const nombre = tabla[b.readInt32LE(a + 4)];
        const crudo = b.readInt32LE(a + 8), tipoDato = b[a + 15], dato = b.readUInt32LE(a + 16);
        attrs[nombre] = tipoDato === 0x03 ? tabla[dato] : crudo >= 0 ? tabla[crudo] : dato;
      }
      return attrs;
    }
    p += tam;
  }
  throw new Error("AndroidManifest.xml sin elemento <manifest>.");
}

// El certificado de depuración de Android se llama "Android Debug": va en META-INF/*.RSA (v1, normalmente comprimido) y en el bloque de firma v2 (en claro).
async function esDepuracion(ruta) {
  const marca = Buffer.from("Android Debug");
  if ((await readFile(ruta)).includes(marca)) return true;
  return (await leerEntradas(ruta, (n) => /^META-INF\/[^/]+\.(RSA|DSA|EC)$/i.test(n))).some((b) => b.includes(marca));
}

/** { paquete, versionCode, versionName, depuracion } del APK. `depuracion`: trae la firma de depuración de Android (si es detectable). */
export async function leerApk(ruta) {
  const [manifiesto] = await leerEntradas(ruta, (n) => n === "AndroidManifest.xml");
  if (!manifiesto) throw new Error("El APK no trae AndroidManifest.xml.");
  const a = leerAxml(manifiesto);
  return {
    paquete: a.package,
    versionCode: typeof a.versionCode === "number" ? a.versionCode : Number(a.versionCode),
    versionName: a.versionName,
    depuracion: await esDepuracion(ruta),
  };
}

import { writeFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";

/** AndroidManifest.xml binario minimo (<manifest package versionCode versionName>), con la misma estructura que escribe aapt2. */
export function axml(paquete: string, versionCode: number, versionName: string): Buffer {
  const cadenas = ["manifest", "package", "versionCode", "versionName", paquete, versionName];
  const datos = cadenas.map((s) => {
    const b = Buffer.alloc(2 + s.length * 2 + 2);
    b.writeUInt16LE(s.length, 0);
    b.write(s, 2, "utf16le");
    return b;
  });
  const offs: number[] = [];
  let acc = 0;
  for (const d of datos) { offs.push(acc); acc += d.length; }
  const relleno = (4 - (acc % 4)) % 4;
  const iniCad = 28 + cadenas.length * 4;
  const pool = Buffer.alloc(iniCad + acc + relleno);
  pool.writeUInt16LE(0x0001, 0); pool.writeUInt16LE(28, 2); pool.writeUInt32LE(pool.length, 4);
  pool.writeUInt32LE(cadenas.length, 8); pool.writeUInt32LE(0, 12); pool.writeUInt32LE(0, 16);
  pool.writeUInt32LE(iniCad, 20); pool.writeUInt32LE(0, 24);
  offs.forEach((o, i) => pool.writeUInt32LE(o, 28 + i * 4));
  Buffer.concat(datos).copy(pool, iniCad);

  const ini = Buffer.alloc(96);
  ini.writeUInt16LE(0x0102, 0); ini.writeUInt16LE(16, 2); ini.writeUInt32LE(96, 4); ini.writeUInt32LE(1, 8); ini.writeInt32LE(-1, 12);
  ini.writeInt32LE(-1, 16); ini.writeInt32LE(0, 20); ini.writeUInt16LE(20, 24); ini.writeUInt16LE(20, 26); ini.writeUInt16LE(3, 28);
  const attr = (i: number, nombre: number, crudo: number, tipo: number, dato: number) => {
    const a = 36 + i * 20;
    ini.writeInt32LE(-1, a); ini.writeInt32LE(nombre, a + 4); ini.writeInt32LE(crudo, a + 8);
    ini.writeUInt16LE(8, a + 12); ini[a + 15] = tipo; ini.writeUInt32LE(dato, a + 16);
  };
  attr(0, 1, 4, 0x03, 4);
  attr(1, 2, -1, 0x10, versionCode);
  attr(2, 3, 5, 0x03, 5);
  const fin = Buffer.alloc(24);
  fin.writeUInt16LE(0x0103, 0); fin.writeUInt16LE(16, 2); fin.writeUInt32LE(24, 4); fin.writeInt32LE(-1, 16); fin.writeInt32LE(0, 20);

  const cabeza = Buffer.alloc(8);
  cabeza.writeUInt16LE(0x0003, 0); cabeza.writeUInt16LE(8, 2); cabeza.writeUInt32LE(8 + pool.length + ini.length + fin.length, 4);
  return Buffer.concat([cabeza, pool, ini, fin]);
}

/** Zip con AndroidManifest.xml (deflate) y, si se pide, relleno que aparenta ser la firma. */
export function crearApk(ruta: string, opciones: { paquete?: string; versionCode: number; versionName: string; extra?: string }): void {
  const archivos: Array<[string, Buffer]> = [["AndroidManifest.xml", axml(opciones.paquete ?? "com.chevechevepos.app", opciones.versionCode, opciones.versionName)]];
  if (opciones.extra) archivos.push(["META-INF/CERT.RSA", Buffer.from(opciones.extra)]);
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let pos = 0;
  for (const [nombre, contenido] of archivos) {
    const comp = deflateRawSync(contenido);
    const n = Buffer.from(nombre);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(8, 8); l.writeUInt32LE(comp.length, 18);
    l.writeUInt32LE(contenido.length, 22); l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(comp.length, 20);
    c.writeUInt32LE(contenido.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(pos, 42);
    locales.push(l, n, comp);
    centrales.push(c, n);
    pos += 30 + n.length + comp.length;
  }
  const cd = Buffer.concat(centrales);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(archivos.length, 8); eocd.writeUInt16LE(archivos.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(pos, 16);
  writeFileSync(ruta, Buffer.concat([...locales, cd, eocd]));
}

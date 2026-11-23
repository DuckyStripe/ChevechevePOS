/** Reduce una foto en el navegador (canvas) antes de subirla: `imagen` <= 800 px y `miniatura` 240 px (CONTRATOS §4.5). */
const TOPE_MINIATURA = 30 * 1024;
const TOPE_TOTAL = 900 * 1024; // el BFF corta a 1 MB

export type ImagenReducida = { imagen: Blob; miniatura: Blob; extension: "webp" | "jpg" };

async function abrir(archivo: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(archivo, { imageOrientation: "from-image" });
    } catch {
      /* cae al elemento img */
    }
  }
  const url = URL.createObjectURL(archivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const codificar = (lienzo: HTMLCanvasElement, tipo: string, calidad: number) => new Promise<Blob | null>((ok) => lienzo.toBlob(ok, tipo, calidad));

async function lado(fuente: ImageBitmap | HTMLImageElement, max: number, tipo: string, tope: number, calidadInicial: number): Promise<Blob> {
  const w0 = "naturalWidth" in fuente ? fuente.naturalWidth : fuente.width;
  const h0 = "naturalHeight" in fuente ? fuente.naturalHeight : fuente.height;
  let escala = Math.min(1, max / Math.max(w0, h0));
  for (let vuelta = 0; vuelta < 6; vuelta++) {
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.max(1, Math.round(w0 * escala));
    lienzo.height = Math.max(1, Math.round(h0 * escala));
    const ctx = lienzo.getContext("2d");
    if (!ctx) throw new Error("sin canvas");
    ctx.fillStyle = "#fff"; // JPEG no tiene transparencia
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.drawImage(fuente, 0, 0, lienzo.width, lienzo.height);
    for (let q = calidadInicial; q >= 0.4; q -= 0.1) {
      const b = await codificar(lienzo, tipo, q);
      if (!b) throw new Error("sin codificador");
      if (b.size <= tope) return b;
    }
    escala *= 0.8; // aun pesa: se achica un poco mas
  }
  throw new Error("no se pudo reducir");
}

export async function reducirImagen(archivo: File): Promise<ImagenReducida> {
  const fuente = await abrir(archivo);
  // WebP si el navegador lo codifica; si no, devuelve PNG y se usa JPEG.
  const prueba = document.createElement("canvas");
  prueba.width = prueba.height = 1;
  const webp = (await codificar(prueba, "image/webp", 0.8))?.type === "image/webp";
  const tipo = webp ? "image/webp" : "image/jpeg";
  const miniatura = await lado(fuente, 240, tipo, TOPE_MINIATURA, 0.8);
  const imagen = await lado(fuente, 800, tipo, TOPE_TOTAL - miniatura.size, 0.85);
  if ("close" in fuente) fuente.close();
  return { imagen, miniatura, extension: webp ? "webp" : "jpg" };
}

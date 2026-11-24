/** Resumen corto del User-Agent para la lista de dispositivos del cliente («Chrome Android», «WhatsApp iOS»). Nada del UA original se guarda. */
export function resumenNavegador(ua: string | undefined): string {
  const t = ua ?? "";
  const so = /iPhone|iPad|iPod/.test(t) ? "iOS" : /Android/.test(t) ? "Android" : /Windows/.test(t) ? "Windows" : /Macintosh|Mac OS X/.test(t) ? "Mac" : /Linux/.test(t) ? "Linux" : "";
  const nav = /WhatsApp/i.test(t)
    ? "WhatsApp"
    : /FBAN|FBAV|FB_IAB/.test(t)
      ? "Facebook"
      : /EdgA?\//.test(t)
        ? "Edge"
        : /SamsungBrowser/.test(t)
          ? "Samsung Internet"
          : /OPR\/|Opera/.test(t)
            ? "Opera"
            : /Firefox|FxiOS/.test(t)
              ? "Firefox"
              : /Chrome|CriOS/.test(t)
                ? "Chrome"
                : /Safari/.test(t)
                  ? "Safari"
                  : "";
  return [nav || "Navegador", so].filter(Boolean).join(" ");
}

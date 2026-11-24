import type { MetadataRoute } from "next";

// PWA para iPhone y PC (CONTRATOS §4.6). Sin service worker: no hay modo sin conexión (shortcut: agregarlo con web push si hace falta).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ChevechevePOS",
    short_name: "Chevecheve",
    description: "Pedidos, reparto y cobro de la bodega",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "es-MX",
    background_color: "#faf6ef",
    theme_color: "#b45309",
    icons: [
      { src: "/iconos/icono-192.png", sizes: "192x192", type: "image/png" },
      { src: "/iconos/icono-512.png", sizes: "512x512", type: "image/png" },
      { src: "/iconos/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

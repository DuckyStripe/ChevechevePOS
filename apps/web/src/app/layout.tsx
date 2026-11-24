import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

// Una sola fuente web, solo para titulos y cifras grandes (el cuerpo usa la del sistema: C9).
const titulo = Bricolage_Grotesque({ subsets: ["latin"], weight: "variable", display: "swap", variable: "--fuente-titulo" });

export const metadata: Metadata = {
  title: "ChevechevePOS",
  description: "Pedidos, reparto y cobro de la bodega",
};

// Colores de la barra del sistema = token `--fondo` de globals.css en cada modo.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eff0ec" },
    { media: "(prefers-color-scheme: dark)", color: "#121413" },
  ],
  colorScheme: "light dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={titulo.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}

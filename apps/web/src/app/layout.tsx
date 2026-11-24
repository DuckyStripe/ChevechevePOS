import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChevechevePOS",
  description: "Pedidos, reparto y cobro de la bodega",
};

export const viewport: Viewport = { themeColor: "#b45309", viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChevechevePOS",
  description: "Punto de venta para bodega de cerveza",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}

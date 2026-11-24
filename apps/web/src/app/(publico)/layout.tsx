import type { Metadata } from "next";

// Paginas del cliente: sin indexar, sin referrer (el link lleva su token) y a lo ligero (C9).
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto min-h-dvh w-full max-w-xl px-4 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))]">{children}</div>;
}

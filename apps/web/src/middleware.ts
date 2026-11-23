import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, leerCookieSesion } from "@/lib/sesion";

const RUTAS_PUBLICAS = ["/login", "/api/salud"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(`${r}/`))) return NextResponse.next();

  if (await leerCookieSesion(req.cookies.get(COOKIE_SESION)?.value)) return NextResponse.next();

  // Los endpoints del BFF responden 401 en vez de redirigir.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ codigo: "SESION_CERRADA", mensaje: "Inicia sesion" }, { status: 401 });
  }
  const destino = req.nextUrl.clone();
  destino.pathname = "/login";
  destino.search = "";
  const res = NextResponse.redirect(destino);
  res.cookies.delete(COOKIE_SESION);
  return res;
}

export const config = {
  // Excluye internos de Next y archivos estaticos (con extension).
  matcher: ["/((?!_next/|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};

import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_JWT } from "@/lib/cookies";

// Solo mira si la cookie EXISTE para redirigir: no la valida ni la firma. La API decide si la sesion vale.
const LIBRES = ["/api", "/img", "/p", "/login", "/pedido/invalido"];
const COOKIE_CLIENTE = "chv_cliente";

const esRuta = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (LIBRES.some((r) => esRuta(pathname, r))) return NextResponse.next();

  const tiene = esRuta(pathname, "/pedido") ? req.cookies.has(COOKIE_CLIENTE) : req.cookies.has(COOKIE_JWT);
  if (tiene) return NextResponse.next();

  const destino = req.nextUrl.clone();
  destino.pathname = esRuta(pathname, "/pedido") ? "/pedido/invalido" : "/login";
  destino.search = "";
  return NextResponse.redirect(destino);
}

export const config = {
  // Excluye internos de Next y archivos estaticos (con extension).
  matcher: ["/((?!_next/|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};

import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Préfixes de routes exigeant une session (le contrôle fin du rôle est fait
// dans les layouts serveur, où Prisma est disponible).
const PROTECTED_PREFIXES = ["/tuteur", "/alternant", "/admin", "/cfa"];
const AUTH_PAGES = ["/login", "/register"];

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  // Route protégée sans session → login (en mémorisant la destination).
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(url);
  }

  // Déjà connecté sur une page d'auth → accueil (qui route vers le bon dashboard).
  if (user && AUTH_PAGES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Exécute le middleware partout sauf assets statiques, images et le callback d'auth.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

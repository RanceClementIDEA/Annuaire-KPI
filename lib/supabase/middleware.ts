import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

/**
 * Rafraîchit la session Supabase au fil des requêtes (Edge runtime) et renvoie
 * l'utilisateur authentifié pour que le middleware décide des redirections.
 *
 * NB : aucun accès Prisma ici — le middleware s'exécute sur l'Edge, où Prisma
 * n'est pas disponible. La résolution fine du rôle se fait en couche serveur (Node).
 *
 * Tolérant aux pannes : si la configuration Supabase est absente/incorrecte ou
 * si l'appel réseau échoue, on renvoie `user: null` sans faire tomber tout le
 * site (le contrôle d'accès fin reste assuré en couche serveur).
 */
export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; user: User | null }> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error(
      "[middleware] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY manquant(s).",
    );
    return { response, user: null };
  }

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });

    // Ne rien intercaler entre createServerClient et getUser (recommandation Supabase).
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return { response, user };
  } catch (e) {
    console.error("[middleware] Échec du rafraîchissement de session Supabase :", e);
    return { response, user: null };
  }
}

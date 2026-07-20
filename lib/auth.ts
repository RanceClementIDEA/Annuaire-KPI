import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

/**
 * Rôle applicatif = rôle d'un `User` (TUTEUR / ADMIN / CFA_REFERENT) OU « ALTERNANT ».
 * Les alternants ne sont pas des `User` (entité distincte) : leur rôle est dérivé
 * de la correspondance de leur e-mail avec un enregistrement `Alternant`.
 */
export type AppRole = Role | "ALTERNANT";

export interface AppUser {
  authId: string;
  email: string;
  nom: string;
  /** null = authentifié mais pas encore rattaché à une fiche métier. */
  role: AppRole | null;
  /** id du `User` ou de l'`Alternant` correspondant (null si non rattaché). */
  entityId: string | null;
  organisationId: string | null;
  /** CFA de rattachement (renseigné pour les référents CFA). */
  cfaId: string | null;
  /** Téléphone (optionnel) pour les alertes SMS/WhatsApp. */
  telephone: string | null;
}

/**
 * Résout l'utilisateur courant : identité Supabase + rôle applicatif (via Prisma).
 * Renvoie null si aucune session valide.
 */
export async function getAppUser(): Promise<AppUser | null> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) return null;

    const dbUser = await prisma.user.findUnique({ where: { email: user.email } });
    if (dbUser) {
      return {
        authId: user.id,
        email: user.email,
        nom: dbUser.nom,
        role: dbUser.role,
        entityId: dbUser.id,
        organisationId: dbUser.organisationId,
        cfaId: dbUser.cfaId,
        telephone: dbUser.telephone,
      };
    }

    const alternant = await prisma.alternant.findUnique({
      where: { email: user.email },
    });
    if (alternant) {
      return {
        authId: user.id,
        email: user.email,
        nom: alternant.nom,
        role: "ALTERNANT",
        entityId: alternant.id,
        organisationId: alternant.organisationId,
        cfaId: null,
        telephone: alternant.telephone,
      };
    }

    // Authentifié mais pas encore provisionné côté métier.
    return {
      authId: user.id,
      email: user.email,
      nom: (user.user_metadata?.nom as string | undefined) ?? user.email,
      role: null,
      entityId: null,
      organisationId: null,
      cfaId: null,
      telephone: null,
    };
  } catch (e) {
    // Laisser passer les signaux internes de Next.js — rendu dynamique
    // (cookies()), redirect(), notFound() : les intercepter casserait le rendu.
    const digest = (e as { digest?: unknown })?.digest;
    const message = e instanceof Error ? e.message : "";
    if (
      (typeof digest === "string" &&
        (digest === "DYNAMIC_SERVER_USAGE" || digest.startsWith("NEXT_"))) ||
      message.includes("Dynamic server usage")
    ) {
      throw e;
    }
    // Supabase/Prisma indisponible ou mal configuré → traite comme non connecté
    // (la vraie erreur reste visible dans les logs) plutôt que de faire un 500.
    console.error("[getAppUser] Échec de résolution de l'utilisateur :", e);
    return null;
  }
}

/** Exige une session ; redirige vers /login sinon. */
export async function requireUser(): Promise<AppUser> {
  const user = await getAppUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Exige un des rôles fournis ; sinon redirige vers le tableau de bord du rôle réel
 * (ou l'accueil si le compte n'est pas encore rattaché).
 */
export async function requireRole(roles: AppRole[]): Promise<AppUser> {
  const user = await requireUser();
  if (!user.role || !roles.includes(user.role)) {
    redirect(dashboardPathForRole(user.role));
  }
  return user;
}

/** Chemin du tableau de bord correspondant à un rôle. */
export function dashboardPathForRole(role: AppRole | null): string {
  switch (role) {
    case "TUTEUR":
      return "/tuteur";
    case "ADMIN":
      return "/admin";
    case "CFA_REFERENT":
      return "/cfa";
    case "ALTERNANT":
      return "/alternant";
    default:
      return "/"; // non rattaché → page d'accueil (état « compte en attente »)
  }
}

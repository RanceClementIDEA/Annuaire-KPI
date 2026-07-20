import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  estSuperAdmin,
  lireImpersonation,
  type Impersonation,
} from "@/lib/superadmin";

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
  /** L'e-mail authentifié est super-administrateur. */
  isSuperAdmin: boolean;
  /** Nom de l'identité consultée en mode admin (null si aucune bascule). */
  impersonating: string | null;
}

/** Identité applicative sans les indicateurs de mode admin. */
type BaseIdentity = Omit<AppUser, "isSuperAdmin" | "impersonating">;

/** Identité de base de l'utilisateur authentifié (User, Alternant, ou aucun). */
async function resoudreBase(
  authId: string,
  email: string,
  nomFallback: string,
): Promise<BaseIdentity> {
  const dbUser = await prisma.user.findUnique({ where: { email } });
  if (dbUser) {
    return {
      authId,
      email,
      nom: dbUser.nom,
      role: dbUser.role,
      entityId: dbUser.id,
      organisationId: dbUser.organisationId,
      cfaId: dbUser.cfaId,
      telephone: dbUser.telephone,
    };
  }

  const alternant = await prisma.alternant.findUnique({ where: { email } });
  if (alternant) {
    return {
      authId,
      email,
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
    authId,
    email,
    nom: nomFallback,
    role: null,
    entityId: null,
    organisationId: null,
    cfaId: null,
    telephone: null,
  };
}

/**
 * Identité « empruntée » par un super-admin (bascule d'identité). `authId`
 * reste celui du super-admin réel (les actions liées à l'auth ne visent jamais
 * le compte consulté). Renvoie null si la cible n'existe plus.
 */
async function resoudreImpersonation(
  imp: Impersonation,
  realAuthId: string,
): Promise<BaseIdentity | null> {
  if (imp.k === "user") {
    const u = await prisma.user.findUnique({ where: { id: imp.id } });
    if (!u) return null;
    return {
      authId: realAuthId,
      email: u.email,
      nom: u.nom,
      role: u.role,
      entityId: u.id,
      organisationId: u.organisationId,
      cfaId: u.cfaId,
      telephone: u.telephone,
    };
  }
  const a = await prisma.alternant.findUnique({ where: { id: imp.id } });
  if (!a) return null;
  return {
    authId: realAuthId,
    email: a.email,
    nom: a.nom,
    role: "ALTERNANT",
    entityId: a.id,
    organisationId: a.organisationId,
    cfaId: null,
    telephone: a.telephone,
  };
}

/**
 * Résout l'utilisateur courant : identité Supabase + rôle applicatif (via Prisma).
 * Pour un super-admin en bascule d'identité, renvoie l'identité consultée en
 * conservant l'indicateur `isSuperAdmin`. Renvoie null si aucune session valide.
 */
export async function getAppUser(): Promise<AppUser | null> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) return null;

    const superAdmin = estSuperAdmin(user.email);

    // Bascule d'identité : honorée uniquement si l'utilisateur est réellement
    // super-admin (le cookie seul ne confère aucun droit).
    if (superAdmin) {
      const imp = lireImpersonation();
      if (imp) {
        const cible = await resoudreImpersonation(imp, user.id);
        if (cible) {
          return { ...cible, isSuperAdmin: true, impersonating: cible.nom };
        }
      }
    }

    const nomFallback =
      (user.user_metadata?.nom as string | undefined) ?? user.email;
    const base = await resoudreBase(user.id, user.email, nomFallback);
    return { ...base, isSuperAdmin: superAdmin, impersonating: null };
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
  // Super-admin sans bascule active : on l'oriente vers son tableau de bord
  // central (il choisit l'espace à consulter avant d'entrer dans un portail).
  if (user.isSuperAdmin && !user.impersonating) {
    redirect("/superadmin");
  }
  if (!user.role || !roles.includes(user.role)) {
    redirect(dashboardPathForRole(user.role));
  }
  return user;
}

/** Exige un super-administrateur ; redirige vers l'accueil sinon. */
export async function requireSuperAdmin(): Promise<AppUser> {
  const user = await requireUser();
  if (!user.isSuperAdmin) redirect("/");
  return user;
}

/**
 * Page d'atterrissage d'un utilisateur : le hub super-admin s'il n'a pas encore
 * choisi d'identité à consulter, sinon le tableau de bord de son rôle.
 */
export function homePathForUser(user: AppUser): string {
  if (user.isSuperAdmin && !user.impersonating) return "/superadmin";
  return dashboardPathForRole(user.role);
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

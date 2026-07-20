import { cookies } from "next/headers";

/**
 * Mode « super-administrateur » : un ou plusieurs e-mails (variable
 * d'environnement) autorisés à consulter chaque portail (tuteur, alternant,
 * CFA, admin) via une bascule d'identité (impersonation).
 *
 * Le périmètre est piloté par `SUPERADMIN_EMAILS` (liste séparée par des
 * virgules/espaces) — jamais codé en dur, pour ne pas committer d'adresse
 * personnelle et pouvoir l'ajuster sans redéploiement de code.
 */

export const IMPERSONATION_COOKIE = "ap_impersonation";

/** L'e-mail fait-il partie des super-administrateurs ? */
export function estSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const liste = (process.env.SUPERADMIN_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return liste.includes(email.toLowerCase());
}

/** Identité consultée en mode admin : un `User` ou un `Alternant`. */
export type Impersonation = { k: "user" | "alternant"; id: string };

/** Lit le cookie d'impersonation (null si absent ou invalide). */
export function lireImpersonation(): Impersonation | null {
  const raw = cookies().get(IMPERSONATION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Partial<Impersonation>;
    if ((obj.k === "user" || obj.k === "alternant") && typeof obj.id === "string") {
      return { k: obj.k, id: obj.id };
    }
  } catch {
    // cookie corrompu → ignoré
  }
  return null;
}

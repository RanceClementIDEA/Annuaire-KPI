import { getAdminClient } from "@/lib/supabase/admin";

export interface InvitationResult {
  invited: boolean;
  /** aucune tentative (clé service_role absente). */
  skipped: boolean;
  error?: string;
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/**
 * Envoie une invitation Supabase à un e-mail : la personne reçoit un lien pour
 * définir son mot de passe et se connecter. Best-effort — si la clé n'est pas
 * configurée ou si l'envoi échoue, on ne bloque pas la création de l'alternant.
 */
export async function inviterUtilisateur(email: string): Promise<InvitationResult> {
  const admin = getAdminClient();
  if (!admin) return { invited: false, skipped: true };

  try {
    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl()}/auth/callback`,
    });
    if (error) {
      return { invited: false, skipped: false, error: error.message };
    }
    return { invited: true, skipped: false };
  } catch (e) {
    return {
      invited: false,
      skipped: false,
      error: e instanceof Error ? e.message : "Échec de l'invitation.",
    };
  }
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { synchroniserQuantiteStripe } from "@/lib/stripe-sync";

/** Refuse toute mutation de compte pendant une bascule d'identité (mode admin). */
const ERREUR_MODE_ADMIN =
  "/mon-compte?error=" +
  encodeURIComponent("Action indisponible en mode admin (consultation seule).");

/** Enregistre (ou efface) le téléphone pour les alertes SMS/WhatsApp. */
export async function mettreAJourTelephone(formData: FormData): Promise<void> {
  const user = await getAppUser();
  if (!user) redirect("/login");
  if (user.impersonating) redirect(ERREUR_MODE_ADMIN);

  const saisi = String(formData.get("telephone") ?? "").trim();
  // Vide = effacement ; sinon format international plausible.
  if (saisi && !/^\+?[0-9 ().-]{6,20}$/.test(saisi)) {
    redirect(
      "/mon-compte?error=" +
        encodeURIComponent(
          "Numéro invalide. Utilisez le format international, ex. +33 6 12 34 56 78.",
        ),
    );
  }
  const valeur = saisi || null;

  if (user.role === "ALTERNANT" && user.entityId) {
    await prisma.alternant.update({
      where: { id: user.entityId },
      data: { telephone: valeur },
    });
  } else if (user.entityId) {
    await prisma.user.update({
      where: { id: user.entityId },
      data: { telephone: valeur },
    });
  }

  revalidatePath("/mon-compte");
  redirect("/mon-compte?tel=1");
}

/**
 * Suppression du compte et des données personnelles (droit à l'effacement).
 * Sécurisé : confirmation explicite + refus si des dépendances subsistent.
 */
export async function supprimerMonCompte(formData: FormData): Promise<void> {
  const user = await getAppUser();
  if (!user) redirect("/login");
  if (user.impersonating) redirect(ERREUR_MODE_ADMIN);

  if (String(formData.get("confirmation") ?? "").trim() !== "SUPPRIMER") {
    redirect(
      "/mon-compte?error=" +
        encodeURIComponent("Tapez SUPPRIMER (en majuscules) pour confirmer."),
    );
  }

  if (user.role === "ALTERNANT" && user.entityId) {
    // Cascade : missions + bilans de l'alternant supprimés automatiquement.
    await prisma.alternant.delete({ where: { id: user.entityId } });
    // Recale la facturation de l'organisation sur le nouvel effectif.
    if (user.organisationId) {
      await synchroniserQuantiteStripe(user.organisationId);
    }
  } else if (
    (user.role === "TUTEUR" || user.role === "ADMIN") &&
    user.entityId
  ) {
    const nbAlternants = await prisma.alternant.count({
      where: { tuteurId: user.entityId },
    });
    if (nbAlternants > 0) {
      redirect(
        "/mon-compte?error=" +
          encodeURIComponent(
            "Supprimez d'abord vos alternants avant de supprimer votre compte.",
          ),
      );
    }

    const orgId = user.organisationId;
    await prisma.user.delete({ where: { id: user.entityId } });

    // Organisation vide → supprimée (cascade abonnement).
    if (orgId) {
      const [resteUsers, resteAlt] = await Promise.all([
        prisma.user.count({ where: { organisationId: orgId } }),
        prisma.alternant.count({ where: { organisationId: orgId } }),
      ]);
      if (resteUsers === 0 && resteAlt === 0) {
        await prisma.organisation.delete({ where: { id: orgId } });
      }
    }
  }

  // Supprime le compte d'authentification Supabase (best-effort).
  const admin = getAdminClient();
  if (admin) {
    try {
      await admin.auth.admin.deleteUser(user.authId);
    } catch {
      // best-effort : les données métier sont déjà supprimées.
    }
  }

  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login?compte=supprime");
}

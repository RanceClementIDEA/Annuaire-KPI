"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { etatAbonnement } from "@/lib/data/abonnement";
import { inviterUtilisateur } from "@/lib/invitations";

/** Le tuteur ajoute un de ses alternants (soumis au quota freemium). */
export async function ajouterAlternantTuteur(formData: FormData): Promise<void> {
  const user = await requireRole(["TUTEUR"]);
  if (!user.organisationId) redirect("/onboarding");
  const organisationId = user.organisationId;

  // Mur de paiement freemium.
  const etat = await etatAbonnement(organisationId);
  if (!etat.peutAjouter) {
    redirect("/admin/abonnement?limite=1");
  }

  const nom = String(formData.get("nom") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const diplomeId = String(formData.get("diplomeId") ?? "").trim();

  if (!nom || !email || !diplomeId) {
    redirect("/tuteur?error=" + encodeURIComponent("Tous les champs sont requis."));
  }

  const [diplome, emailPris] = await Promise.all([
    prisma.referentiel.findUnique({ where: { id: diplomeId } }),
    prisma.alternant.findUnique({ where: { email } }),
  ]);
  if (!diplome) {
    redirect("/tuteur?error=" + encodeURIComponent("Diplôme invalide."));
  }
  if (emailPris) {
    redirect("/tuteur?error=" + encodeURIComponent("Cet e-mail est déjà utilisé."));
  }

  await prisma.alternant.create({
    data: { nom, email, organisationId, tuteurId: user.entityId!, diplomeId },
  });

  // Invitation par e-mail (best-effort) : l'alternant définit son mot de passe.
  const invitation = await inviterUtilisateur(email);

  revalidatePath("/tuteur");
  redirect(`/tuteur?ajout=1${invitation.invited ? "&invite=1" : ""}`);
}

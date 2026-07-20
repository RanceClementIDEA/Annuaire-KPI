"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { etatAbonnement } from "@/lib/data/abonnement";
import { inviterUtilisateur } from "@/lib/invitations";

const base = "/admin/alternants";

/** Ajoute un alternant à l'organisation, sous réserve du quota freemium. */
export async function ajouterAlternant(formData: FormData): Promise<void> {
  const user = await requireRole(["ADMIN"]);
  if (!user.organisationId) {
    redirect(`${base}?error=${encodeURIComponent("Aucune organisation rattachée.")}`);
  }
  const organisationId = user.organisationId;

  // Mur de paiement : au-delà de l'offre gratuite, abonnement requis.
  const etat = await etatAbonnement(organisationId);
  if (!etat.peutAjouter) {
    redirect("/admin/abonnement?limite=1");
  }

  const nom = String(formData.get("nom") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const tuteurId = String(formData.get("tuteurId") ?? "").trim();
  const diplomeId = String(formData.get("diplomeId") ?? "").trim();

  if (!nom || !email || !tuteurId || !diplomeId) {
    redirect(`${base}?error=${encodeURIComponent("Tous les champs sont requis.")}`);
  }

  // Le tuteur doit appartenir à l'organisation ; le diplôme doit exister.
  const [tuteur, diplome, emailPris] = await Promise.all([
    prisma.user.findFirst({ where: { id: tuteurId, organisationId, role: "TUTEUR" } }),
    prisma.referentiel.findUnique({ where: { id: diplomeId } }),
    prisma.alternant.findUnique({ where: { email } }),
  ]);
  if (!tuteur || !diplome) {
    redirect(`${base}?error=${encodeURIComponent("Tuteur ou diplôme invalide.")}`);
  }
  if (emailPris) {
    redirect(`${base}?error=${encodeURIComponent("Cet e-mail est déjà utilisé.")}`);
  }

  await prisma.alternant.create({
    data: { nom, email, organisationId, tuteurId, diplomeId },
  });

  // Invitation par e-mail (best-effort).
  await inviterUtilisateur(email);

  revalidatePath(base);
  redirect(base);
}

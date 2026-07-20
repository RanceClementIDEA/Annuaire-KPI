"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/** Crée l'organisation de l'utilisateur et l'y rattache. */
export async function creerOrganisation(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user.organisationId) redirect("/");

  const nom = String(formData.get("organisation") ?? "").trim();
  if (!nom) {
    redirect("/onboarding?error=" + encodeURIComponent("Le nom de l'entreprise est requis."));
  }

  await prisma.$transaction(async (tx) => {
    const org = await tx.organisation.create({
      data: {
        nom,
        abonnement: { create: { nbAlternants: 0, statut: "TRIAL" } },
      },
    });

    if (user.entityId) {
      // Fiche User déjà présente → simple rattachement.
      await tx.user.update({
        where: { id: user.entityId },
        data: { organisationId: org.id },
      });
    } else {
      // Authentifié sans fiche métier → on crée le tuteur.
      await tx.user.create({
        data: {
          email: user.email,
          nom: user.nom,
          role: "TUTEUR",
          organisationId: org.id,
        },
      });
    }
  });

  revalidatePath("/", "layout");
  redirect("/tuteur");
}

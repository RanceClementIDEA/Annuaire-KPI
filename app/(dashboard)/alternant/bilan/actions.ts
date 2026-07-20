"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { lundiDeLaSemaine } from "@/lib/semaine";

/** Enregistre (crée ou met à jour) le bilan de la semaine courante. */
export async function enregistrerBilan(formData: FormData): Promise<void> {
  const user = await requireRole(["ALTERNANT"]);

  const reussites = String(formData.get("reussites") ?? "").trim();
  const difficultes = String(formData.get("difficultes") ?? "").trim();
  const commentaire = String(formData.get("commentaire") ?? "").trim() || null;

  if (!reussites && !difficultes && !commentaire) {
    redirect(
      "/alternant/bilan?error=" +
        encodeURIComponent("Renseignez au moins un champ."),
    );
  }

  const semaine = lundiDeLaSemaine(new Date());
  const alternantId = user.entityId!;

  const existant = await prisma.bilanHebdo.findUnique({
    where: { alternantId_semaine: { alternantId, semaine } },
    select: { valideParTuteur: true },
  });
  if (existant?.valideParTuteur) {
    redirect(
      "/alternant/bilan?error=" +
        encodeURIComponent(
          "Ce bilan est déjà validé par le tuteur et ne peut plus être modifié.",
        ),
    );
  }

  await prisma.bilanHebdo.upsert({
    where: { alternantId_semaine: { alternantId, semaine } },
    // Le contenu change → le résumé IA existant est invalidé (à régénérer).
    update: { reussites, difficultes, commentaire, resumeIA: null },
    create: { alternantId, semaine, reussites, difficultes, commentaire },
  });

  revalidatePath("/alternant/bilan");
  redirect("/alternant/bilan");
}

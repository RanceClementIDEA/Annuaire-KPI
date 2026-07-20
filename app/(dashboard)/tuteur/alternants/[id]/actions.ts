"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { StatutMission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { PeriodeSchema, chevaucheRythme, parseRythme } from "@/lib/rythme";

const base = (id: string) => `/tuteur/alternants/${id}`;

/** Vérifie que l'alternant est bien suivi par le tuteur courant. */
async function assertOwned(alternantId: string) {
  const user = await requireRole(["TUTEUR"]);
  const alternant = await prisma.alternant.findUnique({ where: { id: alternantId } });
  if (!alternant || alternant.tuteurId !== user.entityId) {
    // Ne divulgue pas l'existence de la ressource d'un autre tuteur.
    redirect("/tuteur");
  }
  return alternant;
}

/** Ajoute une période au rythme d'alternance. */
export async function ajouterPeriode(
  alternantId: string,
  formData: FormData,
): Promise<void> {
  const alternant = await assertOwned(alternantId);

  const parsed = PeriodeSchema.safeParse({
    debut: String(formData.get("debut") ?? ""),
    fin: String(formData.get("fin") ?? ""),
    type: String(formData.get("type") ?? ""),
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Période invalide.";
    redirect(`${base(alternantId)}?error=${encodeURIComponent(msg)}`);
  }

  const rythme = parseRythme(alternant.rythmeAlternance);
  if (chevaucheRythme(rythme, parsed.data)) {
    redirect(
      `${base(alternantId)}?error=${encodeURIComponent(
        "Cette période en chevauche une autre.",
      )}`,
    );
  }

  const next = [...rythme, parsed.data].sort((a, b) => a.debut.localeCompare(b.debut));
  await prisma.alternant.update({
    where: { id: alternantId },
    data: { rythmeAlternance: next },
  });

  revalidatePath(base(alternantId));
  redirect(base(alternantId));
}

/**
 * Ajoute une mission au Kanban de l'alternant (statut « À faire »).
 * Utilisé notamment par l'ajout rapide d'une mission suggérée par l'IA.
 */
export async function ajouterMission(
  alternantId: string,
  formData: FormData,
): Promise<void> {
  const alternant = await assertOwned(alternantId);

  const titre = String(formData.get("titre") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const competenceIdRaw = String(formData.get("competenceId") ?? "").trim();
  const suggereParIA = String(formData.get("suggereParIA") ?? "") === "1";

  if (!titre || !description) {
    redirect(
      `${base(alternantId)}?error=${encodeURIComponent(
        "Titre et description requis.",
      )}`,
    );
  }

  // La compétence, si fournie, doit appartenir au référentiel de l'alternant.
  let competenceId: string | null = null;
  if (competenceIdRaw) {
    const comp = await prisma.competence.findUnique({
      where: { id: competenceIdRaw },
    });
    if (comp && comp.referentielId === alternant.diplomeId) {
      competenceId = comp.id;
    }
  }

  // Échéance optionnelle (AAAA-MM-JJ).
  const echeanceRaw = String(formData.get("echeance") ?? "").trim();
  const echeance = /^\d{4}-\d{2}-\d{2}$/.test(echeanceRaw)
    ? new Date(`${echeanceRaw}T00:00:00.000Z`)
    : null;

  await prisma.mission.create({
    data: {
      titre,
      description,
      statut: StatutMission.A_FAIRE,
      alternantId,
      competenceId,
      suggereParIA,
      echeance,
    },
  });

  revalidatePath(base(alternantId));
  redirect(base(alternantId));
}

/** Vérifie qu'une mission appartient à un alternant suivi par le tuteur courant. */
async function assertMissionOwned(missionId: string) {
  const user = await requireRole(["TUTEUR"]);
  const mission = await prisma.mission.findUnique({
    where: { id: missionId },
    include: { alternant: { select: { id: true, tuteurId: true } } },
  });
  if (!mission || mission.alternant.tuteurId !== user.entityId) {
    redirect("/tuteur");
  }
  return mission;
}

/** Déplace une mission dans une autre colonne du Kanban. */
export async function changerStatutMission(
  missionId: string,
  statut: StatutMission,
): Promise<void> {
  const mission = await assertMissionOwned(missionId);
  await prisma.mission.update({ where: { id: missionId }, data: { statut } });
  revalidatePath(base(mission.alternant.id));
  redirect(base(mission.alternant.id));
}

/** Supprime une mission du Kanban. */
export async function supprimerMission(missionId: string): Promise<void> {
  const mission = await assertMissionOwned(missionId);
  await prisma.mission.delete({ where: { id: missionId } });
  revalidatePath(base(mission.alternant.id));
  redirect(base(mission.alternant.id));
}

/** Valide (en 1 clic) le bilan hebdomadaire d'un alternant suivi. */
export async function validerBilan(bilanId: string): Promise<void> {
  const user = await requireRole(["TUTEUR"]);
  const bilan = await prisma.bilanHebdo.findUnique({
    where: { id: bilanId },
    include: { alternant: { select: { id: true, tuteurId: true } } },
  });
  if (!bilan || bilan.alternant.tuteurId !== user.entityId) {
    redirect("/tuteur");
  }
  await prisma.bilanHebdo.update({
    where: { id: bilanId },
    data: { valideParTuteur: true },
  });
  revalidatePath(base(bilan.alternant.id));
  redirect(base(bilan.alternant.id));
}

/** Supprime la période à l'index donné. */
export async function supprimerPeriode(
  alternantId: string,
  index: number,
): Promise<void> {
  const alternant = await assertOwned(alternantId);

  const rythme = parseRythme(alternant.rythmeAlternance);
  const next = rythme.filter((_, i) => i !== index);
  await prisma.alternant.update({
    where: { id: alternantId },
    data: { rythmeAlternance: next },
  });

  revalidatePath(base(alternantId));
  redirect(base(alternantId));
}

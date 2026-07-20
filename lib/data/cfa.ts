import { prisma } from "@/lib/prisma";
import { risqueDepuisPrisma } from "@/lib/data/risque";
import type { Risque } from "@/lib/risque";

export interface LigneSyntheseCfa {
  id: string;
  nom: string;
  diplome: string;
  entreprise: string;
  tuteur: string;
  /** Date (ISO) du dernier bilan transmis, ou null. */
  dernierBilan: string | null;
  risque: Risque;
}

/** Nom du CFA (null si introuvable). */
export async function getCfaNom(cfaId: string): Promise<string | null> {
  const cfa = await prisma.cfa.findUnique({
    where: { id: cfaId },
    select: { nom: true },
  });
  return cfa?.nom ?? null;
}

/**
 * Synthèse (lecture seule) des alternants suivis par un CFA : tous ceux dont
 * le diplôme est rattaché à ce CFA, toutes entreprises confondues, avec leur
 * risque de décrochage. Une seule requête (missions + bilans inclus).
 */
export async function getSyntheseCfa(
  cfaId: string,
  todayIso: string,
): Promise<LigneSyntheseCfa[]> {
  const alternants = await prisma.alternant.findMany({
    where: { diplome: { cfaId } },
    select: {
      id: true,
      nom: true,
      diplome: { select: { nom: true } },
      organisation: { select: { nom: true } },
      tuteur: { select: { nom: true } },
      missions: { select: { statut: true, echeance: true } },
      bilans: {
        select: { semaine: true, valideParTuteur: true, difficultes: true },
        orderBy: { semaine: "desc" },
      },
    },
    orderBy: { nom: "asc" },
  });

  return alternants.map((a) => ({
    id: a.id,
    nom: a.nom,
    diplome: a.diplome.nom,
    entreprise: a.organisation.nom,
    tuteur: a.tuteur.nom,
    dernierBilan: a.bilans[0]?.semaine.toISOString().slice(0, 10) ?? null,
    risque: risqueDepuisPrisma(a.missions, a.bilans, todayIso),
  }));
}

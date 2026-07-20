import { prisma } from "@/lib/prisma";
import {
  calculerRisque,
  type BilanRisque,
  type MissionRisque,
  type Risque,
} from "@/lib/risque";

/** Convertit une date en ISO « AAAA-MM-JJ » (UTC). */
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function versMissionRisque(m: {
  statut: MissionRisque["statut"];
  echeance: Date | null;
}): MissionRisque {
  return { statut: m.statut, echeance: m.echeance ? iso(m.echeance) : null };
}

function versBilanRisque(b: {
  semaine: Date;
  valideParTuteur: boolean;
  difficultes: string;
}): BilanRisque {
  return {
    semaine: iso(b.semaine),
    valideParTuteur: b.valideParTuteur,
    difficultes: b.difficultes,
  };
}

/** Calcule le risque à partir de missions/bilans au format Prisma. */
export function risqueDepuisPrisma(
  missions: { statut: MissionRisque["statut"]; echeance: Date | null }[],
  bilans: { semaine: Date; valideParTuteur: boolean; difficultes: string }[],
  todayIso: string,
): Risque {
  return calculerRisque(
    missions.map(versMissionRisque),
    bilans.map(versBilanRisque),
    todayIso,
  );
}

/** Risque d'un alternant précis (missions + bilans chargés à la volée). */
export async function risqueAlternant(
  alternantId: string,
  todayIso: string,
): Promise<Risque> {
  const [missions, bilans] = await Promise.all([
    prisma.mission.findMany({
      where: { alternantId },
      select: { statut: true, echeance: true },
    }),
    prisma.bilanHebdo.findMany({
      where: { alternantId },
      select: { semaine: true, valideParTuteur: true, difficultes: true },
    }),
  ]);
  return calculerRisque(
    missions.map(versMissionRisque),
    bilans.map(versBilanRisque),
    todayIso,
  );
}

/**
 * Risque de tous les alternants d'un tuteur, indexé par identifiant.
 * Une seule requête (missions + bilans inclus) pour éviter le N+1.
 */
export async function risquesForTuteur(
  tuteurId: string,
  todayIso: string,
): Promise<Map<string, Risque>> {
  const alternants = await prisma.alternant.findMany({
    where: { tuteurId },
    select: {
      id: true,
      missions: { select: { statut: true, echeance: true } },
      bilans: { select: { semaine: true, valideParTuteur: true, difficultes: true } },
    },
  });

  const map = new Map<string, Risque>();
  for (const a of alternants) {
    map.set(a.id, risqueDepuisPrisma(a.missions, a.bilans, todayIso));
  }
  return map;
}

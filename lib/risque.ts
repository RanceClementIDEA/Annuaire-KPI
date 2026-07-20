/**
 * Score (pur) de risque de décrochage d'un alternant.
 *
 * Heuristique déterministe et explicable (0-100) combinant trois signaux
 * observables : missions en retard, absence de bilans récents, difficultés
 * répétées. Aucune dépendance à une IA : le score se calcule hors-ligne et
 * sert de repère au tuteur (« à surveiller »), pas de verdict automatique.
 *
 * Toutes les dates sont au format ISO « AAAA-MM-JJ » (comparaison
 * lexicographique = comparaison chronologique).
 */

export type NiveauRisque = "FAIBLE" | "MODERE" | "ELEVE";

/** Vue minimale d'une mission pour le calcul (découplée de Prisma). */
export interface MissionRisque {
  statut: "A_FAIRE" | "EN_COURS" | "VALIDE";
  echeance: string | null;
}

/** Vue minimale d'un bilan pour le calcul (découplée de Prisma). */
export interface BilanRisque {
  /** Lundi (ISO) de la semaine du bilan. */
  semaine: string;
  valideParTuteur: boolean;
  difficultes: string;
}

export interface Risque {
  score: number; // 0-100
  niveau: NiveauRisque;
  facteurs: string[]; // explications lisibles, dans l'ordre de contribution
}

/** Seuils de bascule entre niveaux. */
export const SEUIL_MODERE = 30;
export const SEUIL_ELEVE = 60;

/** Nombre de jours entre deux dates ISO (b − a). Négatif si b précède a. */
function joursEntre(aIso: string, bIso: string): number {
  const a = Date.parse(`${aIso}T00:00:00Z`);
  const b = Date.parse(`${bIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

function niveauPour(score: number): NiveauRisque {
  if (score >= SEUIL_ELEVE) return "ELEVE";
  if (score >= SEUIL_MODERE) return "MODERE";
  return "FAIBLE";
}

/**
 * Calcule le risque de décrochage à partir des missions et des bilans.
 * `bilans` peut être dans n'importe quel ordre : la fonction se base sur le
 * bilan le plus récent.
 */
export function calculerRisque(
  missions: MissionRisque[],
  bilans: BilanRisque[],
  todayIso: string,
): Risque {
  let score = 0;
  const facteurs: string[] = [];

  // 1) Missions en retard (échéance dépassée et non validée).
  const retards = missions.filter(
    (m) => m.statut !== "VALIDE" && m.echeance !== null && m.echeance < todayIso,
  ).length;
  if (retards > 0) {
    score += Math.min(40, retards * 15);
    facteurs.push(
      retards === 1 ? "1 mission en retard" : `${retards} missions en retard`,
    );
  }

  // 2) Suivi hebdomadaire : bilan récent manquant.
  const dernier = bilans.reduce<BilanRisque | null>(
    (acc, b) => (acc === null || b.semaine > acc.semaine ? b : acc),
    null,
  );
  if (dernier === null) {
    score += 25;
    facteurs.push("Aucun bilan hebdomadaire transmis");
  } else {
    const jours = joursEntre(dernier.semaine, todayIso);
    if (jours > 14) {
      score += 20;
      facteurs.push("Aucun bilan depuis plus de deux semaines");
    } else if (jours > 7) {
      score += 10;
      facteurs.push("Bilan de la semaine non transmis");
    }
  }

  // 3) Difficultés signalées de façon répétée (bilans récents).
  const recents = [...bilans]
    .sort((a, b) => b.semaine.localeCompare(a.semaine))
    .slice(0, 4);
  const avecDifficultes = recents.filter(
    (b) => b.difficultes.trim().length >= 10,
  ).length;
  if (avecDifficultes >= 2) {
    score += Math.min(25, avecDifficultes * 10);
    facteurs.push("Difficultés signalées sur plusieurs bilans");
  }

  score = Math.max(0, Math.min(100, score));
  return { score, niveau: niveauPour(score), facteurs };
}

/** Libellé lisible d'un niveau de risque. */
export function libelleNiveau(niveau: NiveauRisque): string {
  switch (niveau) {
    case "ELEVE":
      return "Risque élevé";
    case "MODERE":
      return "À surveiller";
    default:
      return "Bon suivi";
  }
}

import { describe, expect, it } from "vitest";
import {
  calculerRisque,
  libelleNiveau,
  SEUIL_ELEVE,
  SEUIL_MODERE,
  type BilanRisque,
  type MissionRisque,
} from "@/lib/risque";

const TODAY = "2026-07-20"; // un lundi

function bilan(semaine: string, over: Partial<BilanRisque> = {}): BilanRisque {
  return { semaine, valideParTuteur: true, difficultes: "", ...over };
}
function mission(over: Partial<MissionRisque> = {}): MissionRisque {
  return { statut: "A_FAIRE", echeance: null, ...over };
}

describe("calculerRisque", () => {
  it("est au plus bas quand tout est à jour", () => {
    const r = calculerRisque(
      [mission({ statut: "VALIDE", echeance: "2026-07-01" })],
      [bilan("2026-07-20")],
      TODAY,
    );
    expect(r.score).toBe(0);
    expect(r.niveau).toBe("FAIBLE");
    expect(r.facteurs).toEqual([]);
  });

  it("compte les missions en retard non validées, plafonnées à 40", () => {
    const enRetard = mission({ statut: "EN_COURS", echeance: "2026-07-10" });
    const r = calculerRisque(
      [enRetard, enRetard, enRetard, enRetard],
      [bilan("2026-07-20")],
      TODAY,
    );
    expect(r.score).toBe(40); // 4 × 15 plafonné à 40
    expect(r.facteurs[0]).toBe("4 missions en retard");
  });

  it("ignore les missions en retard mais validées", () => {
    const r = calculerRisque(
      [mission({ statut: "VALIDE", echeance: "2026-01-01" })],
      [bilan("2026-07-20")],
      TODAY,
    );
    expect(r.score).toBe(0);
  });

  it("pénalise l'absence totale de bilan", () => {
    const r = calculerRisque([], [], TODAY);
    expect(r.score).toBe(25);
    expect(r.facteurs).toContain("Aucun bilan hebdomadaire transmis");
  });

  it("distingue bilan manquant d'une semaine vs de plus de deux semaines", () => {
    const uneSemaine = calculerRisque([], [bilan("2026-07-10")], TODAY);
    expect(uneSemaine.facteurs).toContain("Bilan de la semaine non transmis");
    expect(uneSemaine.score).toBe(10);

    const deuxSemaines = calculerRisque([], [bilan("2026-07-01")], TODAY);
    expect(deuxSemaines.facteurs).toContain(
      "Aucun bilan depuis plus de deux semaines",
    );
    expect(deuxSemaines.score).toBe(20);
  });

  it("détecte des difficultés répétées sur les bilans récents", () => {
    const dur = "Beaucoup de mal avec la comptabilité analytique cette semaine.";
    const r = calculerRisque(
      [],
      [
        bilan("2026-07-20", { difficultes: dur }),
        bilan("2026-07-13", { difficultes: dur }),
      ],
      TODAY,
    );
    expect(r.facteurs).toContain("Difficultés signalées sur plusieurs bilans");
    expect(r.score).toBe(20); // 2 × 10
  });

  it("bascule en niveau ÉLEVÉ quand les signaux s'accumulent", () => {
    const dur = "Difficultés importantes et récurrentes sur les missions.";
    const r = calculerRisque(
      [
        mission({ statut: "A_FAIRE", echeance: "2026-07-01" }),
        mission({ statut: "EN_COURS", echeance: "2026-07-05" }),
      ],
      [
        bilan("2026-07-01", { difficultes: dur }),
        bilan("2026-06-24", { difficultes: dur }),
      ],
      TODAY,
    );
    // 30 (retards) + 20 (bilan > 2 sem.) + 20 (difficultés) = 70
    expect(r.score).toBeGreaterThanOrEqual(SEUIL_ELEVE);
    expect(r.niveau).toBe("ELEVE");
  });

  it("ne dépasse jamais 100", () => {
    const dur = "x".repeat(50);
    const retard = mission({ statut: "A_FAIRE", echeance: "2026-01-01" });
    const r = calculerRisque(
      Array.from({ length: 10 }, () => retard),
      [
        bilan("2026-01-01", { difficultes: dur }),
        bilan("2026-01-08", { difficultes: dur }),
        bilan("2026-01-15", { difficultes: dur }),
      ],
      TODAY,
    );
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe("libelleNiveau / seuils", () => {
  it("expose des seuils cohérents", () => {
    expect(SEUIL_MODERE).toBeLessThan(SEUIL_ELEVE);
  });
  it("traduit chaque niveau", () => {
    expect(libelleNiveau("FAIBLE")).toBe("Bon suivi");
    expect(libelleNiveau("MODERE")).toBe("À surveiller");
    expect(libelleNiveau("ELEVE")).toBe("Risque élevé");
  });
});

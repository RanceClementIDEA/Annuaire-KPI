import { describe, expect, it } from "vitest";
import {
  chevaucheRythme,
  grilleMois,
  moisCouverts,
  nbJours,
  parseRythme,
  periodesSeChevauchent,
  typeForDate,
  type Rythme,
} from "@/lib/rythme";

const rythme: Rythme = [
  { debut: "2026-09-01", fin: "2026-09-14", type: "ENTREPRISE" },
  { debut: "2026-09-15", fin: "2026-09-19", type: "ECOLE" },
];

describe("parseRythme", () => {
  it("renvoie [] pour une donnée absente ou invalide", () => {
    expect(parseRythme(null)).toEqual([]);
    expect(parseRythme(undefined)).toEqual([]);
    expect(parseRythme("nope")).toEqual([]);
    expect(parseRythme([{ debut: "2026-13-40", fin: "x", type: "ECOLE" }])).toEqual([]);
    expect(parseRythme([{ debut: "2026-09-10", fin: "2026-09-01", type: "ECOLE" }])).toEqual([]);
  });

  it("trie les périodes par date de début", () => {
    const out = parseRythme([
      { debut: "2026-09-15", fin: "2026-09-19", type: "ECOLE" },
      { debut: "2026-09-01", fin: "2026-09-14", type: "ENTREPRISE" },
    ]);
    expect(out.map((p) => p.debut)).toEqual(["2026-09-01", "2026-09-15"]);
  });
});

describe("typeForDate", () => {
  it("retourne le type sur les bornes incluses", () => {
    expect(typeForDate(rythme, "2026-09-01")).toBe("ENTREPRISE");
    expect(typeForDate(rythme, "2026-09-14")).toBe("ENTREPRISE");
    expect(typeForDate(rythme, "2026-09-15")).toBe("ECOLE");
    expect(typeForDate(rythme, "2026-09-19")).toBe("ECOLE");
  });
  it("retourne null hors période", () => {
    expect(typeForDate(rythme, "2026-08-31")).toBeNull();
    expect(typeForDate(rythme, "2026-09-20")).toBeNull();
  });
});

describe("chevauchement", () => {
  it("détecte le chevauchement bornes incluses", () => {
    expect(
      periodesSeChevauchent(
        { debut: "2026-09-01", fin: "2026-09-10", type: "ECOLE" },
        { debut: "2026-09-10", fin: "2026-09-12", type: "ENTREPRISE" },
      ),
    ).toBe(true);
    expect(
      periodesSeChevauchent(
        { debut: "2026-09-01", fin: "2026-09-10", type: "ECOLE" },
        { debut: "2026-09-11", fin: "2026-09-12", type: "ENTREPRISE" },
      ),
    ).toBe(false);
  });
  it("chevaucheRythme repère un conflit avec le rythme existant", () => {
    expect(chevaucheRythme(rythme, { debut: "2026-09-10", fin: "2026-09-16", type: "ECOLE" })).toBe(true);
    expect(chevaucheRythme(rythme, { debut: "2026-09-20", fin: "2026-09-25", type: "ECOLE" })).toBe(false);
  });
});

describe("nbJours", () => {
  it("compte les bornes incluses", () => {
    expect(nbJours({ debut: "2026-09-01", fin: "2026-09-14", type: "ENTREPRISE" })).toBe(14);
    expect(nbJours({ debut: "2026-09-01", fin: "2026-09-01", type: "ECOLE" })).toBe(1);
  });
});

describe("moisCouverts", () => {
  it("couvre du premier au dernier mois des périodes", () => {
    const spanning: Rythme = [
      { debut: "2026-09-20", fin: "2026-11-05", type: "ENTREPRISE" },
    ];
    expect(moisCouverts(spanning, "2026-07-16")).toEqual([
      { year: 2026, month0: 8 },
      { year: 2026, month0: 9 },
      { year: 2026, month0: 10 },
    ]);
  });
  it("retombe sur le mois de référence si aucun rythme", () => {
    expect(moisCouverts([], "2026-07-16")).toEqual([{ year: 2026, month0: 6 }]);
  });
});

describe("grilleMois", () => {
  it("septembre 2026 commence un mardi et compte 30 jours", () => {
    const weeks = grilleMois(2026, 8); // septembre
    // 1er sept. 2026 = mardi → une case vide (lundi) avant.
    expect(weeks[0][0]).toBeNull();
    expect(weeks[0][1]).toBe("2026-09-01");
    const flat = weeks.flat().filter(Boolean);
    expect(flat).toHaveLength(30);
    expect(flat[29]).toBe("2026-09-30");
    // Toutes les semaines ont 7 cellules.
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
});

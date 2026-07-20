import { describe, expect, it } from "vitest";
import { dateLimite, estEnRetard, messageAlerte, SEUIL_JOURS } from "@/lib/alertes";

describe("dateLimite", () => {
  it("ajoute le seuil de jours (défaut 3) en UTC", () => {
    const now = new Date("2026-07-16T09:00:00.000Z");
    expect(dateLimite(now).toISOString().slice(0, 10)).toBe("2026-07-19");
    expect(dateLimite(now, 0).toISOString().slice(0, 10)).toBe("2026-07-16");
    expect(SEUIL_JOURS).toBe(3);
  });
  it("franchit correctement une fin de mois", () => {
    const now = new Date("2026-01-30T00:00:00.000Z");
    expect(dateLimite(now, 3).toISOString().slice(0, 10)).toBe("2026-02-02");
  });
});

describe("estEnRetard", () => {
  it("compare les dates ISO lexicographiquement", () => {
    expect(estEnRetard("2026-07-15", "2026-07-16")).toBe(true);
    expect(estEnRetard("2026-07-16", "2026-07-16")).toBe(false);
    expect(estEnRetard("2026-07-17", "2026-07-16")).toBe(false);
  });
});

describe("messageAlerte", () => {
  it("distingue échéance proche et dépassée", () => {
    expect(messageAlerte("Poser un plan", "Léa Moreau", "2026-07-18", false)).toContain(
      "Échéance proche",
    );
    expect(messageAlerte("Poser un plan", "Léa Moreau", "2026-07-10", true)).toContain(
      "Échéance dépassée",
    );
  });
  it("est déterministe (clé de déduplication stable)", () => {
    const a = messageAlerte("X", "Y", "2026-07-18", false);
    const b = messageAlerte("X", "Y", "2026-07-18", false);
    expect(a).toBe(b);
  });
});

import { describe, expect, it } from "vitest";
import { laisseraitSansAdmin, type MembreMinimal } from "@/lib/membres";

const membres: MembreMinimal[] = [
  { id: "a1", role: "ADMIN" },
  { id: "a2", role: "ADMIN" },
  { id: "t1", role: "TUTEUR" },
];

describe("laisseraitSansAdmin", () => {
  it("bloque le retrait/rétrogradation du dernier admin", () => {
    const solo: MembreMinimal[] = [
      { id: "a1", role: "ADMIN" },
      { id: "t1", role: "TUTEUR" },
    ];
    expect(laisseraitSansAdmin(solo, "a1")).toBe(true);
  });

  it("autorise quand un autre admin subsiste", () => {
    expect(laisseraitSansAdmin(membres, "a1")).toBe(false);
    expect(laisseraitSansAdmin(membres, "a2")).toBe(false);
  });

  it("n'est jamais bloquant pour un tuteur (ne touche pas les admins)", () => {
    expect(laisseraitSansAdmin(membres, "t1")).toBe(false);
    const solo: MembreMinimal[] = [
      { id: "a1", role: "ADMIN" },
      { id: "t1", role: "TUTEUR" },
    ];
    expect(laisseraitSansAdmin(solo, "t1")).toBe(false);
  });

  it("renvoie false si la cible est inconnue", () => {
    expect(laisseraitSansAdmin(membres, "inconnu")).toBe(false);
  });
});

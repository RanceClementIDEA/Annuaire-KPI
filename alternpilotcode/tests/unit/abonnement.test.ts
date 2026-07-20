import { describe, expect, it } from "vitest";
import {
  LIMITE_GRATUITE,
  peutAjouterAlternant,
  placesGratuitesRestantes,
} from "@/lib/abonnement";

describe("peutAjouterAlternant", () => {
  it("autorise le 1er alternant en gratuit, bloque le 2e", () => {
    expect(LIMITE_GRATUITE).toBe(1);
    expect(peutAjouterAlternant(0, false)).toBe(true);
    expect(peutAjouterAlternant(1, false)).toBe(false);
    expect(peutAjouterAlternant(5, false)).toBe(false);
  });
  it("autorise au-delà si l'abonnement est actif", () => {
    expect(peutAjouterAlternant(1, true)).toBe(true);
    expect(peutAjouterAlternant(42, true)).toBe(true);
  });
});

describe("placesGratuitesRestantes", () => {
  it("décompte les places gratuites, jamais négatif", () => {
    expect(placesGratuitesRestantes(0)).toBe(1);
    expect(placesGratuitesRestantes(1)).toBe(0);
    expect(placesGratuitesRestantes(3)).toBe(0);
  });
});

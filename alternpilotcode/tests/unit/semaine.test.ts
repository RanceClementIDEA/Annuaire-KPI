import { describe, expect, it } from "vitest";
import { libelleSemaine, lundiDeLaSemaine } from "@/lib/semaine";

describe("lundiDeLaSemaine", () => {
  it("renvoie le lundi de la semaine (UTC)", () => {
    // 2026-07-16 est un jeudi → lundi = 2026-07-13.
    expect(lundiDeLaSemaine(new Date("2026-07-16T09:30:00Z")).toISOString()).toBe(
      "2026-07-13T00:00:00.000Z",
    );
  });
  it("un lundi renvoie lui-même à minuit", () => {
    expect(lundiDeLaSemaine(new Date("2026-07-13T23:59:00Z")).toISOString()).toBe(
      "2026-07-13T00:00:00.000Z",
    );
  });
  it("un dimanche renvoie le lundi précédent", () => {
    // 2026-07-19 est un dimanche → lundi = 2026-07-13.
    expect(lundiDeLaSemaine(new Date("2026-07-19T12:00:00Z")).toISOString()).toBe(
      "2026-07-13T00:00:00.000Z",
    );
  });
});

describe("libelleSemaine", () => {
  it("formate le lundi", () => {
    expect(libelleSemaine(new Date("2026-07-13T00:00:00Z"))).toBe(
      "semaine du 13/07/2026",
    );
  });
});

import { describe, expect, it } from "vitest";
import { genererICS, type EvenementICS } from "@/lib/ics";

const STAMP = "20260720T090000Z";

describe("genererICS", () => {
  it("produit un document VCALENDAR bien formé", () => {
    const ics = genererICS("Alternance", [], STAMP);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//AlternPilot//Calendrier alternance//FR");
    // Lignes séparées par CRLF (RFC 5545).
    expect(ics).toContain("\r\n");
  });

  it("rend un événement journée entière avec DTEND exclusif", () => {
    const e: EvenementICS = {
      uid: "periode-1",
      titre: "Entreprise",
      debut: "2026-09-01",
      fin: "2026-09-05",
    };
    const ics = genererICS("Alternance", [e], STAMP);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:periode-1@alternpilot");
    expect(ics).toContain(`DTSTAMP:${STAMP}`);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260901");
    // fin incluse le 5 → DTEND exclusif le 6
    expect(ics).toContain("DTEND;VALUE=DATE:20260906");
    expect(ics).toContain("SUMMARY:Entreprise");
  });

  it("traite un événement d'un seul jour (fin = début + 1)", () => {
    const ics = genererICS(
      "Échéances",
      [{ uid: "m1", titre: "Rendre le rapport", debut: "2026-07-31" }],
      STAMP,
    );
    expect(ics).toContain("DTSTART;VALUE=DATE:20260731");
    expect(ics).toContain("DTEND;VALUE=DATE:20260801"); // franchit la fin de mois
  });

  it("échappe les caractères spéciaux des valeurs texte", () => {
    const ics = genererICS(
      "Cal",
      [
        {
          uid: "m2",
          titre: "Livrer A, B; puis C",
          debut: "2026-07-31",
          description: "Ligne 1\nLigne 2",
        },
      ],
      STAMP,
    );
    expect(ics).toContain("SUMMARY:Livrer A\\, B\\; puis C");
    expect(ics).toContain("DESCRIPTION:Ligne 1\\nLigne 2");
  });

  it("n'ajoute pas de DESCRIPTION quand elle est absente", () => {
    const ics = genererICS(
      "Cal",
      [{ uid: "m3", titre: "Sans description", debut: "2026-07-31" }],
      STAMP,
    );
    expect(ics).not.toContain("DESCRIPTION:");
  });
});

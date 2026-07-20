import { describe, expect, it } from "vitest";
import { construireEmailAlerte, escapeHtml } from "@/lib/notifications/format";

describe("escapeHtml", () => {
  it("échappe les caractères sensibles", () => {
    expect(escapeHtml('a<b>&"\'')).toBe("a&lt;b&gt;&amp;&quot;&#39;");
  });
});

describe("construireEmailAlerte", () => {
  const contenu = "Échéance dépassée pour Léa Moreau : « Poser un plan » (prévue le 2026-07-10).";
  const email = construireEmailAlerte(contenu);

  it("a un sujet, un corps texte et un corps HTML", () => {
    expect(email.subject).toContain("AlternPilot");
    expect(email.text).toContain(contenu);
    expect(email.html).toContain("AlternPilot");
  });
  it("échappe le contenu dans le HTML (pas d'injection)", () => {
    const evil = construireEmailAlerte('<script>alert(1)</script>');
    expect(evil.html).not.toContain("<script>");
    expect(evil.html).toContain("&lt;script&gt;");
  });
});

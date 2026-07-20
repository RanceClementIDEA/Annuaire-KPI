import Anthropic from "@anthropic-ai/sdk";

/**
 * Résumé IA d'un bilan hebdomadaire : reformule les notes brutes de l'alternant
 * en un paragraphe professionnel, prêt à coller dans le livret d'apprentissage.
 * Repli statique si l'IA est indisponible (règle de la roadmap).
 */

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

export interface BilanInput {
  reussites: string;
  difficultes: string;
  commentaire?: string | null;
}

export interface ResumeResult {
  resume: string;
  source: "ia" | "fallback";
}

const SYSTEME =
  "Tu reformules le bilan hebdomadaire d'un alternant en un paragraphe " +
  "professionnel, factuel et bienveillant, prêt à être copié dans le livret " +
  "d'apprentissage. Écris à la 3e personne, en français correct, 4 à 6 phrases, " +
  "sans liste ni titre.";

function fallback(input: BilanInput): string {
  const parts: string[] = [];
  if (input.reussites.trim()) {
    parts.push(`Réussites de la semaine : ${input.reussites.trim()}`);
  }
  if (input.difficultes.trim()) {
    parts.push(`Difficultés rencontrées : ${input.difficultes.trim()}`);
  }
  if (input.commentaire?.trim()) {
    parts.push(`Remarques : ${input.commentaire.trim()}`);
  }
  return parts.join(" ") || "Aucun élément renseigné pour cette semaine.";
}

export async function resumerBilan(input: BilanInput): Promise<ResumeResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { resume: fallback(input), source: "fallback" };
  }

  try {
    const client = new Anthropic();
    const prompt = [
      "Reformule ce bilan hebdomadaire en un court paragraphe professionnel",
      "pour le livret d'apprentissage :",
      "",
      `Réussites : ${input.reussites || "(non renseigné)"}`,
      `Difficultés : ${input.difficultes || "(non renseigné)"}`,
      `Commentaire libre : ${input.commentaire || "(non renseigné)"}`,
    ].join("\n");

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEME,
      messages: [{ role: "user", content: prompt }],
    });

    const texte = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!texte) return { resume: fallback(input), source: "fallback" };
    return { resume: texte, source: "ia" };
  } catch {
    return { resume: fallback(input), source: "fallback" };
  }
}

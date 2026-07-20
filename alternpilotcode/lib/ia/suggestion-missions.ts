import Anthropic from "@anthropic-ai/sdk";

/**
 * Suggestion de missions par IA (Claude), avec repli statique.
 *
 * Règle d'or de la roadmap : chaque route IA doit avoir un fallback simple
 * (règles statiques) pour ne jamais bloquer l'utilisateur si l'appel échoue
 * (clé absente, erreur réseau, réponse invalide…).
 *
 * Modèle : Claude Opus 4.8 par défaut ; surchargeable via ANTHROPIC_MODEL
 * (ex. "claude-haiku-4-5" pour réduire le coût).
 */

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

export interface SuggestionContext {
  /** Secteur d'activité de l'organisation (ex. "Artisanat / Bois"). */
  metier: string | null;
  /** Intitulé du diplôme préparé (référentiel). */
  diplome: string;
  /** Compétences du référentiel, avec leur id (pour rattacher la mission). */
  competences: { id: string; intitule: string }[];
  /** Titres des missions déjà validées (pour proposer la suite logique). */
  missionsValidees: string[];
}

export interface Suggestion {
  titre: string;
  description: string;
  /** id d'une compétence du référentiel, ou null. */
  competenceId: string | null;
}

export interface SuggestionResult {
  suggestions: Suggestion[];
  source: "ia" | "fallback";
}

const SYSTEME =
  "Tu es un expert en pédagogie de l'alternance qui conseille un maître " +
  "d'apprentissage (tuteur) dans une TPE/PME. Tu proposes des missions " +
  "concrètes, réalistes et progressives, adaptées au métier et au référentiel " +
  "de l'alternant, en t'appuyant sur les missions déjà validées pour proposer " +
  "la suite logique.";

function construirePrompt(ctx: SuggestionContext): string {
  const comps = ctx.competences
    .map((c) => `- [${c.id}] ${c.intitule}`)
    .join("\n");
  const validees =
    ctx.missionsValidees.length > 0
      ? ctx.missionsValidees.map((m) => `- ${m}`).join("\n")
      : "(aucune pour l'instant)";

  return [
    `Diplôme préparé : ${ctx.diplome}`,
    `Métier / secteur : ${ctx.metier ?? "non précisé"}`,
    "",
    "Compétences du référentiel (id entre crochets) :",
    comps,
    "",
    "Missions déjà validées :",
    validees,
    "",
    "Propose 2 à 3 nouvelles missions adaptées, en français. Pour chaque mission,",
    'rattache-la à l\'id d\'une compétence de la liste ci-dessus (champ "competenceId"),',
    'ou "" si aucune ne convient.',
    "",
    "Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, de la forme :",
    '{"suggestions":[{"titre":"...","description":"...","competenceId":"..."}]}',
  ].join("\n");
}

/** Extrait et valide un tableau de suggestions depuis la réponse brute du modèle. */
function parseSuggestions(
  texte: string,
  competenceIds: Set<string>,
): Suggestion[] {
  const debut = texte.indexOf("{");
  const fin = texte.lastIndexOf("}");
  if (debut === -1 || fin === -1 || fin <= debut) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(texte.slice(debut, fin + 1));
  } catch {
    return [];
  }

  const brut = (parsed as { suggestions?: unknown })?.suggestions;
  if (!Array.isArray(brut)) return [];

  const out: Suggestion[] = [];
  for (const item of brut) {
    const titre = typeof item?.titre === "string" ? item.titre.trim() : "";
    const description =
      typeof item?.description === "string" ? item.description.trim() : "";
    if (!titre || !description) continue;
    const rawId = typeof item?.competenceId === "string" ? item.competenceId : "";
    const competenceId = competenceIds.has(rawId) ? rawId : null;
    out.push({ titre, description, competenceId });
  }
  return out.slice(0, 3);
}

/** Repli statique : une mission par compétence non encore couverte. */
function fallback(ctx: SuggestionContext): Suggestion[] {
  const dejaVues = ctx.missionsValidees.map((m) => m.toLowerCase());
  const restantes = ctx.competences.filter(
    (c) => !dejaVues.some((m) => m.includes(c.intitule.toLowerCase())),
  );
  const source = restantes.length > 0 ? restantes : ctx.competences;
  const suffixe = ctx.metier ? ` en ${ctx.metier}` : "";

  return source.slice(0, 3).map((c) => ({
    titre: `Mettre en pratique : ${c.intitule}`,
    description: `Confier à l'alternant une tâche concrète${suffixe} permettant de travailler la compétence « ${c.intitule} ».`,
    competenceId: c.id,
  }));
}

export async function suggererMissions(
  ctx: SuggestionContext,
): Promise<SuggestionResult> {
  const competenceIds = new Set(ctx.competences.map((c) => c.id));

  // Pas de clé API → repli immédiat (aucune tentative réseau).
  if (!process.env.ANTHROPIC_API_KEY) {
    return { suggestions: fallback(ctx), source: "fallback" };
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEME,
      messages: [{ role: "user", content: construirePrompt(ctx) }],
    });

    const texte = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const suggestions = parseSuggestions(texte, competenceIds);
    if (suggestions.length === 0) {
      return { suggestions: fallback(ctx), source: "fallback" };
    }
    return { suggestions, source: "ia" };
  } catch {
    // Erreur réseau / API / quota → repli statique.
    return { suggestions: fallback(ctx), source: "fallback" };
  }
}

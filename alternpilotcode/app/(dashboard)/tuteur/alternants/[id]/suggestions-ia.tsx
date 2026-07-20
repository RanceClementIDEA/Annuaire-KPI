"use client";

import { useState } from "react";
import type { Suggestion } from "@/lib/ia/suggestion-missions";
import { ajouterMission } from "./actions";

export function SuggestionsIA({ alternantId }: { alternantId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [source, setSource] = useState<"ia" | "fallback" | null>(null);

  async function generer() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ia/suggestion-missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alternantId }),
      });
      if (!res.ok) {
        setError("Impossible de générer des suggestions pour le moment.");
        setSuggestions(null);
        return;
      }
      const data = (await res.json()) as {
        suggestions: Suggestion[];
        source: "ia" | "fallback";
      };
      setSuggestions(data.suggestions);
      setSource(data.source);
    } catch {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">Suggestions IA</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Missions proposées à partir du référentiel et des missions validées.
          </p>
        </div>
        <button
          type="button"
          onClick={generer}
          disabled={loading}
          className="shrink-0 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "Génération…" : "Générer"}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {source === "fallback" && (
        <p className="mt-4 rounded-xl bg-accent px-3 py-2 text-xs text-accent-foreground">
          Suggestions générées par règles (IA indisponible). Renseignez
          ANTHROPIC_API_KEY pour des propositions contextualisées.
        </p>
      )}

      {suggestions && suggestions.length === 0 && !error && (
        <p className="mt-4 text-sm text-muted-foreground">Aucune suggestion.</p>
      )}

      {suggestions && suggestions.length > 0 && (
        <ul className="mt-4 space-y-3">
          {suggestions.map((s, i) => (
            <li key={i} className="rounded-xl border bg-background p-4">
              <div className="text-sm font-medium text-foreground">{s.titre}</div>
              <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
              <form action={ajouterMission.bind(null, alternantId)} className="mt-3">
                <input type="hidden" name="titre" value={s.titre} />
                <input type="hidden" name="description" value={s.description} />
                <input type="hidden" name="competenceId" value={s.competenceId ?? ""} />
                <input type="hidden" name="suggereParIA" value="1" />
                <button
                  type="submit"
                  className="rounded-lg border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                >
                  + Ajouter au Kanban
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Bouton « Générer le résumé IA » — appelle /api/ia/resume-bilan puis
 * rafraîchit la page pour afficher le résumé enregistré.
 */
export function GenererResume({
  bilanId,
  label = "Générer le résumé IA",
}: {
  bilanId: string;
  label?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generer() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ia/resume-bilan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bilanId }),
      });
      if (!res.ok) {
        setError("Génération impossible pour le moment.");
        return;
      }
      router.refresh();
    } catch {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={generer}
        disabled={loading}
        className="rounded-xl border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
      >
        {loading ? "Génération…" : label}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

"use client";

/** Déclenche l'impression du navigateur (→ « Enregistrer en PDF »). */
export function PrintButton({ label = "Imprimer / PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
    >
      {label}
    </button>
  );
}

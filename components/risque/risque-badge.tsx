import { libelleNiveau, type Risque } from "@/lib/risque";

const STYLES: Record<Risque["niveau"], string> = {
  FAIBLE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
  MODERE: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100",
  ELEVE: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200",
};

/** Pastille de niveau de risque (compacte, pour les listes/cartes). */
export function RisqueBadge({ risque }: { risque: Risque }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium ${STYLES[risque.niveau]}`}
      title={risque.facteurs.join(" · ") || "Aucun signal d'alerte"}
    >
      <span aria-hidden>●</span>
      {libelleNiveau(risque.niveau)}
    </span>
  );
}

/** Encart détaillé (score + facteurs) pour la page d'un alternant. */
export function RisqueCard({ risque }: { risque: Risque }) {
  const border =
    risque.niveau === "ELEVE"
      ? "border-red-200 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/10"
      : risque.niveau === "MODERE"
        ? "border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10"
        : "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10";

  return (
    <div className={`rounded-2xl border p-4 ${border}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">
          Risque de décrochage
        </span>
        <RisqueBadge risque={risque} />
      </div>
      {risque.facteurs.length > 0 ? (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-foreground">
          {risque.facteurs.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Aucun signal d&apos;alerte : missions et bilans à jour.
        </p>
      )}
    </div>
  );
}

import type { Mission, StatutMission } from "@prisma/client";
import { estEnRetard } from "@/lib/alertes";
import { changerStatutMission, supprimerMission } from "./actions";

const ORDRE: StatutMission[] = ["A_FAIRE", "EN_COURS", "VALIDE"];
const LABELS: Record<StatutMission, string> = {
  A_FAIRE: "À faire",
  EN_COURS: "En cours",
  VALIDE: "Validé",
};

function MoveButton({
  missionId,
  vers,
  children,
}: {
  missionId: string;
  vers: StatutMission;
  children: React.ReactNode;
}) {
  return (
    <form action={changerStatutMission.bind(null, missionId, vers)}>
      <button
        type="submit"
        className="rounded-md border px-1.5 py-0.5 text-xs text-foreground transition-colors hover:bg-accent"
      >
        {children}
      </button>
    </form>
  );
}

export function MissionBoard({
  missions,
  today,
}: {
  missions: Mission[];
  today: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {ORDRE.map((statut, colIdx) => {
        const cartes = missions.filter((m) => m.statut === statut);
        const precedent = ORDRE[colIdx - 1];
        const suivant = ORDRE[colIdx + 1];

        return (
          <div key={statut} className="rounded-2xl border bg-card p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-foreground">
                {LABELS[statut]}
              </span>
              <span className="text-xs text-muted-foreground">{cartes.length}</span>
            </div>

            <ul className="space-y-2">
              {cartes.map((m) => {
                const echeanceIso = m.echeance
                  ? m.echeance.toISOString().slice(0, 10)
                  : null;
                const retard =
                  echeanceIso != null &&
                  statut !== "VALIDE" &&
                  estEnRetard(echeanceIso, today);

                return (
                  <li key={m.id} className="rounded-xl border bg-background p-3">
                    <div className="flex items-start gap-1.5">
                      <span className="flex-1 text-sm text-foreground">{m.titre}</span>
                      {m.suggereParIA && (
                        <span
                          title="Suggérée par l'IA"
                          className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground"
                        >
                          IA
                        </span>
                      )}
                    </div>

                    {echeanceIso && (
                      <div
                        className={`mt-1 text-xs ${
                          retard ? "font-medium text-red-600" : "text-muted-foreground"
                        }`}
                      >
                        {retard ? "En retard : " : "Échéance : "}
                        {echeanceIso}
                      </div>
                    )}

                    <div className="mt-2 flex items-center gap-1.5">
                      {precedent && (
                        <MoveButton missionId={m.id} vers={precedent}>
                          ◀
                        </MoveButton>
                      )}
                      {suivant && (
                        <MoveButton missionId={m.id} vers={suivant}>
                          ▶
                        </MoveButton>
                      )}
                      <form
                        action={supprimerMission.bind(null, m.id)}
                        className="ml-auto"
                      >
                        <button
                          type="submit"
                          title="Supprimer"
                          className="rounded-md px-1.5 py-0.5 text-xs text-red-600 transition-colors hover:bg-red-50"
                        >
                          ✕
                        </button>
                      </form>
                    </div>
                  </li>
                );
              })}
              {cartes.length === 0 && (
                <li className="px-1 py-2 text-xs text-muted-foreground">—</li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

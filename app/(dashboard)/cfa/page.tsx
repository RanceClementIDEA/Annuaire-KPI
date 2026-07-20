import { requireRole } from "@/lib/auth";
import { getCfaNom, getSyntheseCfa } from "@/lib/data/cfa";
import { RisqueBadge } from "@/components/risque/risque-badge";

export const metadata = { title: "Espace CFA · AlternPilot" };

function formatIso(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default async function CfaPage() {
  const user = await requireRole(["CFA_REFERENT"]);

  if (!user.cfaId) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-xl font-semibold text-foreground">Espace CFA</h1>
        <div className="mt-4 rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          Votre compte n&apos;est rattaché à aucun centre de formation. Contactez
          l&apos;administrateur d&apos;AlternPilot pour associer votre CFA.
        </div>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const [cfaNom, lignes] = await Promise.all([
    getCfaNom(user.cfaId),
    getSyntheseCfa(user.cfaId, today),
  ]);

  const aSurveiller = lignes.filter((l) => l.risque.niveau !== "FAIBLE").length;

  const th = "px-3 py-2 text-left text-xs font-semibold text-muted-foreground";
  const td = "px-3 py-2.5 text-sm align-top";

  return (
    <div>
      <div>
        <h1 className="text-xl font-semibold text-foreground">Espace CFA</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {cfaNom ?? "Centre de formation"} · suivi en lecture seule des
          alternants
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Alternants suivis" valeur={lignes.length} />
        <Stat label="À surveiller" valeur={aSurveiller} accent={aSurveiller > 0} />
        <Stat
          label="Entreprises"
          valeur={new Set(lignes.map((l) => l.entreprise)).size}
        />
      </div>

      {lignes.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          Aucun alternant rattaché aux diplômes de ce CFA pour l&apos;instant.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border bg-card shadow-soft">
          <table className="w-full min-w-[640px] border-collapse">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className={th}>Alternant</th>
                <th className={th}>Diplôme</th>
                <th className={th}>Entreprise</th>
                <th className={th}>Tuteur</th>
                <th className={th}>Dernier bilan</th>
                <th className={th}>Suivi</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className={`${td} font-medium text-foreground`}>{l.nom}</td>
                  <td className={`${td} text-muted-foreground`}>{l.diplome}</td>
                  <td className={`${td} text-muted-foreground`}>{l.entreprise}</td>
                  <td className={`${td} text-muted-foreground`}>{l.tuteur}</td>
                  <td className={`${td} text-muted-foreground`}>
                    {l.dernierBilan ? formatIso(l.dernierBilan) : "—"}
                  </td>
                  <td className={td}>
                    <RisqueBadge risque={l.risque} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  valeur,
  accent = false,
}: {
  label: string;
  valeur: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-soft">
      <div
        className={`text-2xl font-bold ${accent ? "text-red-600" : "text-foreground"}`}
      >
        {valeur}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

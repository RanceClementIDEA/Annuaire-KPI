import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getReferentiels } from "@/lib/data/referentiels";

export const metadata = { title: "Référentiels · AlternPilot" };

export default async function ReferentielsPage() {
  await requireRole(["ADMIN"]);
  const referentiels = await getReferentiels();

  return (
    <div>
      <Link href="/admin" className="text-sm text-primary hover:underline">
        ← Administration
      </Link>

      <h1 className="mt-3 text-xl font-semibold text-foreground">
        Référentiels &amp; compétences
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Catalogue des diplômes pré-chargés et de leurs blocs de compétences.
      </p>

      {referentiels.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          Aucun référentiel. Lancez le seed (`npm run seed`).
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {referentiels.map((r) => (
            <div key={r.id} className="rounded-2xl border bg-card p-5 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-foreground">{r.nom}</div>
                <span className="text-xs text-muted-foreground">
                  {r._count.alternants} alternant
                  {r._count.alternants > 1 ? "s" : ""}
                </span>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2">
                {r.competences.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-lg bg-muted px-2.5 py-1 text-xs text-foreground"
                  >
                    {c.intitule}
                  </li>
                ))}
                {r.competences.length === 0 && (
                  <li className="text-xs text-muted-foreground">
                    Aucune compétence.
                  </li>
                )}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

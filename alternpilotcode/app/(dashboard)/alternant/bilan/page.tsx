import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { libelleSemaine, lundiDeLaSemaine } from "@/lib/semaine";
import { GenererResume } from "@/components/bilan/generer-resume";
import { enregistrerBilan } from "./actions";

export const metadata = { title: "Mon bilan · AlternPilot" };

export default async function BilanPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const user = await requireRole(["ALTERNANT"]);
  const semaine = lundiDeLaSemaine(new Date());
  const alternantId = user.entityId!;

  const [courant, historique] = await Promise.all([
    prisma.bilanHebdo.findUnique({
      where: { alternantId_semaine: { alternantId, semaine } },
    }),
    prisma.bilanHebdo.findMany({
      where: { alternantId, semaine: { lt: semaine } },
      orderBy: { semaine: "desc" },
      take: 5,
    }),
  ]);

  const verrouille = courant?.valideParTuteur ?? false;
  const areaClass =
    "w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-70";

  return (
    <div>
      <Link href="/alternant" className="text-sm text-primary hover:underline">
        ← Mon suivi
      </Link>

      <h1 className="mt-3 text-xl font-semibold text-foreground">
        Bilan hebdomadaire
      </h1>
      <p className="mt-1 text-sm text-muted-foreground capitalize">
        {libelleSemaine(semaine)}
        {verrouille && " · validé par le tuteur"}
      </p>

      {searchParams.error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {searchParams.error}
        </p>
      )}

      <form action={enregistrerBilan} className="mt-5 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">
            Réussites de la semaine
          </span>
          <textarea
            name="reussites"
            rows={3}
            disabled={verrouille}
            defaultValue={courant?.reussites ?? ""}
            className={areaClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">
            Difficultés rencontrées
          </span>
          <textarea
            name="difficultes"
            rows={3}
            disabled={verrouille}
            defaultValue={courant?.difficultes ?? ""}
            className={areaClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">
            Commentaire libre
          </span>
          <textarea
            name="commentaire"
            rows={2}
            disabled={verrouille}
            defaultValue={courant?.commentaire ?? ""}
            className={areaClass}
          />
        </label>
        {!verrouille && (
          <button
            type="submit"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Enregistrer mon bilan
          </button>
        )}
      </form>

      {courant && (
        <section className="mt-8 rounded-2xl border bg-card p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">
              Résumé professionnel (IA)
            </h2>
            <GenererResume
              bilanId={courant.id}
              label={courant.resumeIA ? "Régénérer" : "Générer le résumé IA"}
            />
          </div>
          {courant.resumeIA ? (
            <p className="mt-3 whitespace-pre-line text-sm text-foreground">
              {courant.resumeIA}
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Générez une reformulation professionnelle, prête à copier dans le
              livret d&apos;apprentissage.
            </p>
          )}
        </section>
      )}

      {historique.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Bilans précédents
          </h2>
          <ul className="space-y-2">
            {historique.map((b) => (
              <li
                key={b.id}
                className="rounded-xl border bg-card px-4 py-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="capitalize text-foreground">
                    {libelleSemaine(b.semaine)}
                  </span>
                  <span
                    className={`text-xs ${
                      b.valideParTuteur
                        ? "text-emerald-600"
                        : "text-muted-foreground"
                    }`}
                  >
                    {b.valideParTuteur ? "Validé" : "En attente"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

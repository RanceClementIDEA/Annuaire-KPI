import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getAlternantOwnedByTuteur } from "@/lib/data/alternants";
import { prisma } from "@/lib/prisma";
import { nbJours, parseRythme } from "@/lib/rythme";
import { libelleSemaine } from "@/lib/semaine";
import { CalendrierAlternance } from "@/components/calendrier/calendrier-alternance";
import { GenererResume } from "@/components/bilan/generer-resume";
import {
  ajouterMission,
  ajouterPeriode,
  supprimerPeriode,
  validerBilan,
} from "./actions";
import { MissionBoard } from "./mission-board";
import { SuggestionsIA } from "./suggestions-ia";

export const metadata = { title: "Calendrier de l'alternant · AlternPilot" };

export default async function AlternantDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const user = await requireRole(["TUTEUR"]);
  const alternant = await getAlternantOwnedByTuteur(params.id, user.entityId!);
  if (!alternant) notFound();

  const rythme = parseRythme(alternant.rythmeAlternance);
  const today = new Date().toISOString().slice(0, 10);

  const missions = await prisma.mission.findMany({
    where: { alternantId: alternant.id },
    orderBy: { createdAt: "asc" },
  });

  const bilans = await prisma.bilanHebdo.findMany({
    where: { alternantId: alternant.id },
    orderBy: { semaine: "desc" },
    take: 8,
  });

  const inputClass =
    "w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div>
      <Link href="/tuteur" className="text-sm text-primary hover:underline">
        ← Mes alternants
      </Link>

      <div className="mt-3">
        <h1 className="text-xl font-semibold text-foreground">{alternant.nom}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{alternant.diplome.nom}</p>
      </div>

      {searchParams.error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {searchParams.error}
        </p>
      )}

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Calendrier d&apos;alternance
        </h2>
        <CalendrierAlternance rythme={rythme} refIso={today} today={today} />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Liste des périodes */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Périodes saisies</h2>
          {rythme.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune période.</p>
          ) : (
            <ul className="space-y-2">
              {rythme.map((p, i) => (
                <li
                  key={`${p.debut}-${p.fin}`}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2.5"
                >
                  <div className="text-sm">
                    <span
                      className={`mr-2 inline-block rounded px-2 py-0.5 text-xs font-medium ${
                        p.type === "ECOLE"
                          ? "bg-sky-100 text-sky-900"
                          : "bg-emerald-100 text-emerald-900"
                      }`}
                    >
                      {p.type === "ECOLE" ? "École / CFA" : "Entreprise"}
                    </span>
                    <span className="text-foreground">
                      {p.debut} → {p.fin}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({nbJours(p)} j)
                    </span>
                  </div>
                  <form action={supprimerPeriode.bind(null, alternant.id, i)}>
                    <button
                      type="submit"
                      className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Supprimer
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Ajout d'une période */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Ajouter une période</h2>
          <form
            action={ajouterPeriode.bind(null, alternant.id)}
            className="space-y-3 rounded-2xl border bg-card p-4"
          >
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-foreground">Début</span>
              <input type="date" name="debut" required className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-foreground">Fin</span>
              <input type="date" name="fin" required className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-foreground">Type</span>
              <select name="type" required className={inputClass} defaultValue="ENTREPRISE">
                <option value="ENTREPRISE">Entreprise</option>
                <option value="ECOLE">École / CFA</option>
              </select>
            </label>
            <button
              type="submit"
              className="w-full rounded-xl bg-primary py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Ajouter
            </button>
          </form>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Kanban des missions
            </h2>
          </div>

          <MissionBoard missions={missions} today={today} />

          {/* Ajout manuel d'une mission (colonne « À faire »). */}
          <form
            action={ajouterMission.bind(null, alternant.id)}
            className="mt-4 grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2"
          >
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-foreground">
                Nouvelle mission
              </span>
              <input
                type="text"
                name="titre"
                required
                placeholder="Titre"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-foreground">
                Échéance (optionnelle)
              </span>
              <input type="date" name="echeance" className={inputClass} />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-foreground">
                Description
              </span>
              <input
                type="text"
                name="description"
                required
                placeholder="Ce que l'alternant doit réaliser"
                className={inputClass}
              />
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Ajouter la mission
              </button>
            </div>
          </form>
        </div>

        <SuggestionsIA alternantId={alternant.id} />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Bilans hebdomadaires
        </h2>
        {bilans.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun bilan soumis par l&apos;alternant pour l&apos;instant.
          </p>
        ) : (
          <ul className="space-y-3">
            {bilans.map((b) => (
              <li key={b.id} className="rounded-2xl border bg-card p-5 shadow-soft">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium capitalize text-foreground">
                    {libelleSemaine(b.semaine)}
                  </span>
                  {b.valideParTuteur ? (
                    <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
                      Validé
                    </span>
                  ) : (
                    <form action={validerBilan.bind(null, b.id)}>
                      <button
                        type="submit"
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                      >
                        Valider
                      </button>
                    </form>
                  )}
                </div>

                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Réussites</dt>
                    <dd className="text-foreground">{b.reussites || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Difficultés</dt>
                    <dd className="text-foreground">{b.difficultes || "—"}</dd>
                  </div>
                  {b.commentaire && (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">Commentaire</dt>
                      <dd className="text-foreground">{b.commentaire}</dd>
                    </div>
                  )}
                </dl>

                <div className="mt-3 rounded-xl bg-muted p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-foreground">
                      Résumé pour le livret (IA)
                    </span>
                    <GenererResume
                      bilanId={b.id}
                      label={b.resumeIA ? "Régénérer" : "Générer"}
                    />
                  </div>
                  {b.resumeIA ? (
                    <p className="whitespace-pre-line text-sm text-foreground">
                      {b.resumeIA}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Aucun résumé généré.
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

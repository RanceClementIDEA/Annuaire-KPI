import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getReferentiels } from "@/lib/data/referentiels";
import {
  etatAbonnement,
  getAlternantsForOrg,
  getTuteursForOrg,
} from "@/lib/data/abonnement";
import { placesGratuitesRestantes } from "@/lib/abonnement";
import { ajouterAlternant } from "./actions";

export const metadata = { title: "Alternants · AlternPilot" };

export default async function AdminAlternantsPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const user = await requireRole(["ADMIN"]);

  if (!user.organisationId) {
    return (
      <div>
        <Link href="/admin" className="text-sm text-primary hover:underline">
          ← Administration
        </Link>
        <p className="mt-4 text-sm text-muted-foreground">
          Votre compte n&apos;est rattaché à aucune organisation.
        </p>
      </div>
    );
  }
  const organisationId = user.organisationId;

  const [etat, alternants, tuteurs, referentiels] = await Promise.all([
    etatAbonnement(organisationId),
    getAlternantsForOrg(organisationId),
    getTuteursForOrg(organisationId),
    getReferentiels(),
  ]);

  const inputClass =
    "w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div>
      <Link href="/admin" className="text-sm text-primary hover:underline">
        ← Administration
      </Link>

      <h1 className="mt-3 text-xl font-semibold text-foreground">Alternants</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {etat.actif
          ? "Abonnement actif — alternants illimités (facturés à l'usage)."
          : `Offre gratuite : ${placesGratuitesRestantes(etat.nbAlternants)} place(s) restante(s) sur ${etat.limite}.`}
      </p>

      {searchParams.error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {searchParams.error}
        </p>
      )}

      <ul className="mt-6 space-y-2">
        {alternants.map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 text-sm"
          >
            <span className="text-foreground">{a.nom}</span>
            <span className="text-xs text-muted-foreground">
              {a.tuteur.nom} · {a.diplome.nom}
            </span>
          </li>
        ))}
        {alternants.length === 0 && (
          <li className="text-sm text-muted-foreground">Aucun alternant.</li>
        )}
      </ul>

      {etat.peutAjouter ? (
        <form
          action={ajouterAlternant}
          className="mt-6 grid gap-3 rounded-2xl border bg-card p-5 sm:grid-cols-2"
        >
          <div className="sm:col-span-2 text-sm font-semibold text-foreground">
            Ajouter un alternant
          </div>
          <input name="nom" required placeholder="Nom complet" className={inputClass} />
          <input
            name="email"
            type="email"
            required
            placeholder="Email"
            className={inputClass}
          />
          <select name="tuteurId" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Tuteur…
            </option>
            {tuteurs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nom}
              </option>
            ))}
          </select>
          <select name="diplomeId" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Diplôme…
            </option>
            {referentiels.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nom}
              </option>
            ))}
          </select>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Ajouter l&apos;alternant
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed bg-card p-6 text-center">
          <p className="text-sm text-foreground">
            Vous avez atteint la limite de l&apos;offre gratuite.
          </p>
          <Link
            href="/admin/abonnement"
            className="mt-3 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Passer à l&apos;offre payante
          </Link>
        </div>
      )}
    </div>
  );
}

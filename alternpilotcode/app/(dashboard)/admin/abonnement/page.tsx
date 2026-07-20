import Link from "next/link";
import { dashboardPathForRole, requireRole } from "@/lib/auth";
import { etatAbonnement } from "@/lib/data/abonnement";
import { paiementConfigure } from "@/lib/stripe";
import { creerCheckout, ouvrirPortail } from "./actions";

export const metadata = { title: "Abonnement · AlternPilot" };

const LIBELLE_STATUT: Record<string, string> = {
  TRIAL: "Essai",
  ACTIVE: "Actif",
  CANCELLED: "Annulé",
};

export default async function AbonnementPage({
  searchParams,
}: {
  searchParams: { success?: string; canceled?: string; limite?: string; error?: string };
}) {
  const user = await requireRole(["TUTEUR", "ADMIN"]);
  const retour = dashboardPathForRole(user.role);

  if (!user.organisationId) {
    return (
      <div>
        <Link href={retour} className="text-sm text-primary hover:underline">
          ← Retour
        </Link>
        <p className="mt-4 text-sm text-muted-foreground">
          Votre compte n&apos;est rattaché à aucune organisation.
        </p>
      </div>
    );
  }

  const etat = await etatAbonnement(user.organisationId);
  const configure = paiementConfigure();

  return (
    <div className="max-w-2xl">
      <Link href={retour} className="text-sm text-primary hover:underline">
        ← Retour
      </Link>

      <h1 className="mt-3 text-xl font-semibold text-foreground">Abonnement</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Offre freemium : 1 alternant gratuit, puis facturation à l&apos;alternant actif.
      </p>

      {searchParams.success && (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Merci ! Votre abonnement est en cours d&apos;activation.
        </p>
      )}
      {searchParams.canceled && (
        <p className="mt-4 rounded-xl bg-accent px-3 py-2 text-sm text-accent-foreground">
          Paiement annulé — vous pouvez réessayer à tout moment.
        </p>
      )}
      {searchParams.limite && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Limite de l&apos;offre gratuite atteinte : abonnez-vous pour ajouter d&apos;autres alternants.
        </p>
      )}
      {searchParams.error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {searchParams.error}
        </p>
      )}

      <div className="mt-6 rounded-2xl border bg-card p-6 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Plan actuel
            </div>
            <div className="mt-1 text-lg font-semibold text-foreground">
              {etat.actif ? "Payant (métré)" : "Gratuit"}
            </div>
          </div>
          <span
            className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
              etat.actif
                ? "bg-emerald-100 text-emerald-800"
                : "bg-accent text-accent-foreground"
            }`}
          >
            {etat.statut ? LIBELLE_STATUT[etat.statut] : "Gratuit"}
          </span>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Alternants actifs</dt>
            <dd className="text-foreground">{etat.nbAlternants}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Inclus (gratuit)</dt>
            <dd className="text-foreground">{etat.limite}</dd>
          </div>
        </dl>

        <div className="mt-6">
          {etat.actif ? (
            <form action={ouvrirPortail}>
              <button
                type="submit"
                className="rounded-xl border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Gérer l&apos;abonnement
              </button>
            </form>
          ) : (
            <form action={creerCheckout}>
              <button
                type="submit"
                disabled={!configure}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                S&apos;abonner via Stripe
              </button>
              {!configure && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Paiement non configuré : renseignez STRIPE_SECRET_KEY et
                  STRIPE_PRICE_ID.
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";

export const metadata = { title: "Confidentialité · AlternPilot" };

// Gabarit de politique de confidentialité — à faire valider juridiquement et à
// compléter aux endroits [À COMPLÉTER] avant une mise en production réelle.
export default function ConfidentialitePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/login" className="text-sm text-primary hover:underline">
        ← Retour
      </Link>

      <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
        Politique de confidentialité
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        AlternPilot traite des données personnelles de tuteurs et d&apos;alternants.
        Cette page décrit lesquelles, pourquoi, et vos droits.
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-foreground">
        <section>
          <h2 className="text-base font-semibold">Responsable du traitement</h2>
          <p className="mt-1 text-muted-foreground">
            [À COMPLÉTER : nom de l&apos;entreprise, adresse, e-mail de contact].
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold">Données collectées</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Identité et contact : nom, adresse e-mail.</li>
            <li>Suivi d&apos;alternance : diplôme, rythme, missions, bilans hebdomadaires.</li>
            <li>Facturation : identifiant client Stripe, statut d&apos;abonnement.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold">Finalités</h2>
          <p className="mt-1 text-muted-foreground">
            Fournir le service de suivi d&apos;alternance (calendrier, missions,
            bilans), envoyer des alertes, et gérer l&apos;abonnement.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold">Sous-traitants</h2>
          <p className="mt-1 text-muted-foreground">
            Hébergement et base de données (Supabase, Vercel), génération de textes
            par IA (Anthropic), envoi d&apos;e-mails (Resend), paiement (Stripe). Ces
            prestataires n&apos;utilisent vos données que pour fournir ces services.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold">Durée de conservation</h2>
          <p className="mt-1 text-muted-foreground">
            Les données sont conservées le temps de l&apos;utilisation du service,
            puis supprimées sur demande. [À COMPLÉTER : durées précises].
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold">Vos droits</h2>
          <p className="mt-1 text-muted-foreground">
            Accès, rectification, export et suppression. Une fois connecté, vous
            pouvez <span className="font-medium text-foreground">télécharger vos
            données</span> et <span className="font-medium text-foreground">supprimer
            votre compte</span> depuis la page « Mon compte ». Pour toute demande :
            [À COMPLÉTER : e-mail de contact].
          </p>
        </section>
      </div>
    </div>
  );
}

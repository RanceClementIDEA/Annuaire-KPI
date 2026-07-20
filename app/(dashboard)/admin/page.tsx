import Link from "next/link";
import { requireRole } from "@/lib/auth";

export const metadata = { title: "Administration · AlternPilot" };

export default async function AdminPage() {
  const user = await requireRole(["ADMIN"]);

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">
        Administration — {user.nom}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Gestion de l&apos;organisation, des utilisateurs et de l&apos;abonnement.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          {
            href: "/admin/alternants",
            titre: "Alternants",
            detail: "Contrats & ajout (offre freemium)",
          },
          {
            href: "/admin/abonnement",
            titre: "Abonnement",
            detail: "Facturation Stripe à l'alternant actif",
          },
          {
            href: "/admin/referentiels",
            titre: "Référentiels",
            detail: "Diplômes & compétences pré-chargés",
          },
        ].map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-2xl border bg-card p-5 shadow-soft transition-colors hover:border-primary/50"
          >
            <div className="text-sm font-medium text-foreground">{c.titre}</div>
            <p className="mt-1 text-sm text-muted-foreground">{c.detail}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

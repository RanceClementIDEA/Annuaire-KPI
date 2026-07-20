import Link from "next/link";
import { dashboardPathForRole, requireUser } from "@/lib/auth";
import { supprimerMonCompte } from "./actions";

export const metadata = { title: "Mon compte · AlternPilot" };

export default async function MonComptePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const user = await requireUser();

  return (
    <div className="max-w-2xl">
      <Link
        href={dashboardPathForRole(user.role)}
        className="text-sm text-primary hover:underline"
      >
        ← Retour
      </Link>

      <h1 className="mt-3 text-xl font-semibold text-foreground">Mon compte</h1>
      <dl className="mt-4 space-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Nom :</dt>
          <dd className="text-foreground">{user.nom}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">E-mail :</dt>
          <dd className="text-foreground">{user.email}</dd>
        </div>
      </dl>

      {searchParams.error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {searchParams.error}
        </p>
      )}

      <section className="mt-8 rounded-2xl border bg-card p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-foreground">Mes données</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Téléchargez l&apos;ensemble de vos données personnelles au format JSON.
        </p>
        <a
          href="/api/mon-compte/export"
          className="mt-3 inline-block rounded-xl border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Télécharger mes données
        </a>
      </section>

      <section className="mt-6 rounded-2xl border border-red-200 bg-red-50/50 p-5">
        <h2 className="text-sm font-semibold text-red-700">Supprimer mon compte</h2>
        <p className="mt-1 text-sm text-red-700/90">
          Action définitive : votre compte et vos données personnelles seront
          supprimés. {user.role === "ALTERNANT"
            ? "Vos missions et bilans seront effacés."
            : "Supprimez d'abord vos alternants le cas échéant."}
        </p>
        <form action={supprimerMonCompte} className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-red-700">
              Tapez SUPPRIMER pour confirmer
            </span>
            <input
              name="confirmation"
              type="text"
              autoComplete="off"
              placeholder="SUPPRIMER"
              className="w-full max-w-xs rounded-xl border border-red-300 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400"
            />
          </label>
          <button
            type="submit"
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Supprimer définitivement
          </button>
        </form>
      </section>
    </div>
  );
}

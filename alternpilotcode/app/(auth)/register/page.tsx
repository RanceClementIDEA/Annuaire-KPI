import Link from "next/link";
import { signUp } from "../actions";

export const metadata = { title: "Créer un compte · AlternPilot" };

export default function RegisterPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div>
      <h1 className="text-lg font-semibold text-foreground">Créer un compte</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Pour les maîtres d&apos;apprentissage (tuteurs).
      </p>

      {searchParams.error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {searchParams.error}
        </p>
      )}

      <form action={signUp} className="mt-5 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">
            Nom complet
          </span>
          <input
            name="nom"
            type="text"
            autoComplete="name"
            required
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">
            Nom de votre entreprise
          </span>
          <input
            name="organisation"
            type="text"
            autoComplete="organization"
            required
            placeholder="ex. Menuiserie Dubois"
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">
            Mot de passe
          </span>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            8 caractères minimum.
          </span>
        </label>
        <button
          type="submit"
          className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Créer mon compte
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        Déjà inscrit ?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Se connecter
        </Link>
      </p>
    </div>
  );
}

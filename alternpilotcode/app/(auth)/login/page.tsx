import Link from "next/link";
import { signIn } from "../actions";

export const metadata = { title: "Connexion · AlternPilot" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; checkEmail?: string };
}) {
  return (
    <div>
      <h1 className="text-lg font-semibold text-foreground">Connexion</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Accédez à votre espace de suivi.
      </p>

      {searchParams.checkEmail && (
        <p className="mt-4 rounded-xl bg-accent px-3 py-2 text-sm text-accent-foreground">
          Compte créé. Vérifiez votre boîte mail pour confirmer votre adresse,
          puis connectez-vous.
        </p>
      )}
      {searchParams.error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {searchParams.error}
        </p>
      )}

      <form action={signIn} className="mt-5 space-y-4">
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
            autoComplete="current-password"
            required
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Se connecter
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        Pas encore de compte ?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Créer un compte
        </Link>
      </p>
    </div>
  );
}

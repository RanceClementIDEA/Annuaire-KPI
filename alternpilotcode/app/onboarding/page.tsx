import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { signOut } from "../(auth)/actions";
import { creerOrganisation } from "./actions";

export const metadata = { title: "Bienvenue · AlternPilot" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const user = await requireUser();
  if (user.organisationId) redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold tracking-tight text-foreground">
            Altern<span className="text-primary">Pilot</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Bienvenue {user.nom} ! Une dernière étape.
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-soft-lg sm:p-8">
          <h1 className="text-lg font-semibold text-foreground">Votre entreprise</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Créez votre espace pour commencer à suivre vos alternants.
          </p>

          {searchParams.error && (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {searchParams.error}
            </p>
          )}

          <form action={creerOrganisation} className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground">
                Nom de l&apos;entreprise
              </span>
              <input
                name="organisation"
                type="text"
                required
                autoFocus
                placeholder="ex. Menuiserie Dubois"
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Créer mon espace
            </button>
          </form>
        </div>

        <form action={signOut} className="mt-4 text-center">
          <button
            type="submit"
            className="text-sm text-muted-foreground hover:underline"
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </div>
  );
}

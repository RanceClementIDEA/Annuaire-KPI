import { redirect } from "next/navigation";
import { getAppUser, homePathForUser } from "@/lib/auth";
import { signOut } from "./(auth)/actions";

/**
 * Point d'entrée `/` : aiguille l'utilisateur vers le bon tableau de bord.
 * - Non authentifié → /login
 * - Authentifié + rôle connu → dashboard du rôle
 * - Authentifié sans rattachement métier → état « compte en attente »
 */
export default async function Home() {
  const user = await getAppUser();

  if (!user) redirect("/login");
  if (user.isSuperAdmin && !user.impersonating) redirect("/superadmin");
  if (user.role) redirect(homePathForUser(user));

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-soft-lg">
        <h1 className="text-lg font-semibold text-foreground">Compte en attente</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Votre compte <span className="font-medium">{user.email}</span> n&apos;est
          pas encore rattaché à une organisation ou à un contrat d&apos;alternance.
          Contactez votre tuteur ou votre administrateur.
        </p>
        <form action={signOut} className="mt-6">
          <button
            type="submit"
            className="rounded-xl border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </div>
  );
}

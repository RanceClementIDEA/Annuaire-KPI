import Link from "next/link";
import { requireUser, type AppRole } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { signOut } from "../(auth)/actions";

const ROLE_LABELS: Record<AppRole, string> = {
  TUTEUR: "Tuteur",
  ADMIN: "Administrateur",
  CFA_REFERENT: "Référent CFA",
  ALTERNANT: "Alternant",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const roleLabel = user.role ? ROLE_LABELS[user.role] : "Compte en attente";

  return (
    <div className="min-h-screen bg-muted">
      <header className="border-b bg-card no-print">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="text-lg font-bold tracking-tight">
            Altern<span className="text-primary">Pilot</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/mon-compte"
              className="min-w-0 text-right transition-opacity hover:opacity-80"
            >
              <div className="truncate text-sm font-medium text-foreground">
                {user.nom}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {roleLabel}
              </div>
            </Link>
            <ThemeToggle />
            <form action={signOut}>
              <button
                type="submit"
                aria-label="Déconnexion"
                className="rounded-xl border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                <span className="hidden sm:inline" aria-hidden>
                  Déconnexion
                </span>
                <span className="sm:hidden" aria-hidden>
                  Quitter
                </span>
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}

import Link from "next/link";
import { requireUser, type AppRole } from "@/lib/auth";
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
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="text-lg font-bold tracking-tight">
            Altern<span className="text-primary">Pilot</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/mon-compte"
              className="text-right transition-opacity hover:opacity-80"
            >
              <div className="text-sm font-medium text-foreground">{user.nom}</div>
              <div className="text-xs text-muted-foreground">{roleLabel}</div>
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-xl border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
